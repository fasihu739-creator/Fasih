import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, GitBranch, MessageSquarePlus, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citationsJson: Array<{ kind: string; ref: string; title: string }> | null;
  confirmedFactsJson: string[] | null;
  hypothesesJson: string[] | null;
  confidence: string | null;
  limitations: string | null;
  createdAt: string;
}

interface ConversationSummary {
  id: number;
  title: string;
  createdAt: string;
}

const SUGGESTED_QUESTIONS = [
  'Why was LedgerPostgresCluster isolated from direct reads?',
  'What could break if we modify PaymentOrchestratorService?',
  'Have we experienced a duplicate settlement or idempotency bug before?',
  'Which tests should we run before deploying changes to StripeWebhookEndpoint?',
];

export function AssistantView({ orgId }: { orgId: number }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (convId?: number | null) => {
      setLoading(true);
      try {
        const qs = convId ? `?conversationId=${convId}` : '';
        const res = await apiFetch<{
          conversations: ConversationSummary[];
          activeConversationId: number | null;
          messages: AssistantMessage[];
        }>(`/api/orgs/${orgId}/assistant${qs}`);
        setConversations(res.conversations);
        setActiveConvId(res.activeConversationId);
        setMessages(res.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load assistant history.');
      } finally {
        setLoading(false);
      }
    },
    [orgId]
  );

  useEffect(() => {
    loadHistory(null);
  }, [loadHistory]);

  const handleAsk = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{
        conversationId: number;
        userMessage: AssistantMessage;
        assistantMessage: AssistantMessage;
      }>(`/api/orgs/${orgId}/assistant/ask`, {
        method: 'POST',
        body: JSON.stringify({
          question: trimmed,
          conversationId: activeConvId ?? undefined,
        }),
      });
      setActiveConvId(res.conversationId);
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
      setQuestion('');
      // Refresh conversation list if newly created
      if (!activeConvId) {
        const listRes = await apiFetch<{ conversations: ConversationSummary[] }>(
          `/api/orgs/${orgId}/assistant`
        );
        setConversations(listRes.conversations);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed.');
    } finally {
      setSending(false);
    }
  };

  const startNewThread = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            AI Engineering Assistant
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Evidence-grounded answers across your organisation’s ADRs, dependencies, commits, and
            incident history.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewThread}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          <span>New Thread</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Conversation History Sidebar */}
        <div className="lg:col-span-3 space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
            Recent Investigations
          </p>
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
              No saved threads yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => loadHistory(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                    activeConvId === conv.id
                      ? 'border-blue-700 dark:border-blue-500 bg-white dark:bg-slate-900 font-medium text-slate-950 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <span className="line-clamp-2">{conv.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Chat Viewport */}
        <div className="lg:col-span-9 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[540px]">
          <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[600px]">
            {loading ? (
              <div className="h-32 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ) : messages.length === 0 ? (
              <div className="space-y-5 py-6">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                    Ask a grounded architectural or historical question
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Responses strictly cite verified organisation records and separate confirmed
                    facts from inferred risks.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleAsk(q)}
                      disabled={sending}
                      className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-700 dark:hover:border-blue-500 text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.role === 'user'
                      ? 'ml-auto max-w-2xl p-4 rounded-xl bg-blue-800 dark:bg-blue-700 text-white text-sm'
                      : 'p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-4'
                  }
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {msg.role === 'assistant' && (
                    <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                      {msg.confirmedFactsJson && msg.confirmedFactsJson.length > 0 && (
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white mb-1">
                            Confirmed Facts
                          </p>
                          <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                            {msg.confirmedFactsJson.map((fact, idx) => (
                              <li key={idx}>• {fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.hypothesesJson && msg.hypothesesJson.length > 0 && (
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white mb-1">
                            Inferred Hypotheses
                          </p>
                          <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                            {msg.hypothesesJson.map((hyp, idx) => (
                              <li key={idx}>• {hyp}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.citationsJson && msg.citationsJson.length > 0 && (
                        <p className="font-mono text-slate-600 dark:text-slate-400">
                          Sources:{' '}
                          {msg.citationsJson
                            .map((c) => `${c.ref} (${c.title})`)
                            .join(' · ')}
                        </p>
                      )}

                      <p className="text-slate-500 dark:text-slate-400">
                        Confidence: {(msg.confidence ?? 'medium').toUpperCase()} ·{' '}
                        {msg.limitations}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(question);
            }}
            className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2"
          >
            {error && (
              <p className="text-xs text-red-700 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask why an architecture was chosen, what could break, or past incidents..."
                className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={sending || question.trim().length < 3}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 text-white whitespace-nowrap cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{sending ? 'Analysing...' : 'Ask'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface IntegrationConnector {
  id: number;
  provider: string;
  status: string;
  accountLogin: string | null;
  scopesJson: string[] | null;
  updatedAt: string;
}

interface RepoRecord {
  id: number;
  fullName: string;
  defaultBranch: string;
  primaryLanguage: string | null;
  isAuthorised: boolean;
  isDemo: boolean;
  syncStatus: string;
  fileCount: number;
  commitCount: number;
  prCount: number;
  lastSyncedAt: string | null;
}

interface RecentCommitRecord {
  id: number;
  refType: string;
  externalRef: string;
  title: string;
  authorLogin: string;
  occurredAt: string;
}

export function IntegrationsView({ orgId }: { orgId: number }) {
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([]);
  const [repositories, setRepositories] = useState<RepoRecord[]>([]);
  const [recentChanges, setRecentChanges] = useState<RecentCommitRecord[]>([]);
  const [githubOAuthConfigured, setGithubOAuthConfigured] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        connectors: IntegrationConnector[];
        repositories: RepoRecord[];
        recentChanges: RecentCommitRecord[];
        githubOAuthConfigured: boolean;
        callbackUrl: string;
      }>(`/api/orgs/${orgId}/integrations`);
      setConnectors(res.connectors);
      setRepositories(res.repositories);
      setRecentChanges(res.recentChanges);
      setGithubOAuthConfigured(res.githubOAuthConfigured);
      setCallbackUrl(res.callbackUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load integrations.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !event.origin.endsWith('.run.app') &&
        !event.origin.includes('localhost')
      ) {
        return;
      }
      if (event.data?.type === 'GITHUB_OAUTH_SUCCESS') {
        setStatusMessage('GitHub account connected with least-privilege permissions.');
        loadIntegrations();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadIntegrations]);

  const handleConnectGitHub = async () => {
    setError(null);
    try {
      const res = await apiFetch<{ url: string }>(
        `/api/orgs/${orgId}/integrations/github/auth-url`
      );
      const popup = window.open(
        res.url,
        'github_oauth_popup',
        'width=620,height=720'
      );
      if (!popup) {
        setError('Please allow popups for this site to complete GitHub authorisation.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start GitHub OAuth.');
    }
  };

  const handleDisconnectGitHub = async () => {
    try {
      await apiFetch(`/api/orgs/${orgId}/integrations/github`, { method: 'DELETE' });
      setStatusMessage('GitHub integration disconnected and stored token cleared.');
      await loadIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disconnect GitHub.');
    }
  };

  const handleAuthoriseRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiFetch<{ repository: RepoRecord }>(
        `/api/orgs/${orgId}/integrations/github/repos`,
        {
          method: 'POST',
          body: JSON.stringify({ fullName: repoInput }),
        }
      );
      setRepositories((prev) => [res.repository, ...prev]);
      setRepoInput('');
      setStatusMessage(`Authorised ${res.repository.fullName}. Click Sync to ingest AST & commit history.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authorise repository.');
    }
  };

  const handleSyncRepo = async (repoId: number) => {
    setSyncingId(repoId);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiFetch<{
        repository: RepoRecord;
        componentsIndexed?: number;
        dependenciesExtracted?: number;
        commitsAndPrs?: number;
        message?: string;
      }>(`/api/orgs/${orgId}/integrations/github/repos/${repoId}/sync`, {
        method: 'POST',
      });
      setRepositories((prev) =>
        prev.map((r) => (r.id === repoId ? res.repository : r))
      );
      setStatusMessage(
        res.message ||
          `Synced ${res.repository.fullName}: ${res.componentsIndexed ?? 0} components, ${
            res.dependenciesExtracted ?? 0
          } dependencies, ${res.commitsAndPrs ?? 0} commits/PRs.`
      );
      await loadIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Repository sync failed.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleToggleAuth = async (repo: RepoRecord) => {
    try {
      const res = await apiFetch<{ repository: RepoRecord }>(
        `/api/orgs/${orgId}/integrations/github/repos/${repo.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isAuthorised: !repo.isAuthorised }),
        }
      );
      setRepositories((prev) =>
        prev.map((r) => (r.id === repo.id ? res.repository : r))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update authorisation.');
    }
  };

  const ghConnector = connectors.find((c) => c.provider === 'github');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Integrations & Least-Privilege Repository Access
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Connect your GitHub organisation and explicitly authorise only the repositories you wish
          to index.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {statusMessage && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {statusMessage}
        </p>
      )}

      {/* GitHub Connector Card */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
              GitHub Organisation Connector
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Status: {ghConnector?.status === 'connected' ? `Connected (${ghConnector.accountLogin})` : 'Not connected'} ·
              Scopes: {ghConnector?.scopesJson?.join(', ') || 'read:user, repo (least-privilege)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {ghConnector?.status === 'connected' ? (
              <button
                type="button"
                onClick={handleDisconnectGitHub}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
              >
                Revoke & Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectGitHub}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 text-white cursor-pointer"
              >
                <span>Connect GitHub OAuth</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {!githubOAuthConfigured && (
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-medium text-slate-900 dark:text-white">
              GitHub OAuth App Callback Configuration
            </p>
            <p>
              To connect private repositories via OAuth, configure{' '}
              <code className="font-mono">GITHUB_CLIENT_ID</code> and{' '}
              <code className="font-mono">GITHUB_CLIENT_SECRET</code> in Secrets with callback URL:{' '}
              <code className="font-mono break-all">{callbackUrl}</code>
            </p>
            <p>
              You can also authorise and ingest any public GitHub repository immediately below
              using <code className="font-mono">owner/repo</code>.
            </p>
          </div>
        )}

        {/* Authorise Repository Form */}
        <form onSubmit={handleAuthoriseRepo} className="flex flex-wrap items-center gap-3 pt-2">
          <input
            type="text"
            required
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="Authorise repository (e.g. expressjs/express or org/service)"
            className="flex-1 min-w-[260px] px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap cursor-pointer"
          >
            Authorise Repository
          </button>
        </form>
      </div>

      {/* Authorised Repositories Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
            Repository Access Control & Sync Status
          </h2>
        </div>

        {loading ? (
          <div className="h-32 animate-pulse bg-slate-50 dark:bg-slate-950" />
        ) : repositories.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No repositories authorised yet. Add an <code className="font-mono">owner/repo</code>{' '}
            above to run static dependency parsing and commit history import.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60">
                  <th className="py-2.5 px-4 font-medium">Repository</th>
                  <th className="py-2.5 px-4 font-medium">Branch</th>
                  <th className="py-2.5 px-4 font-medium">Authorisation</th>
                  <th className="py-2.5 px-4 font-medium text-right">Files</th>
                  <th className="py-2.5 px-4 font-medium text-right">Commits / PRs</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {repositories.map((repo) => (
                  <tr key={repo.id}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                        <span>{repo.fullName}</span>
                        {repo.isDemo && (
                          <span className="text-[11px] font-sans text-slate-500">
                            (Demo)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {repo.defaultBranch}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleAuth(repo)}
                        className="underline text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        {repo.isAuthorised ? 'Authorised (Revoke)' : 'Revoked (Authorise)'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {repo.fileCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {repo.commitCount} / {repo.prCount}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={!repo.isAuthorised || syncingId === repo.id}
                        onClick={() => handleSyncRepo(repo.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${syncingId === repo.id ? 'animate-spin' : ''}`}
                        />
                        <span>{syncingId === repo.id ? 'Syncing...' : 'Sync Now'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Extensible Integration Architecture (Jira, Linear, Slack, Notion, CI/CD) */}
      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
          Extensible Ecosystem Connectors (Modular Adapter Architecture)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              name: 'Jira & Linear',
              purpose: 'Link engineering epics and bug tickets to ADR Decision DNA.',
            },
            {
              name: 'Slack',
              purpose: 'Deliver pre-merge Change Impact digests to squad channels.',
            },
            {
              name: 'Notion',
              purpose: 'Index RFCs and architectural postmortems alongside GitHub PRs.',
            },
            {
              name: 'CI/CD Pipelines',
              purpose: 'Run automated risk gates on GitHub Actions pull requests.',
            },
          ].map((adapter) => (
            <div
              key={adapter.name}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <p className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                {adapter.name}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {adapter.purpose}
              </p>
              <p className="mt-3 text-[11px] font-mono text-slate-400">
                Adapter Ready · Phase 2+ Rollout
              </p>
            </div>
          ))}
        </div>
      </div>

      {recentChanges.length > 0 && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-3">
            Recently Ingested Commits & Pull Requests
          </h3>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {recentChanges.slice(0, 8).map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-slate-800 dark:text-slate-200 truncate">
                  <span className="font-mono text-blue-700 dark:text-blue-400 mr-2">
                    {c.externalRef}
                  </span>
                  {c.title}
                </span>
                <span className="font-mono text-slate-500 shrink-0">
                  {c.authorLogin} · {new Date(c.occurredAt).toLocaleDateString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
