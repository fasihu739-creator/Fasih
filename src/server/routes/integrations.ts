import crypto from 'node:crypto';
import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  codeComponents,
  componentDependencies,
  integrations,
  pullRequestsCommits,
  repositories,
  subscriptionPlans,
} from '../../db/schema.ts';
import { ensureSubscriptionPlansSeeded } from '../../db/seed.ts';
import { decryptSecret, encryptSecret } from '../../lib/security.ts';
import {
  type AuthRequest,
  recordAuditLog,
  requireAuth,
  requireOrgMembership,
} from '../../middleware/auth.ts';
import {
  fetchGitHubRepoMetadata,
  ingestGitHubRepository,
  listUserGitHubRepos,
} from '../services/githubService.ts';

export const integrationsRouter = Router();

// Ephemeral signed OAuth state registry (CSRF protection)
const oauthStateStore = new Map<
  string,
  { organizationId: number; userId: number; userEmail: string; expiresAt: number }
>();

export function consumeOAuthState(state: string) {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  oauthStateStore.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

integrationsRouter.use(requireAuth);

integrationsRouter.get(
  '/orgs/:orgId/integrations',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const [connectorRows, repoRows, recentCommits] = await Promise.all([
        db
          .select({
            id: integrations.id,
            provider: integrations.provider,
            status: integrations.status,
            accountLogin: integrations.accountLogin,
            scopesJson: integrations.scopesJson,
            installationMetaJson: integrations.installationMetaJson,
            updatedAt: integrations.updatedAt,
          })
          .from(integrations)
          .where(eq(integrations.organizationId, orgId)),
        db
          .select()
          .from(repositories)
          .where(eq(repositories.organizationId, orgId))
          .orderBy(desc(repositories.createdAt)),
        db
          .select()
          .from(pullRequestsCommits)
          .where(eq(pullRequestsCommits.organizationId, orgId))
          .orderBy(desc(pullRequestsCommits.occurredAt))
          .limit(20),
      ]);

      const appUrl = process.env.APP_URL || '';
      const githubConfigured = Boolean(
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      );

      res.json({
        connectors: connectorRows,
        repositories: repoRows,
        recentChanges: recentCommits,
        githubOAuthConfigured: githubConfigured,
        callbackUrl: appUrl ? `${appUrl.replace(/\/$/, '')}/auth/github/callback` : '/auth/github/callback',
      });
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      res.status(500).json({ error: 'Unable to load integrations.' });
    }
  }
);

