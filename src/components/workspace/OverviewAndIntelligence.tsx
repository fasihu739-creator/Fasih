import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface OverviewResponse {
  isDemoWorkspace: boolean;
  metrics: {
    authorisedRepositories: { value: number; totalTracked: number; formula: string };
    architectureComplexity: {
      avgComplexity: number;
      totalComponents: number;
      totalEdges: number;
      driftEdges: number;
      formula: string;
    };
    technicalDebt: {
      openFindings: number;
      highSeverity: number;
      avgTestCoveragePct: number | null;
      formula: string;
    };
    incidentMemory: { totalIncidents: number; sev1AndSev2: number; formula: string };
    knowledgeCoverage: {
      percentage: number;
      coveredComponents: number;
      totalComponents: number;
      totalDecisions: number;
      formula: string;
    };
    changeRiskSummary: {
      reportsGenerated: number;
      highOrCriticalReports: number;
      formula: string;
    };
  };
  recentReports: Array<{
    id: number;
    title: string;
    riskLevel: string;
    confidenceLevel: string;
    createdAt: string;
  }>;
  recentDecisions: Array<{
    id: number;
    adrCode: string;
    title: string;
    authorName: string;
    outcomeStatus: string;
  }>;
  recentIncidents: Array<{
    id: number;
    incidentCode: string;
    title: string;
    severity: string;
    category: string;
    downtimeMinutes: number;
  }>;
  recentChanges: Array<{
    id: number;
    refType: string;
    externalRef: string;
    title: string;
    authorLogin: string;
    occurredAt: string;
  }>;
  components: Array<{
    id: number;
    name: string;
    componentType: string;
    filePath: string;
    language: string;
    linesOfCode: number;
    complexityScore: number;
    testCoveragePct: number | null;
    churnCount: number;
  }>;
}

interface Props {
  orgId: number;
  mode: 'overview' | 'intelligence';
  onNavigate: (tab: string) => void;
}

export function OverviewAndIntelligence({ orgId, mode, onNavigate }: Props) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<OverviewResponse>(`/api/orgs/${orgId}/overview`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load engineering metrics.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900">
        <p className="text-sm text-red-700 dark:text-red-400">
          {error ?? 'No overview data available.'}
        </p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const { metrics } = data;
  const filteredComponents = data.components.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.filePath.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            {mode === 'overview'
              ? 'Engineering Overview'
              : 'Engineering Intelligence & Metric Transparency'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {mode === 'overview'
              ? 'Unified view connecting repositories, architectural decisions, incidents, and change risk.'
              : 'Every metric below displays its exact calculation formula from indexed organisation records.'}
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Primary KPI Grid — Flat single elevation, transparent formulas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Authorised Repositories
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
            {metrics.authorisedRepositories.value}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              / {metrics.authorisedRepositories.totalTracked} tracked
            </span>
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {metrics.authorisedRepositories.formula}
          </p>
        </div>

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Knowledge Coverage
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
            {metrics.knowledgeCoverage.percentage}%
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              ({metrics.knowledgeCoverage.coveredComponents}/{metrics.knowledgeCoverage.totalComponents} components)
            </span>
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {metrics.knowledgeCoverage.formula}
          </p>
        </div>

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Architecture Complexity & Drift
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
            {metrics.architectureComplexity.avgComplexity}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              avg · {metrics.architectureComplexity.driftEdges} drift edges
            </span>
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {metrics.architectureComplexity.formula}
          </p>
        </div>

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Technical Debt Radar
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
            {metrics.technicalDebt.openFindings}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              open ({metrics.technicalDebt.highSeverity} high)
            </span>
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {metrics.technicalDebt.formula}
          </p>
        </div>

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Incident Memory
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
            {metrics.incidentMemory.totalIncidents}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              ({metrics.incidentMemory.sev1AndSev2} SEV-1/2)
            </span>
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {metrics.incidentMemory.formula}
          </p>
        </div>

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Change Risk Evaluations
          </p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
            {metrics.changeRiskSummary.reportsGenerated}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              ({metrics.changeRiskSummary.highOrCriticalReports} high/critical)
            </span>
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {metrics.changeRiskSummary.formula}
          </p>
        </div>
      </div>

      {data.components.length === 0 ? (
        <div className="p-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
          <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
            No repositories indexed in this organisation yet
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Connect GitHub or authorise your first repository in Integrations to populate real
            dependency graphs, commit history, and change impact intelligence.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('integrations')}
            className="mt-5 px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white cursor-pointer"
          >
            Configure GitHub Integration
          </button>
        </div>
      ) : mode === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Change Impact Reports */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                Recent Change Impact Reports
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('impact')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Open Predictor
              </button>
            </div>
            {data.recentReports.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No impact reports generated yet. Run an analysis before your next PR.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.recentReports.map((rep) => (
                  <li key={rep.id} className="py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {rep.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Risk: {rep.riskLevel.toUpperCase()} · Confidence: {rep.confidenceLevel} ·{' '}
                      {new Date(rep.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Engineering Decisions & Incidents */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                Decision DNA & Incident Timeline
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('decisions')}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                View All ADRs
              </button>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.recentDecisions.map((d) => (
                <li key={`dec-${d.id}`} className="py-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-xs text-blue-700 dark:text-blue-400 mr-2">
                      {d.adrCode}
                    </span>
                    {d.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {d.authorName} · Outcome: {d.outcomeStatus.replace(/_/g, ' ')}
                  </p>
                </li>
              ))}
              {data.recentIncidents.map((inc) => (
                <li key={`inc-${inc.id}`} className="py-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-xs text-red-700 dark:text-red-400 mr-2">
                      {inc.incidentCode}
                    </span>
                    {inc.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {inc.severity.toUpperCase()} · {inc.category} · {inc.downtimeMinutes}m downtime
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        /* Engineering Intelligence Detailed Component Health Table */
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                Indexed Component Health & Complexity Ledger
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Measured directly from static AST branch counts, LOC, and test-file pairing.
              </p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter components or paths..."
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 w-64"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60">
                  <th className="py-2.5 px-4 font-medium">Component</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium">File Path</th>
                  <th className="py-2.5 px-4 font-medium text-right">LOC</th>
                  <th className="py-2.5 px-4 font-medium text-right">Complexity</th>
                  <th className="py-2.5 px-4 font-medium text-right">Coverage</th>
                  <th className="py-2.5 px-4 font-medium text-right">Churn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredComponents.map((comp) => (
                  <tr
                    key={comp.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {comp.name}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {comp.componentType}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {comp.filePath}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {comp.linesOfCode}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {comp.complexityScore}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {comp.testCoveragePct !== null ? `${comp.testCoveragePct}%` : 'Unverified'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {comp.churnCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
