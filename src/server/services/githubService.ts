import { sanitizeUntrustedEngineeringText } from '../../lib/security.ts';
import { extractSourceAnalysis } from './dependencyParser.ts';

export interface GitHubRepoSummary {
  externalId: string;
  fullName: string;
  defaultBranch: string;
  primaryLanguage: string | null;
  private: boolean;
}

export interface GitHubIngestedSnapshot {
  commits: Array<{
    refType: 'commit' | 'pr';
    externalRef: string;
    title: string;
    authorLogin: string;
    changedFiles: string[];
    additions: number;
    deletions: number;
    summary: string;
    externalUrl: string;
    occurredAt: Date;
  }>;
  components: Array<{
    name: string;
    componentType: 'service' | 'module' | 'api' | 'database';
    filePath: string;
    language: string;
    linesOfCode: number;
    complexityScore: number;
    testCoveragePct: number | null;
    churnCount: number;
    imports: string[];
  }>;
  totalFilesInRepo: number;
}

const GITHUB_API_BASE = 'https://api.github.com';

async function githubFetchJson<T>(url: string, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AI-Engineering-Intelligence-Brain',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${bodyText.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function listUserGitHubRepos(accessToken: string): Promise<GitHubRepoSummary[]> {
  const repos = await githubFetchJson<
    Array<{
      id: number;
      full_name: string;
      default_branch: string;
      language: string | null;
      private: boolean;
    }>
  >(`${GITHUB_API_BASE}/user/repos?per_page=50&sort=updated`, accessToken);

  return repos.map((r) => ({
    externalId: String(r.id),
    fullName: r.full_name,
    defaultBranch: r.default_branch || 'main',
    primaryLanguage: r.language,
    private: r.private,
  }));
}

export async function fetchGitHubRepoMetadata(
  fullName: string,
  accessToken?: string
): Promise<GitHubRepoSummary> {
  const cleanName = fullName.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
  const parts = cleanName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Repository name must be in "owner/repo" format.');
  }

  const repo = await githubFetchJson<{
    id: number;
    full_name: string;
    default_branch: string;
    language: string | null;
    private: boolean;
  }>(`${GITHUB_API_BASE}/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`, accessToken);

  return {
    externalId: String(repo.id),
    fullName: repo.full_name,
    defaultBranch: repo.default_branch || 'main',
    primaryLanguage: repo.language,
    private: repo.private,
  };
}

export async function ingestGitHubRepository(
  fullName: string,
  defaultBranch: string,
  accessToken?: string
): Promise<GitHubIngestedSnapshot> {
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) {
    throw new Error('Invalid GitHub repository full name.');
  }
  const baseRepoUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const [commitsRaw, pullsRaw, treeRaw] = await Promise.all([
    githubFetchJson<
      Array<{
        sha: string;
        html_url: string;
        commit: {
          message: string;
          author: { name?: string; date?: string } | null;
        };
        author: { login?: string } | null;
      }>
    >(`${baseRepoUrl}/commits?per_page=15`, accessToken),
    githubFetchJson<
      Array<{
        number: number;
        title: string;
        html_url: string;
        user: { login?: string } | null;
        created_at: string;
        merged_at: string | null;
      }>
    >(`${baseRepoUrl}/pulls?state=all&per_page=15`, accessToken).catch(() => []),
    githubFetchJson<{
      tree: Array<{ path: string; type: string; size?: number }>;
    }>(
      `${baseRepoUrl}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      accessToken
    ),
  ]);

  const allBlobPaths = (treeRaw.tree ?? [])
    .filter((item) => item.type === 'blob')
    .map((item) => item.path);

  const analysablePaths = allBlobPaths
    .filter((p) => {
      const lower = p.toLowerCase();
      if (
        lower.includes('node_modules/') ||
        lower.includes('dist/') ||
        lower.includes('.git/') ||
        lower.includes('vendor/')
      ) {
        return false;
      }
      return (
        lower.endsWith('.ts') ||
        lower.endsWith('.tsx') ||
        lower.endsWith('.js') ||
        lower.endsWith('.py') ||
        lower.endsWith('.sql')
      );
    })
    .filter((p) => !p.includes('.test.') && !p.includes('.spec.'))
    .slice(0, 18);

  const components: GitHubIngestedSnapshot['components'] = [];

  for (const filePath of analysablePaths) {
    try {
      const fileData = await githubFetchJson<{
        content?: string;
        encoding?: string;
      }>(
        `${baseRepoUrl}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(defaultBranch)}`,
        accessToken
      );

      if (fileData.content && fileData.encoding === 'base64') {
        const decoded = Buffer.from(fileData.content, 'base64').toString('utf8');
        const safeText = sanitizeUntrustedEngineeringText(decoded, 40000);
        const analysis = extractSourceAnalysis(filePath, safeText, allBlobPaths);
        components.push({
          ...analysis.component,
          churnCount: 1,
        });
      }
    } catch {
      // Skip unreadable or oversized binary files cleanly
    }
  }

  const commitHistory: GitHubIngestedSnapshot['commits'] = [
    ...pullsRaw.map((pr) => ({
      refType: 'pr' as const,
      externalRef: `PR #${pr.number}`,
      title: sanitizeUntrustedEngineeringText(pr.title, 300),
      authorLogin: pr.user?.login ?? 'unknown',
      changedFiles: [] as string[],
      additions: 0,
      deletions: 0,
      summary: pr.merged_at ? 'Merged pull request' : 'Open/closed pull request',
      externalUrl: pr.html_url,
      occurredAt: new Date(pr.merged_at ?? pr.created_at),
    })),
    ...commitsRaw.map((c) => {
      const firstLine = c.commit.message.split('\n')[0] ?? c.sha.slice(0, 7);
      return {
        refType: 'commit' as const,
        externalRef: c.sha.slice(0, 7),
        title: sanitizeUntrustedEngineeringText(firstLine, 300),
        authorLogin: c.author?.login ?? c.commit.author?.name ?? 'unknown',
        changedFiles: [] as string[],
        additions: 0,
        deletions: 0,
        summary: sanitizeUntrustedEngineeringText(c.commit.message, 600),
        externalUrl: c.html_url,
        occurredAt: new Date(c.commit.author?.date ?? Date.now()),
      };
    }),
  ];

  return {
    commits: commitHistory,
    components,
    totalFilesInRepo: allBlobPaths.length,
  };
}
