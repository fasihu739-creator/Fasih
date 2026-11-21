import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import { integrations } from './src/db/schema.ts';
import { encryptSecret } from './src/lib/security.ts';
import { recordAuditLog } from './src/middleware/auth.ts';
import { publicRouter } from './src/server/routes/public.ts';
import { orgsRouter } from './src/server/routes/orgs.ts';
import { intelligenceRouter } from './src/server/routes/intelligence.ts';
import {
  consumeOAuthState,
  integrationsRouter,
} from './src/server/routes/integrations.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ai-engineering-intelligence-brain' });
  });

  // Public landing & pricing routes
  app.use('/api/public', publicRouter);

  // Authenticated SaaS API routes
  app.use('/api', orgsRouter);
  app.use('/api', intelligenceRouter);
  app.use('/api', integrationsRouter);

  // GitHub OAuth callback (handles trailing slash variations per OAuth guidelines)
  app.get(['/auth/github/callback', '/auth/github/callback/'], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    const stateData = consumeOAuthState(state);
    if (!code || !stateData) {
      res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:24px;">
          <p>GitHub authorisation session expired or invalid. You may close this window.</p>
        </body></html>
      `);
      return;
    }

    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      const appUrl = process.env.APP_URL;

      if (!clientId || !clientSecret || !appUrl) {
        throw new Error('GitHub OAuth credentials not configured on server.');
      }

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${appUrl.replace(/\/$/, '')}/auth/github/callback`,
        }),
      });

      const tokenPayload = (await tokenRes.json()) as {
        access_token?: string;
        scope?: string;
        error?: string;
      };

      if (!tokenPayload.access_token) {
        throw new Error(tokenPayload.error ?? 'Failed to obtain GitHub access token.');
      }

      const ghUserRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'AI-Engineering-Intelligence-Brain',
        },
      });
      const ghUser = (await ghUserRes.json()) as { login?: string };

      const encryptedToken = encryptSecret(tokenPayload.access_token);
      const scopes = (tokenPayload.scope ?? 'read:user repo')
        .split(/[,\s]+/)
        .filter(Boolean);

      const existing = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.organizationId, stateData.organizationId),
            eq(integrations.provider, 'github')
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(integrations)
          .set({
            status: 'connected',
            accountLogin: ghUser.login ?? 'github-account',
            scopesJson: scopes,
            accessTokenEncrypted: encryptedToken,
            connectedByUserId: stateData.userId,
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, existing[0].id));
      } else {
        await db.insert(integrations).values({
          organizationId: stateData.organizationId,
          provider: 'github',
          status: 'connected',
          accountLogin: ghUser.login ?? 'github-account',
          scopesJson: scopes,
          accessTokenEncrypted: encryptedToken,
          connectedByUserId: stateData.userId,
        });
      }

      await recordAuditLog({
        organizationId: stateData.organizationId,
        actorUserId: stateData.userId,
        actorEmail: stateData.userEmail,
        action: 'integration.github_connected',
        resourceType: 'integration',
        resourceId: 'github',
        details: { accountLogin: ghUser.login ?? 'unknown', scopes },
      });

      res.send(`
        <html>
          <body style="font-family:sans-serif;padding:24px;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GITHUB_OAUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>GitHub connected successfully. This window will close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('GitHub OAuth callback error:', error);
      res.status(500).send(`
        <html><body style="font-family:sans-serif;padding:24px;">
          <p>Unable to complete GitHub authorisation. Please return to the application and retry.</p>
        </body></html>
      `);
    }
  });

  // Serve Vite dev middleware in development or static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