integrationsRouter.get(
  '/orgs/:orgId/integrations/github/auth-url',
  requireOrgMembership(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.APP_URL;

    if (!clientId || !appUrl) {
      res.status(400).json({
        error:
          'GitHub OAuth is not configured yet. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in AI Studio Secrets, or authorise a public repository by owner/repo below.',
      });
      return;
    }

    const state = crypto.randomBytes(24).toString('hex');
    oauthStateStore.set(state, {
      organizationId: req.orgContext!.organizationId,
      userId: req.dbUser!.id,
      userEmail: req.dbUser!.email,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri = `${appUrl.replace(/\/$/, '')}/auth/github/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user repo',
      state,
    });

    res.json({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      redirectUri,
    });
  }
);

integrationsRouter.get(
  '/orgs/:orgId/integrations/github/remote-repos',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const [gh] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.organizationId, orgId),
            eq(integrations.provider, 'github')
          )
        )
        .limit(1);

      if (!gh?.accessTokenEncrypted) {
        res.status(400).json({
          error: 'No active GitHub OAuth token found for this organisation.',
        });
        return;
      }

      const token = decryptSecret(gh.accessTokenEncrypted);
      const remoteRepos = await listUserGitHubRepos(token);
      res.json({ repositories: remoteRepos });
    } catch (error) {
      console.error('Failed to list remote GitHub repos:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to fetch repositories from GitHub.',
      });
    }
  }
);

const addRepoSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
});

integrationsRouter.post(
  '/orgs/:orgId/integrations/github/repos',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    const parsed = addRepoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide repository in owner/repo format.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [gh] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.organizationId, orgId),
            eq(integrations.provider, 'github')
          )
        )
        .limit(1);

      let token: string | undefined;
      if (gh?.accessTokenEncrypted) {
        try {
          token = decryptSecret(gh.accessTokenEncrypted);
        } catch {
          token = undefined;
        }
      }

      const meta = await fetchGitHubRepoMetadata(parsed.data.fullName, token);

      const [repo] = await db
        .insert(repositories)
        .values({
          organizationId: orgId,
          externalId: meta.externalId,
          fullName: meta.fullName,
          defaultBranch: meta.defaultBranch,
          primaryLanguage: meta.primaryLanguage ?? 'TypeScript',
          isAuthorised: true,
          isDemo: false,
          syncStatus: 'pending',
        })
        .returning();

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'repository.authorised',
        resourceType: 'repository',
        resourceId: String(repo.id),
        details: { fullName: repo.fullName },
      });

      res.status(201).json({ repository: repo });
    } catch (error) {
      console.error('Failed to authorise GitHub repository:', error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to authorise GitHub repository.',
      });
    }
  }
);

integrationsRouter.post(
  '/orgs/:orgId/integrations/github/repos/:repoId/sync',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    const repoId = Number(req.params.repoId);
    if (!Number.isInteger(repoId)) {
      res.status(400).json({ error: 'Invalid repository ID.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [repo] = await db
        .select()
        .from(repositories)
        .where(
          and(eq(repositories.id, repoId), eq(repositories.organizationId, orgId))
        )
        .limit(1);

      if (!repo) {
        res.status(404).json({ error: 'Repository not found.' });
        return;
      }

      if (!repo.isAuthorised) {
        res.status(403).json({
          error:
            'Least-privilege policy: repository must be explicitly authorised before indexing.',
        });
        return;
      }

      const [gh] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.organizationId, orgId),
            eq(integrations.provider, 'github')
          )
        )
        .limit(1);

      let token: string | undefined;
      if (gh?.accessTokenEncrypted) {
        try {
          token = decryptSecret(gh.accessTokenEncrypted);
        } catch {
          token = undefined;
        }
      }

      if (repo.isDemo) {
        res.json({
          repository: repo,
          message:
            'Demo repository already contains seeded AlbionPay snapshot data. Authorise a real GitHub repository to run live AST & commit ingestion.',
        });
        return;
      }

      const snapshot = await ingestGitHubRepository(
        repo.fullName,
        repo.defaultBranch,
        token
      );

      // Replace previously indexed non-demo components/commits for this repo cleanly
      await db
        .delete(componentDependencies)
        .where(
          and(
            eq(componentDependencies.repositoryId, repo.id),
            eq(componentDependencies.organizationId, orgId)
          )
        );
      await db
        .delete(codeComponents)
        .where(
          and(
            eq(codeComponents.repositoryId, repo.id),
            eq(codeComponents.organizationId, orgId)
          )
        );
      await db
        .delete(pullRequestsCommits)
        .where(
          and(
            eq(pullRequestsCommits.repositoryId, repo.id),
            eq(pullRequestsCommits.organizationId, orgId)
          )
        );

      const insertedComponents =
        snapshot.components.length > 0
          ? await db
              .insert(codeComponents)
              .values(
                snapshot.components.map((c) => ({
                  organizationId: orgId,
                  repositoryId: repo.id,
                  name: c.name,
                  componentType: c.componentType,
                  filePath: c.filePath,
                  language: c.language,
                  linesOfCode: c.linesOfCode,
                  complexityScore: c.complexityScore,
                  testCoveragePct: c.testCoveragePct,
                  churnCount: c.churnCount,
                  isDemo: false,
                }))
              )
              .returning()
          : [];

      // Resolve relative import edges between ingested components
      const pathToComp = new Map(insertedComponents.map((c) => [c.filePath, c]));
      const edgeInserts: Array<typeof componentDependencies.$inferInsert> = [];

      for (const parsedComp of snapshot.components) {
        const srcComp = pathToComp.get(parsedComp.filePath);
        if (!srcComp) continue;
        for (const imp of parsedComp.imports) {
          const normalizedImp = imp.replace(/^\.\//, '').replace(/^\.\.\//, '');
          const matchedTarget = insertedComponents.find(
            (candidate) =>
              candidate.id !== srcComp.id &&
              (candidate.filePath.includes(normalizedImp) ||
                candidate.name.toLowerCase() === normalizedImp.toLowerCase())
          );
          if (matchedTarget) {
            edgeInserts.push({
              organizationId: orgId,
              repositoryId: repo.id,
              sourceComponentId: srcComp.id,
              targetComponentId: matchedTarget.id,
              dependencyType: 'imports',
              isDocumented: true,
              driftDetected: false,
              evidenceRef: `${parsedComp.filePath} -> ${imp}`,
              isDemo: false,
            });
          }
        }
      }

      if (edgeInserts.length > 0) {
        await db.insert(componentDependencies).values(edgeInserts);
      }

      if (snapshot.commits.length > 0) {
        await db.insert(pullRequestsCommits).values(
          snapshot.commits.map((c) => ({
            organizationId: orgId,
            repositoryId: repo.id,
            refType: c.refType,
            externalRef: c.externalRef,
            title: c.title,
            authorLogin: c.authorLogin,
            changedFilesJson: c.changedFiles,
            additions: c.additions,
            deletions: c.deletions,
            summary: c.summary,
            externalUrl: c.externalUrl,
            occurredAt: c.occurredAt,
            isDemo: false,
          }))
        );
      }

      const [updatedRepo] = await db
        .update(repositories)
        .set({
          syncStatus: 'synced',
          fileCount: snapshot.totalFilesInRepo,
          commitCount: snapshot.commits.filter((c) => c.refType === 'commit').length,
          prCount: snapshot.commits.filter((c) => c.refType === 'pr').length,
          lastSyncedAt: new Date(),
        })
        .where(eq(repositories.id, repo.id))
        .returning();

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'repository.synced',
        resourceType: 'repository',
        resourceId: String(repo.id),
        details: {
          componentsIndexed: insertedComponents.length,
          dependenciesExtracted: edgeInserts.length,
          commitsAndPrs: snapshot.commits.length,
        },
      });

      res.json({
        repository: updatedRepo,
        componentsIndexed: insertedComponents.length,
        dependenciesExtracted: edgeInserts.length,
        commitsAndPrs: snapshot.commits.length,
      });
    } catch (error) {
      console.error('Failed to sync GitHub repository:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to sync repository from GitHub.',
      });
    }
  }
);

const toggleAuthSchema = z.object({
  isAuthorised: z.boolean(),
});

integrationsRouter.patch(
  '/orgs/:orgId/integrations/github/repos/:repoId',
  requireOrgMembership(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const parsed = toggleAuthSchema.safeParse(req.body);
    const repoId = Number(req.params.repoId);
    if (!parsed.success || !Number.isInteger(repoId)) {
      res.status(400).json({ error: 'Valid repository ID and authorisation flag required.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [updated] = await db
        .update(repositories)
        .set({ isAuthorised: parsed.data.isAuthorised })
        .where(
          and(eq(repositories.id, repoId), eq(repositories.organizationId, orgId))
        )
        .returning();

      if (!updated) {
        res.status(404).json({ error: 'Repository not found.' });
        return;
      }

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: parsed.data.isAuthorised
          ? 'repository.authorised'
          : 'repository.revoked',
        resourceType: 'repository',
        resourceId: String(repoId),
        details: { fullName: updated.fullName },
      });

      res.json({ repository: updated });
    } catch (error) {
      console.error('Failed to update repository authorisation:', error);
      res.status(500).json({ error: 'Unable to update repository authorisation.' });
    }
  }
);

integrationsRouter.delete(
  '/orgs/:orgId/integrations/github',
  requireOrgMembership(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      await db
        .update(integrations)
        .set({
          status: 'disconnected',
          accessTokenEncrypted: null,
          accountLogin: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrations.organizationId, orgId),
            eq(integrations.provider, 'github')
          )
        );

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'integration.github_disconnected',
        resourceType: 'integration',
        resourceId: 'github',
      });

      res.json({ disconnected: true });
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
      res.status(500).json({ error: 'Unable to disconnect GitHub integration.' });
    }
  }
);

// Platform Admin Configurable Pricing Plans
integrationsRouter.get('/admin/plans', async (req: AuthRequest, res) => {
  if (!req.dbUser?.isPlatformAdmin) {
    res.status(403).json({ error: 'Platform administrator access required.' });
    return;
  }
  await ensureSubscriptionPlansSeeded();
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .orderBy(asc(subscriptionPlans.sortOrder));
  res.json({ plans });
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  targetAudience: z.string().trim().min(4).max(200),
  monthlyPriceGbp: z.number().int().min(0).max(100000),
  maxDevelopers: z.number().int().min(1).max(10000),
  maxRepositories: z.number().int().min(1).max(10000),
  features: z.array(z.string().trim().min(2).max(200)).min(1),
  isActive: z.boolean(),
});

integrationsRouter.put('/admin/plans/:planId', async (req: AuthRequest, res) => {
  if (!req.dbUser?.isPlatformAdmin) {
    res.status(403).json({ error: 'Platform administrator access required.' });
    return;
  }
  const planId = Number(req.params.planId);
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!Number.isInteger(planId) || !parsed.success) {
    res.status(400).json({ error: 'Invalid subscription plan payload.' });
    return;
  }

  try {
    const [updated] = await db
      .update(subscriptionPlans)
      .set({
        name: parsed.data.name,
        targetAudience: parsed.data.targetAudience,
        monthlyPriceGbp: parsed.data.monthlyPriceGbp,
        maxDevelopers: parsed.data.maxDevelopers,
        maxRepositories: parsed.data.maxRepositories,
        featuresJson: parsed.data.features,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.id, planId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }

    res.json({ plan: updated });
  } catch (error) {
    console.error('Failed to update subscription plan:', error);
    res.status(500).json({ error: 'Unable to update subscription plan.' });
  }
});

export { encryptSecret };
