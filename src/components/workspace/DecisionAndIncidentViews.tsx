import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface DecisionRecord {
  id: number;
  title: string;
  adrCode: string;
  status: string;
  context: string;
  decision: string;
  consequences: string;
  authorName: string;
  prRef: string | null;
  commitSha: string | null;
  affectedComponentsJson: string[];
  outcomeSummary: string | null;
  outcomeStatus: string;
  decidedAt: string;
  isDemo: boolean;
}

interface IncidentRecord {
  id: number;
  title: string;
  incidentCode: string;
  severity: string;
  category: string;
  rootCause: string;
  resolution: string;
  postmortemUrl: string | null;
  prRef: string | null;
  affectedComponentsJson: string[];
  downtimeMinutes: number;
  occurredAt: string;
  isDemo: boolean;
}

export function DecisionMemoryView({ orgId }: { orgId: number }) {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    adrCode: 'ADR-021',
    title: '',
    authorName: '',
    prRef: '',
    commitSha: '',
    affectedComponents: '',
    context: '',
    decision: '',
    consequences: '',
    outcomeSummary: '',
    outcomeStatus: 'pending_review',
  });

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ decisions: DecisionRecord[] }>(
        `/api/orgs/${orgId}/decisions`
      );
      setDecisions(res.decisions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load decisions.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadDecisions();
  }, [loadDecisions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ decision: DecisionRecord }>(
        `/api/orgs/${orgId}/decisions`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            affectedComponents: form.affectedComponents
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        }
      );
      setDecisions((prev) => [res.decision, ...prev]);
      setShowForm(false);
      setForm({
        adrCode: `ADR-0${decisions.length + 22}`,
        title: '',
        authorName: '',
        prRef: '',
        commitSha: '',
        affectedComponents: '',
        context: '',
        decision: '',
        consequences: '',
        outcomeSummary: '',
        outcomeStatus: 'pending_review',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save ADR.');
    }
  };

  const filtered = decisions.filter((d) =>
    `${d.adrCode} ${d.title} ${d.authorName} ${d.decision}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Engineering Decision DNA
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Architectural Decision Records linked to authors, pull requests, affected systems, and
            real-world outcomes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ADRs or authors..."
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showForm ? 'Cancel' : 'Record Decision'}</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                ADR Code
              </label>
              <input
                required
                value={form.adrCode}
                onChange={(e) => setForm((p) => ({ ...p, adrCode: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Decision Title
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Isolate settlement queue consumer from API pods"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Decision Author
              </label>
              <input
                required
                value={form.authorName}
                onChange={(e) => setForm((p) => ({ ...p, authorName: e.target.value }))}
                placeholder="Name & role"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Linked PR / Commit
              </label>
              <input
                value={form.prRef}
                onChange={(e) => setForm((p) => ({ ...p, prRef: e.target.value }))}
                placeholder="e.g. PR #502"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Affected Components
              </label>
              <input
                value={form.affectedComponents}
                onChange={(e) =>
                  setForm((p) => ({ ...p, affectedComponents: e.target.value }))
                }
                placeholder="PaymentOrchestratorService, LedgerPostgresCluster"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Context & Problem
              </label>
              <textarea
                required
                rows={3}
                value={form.context}
                onChange={(e) => setForm((p) => ({ ...p, context: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Chosen Decision
              </label>
              <textarea
                required
                rows={3}
                value={form.decision}
                onChange={(e) => setForm((p) => ({ ...p, decision: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Trade-offs & Consequences
              </label>
              <input
                required
                value={form.consequences}
                onChange={(e) => setForm((p) => ({ ...p, consequences: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Post-Implementation Outcome
              </label>
              <input
                value={form.outcomeSummary}
                onChange={(e) =>
                  setForm((p) => ({ ...p, outcomeSummary: e.target.value }))
                }
                placeholder="Observed production effect..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 text-white cursor-pointer"
          >
            Save Decision Record
          </button>
        </form>
      )}

      {loading ? (
        <div className="h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          No engineering decisions recorded yet. Click “Record Decision” to document your first
          ADR.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((d) => (
            <article
              key={d.id}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono">
                  {d.adrCode} · {d.status.toUpperCase()} · {d.prRef || 'No PR linked'}
                  {d.isDemo ? ' · Demo Record' : ''}
                </span>
                <span>
                  {d.authorName} · {new Date(d.decidedAt).toLocaleDateString('en-GB')}
                </span>
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                {d.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-sm text-slate-700 dark:text-slate-300">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Context
                  </p>
                  <p className="leading-relaxed">{d.context}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Decision
                  </p>
                  <p className="leading-relaxed">{d.decision}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Consequences & Outcome
                  </p>
                  <p className="leading-relaxed">{d.consequences}</p>
                  {d.outcomeSummary && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Observed outcome: {d.outcomeSummary}
                    </p>
                  )}
                </div>
              </div>
              {d.affectedComponentsJson.length > 0 && (
                <p className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono text-slate-500 dark:text-slate-400">
                  Affected: {d.affectedComponentsJson.join(' · ')}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function IncidentMemoryView({ orgId }: { orgId: number }) {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    incidentCode: 'INC-2026-064',
    title: '',
    severity: 'sev2',
    category: 'bug',
    rootCause: '',
    resolution: '',
    prRef: '',
    affectedComponents: '',
    downtimeMinutes: 15,
  });

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ incidents: IncidentRecord[] }>(
        `/api/orgs/${orgId}/incidents`
      );
      setIncidents(res.incidents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incidents.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ incident: IncidentRecord }>(
        `/api/orgs/${orgId}/incidents`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            downtimeMinutes: Number(form.downtimeMinutes),
            affectedComponents: form.affectedComponents
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        }
      );
      setIncidents((prev) => [res.incident, ...prev]);
      setShowForm(false);
      setForm({
        incidentCode: `INC-2026-0${incidents.length + 65}`,
        title: '',
        severity: 'sev2',
        category: 'bug',
        rootCause: '',
        resolution: '',
        prRef: '',
        affectedComponents: '',
        downtimeMinutes: 15,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record incident.');
    }
  };

  const filtered =
    categoryFilter === 'all'
      ? incidents
      : incidents.filter((i) => i.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Technical Mistake & Incident Memory
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Production outages, rollbacks, database locks, and postmortems surfaced automatically
            when similar changes are proposed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{showForm ? 'Cancel' : 'Record Incident'}</span>
        </button>
      </div>

      {/* Category Filter Segmented Control */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg w-fit border border-slate-200 dark:border-slate-800">
        {['all', 'bug', 'deployment', 'rollback', 'database', 'security', 'performance'].map(
          (cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          )
        )}
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Incident Code
              </label>
              <input
                required
                value={form.incidentCode}
                onChange={(e) =>
                  setForm((p) => ({ ...p, incidentCode: e.target.value }))
                }
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Incident Title
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Connection pool exhaustion after migration"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Severity
              </label>
              <select
                value={form.severity}
                onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="sev1">SEV-1 (Critical)</option>
                <option value="sev2">SEV-2 (Major)</option>
                <option value="sev3">SEV-3 (Moderate)</option>
                <option value="sev4">SEV-4 (Minor)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="bug">Production Bug</option>
                <option value="deployment">Failed Deployment</option>
                <option value="rollback">Rollback</option>
                <option value="database">Database Issue</option>
                <option value="security">Security Incident</option>
                <option value="performance">Performance Problem</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Affected Components (comma-separated)
              </label>
              <input
                value={form.affectedComponents}
                onChange={(e) =>
                  setForm((p) => ({ ...p, affectedComponents: e.target.value }))
                }
                placeholder="PaymentOrchestratorService"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Downtime (minutes)
              </label>
              <input
                type="number"
                min={0}
                value={form.downtimeMinutes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, downtimeMinutes: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Root Cause
              </label>
              <textarea
                required
                rows={3}
                value={form.rootCause}
                onChange={(e) => setForm((p) => ({ ...p, rootCause: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Resolution & Safeguards Added
              </label>
              <textarea
                required
                rows={3}
                value={form.resolution}
                onChange={(e) => setForm((p) => ({ ...p, resolution: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 text-white cursor-pointer"
          >
            Save Incident Postmortem
          </button>
        </form>
      )}

      {loading ? (
        <div className="h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          No historical incidents recorded in this category.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((inc) => (
            <article
              key={inc.id}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>
                  {inc.incidentCode} · {inc.severity.toUpperCase()} · {inc.category} ·{' '}
                  {inc.downtimeMinutes}m downtime
                  {inc.isDemo ? ' · Demo Record' : ''}
                </span>
                <span>{new Date(inc.occurredAt).toLocaleDateString('en-GB')}</span>
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                {inc.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700 dark:text-slate-300 pt-1">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Root Cause
                  </p>
                  <p className="leading-relaxed">{inc.rootCause}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Resolution
                  </p>
                  <p className="leading-relaxed">{inc.resolution}</p>
                </div>
              </div>
              {inc.affectedComponentsJson.length > 0 && (
                <p className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono text-slate-500 dark:text-slate-400">
                  Affected: {inc.affectedComponentsJson.join(' · ')}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
