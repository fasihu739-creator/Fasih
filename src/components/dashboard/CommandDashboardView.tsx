import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  GitBranch,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface CommandDashboardProps {
  mode: 'live' | 'preview';
  orgId?: number;
  engineerCount?: number;
  onNavigateTab: (tab: string) => void;
  onRequireSignIn?: () => void;
}

interface DashboardStats {
  repositoriesCount: number;
  repositoriesDelta: string;
  developersCount: number;
  healthPct: number;
  needsAttentionPct: number;
  criticalPct: number;
  riskLabel: string;
  impactScorePct: number;
  impactFile: string;
  affectedModules: number;
  affectedServices: number;
  recommendedTests: number;
  intelligenceScore: number;
  lastIncidentLabel: string;
  debtPct: number;
  debtBreakdown: { critical: number; high: number; medium: number; low: number };
  driftPctLabel: string;
  isDemo: boolean;
}

interface AssistantSnippet {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  bullets?: string[];
  followUp?: string;
}

const PREVIEW_STATS: DashboardStats = {
  repositoriesCount: 25,
  repositoriesDelta: '+2 new',
  developersCount: 48,
  healthPct: 92,
  needsAttentionPct: 6,
  criticalPct: 2,
  riskLabel: 'Low',
  impactScorePct: 78,
  impactFile: 'payment-service.ts',
  affectedModules: 4,
  affectedServices: 2,
  recommendedTests: 12,
  intelligenceScore: 94,
  lastIncidentLabel: 'Last Incident · 12 days ago',
  debtPct: 34,
  debtBreakdown: { critical: 12, high: 22, medium: 34, low: 32 },
  driftPctLabel: '+18%',
  isDemo: true,
};

const INITIAL_PREVIEW_MESSAGES: AssistantSnippet[] = [
  {
    id: 'm1',
    role: 'assistant',
    text: 'How can I help you today?',
  },
  {
    id: 'm2',
    role: 'user',
    text: 'What will be the impact if we change the payment logic?',
  },
  {
    id: 'm3',
    role: 'assistant',
    text: "Here's the analysis based on Decision DNA & dependencies:",
    bullets: [
      '4 modules affected (incl. PaymentOrchestratorService)',
      '78% estimated change impact radius',
      '2 historical incident risks surfaced (INC-2026-041)',
    ],
    followUp: 'Would you like to see recommended tests?',
  },
];

