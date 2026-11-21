import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface ArchComponent {
  id: number;
  name: string;
  componentType: 'service' | 'module' | 'api' | 'database';
  filePath: string;
  language: string;
  complexityScore: number;
  testCoveragePct: number | null;
}

interface ArchEdge {
  id: number;
  sourceId: number;
  targetId: number;
  sourceName: string;
  targetName: string;
  dependencyType: string;
  isDocumented: boolean;
  driftDetected: boolean;
  evidenceRef: string | null;
}

export function ArchitectureMapView({ orgId }: { orgId: number }) {
  const [components, setComponents] = useState<ArchComponent[]>([]);
  const [edges, setEdges] = useState<ArchEdge[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        components: ArchComponent[];
        edges: ArchEdge[];
      }>(`/api/orgs/${orgId}/architecture`);
      setComponents(res.components);
      setEdges(res.edges);
      if (res.components.length > 0) {
        setSelectedId((prev) => prev ?? res.components[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load architecture map.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Layered layout coordinates inside 900x440 SVG canvas
  const layers: Record<ArchComponent['componentType'], number> = {
    api: 110,
    service: 350,
    module: 590,
    database: 800,
  };

  const grouped: Record<ArchComponent['componentType'], ArchComponent[]> = {
    api: [],
    service: [],
    module: [],
    database: [],
  };
  for (const c of components) {
    grouped[c.componentType]?.push(c);
  }

  const nodeCoords = new Map<number, { x: number; y: number }>();
  (['api', 'service', 'module', 'database'] as const).forEach((type) => {
    const list = grouped[type];
    const spacing = 380 / Math.max(1, list.length + 1);
    list.forEach((comp, idx) => {
      nodeCoords.set(comp.id, {
        x: layers[type],
        y: 30 + spacing * (idx + 1),
      });
    });
  });

  const selectedComp = components.find((c) => c.id === selectedId) ?? null;
  const connectedEdges = selectedComp
    ? edges.filter(
        (e) => e.sourceId === selectedComp.id || e.targetId === selectedComp.id
      )
    : [];
  const driftEdges = edges.filter((e) => e.driftDetected);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Architecture Intelligence Map
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Interactive dependency graph across APIs, services, modules, and databases with
            architecture drift detection.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
          {components.length} nodes · {edges.length} edges · {driftEdges.length} drift alerts
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="h-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : components.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          Authorise and sync a repository in Integrations to construct your live architecture map.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-x-auto">
            <svg
              viewBox="0 0 920 440"
              className="w-full min-w-[700px] h-auto"
              role="img"
              aria-label="System dependency topology graph"
            >
              {/* Layer column titles */}
              <text x="110" y="22" textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
                APIs
              </text>
              <text x="350" y="22" textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
                Services
              </text>
              <text x="590" y="22" textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
                Modules
              </text>
              <text x="800" y="22" textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
                Databases
              </text>

              {/* Edges */}
              {edges.map((edge) => {
                const src = nodeCoords.get(edge.sourceId);
                const tgt = nodeCoords.get(edge.targetId);
                if (!src || !tgt) return null;
                const isHighlighted =
                  selectedId !== null &&
                  (edge.sourceId === selectedId || edge.targetId === selectedId);

                return (
                  <g key={edge.id}>
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={
                        edge.driftDetected
                          ? '#D97706'
                          : isHighlighted
                          ? '#1D4ED8'
                          : '#94A3B8'
                      }
                      strokeWidth={edge.driftDetected || isHighlighted ? 2.2 : 1.2}
                      strokeDasharray={edge.driftDetected ? '5 4' : undefined}
                      strokeOpacity={isHighlighted || edge.driftDetected ? 0.95 : 0.45}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {components.map((comp) => {
                const pos = nodeCoords.get(comp.id);
                if (!pos) return null;
                const isSelected = comp.id === selectedId;
                return (
                  <g
                    key={comp.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={() => setSelectedId(comp.id)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={-84}
                      y={-22}
                      width={168}
                      height={44}
                      rx={8}
                      className={
                        isSelected
                          ? 'fill-blue-800 dark:fill-blue-600 stroke-blue-900 dark:stroke-blue-400'
                          : 'fill-slate-50 dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-700'
                      }
                      strokeWidth={1.5}
                    />
                    <text
                      x={0}
                      y={-2}
                      textAnchor="middle"
                      className={`text-[11px] font-semibold ${
                        isSelected
                          ? 'fill-white'
                          : 'fill-slate-900 dark:fill-slate-100'
                      }`}
                    >
                      {comp.name.length > 21
                        ? `${comp.name.slice(0, 19)}…`
                        : comp.name}
                    </text>
                    <text
                      x={0}
                      y={13}
                      textAnchor="middle"
                      className={`text-[9px] font-mono ${
                        isSelected
                          ? 'fill-blue-100'
                          : 'fill-slate-500 dark:fill-slate-400'
                      }`}
                    >
                      {comp.componentType} · C:{comp.complexityScore}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Node Inspector & Drift Alerts */}
          <div className="lg:col-span-4 space-y-5">
            {selectedComp && (
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <p className="text-xs font-mono text-blue-700 dark:text-blue-400">
                  {selectedComp.componentType.toUpperCase()} · {selectedComp.language}
                </p>
                <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                  {selectedComp.name}
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                  {selectedComp.filePath}
                </p>
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Direct Dependencies ({connectedEdges.length})
                  </p>
                  {connectedEdges.map((edge) => (
                    <div
                      key={edge.id}
                      className="text-xs font-mono text-slate-600 dark:text-slate-300"
                    >
                      {edge.sourceName} → {edge.targetName} ({edge.dependencyType})
                      {edge.driftDetected && (
                        <span className="text-amber-600 dark:text-amber-400 ml-1.5">
                          [Drift]
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {driftEdges.length > 0 && (
              <div className="p-5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 space-y-2">
                <h3 className="font-display text-sm font-semibold text-amber-900 dark:text-amber-300">
                  Architecture Drift Detected ({driftEdges.length})
                </h3>
                {driftEdges.map((d) => (
                  <div key={d.id} className="text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-mono font-medium">
                      {d.sourceName} → {d.targetName}
                    </p>
                    {d.evidenceRef && <p className="mt-0.5 opacity-80">{d.evidenceRef}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DebtFinding {
  id: number;
  category: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  explanation: string;
  evidence: string;
  remediationPlan: string;
  status: 'open' | 'acknowledged' | 'resolved';
  isDemo: boolean;
}

export function TechnicalDebtView({ orgId }: { orgId: number }) {
  const [findings, setFindings] = useState<DebtFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const loadDebt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ findings: DebtFinding[] }>(
        `/api/orgs/${orgId}/technical-debt`
      );
      setFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load debt radar.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadDebt();
  }, [loadDebt]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await apiFetch<{ findings: DebtFinding[] }>(
        `/api/orgs/${orgId}/technical-debt/scan`,
        { method: 'POST' }
      );
      setFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Debt scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateStatus = async (
    findingId: number,
    nextStatus: 'open' | 'acknowledged' | 'resolved'
  ) => {
    try {
      const res = await apiFetch<{ finding: DebtFinding }>(
        `/api/orgs/${orgId}/technical-debt/${findingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      setFindings((prev) =>
        prev.map((f) => (f.id === findingId ? res.finding : f))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    }
  };

  const filtered =
    statusFilter === 'all'
      ? findings
      : findings.filter((f) => f.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Technical Debt Radar
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Prioritised coupling, complexity, test coverage, and churn hotspots backed by code
            evidence.
          </p>
        </div>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white whitespace-nowrap cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          <span>{scanning ? 'Scanning Codebase...' : 'Run Debt Scan'}</span>
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg w-fit border border-slate-200 dark:border-slate-800">
        {['all', 'open', 'acknowledged', 'resolved'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === st
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {st.charAt(0).toUpperCase() + st.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          No technical debt findings match this filter. Run a debt scan after syncing repositories.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Severity: {item.severity.toUpperCase()} · Category:{' '}
                  {item.category.replace(/_/g, ' ')} · Status: {item.status}
                  {item.isDemo ? ' · Demo Record' : ''}
                </span>
                <div className="flex items-center gap-2">
                  {(['open', 'acknowledged', 'resolved'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleUpdateStatus(item.id, st)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                        item.status === st
                          ? 'border-blue-700 dark:border-blue-500 text-blue-800 dark:text-blue-400 font-medium'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                {item.title}
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {item.explanation}
              </p>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <p className="font-mono text-slate-500 dark:text-slate-400">
                  Evidence: {item.evidence}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  Remediation: {item.remediationPlan}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
