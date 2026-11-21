export interface ParsedComponentInfo {
  name: string;
  componentType: 'service' | 'module' | 'api' | 'database';
  filePath: string;
  language: string;
  linesOfCode: number;
  complexityScore: number;
  testCoveragePct: number | null;
  imports: string[];
  callsDb: boolean;
  exposesApi: boolean;
}

export interface ParsedDependencyEdge {
  sourcePath: string;
  targetNameOrPath: string;
  dependencyType: 'imports' | 'calls_api' | 'reads_db' | 'publishes_event';
  evidenceRef: string;
}

function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'TypeScript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) {
    return 'JavaScript';
  }
  if (lower.endsWith('.py')) return 'Python';
  if (lower.endsWith('.sql')) return 'SQL';
  if (lower.endsWith('.go')) return 'Go';
  return 'Other';
}

function classifyComponentType(
  filePath: string,
  content: string
): 'service' | 'module' | 'api' | 'database' {
  const lower = filePath.toLowerCase();
  if (
    lower.includes('/db/') ||
    lower.includes('schema') ||
    lower.includes('migration') ||
    lower.endsWith('.sql')
  ) {
    return 'database';
  }
  if (
    lower.includes('/routes/') ||
    lower.includes('/api/') ||
    lower.includes('controller') ||
    /app\.(get|post|put|patch|delete)\(|router\.(get|post|put|delete)\(|@(app|router)\.(get|post|put|delete)/i.test(
      content
    )
  ) {
    return 'api';
  }
  if (
    lower.includes('/services/') ||
    lower.includes('worker') ||
    lower.includes('orchestrator') ||
    lower.includes('server')
  ) {
    return 'service';
  }
  return 'module';
}

function deriveComponentName(filePath: string): string {
  const segments = filePath.split('/');
  const fileName = segments[segments.length - 1] ?? filePath;
  const stem = fileName.replace(/\.[^.]+$/, '');
  if (stem === 'index' && segments.length >= 2) {
    return `${segments[segments.length - 2]}/index`;
  }
  return stem;
}

export function extractSourceAnalysis(
  filePath: string,
  content: string,
  allFilePaths: string[]
): { component: ParsedComponentInfo; edges: ParsedDependencyEdge[] } {
  const language = detectLanguage(filePath);
  const lines = content.split(/\r?\n/);
  const linesOfCode = lines.filter((line) => line.trim().length > 0).length;

  // Compute deterministic branch-based complexity heuristic
  const branchMatches =
    content.match(
      /\b(if|else if|for|while|switch|case|catch|except|elif|&&|\|\||\?)\b/g
    ) ?? [];
  const complexityScore = Math.max(1, 1 + branchMatches.length);

  // Check if a matching test file exists in the repository tree
  const baseNoExt = filePath.replace(/\.[^.]+$/, '');
  const baseName = baseNoExt.split('/').pop() ?? '';
  const hasTestFile = allFilePaths.some((p) => {
    const lower = p.toLowerCase();
    return (
      (lower.includes('.test.') ||
        lower.includes('.spec.') ||
        lower.includes('test_')) &&
      lower.includes(baseName.toLowerCase())
    );
  });
  const testCoveragePct = hasTestFile ? 75 : null;

  const imports: string[] = [];
  const edges: ParsedDependencyEdge[] = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // JS/TS static imports
    const jsImportMatch = line.match(
      /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"]([^'"]+)['"]/
    );
    if (jsImportMatch?.[1]) {
      const target = jsImportMatch[1];
      imports.push(target);
      edges.push({
        sourcePath: filePath,
        targetNameOrPath: target,
        dependencyType: 'imports',
        evidenceRef: `${filePath}:${lineNum}`,
      });
    }

    // Python imports
    const pyImportMatch = line.match(
      /^\s*(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/
    );
    if (pyImportMatch) {
      const target = pyImportMatch[1] ?? pyImportMatch[2];
      if (target) {
        imports.push(target);
        edges.push({
          sourcePath: filePath,
          targetNameOrPath: target,
          dependencyType: 'imports',
          evidenceRef: `${filePath}:${lineNum}`,
        });
      }
    }
  });

  const callsDb =
    /\b(db\.|pool\.query|SELECT\s+.*FROM|INSERT\s+INTO|UPDATE\s+.*SET|sqlalchemy|prisma\.)/i.test(
      content
    );
  const exposesApi =
    /\b(app\.(get|post|put|patch|delete)|router\.(get|post|put|patch|delete)|FastAPI|APIRouter)\b/i.test(
      content
    );

  return {
    component: {
      name: deriveComponentName(filePath),
      componentType: classifyComponentType(filePath, content),
      filePath,
      language,
      linesOfCode,
      complexityScore,
      testCoveragePct,
      imports,
      callsDb,
      exposesApi,
    },
    edges,
  };
}