export function CommandDashboardView({
  mode,
  orgId,
  engineerCount = 48,
  onNavigateTab,
  onRequireSignIn,
}: CommandDashboardProps) {
  const [timeframe, setTimeframe] = useState<'30d' | '90d' | '6m'>('30d');
  const [stats, setStats] = useState<DashboardStats>(PREVIEW_STATS);
  const [loading, setLoading] = useState(mode === 'live');
  const [messages, setMessages] = useState<AssistantSnippet[]>(INITIAL_PREVIEW_MESSAGES);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const loadLiveStats = useCallback(async () => {
    if (mode !== 'live' || !orgId) return;
    setLoading(true);
    try {
      const [overview, debtRes, archRes, impactRes] = await Promise.all([
        apiFetch<{
          isDemoWorkspace: boolean;
          metrics: {
            authorisedRepositories: { value: number; totalTracked: number };
            architectureComplexity: {
              avgComplexity: number;
              totalComponents: number;
              totalEdges: number;
              driftEdges: number;
            };
            technicalDebt: {
              openFindings: number;
              highSeverity: number;
              avgTestCoveragePct: number | null;
            };
            incidentMemory: { totalIncidents: number; sev1AndSev2: number };
            knowledgeCoverage: { percentage: number; totalDecisions: number };
            changeRiskSummary: {
              reportsGenerated: number;
              highOrCriticalReports: number;
            };
          };
          recentIncidents: Array<{ occurredAt: string }>;
        }>(`/api/orgs/${orgId}/overview`),
        apiFetch<{
          findings: Array<{ severity: string; status: string }>;
        }>(`/api/orgs/${orgId}/technical-debt`),
        apiFetch<{
          edges: Array<{ driftDetected: boolean }>;
        }>(`/api/orgs/${orgId}/architecture`),
        apiFetch<{
          reports: Array<{
            title: string;
            riskLevel: string;
            targetFilesJson: string[];
            affectedServicesJson: string[];
            recommendedTestsJson: string[];
          }>;
        }>(`/api/orgs/${orgId}/impact`),
      ]);

      const totalComps = Math.max(1, overview.metrics.architectureComplexity.totalComponents);
      const openDebt = debtRes.findings.filter((f) => f.status !== 'resolved');
      const highDebt = openDebt.filter((f) => f.severity === 'high').length;
      const criticalPct = Math.min(25, Math.round((highDebt / totalComps) * 100));
      const needsAttentionPct = Math.min(35, Math.round((openDebt.length / totalComps) * 100));
      const healthPct = Math.max(40, 100 - criticalPct - needsAttentionPct);

      const latestReport = impactRes.reports[0];
      const riskToPct: Record<string, number> = {
        critical: 92,
        high: 78,
        moderate: 46,
        low: 18,
      };

      const totalEdges = Math.max(1, archRes.edges.length);
      const driftEdges = archRes.edges.filter((e) => e.driftDetected).length;
      const driftPct = Math.round((driftEdges / totalEdges) * 100);

      const totalDebtCount = Math.max(1, debtRes.findings.length);
      const medDebt = openDebt.filter((f) => f.severity === 'medium').length;
      const lowDebt = openDebt.filter((f) => f.severity === 'low').length;

      const latestIncidentDate = overview.recentIncidents[0]?.occurredAt;
      let lastIncidentLabel = 'No incidents recorded';
      if (latestIncidentDate) {
        const diffDays = Math.max(
          0,
          Math.round(
            (Date.now() - new Date(latestIncidentDate).getTime()) / (1000 * 60 * 60 * 24)
          )
        );
        lastIncidentLabel = `Last Incident · ${diffDays} days ago`;
      }

      const debtPct = Math.min(
        85,
        Math.round((openDebt.length / Math.max(1, totalComps)) * 100)
      );
      const intelligenceScore = Math.min(
        98,
        Math.max(
          52,
          Math.round(
            healthPct * 0.65 +
              Math.min(100, overview.metrics.knowledgeCoverage.percentage + 25) * 0.35
          )
        )
      );

      setStats({
        repositoriesCount: overview.metrics.authorisedRepositories.value,
        repositoriesDelta: `${overview.metrics.authorisedRepositories.totalTracked} tracked`,
        developersCount: engineerCount,
        healthPct,
        needsAttentionPct,
        criticalPct,
        riskLabel:
          overview.metrics.changeRiskSummary.highOrCriticalReports > 0
            ? 'Elevated'
            : 'Low',
        impactScorePct: latestReport
          ? riskToPct[latestReport.riskLevel] ?? 50
          : 24,
        impactFile:
          latestReport?.targetFilesJson[0] ?? 'payment-orchestrator.ts',
        affectedModules: latestReport?.affectedServicesJson.length ?? 0,
        affectedServices: overview.metrics.authorisedRepositories.value,
        recommendedTests: latestReport?.recommendedTestsJson.length ?? 0,
        intelligenceScore,
        lastIncidentLabel,
        debtPct,
        debtBreakdown: {
          critical: Math.round((highDebt / totalDebtCount) * 40),
          high: Math.round((highDebt / totalDebtCount) * 60),
          medium: Math.round((medDebt / totalDebtCount) * 100) || 34,
          low: Math.round((lowDebt / totalDebtCount) * 100) || 32,
        },
        driftPctLabel: `+${driftPct}%`,
        isDemo: overview.isDemoWorkspace,
      });
    } catch (err) {
      console.error('Failed to load command dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, [mode, orgId, engineerCount]);

  useEffect(() => {
    loadLiveStats();
  }, [loadLiveStats]);

  const handleAssistantSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q) return;

    if (mode === 'preview' || !orgId) {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', text: q },
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: 'Sign in with Google to run live Gemini intelligence grounded in your repositories, ADRs, and incident history.',
        },
      ]);
      setChatInput('');
      return;
    }

    setChatLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: q },
    ]);
    setChatInput('');
    try {
      const res = await apiFetch<{
        assistantMessage: {
          content: string;
          confirmedFactsJson: string[] | null;
          confidence: string | null;
        };
      }>(`/api/orgs/${orgId}/assistant/ask`, {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.assistantMessage.content,
          bullets: res.assistantMessage.confirmedFactsJson?.slice(0, 3) ?? undefined,
          followUp: res.assistantMessage.confidence
            ? `Confidence: ${res.assistantMessage.confidence.toUpperCase()}`
            : undefined,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text:
            err instanceof Error
              ? err.message
              : 'Unable to query AI Engineering Assistant.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Ring math for 92% Healthy & 94/100 & 34% Debt
  const r = 40;
  const circ = 2 * Math.PI * r;
  const healthDash = (stats.healthPct / 100) * circ;
  const scoreDash = (stats.intelligenceScore / 100) * circ;
  const debtDash = (stats.debtPct / 100) * circ;

  return (
    <div className="space-y-5">
      {/* Top KPI Summary Row + Timeframe Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 items-stretch">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-500 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Repositories</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                {loading ? '—' : stats.repositoriesCount}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {stats.repositoriesDelta}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Developers</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                {loading ? '—' : stats.developersCount}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                UK Team
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Health Score</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                {loading ? '—' : `${stats.healthPct}%`}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {stats.healthPct >= 80 ? 'Strong' : 'Monitor'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Risk Level</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                {loading ? '—' : stats.riskLabel}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Grounded
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-center">
          <label
            htmlFor="dashboard-timeframe"
            className="text-[11px] text-slate-500 dark:text-slate-400 mb-1"
          >
            Telemetry Window
          </label>
          <select
            id="dashboard-timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as '30d' | '90d' | '6m')}
            className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-slate-50 dark:bg-[#080D24] text-slate-900 dark:text-slate-100 cursor-pointer"
          >
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="6m">Last 6 months</option>
          </select>
        </div>
      </div>

      {/* Main 12-Column Command Bento + Right-Docked AI Assistant */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Left/Center 8 Columns: 6 Visualization Cards */}
        <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Codebase Overview */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
              Codebase Overview
            </h2>
            <div className="my-4 flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-slate-200 dark:text-slate-800"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="#06B6D4"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${healthDash} ${circ}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono tabular-nums text-lg font-bold text-slate-950 dark:text-white">
                    {stats.healthPct}%
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Healthy
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs flex-1">
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span>Healthy</span>
                  <span className="font-mono tabular-nums text-cyan-600 dark:text-cyan-400">
                    {stats.healthPct}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span>Attention</span>
                  <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {stats.needsAttentionPct}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span>Critical</span>
                  <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                    {stats.criticalPct}%
                  </span>
                </div>
              </div>
            </div>
            {/* Trend Sparkline */}
            <svg viewBox="0 0 220 44" className="w-full h-10">
              <defs>
                <linearGradient id="codebaseSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 36 L35 28 L70 30 L105 18 L140 22 L175 11 L220 14 L220 44 L0 44 Z"
                fill="url(#codebaseSpark)"
              />
              <path
                d="M0 36 L35 28 L70 30 L105 18 L140 22 L175 11 L220 14"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
              />
            </svg>
          </div>

          {/* Card 2: Change Impact Predictor */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                Change Impact Predictor
              </h2>
              <p className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {stats.impactFile}
              </p>
            </div>

            <div className="my-3 grid grid-cols-12 gap-2 items-center">
              {/* Mini Dependency Graph */}
              <svg viewBox="0 0 130 110" className="col-span-7 w-full h-24">
                <line x1="25" y1="28" x2="65" y2="55" stroke="#6366F1" strokeWidth="1.5" />
                <line x1="25" y1="82" x2="65" y2="55" stroke="#6366F1" strokeWidth="1.5" />
                <line x1="65" y1="55" x2="105" y2="25" stroke="#38BDF8" strokeWidth="1.5" />
                <line x1="65" y1="55" x2="108" y2="62" stroke="#38BDF8" strokeWidth="1.5" />
                <line x1="65" y1="55" x2="92" y2="95" stroke="#F59E0B" strokeWidth="1.5" />
                <circle cx="25" cy="28" r="10" fill="#1E293B" stroke="#6366F1" />
                <text x="25" y="31" textAnchor="middle" className="fill-slate-200 text-[7px]">
                  API
                </text>
                <circle cx="25" cy="82" r="10" fill="#1E293B" stroke="#6366F1" />
                <text x="25" y="85" textAnchor="middle" className="fill-slate-200 text-[7px]">
                  Auth
                </text>
                <circle cx="65" cy="55" r="16" fill="#3B82F6" />
                <text x="65" y="57" textAnchor="middle" className="fill-white text-[7px] font-bold">
                  Payment
                </text>
                <circle cx="105" cy="25" r="10" fill="#1E293B" stroke="#38BDF8" />
                <text x="105" y="28" textAnchor="middle" className="fill-slate-200 text-[6px]">
                  DB
                </text>
                <circle cx="108" cy="62" r="10" fill="#1E293B" stroke="#38BDF8" />
                <text x="108" y="65" textAnchor="middle" className="fill-slate-200 text-[6px]">
                  UI
                </text>
                <circle cx="92" cy="95" r="9" fill="#1E293B" stroke="#F59E0B" />
                <text x="92" y="98" textAnchor="middle" className="fill-slate-200 text-[6px]">
                  Hooks
                </text>
              </svg>

              <div className="col-span-5 space-y-2 text-[11px]">
                <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-700 dark:text-red-300">
                  <p className="font-semibold">High Impact</p>
                  <p className="font-mono tabular-nums font-bold">
                    {stats.impactScorePct}% radius
                  </p>
                </div>
                <div className="text-slate-600 dark:text-slate-300 font-mono tabular-nums space-y-0.5">
                  <p>• {stats.affectedModules} Modules</p>
                  <p>• {stats.affectedServices} Services</p>
                  <p>• {stats.recommendedTests} Tests</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('impact')}
              className="w-full py-1.5 px-3 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: Engineering Intelligence Score */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
              Engineering Intelligence
            </h2>

            <div className="my-4 flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-slate-200 dark:text-slate-800"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${scoreDash} ${circ}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono tabular-nums text-xl font-bold text-slate-950 dark:text-white">
                    {stats.intelligenceScore}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    / 100
                  </span>
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Maintainability</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Stability</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Knowledge DNA</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Debt Control</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('intelligence')}
              className="w-full py-1.5 px-3 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              Inspect Formula Breakdown
            </button>
          </div>

          {/* Card 4: Historical Incidents */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                Historical Incidents
              </h2>
              <button
                type="button"
                onClick={() => onNavigateTab('incidents')}
                className="text-[11px] text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Timeline
              </button>
            </div>

            <div className="my-3">
              <p className="text-xs font-mono text-slate-500 dark:text-slate-300 mb-2">
                {stats.lastIncidentLabel}
              </p>
              <svg viewBox="0 0 220 74" className="w-full h-16">
                <defs>
                  <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 58 L35 50 L60 28 L95 54 L130 40 L165 44 L195 60 L220 48 L220 74 L0 74 Z"
                  fill="url(#incFill)"
                />
                <path
                  d="M0 58 L35 50 L60 28 L95 54 L130 40 L165 44 L195 60 L220 48"
                  fill="none"
                  stroke="#F87171"
                  strokeWidth="2"
                />
                <circle cx="60" cy="28" r="3.5" fill="#EF4444" />
                <circle cx="130" cy="40" r="3.5" fill="#F59E0B" />
                <circle cx="195" cy="60" r="3.5" fill="#F87171" />
              </svg>
              <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span>Apr</span>
                <span>May</span>
                <span>Jun</span>
                <span>Jul</span>
              </div>
            </div>
          </div>

          {/* Card 5: Technical Debt Radar */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
              Technical Debt Radar
            </h2>

            <div className="my-3 flex items-center gap-3">
              <div className="relative w-20 h-20 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-slate-200 dark:text-slate-800"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="12"
                    strokeDasharray={`${debtDash} ${circ}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono tabular-nums text-sm font-bold text-slate-950 dark:text-white">
                    {stats.debtPct}%
                  </span>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400">
                    Debt
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="text-red-600 dark:text-red-400">Critical</span>
                  <span>{stats.debtBreakdown.critical}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-600 dark:text-amber-400">High</span>
                  <span>{stats.debtBreakdown.high}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600 dark:text-yellow-300">Medium</span>
                  <span>{stats.debtBreakdown.medium}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400">Low</span>
                  <span>{stats.debtBreakdown.low}%</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('debt')}
              className="w-full py-1.5 px-3 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-indigo-500/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>View Report</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 6: Architecture Drift */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90 flex flex-col justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
              Architecture Drift
            </h2>

            <div className="my-3 flex items-center justify-between gap-2">
              <svg viewBox="0 0 110 75" className="w-28 h-20">
                <line x1="20" y1="20" x2="55" y2="16" stroke="#6366F1" strokeWidth="1.4" />
                <line x1="55" y1="16" x2="90" y2="30" stroke="#6366F1" strokeWidth="1.4" />
                <line x1="20" y1="20" x2="36" y2="55" stroke="#38BDF8" strokeWidth="1.4" />
                <line
                  x1="36"
                  y1="55"
                  x2="90"
                  y2="30"
                  stroke="#F59E0B"
                  strokeWidth="1.8"
                  strokeDasharray="3 2"
                />
                <circle cx="20" cy="20" r="6" fill="#3B82F6" />
                <circle cx="55" cy="16" r="6" fill="#6366F1" />
                <circle cx="90" cy="30" r="6" fill="#06B6D4" />
                <circle cx="36" cy="55" r="6" fill="#F59E0B" />
              </svg>

              <div className="text-right">
                <p className="font-mono tabular-nums text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.driftPctLabel}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  vs Planned
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('architecture')}
              className="w-full py-1.5 px-3 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-indigo-500/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>View Analysis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right 4 Columns: Docked AI Engineering Assistant */}
        <div className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-indigo-500/30 bg-white dark:bg-[#0D1535]/95 flex flex-col justify-between min-h-[430px]">
          <div className="p-4 border-b border-slate-200 dark:border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-600 dark:text-cyan-400 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                  AI Engineering Assistant
                </h2>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {mode === 'live' ? 'Evidence-Grounded Ready' : 'Demo Preview Mode'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('assistant')}
              className="text-xs text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Full View
            </button>
          </div>

          <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[340px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === 'user'
                    ? 'ml-auto max-w-[88%] px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs leading-relaxed'
                    : 'mr-auto max-w-[94%] p-3.5 rounded-xl border border-slate-200 dark:border-indigo-500/20 bg-slate-50 dark:bg-[#131D47] text-slate-800 dark:text-slate-200 text-xs space-y-2'
                }
              >
                <p className="leading-relaxed">{msg.text}</p>
                {msg.bullets && msg.bullets.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {msg.bullets.map((b, i) => (
                      <li key={i}>• {b}</li>
                    ))}
                  </ul>
                )}
                {msg.followUp && (
                  <p className="text-[11px] text-indigo-600 dark:text-cyan-300">
                    {msg.followUp}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-indigo-500/20 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  mode === 'live'
                    ? onNavigateTab('impact')
                    : onRequireSignIn?.()
                }
                className="text-[11px] font-medium text-blue-700 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                {mode === 'live'
                  ? 'Show Recommended Tests →'
                  : 'Sign In to Analyse Live Repos →'}
              </button>
              <span className="text-[10px] font-mono text-slate-400">
                <GitBranch className="w-3 h-3 inline mr-1" />
                {stats.isDemo ? 'Demo DNA' : 'Live Org'}
              </span>
            </div>

            <form onSubmit={handleAssistantSend} className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask anything about your codebase..."
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-slate-50 dark:bg-[#080D24] text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={chatLoading}
                aria-label="Send question"
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Capabilities & Business Value Row (matches mockup!) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-9 p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90">
          <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-4">
            Key Features — What It Does
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { num: '1. Understand Code', sub: 'Analyse repositories', tab: 'intelligence' },
              { num: '2. Decision DNA', sub: 'Keep ADR history', tab: 'decisions' },
              { num: '3. Predict Impact', sub: 'Pre-merge blast radius', tab: 'impact' },
              { num: '4. Mistake Memory', sub: 'Surface past outages', tab: 'incidents' },
              { num: '5. Tech Debt Radar', sub: 'Spot coupling & churn', tab: 'debt' },
              { num: '6. AI Assistant', sub: 'Grounded Q&A', tab: 'assistant' },
              { num: '7. Architecture Map', sub: 'Detect silent drift', tab: 'architecture' },
            ].map((feat) => (
              <button
                key={feat.num}
                type="button"
                onClick={() => onNavigateTab(feat.tab)}
                className="text-left p-3 rounded-lg border border-slate-200 dark:border-indigo-500/20 bg-slate-50 dark:bg-[#111B45]/80 hover:border-indigo-400 transition-colors cursor-pointer"
              >
                <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                  {feat.num}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {feat.sub}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="xl:col-span-3 p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90">
          <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white mb-3">
            Business Value
          </h2>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
            {[
              'Reduce deployment risk',
              'Save investigation time',
              'Prevent repeat outages',
              'Improve code quality',
              'Evidence-backed decisions',
            ].map((val) => (
              <li key={val} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{val}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* How It Works Horizontal Flow Strip */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {[
              { step: 'Connect GitHub', desc: 'Least-privilege read access' },
              { step: 'Analyse Code & ADRs', desc: 'Dependencies & decisions' },
              { step: 'Get Grounded Insights', desc: 'Facts vs hypotheses' },
              { step: 'Ship Software Safely', desc: 'Recommended tests' },
            ].map((item, idx, arr) => (
              <React.Fragment key={item.step}>
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-cyan-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-950 dark:text-white">
                      {item.step}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.desc}
                    </p>
                  </div>
                </div>
                {idx < arr.length - 1 && (
                  <ArrowRight className="hidden sm:block w-4 h-4 text-indigo-400 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="lg:col-span-4 p-3.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-300">
              The Result:
            </p>
            <p className="text-xs font-medium text-slate-900 dark:text-white mt-0.5">
              A Smarter, Safer &amp; More Productive Engineering Team
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
