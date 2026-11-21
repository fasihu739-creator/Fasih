import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, Play } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface ChangeImpactReport {
  id: number;
  title: string;
  proposedChangeSummary: string;
  targetFilesJson: string[];
  affectedServicesJson: string[];
  dependencyChainJson: Array<{
    from: string;
    to: string;
    type: string;
    driftDetected?: boolean;
  }>;
  relatedDecisionsJson: Array<{
    id: number;
    adrCode: string;
    title: string;
    prRef?: string | null;
  }>;
  similarChangesJson: Array<{
    externalRef: string;
    title: string;
    authorLogin: string;
  }>;
  relevantIncidentsJson: Array<{
    id: number;
    incidentCode: string;
    title: string;
    severity: string;
    rootCause: string;
  }>;
  confirmedFactsJson: string[];
  aiHypothesesJson: string[];
  recommendedTestsJson: string[];
  potentialRisksJson: Array<{ area: string; severity: string; rationale: string }>;
  riskLevel: string;
  confidenceLevel: string;
  limitations: string;
  evidenceLinksJson: Array<{ label: string; ref: string; kind: string }>;
  isDemo: boolean;
  createdAt: string;
}

interface ComponentOption {
  id: number;
  name: string;
  filePath: string;
}

export function ChangeImpactView({ orgId }: { orgId: number }) {
  const [reports, setReports] = useState<ChangeImpactReport[]>([]);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [targetFilesInput, setTargetFilesInput] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        reports: ChangeImpactReport[];
        components: ComponentOption[];
      }>(`/api/orgs/${orgId}/impact`);
      setReports(data.reports);
      setComponents(data.components);
      if (data.reports.length > 0) {
        setSelectedReportId((prev) => prev ?? data.reports[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load impact reports.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setError(null);
    try {
      const targetFiles = targetFilesInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await apiFetch<{ report: ChangeImpactReport }>(
        `/api/orgs/${orgId}/impact/analyze`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            proposedChangeSummary: summary,
            targetFiles,
          }),
        }
      );

      setReports((prev) => [res.report, ...prev]);
      setSelectedReportId(res.report.id);
      setTitle('');
      setSummary('');
      setTargetFilesInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impact analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyPaymentSamplePrompt = () => {
    setTitle('Adjust Faster Payments settlement retry window in PaymentOrchestratorService');
    setSummary(
      'Increase settlement retry timeout from 300ms to 1500ms and update IdempotencyGuard key validation for Stripe webhook retries.'
    );
    setTargetFilesInput(
      'src/services/payment-orchestrator.ts, src/middleware/idempotency-guard.ts'
    );
  };

  const activeReport =
    reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            AI Change Impact Predictor
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Evaluate proposed code changes against dependencies, Decision DNA, and historical
            incidents before merge.
          </p>
        </div>
        {components.length > 0 && (
          <button
            type="button"
            onClick={applyPaymentSamplePrompt}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
          >
            Load Payment Service Proposal
          </button>
        )}
      </div>

      {/* Proposal Form */}
      <form
        onSubmit={handleAnalyze}
        className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
          Evaluate Proposed Code Change
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Change Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Refactor settlement lock ordering in PaymentOrchestratorService"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Target Files or Modules (comma-separated)
            </label>
            <input
              type="text"
              value={targetFilesInput}
              onChange={(e) => setTargetFilesInput(e.target.value)}
              placeholder={
                components[0]?.filePath || 'src/services/payment-orchestrator.ts'
              }
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Proposed Change Details / Diff Summary
          </label>
          <textarea
            rows={3}
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Describe the behaviour change, schema modification, retry policy, or API contract adjustment..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
        </div>

        {error && (
          <p className="text-xs text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reports distinguish confirmed repository facts from AI-generated risk hypotheses.
          </p>
          <button
            type="submit"
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{analyzing ? 'Analysing Impact...' : 'Generate Impact Report'}</span>
          </button>
        </div>
      </form>

      {/* Report Selector & Detailed Evidence View */}
      {loading ? (
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : reports.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No Change Impact Reports have been generated for this organisation yet. Submit a
            change proposal above to inspect dependencies and historical risks.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* History List */}
          <div className="lg:col-span-4 space-y-2">
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
              Generated Impact Reports ({reports.length})
            </h3>
            <div className="space-y-2">
              {reports.map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setSelectedReportId(rep.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    activeReport?.id === rep.id
                      ? 'border-blue-700 dark:border-blue-500 bg-white dark:bg-slate-900'
                      : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <p className="text-sm font-medium text-slate-950 dark:text-white line-clamp-2">
                    {rep.title}
                  </p>
                  <p className="mt-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Risk: {rep.riskLevel.toUpperCase()} · Confidence: {rep.confidenceLevel}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Active Report Detail */}
          {activeReport && (
            <div className="lg:col-span-8 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-7">
              <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mb-2">
                  <span>
                    Risk Level: {activeReport.riskLevel.toUpperCase()} · Confidence:{' '}
                    {activeReport.confidenceLevel.toUpperCase()}
                    {activeReport.isDemo ? ' · DEMO WORKSPACE RECORD' : ''}
                  </span>
                  <span>{new Date(activeReport.createdAt).toLocaleString('en-GB')}</span>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-950 dark:text-white">
                  {activeReport.title}
                </h2>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {activeReport.proposedChangeSummary}
                </p>
              </div>

              {/* Confirmed Facts vs AI Hypotheses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                      Confirmed Facts (Verified Records)
                    </h3>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {activeReport.confirmedFactsJson.length === 0 ? (
                      <li className="text-xs text-slate-500">
                        No direct repository matches confirmed yet.
                      </li>
                    ) : (
                      activeReport.confirmedFactsJson.map((fact, idx) => (
                        <li key={idx} className="leading-relaxed">
                          • {fact}
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                      AI-Generated Hypotheses (Unverified Risks)
                    </h3>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {activeReport.aiHypothesesJson.map((hyp, idx) => (
                      <li key={idx} className="leading-relaxed">
                        • {hyp}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Affected Services & Dependency Relationships */}
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                  Affected Services & Dependency Relationships
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                  {activeReport.affectedServicesJson.length > 0
                    ? activeReport.affectedServicesJson.join(' · ')
                    : 'No indexed component dependencies matched.'}
                </p>
                {activeReport.dependencyChainJson.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {activeReport.dependencyChainJson.map((edge, idx) => (
                      <div
                        key={idx}
                        className="text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70 last:border-b-0"
                      >
                        <span>
                          {edge.from} --[{edge.type}]--&gt; {edge.to}
                        </span>
                        {edge.driftDetected && (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            Architecture Drift
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Historical Decisions & Relevant Incidents */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-2">
                    Related Historical Decisions
                  </h3>
                  {activeReport.relatedDecisionsJson.length === 0 ? (
                    <p className="text-xs text-slate-500">No linked ADRs found.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activeReport.relatedDecisionsJson.map((d, idx) => (
                        <li key={idx} className="text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-mono text-blue-700 dark:text-blue-400 mr-1.5">
                            {d.adrCode}
                          </span>
                          {d.title} {d.prRef ? `(${d.prRef})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-2">
                    Relevant Historical Incidents
                  </h3>
                  {activeReport.relevantIncidentsJson.length === 0 ? (
                    <p className="text-xs text-slate-500">No matching incidents recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {activeReport.relevantIncidentsJson.map((inc, idx) => (
                        <li key={idx} className="text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-mono text-red-700 dark:text-red-400 mr-1.5">
                            {inc.incidentCode} ({inc.severity.toUpperCase()})
                          </span>
                          {inc.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Recommended Tests & Potential Risks */}
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-2">
                    Recommended Pre-Deployment Tests
                  </h3>
                  <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {activeReport.recommendedTestsJson.map((test, idx) => (
                      <li key={idx}>• {test}</li>
                    ))}
                  </ul>
                </div>

                {activeReport.potentialRisksJson.length > 0 && (
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-2">
                      Potential Risks
                    </h3>
                    <div className="space-y-2">
                      {activeReport.potentialRisksJson.map((risk, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-slate-700 dark:text-slate-300 py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
                        >
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {risk.area} ({risk.severity}):
                          </span>{' '}
                          {risk.rationale}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Evidence Links & Limitations */}
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                {activeReport.evidenceLinksJson.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Evidence:
                    </span>
                    <span className="font-mono">
                      {activeReport.evidenceLinksJson.map((e) => e.label).join(' · ')}
                    </span>
                  </div>
                )}
                <p>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Limitations & Uncertainty:
                  </span>{' '}
                  {activeReport.limitations}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
