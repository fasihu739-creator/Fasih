import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface MemberRecord {
  membershipId: number;
  userId: number;
  email: string;
  displayName: string | null;
  role: 'owner' | 'admin' | 'architect' | 'engineer' | 'viewer';
  status: string;
  createdAt: string;
}

interface InvitationRecord {
  id: number;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

interface AuditLogRecord {
  id: number;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

interface PlanRecord {
  id: number;
  slug: string;
  name: string;
  targetAudience: string;
  monthlyPriceGbp: number;
  maxDevelopers: number;
  maxRepositories: number;
  featuresJson: string[];
  isActive: boolean;
}

export function SettingsAndAdminView({ orgId }: { orgId: number }) {
  const { dbUser, activeOrg, refreshProfile } = useAuth();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [usageSummary, setUsageSummary] = useState<{
    activeMembers: number;
    authorisedRepositories: number;
    totalRepositories: number;
  } | null>(null);

  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSize, setNewOrgSize] = useState<'50-149' | '15-49' | '150-249'>('50-149');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'architect' | 'engineer' | 'viewer'>(
    'engineer'
  );
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRecord | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setError(null);
    try {
      const [memRes, billRes] = await Promise.all([
        apiFetch<{ members: MemberRecord[]; invitations: InvitationRecord[] }>(
          `/api/orgs/${orgId}/members`
        ),
        apiFetch<{
          activePlan: PlanRecord | null;
          availablePlans: PlanRecord[];
          usageSummary: {
            activeMembers: number;
            authorisedRepositories: number;
            totalRepositories: number;
          };
        }>(`/api/orgs/${orgId}/billing`),
      ]);

      setMembers(memRes.members);
      setInvitations(memRes.invitations);
      setPlans(billRes.availablePlans);
      setActivePlanId(billRes.activePlan?.id ?? null);
      setUsageSummary(billRes.usageSummary);

      if (
        activeOrg &&
        ['owner', 'admin', 'architect'].includes(activeOrg.role)
      ) {
        const auditRes = await apiFetch<{ auditLogs: AuditLogRecord[] }>(
          `/api/orgs/${orgId}/audit-logs`
        );
        setAuditLogs(auditRes.auditLogs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings.');
    }
  }, [orgId, activeOrg]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleCreateProductionOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    try {
      await apiFetch('/api/orgs', {
        method: 'POST',
        body: JSON.stringify({
          name: newOrgName,
          ukCompanySize: newOrgSize,
          engineerCount: 30,
        }),
      });
      setNewOrgName('');
      await refreshProfile();
      setStatusMsg('Clean production organisation created (zero demo records). Switch via the top-left selector.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create organisation.');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/orgs/${orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail('');
      setStatusMsg('Invitation recorded and logged to audit trail.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to invite member.');
    }
  };

  const handlePlanSwitch = async (planId: number) => {
    setError(null);
    try {
      await apiFetch(`/api/orgs/${orgId}/billing/plan`, {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      setActivePlanId(planId);
      setStatusMsg('Subscription plan updated.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change plan.');
    }
  };

  const handleSaveAdminPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/plans/${editingPlan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingPlan.name,
          targetAudience: editingPlan.targetAudience,
          monthlyPriceGbp: Number(editingPlan.monthlyPriceGbp),
          maxDevelopers: Number(editingPlan.maxDevelopers),
          maxRepositories: Number(editingPlan.maxRepositories),
          features: editingPlan.featuresJson,
          isActive: editingPlan.isActive,
        }),
      });
      setEditingPlan(null);
      setStatusMsg('Configurable pricing plan saved. Changes reflect across Billing and the Public Landing Page.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update pricing plan.');
    }
  };

  const handleDeleteOrg = async () => {
    setError(null);
    try {
      await apiFetch(`/api/orgs/${orgId}`, { method: 'DELETE' });
      setConfirmDeleteOrg(false);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete organisation.');
    }
  };

  const currentPlan = plans.find((p) => p.id === activePlanId) ?? plans[0] ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Organisation Settings, RBAC & Billing
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage multi-tenant isolation, team roles, subscription usage, audit trails, and secure
          data deletion.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {statusMsg && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {statusMsg}
        </p>
      )}

      {/* Create Clean Production Organisation */}
      <form
        onSubmit={handleCreateProductionOrg}
        className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
          Create Isolated Production Organisation
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Creates a completely clean tenant workspace with zero demo data, ready for your real
          GitHub repositories and ADRs.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            required
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="e.g. Northbridge Clearing Ltd"
            className="flex-1 min-w-[240px] px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <select
            value={newOrgSize}
            onChange={(e) =>
              setNewOrgSize(e.target.value as '50-149' | '15-49' | '150-249')
            }
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          >
            <option value="15-49">15–49 employees</option>
            <option value="50-149">50–149 employees</option>
            <option value="150-249">150–249 employees</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-800 hover:bg-blue-700 dark:bg-blue-600 text-white whitespace-nowrap cursor-pointer"
          >
            Create Organisation
          </button>
        </div>
      </form>

      {/* Team Members & Invitations */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
              Members & Role-Based Access Control
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active members: {members.length} · Pending invitations: {invitations.length}
            </p>
          </div>
        </div>

        {activeOrg && ['owner', 'admin'].includes(activeOrg.role) && (
          <form onSubmit={handleInviteMember} className="flex flex-wrap items-center gap-3">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.co.uk"
              className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(
                  e.target.value as 'admin' | 'architect' | 'engineer' | 'viewer'
                )
              }
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="engineer">Engineer</option>
              <option value="architect">Software Architect</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Send Invite</span>
            </button>
          </form>
        )}

        <div className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          {members.map((m) => (
            <div key={m.membershipId} className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {m.displayName || m.email}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{m.email}</p>
              </div>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                {m.role.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription Plan & Usage Tracking */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
              Subscription Plan & Usage Metering
            </h2>
            {currentPlan && usageSummary && (
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Active Plan: {currentPlan.name} (£{currentPlan.monthlyPriceGbp}/mo) · Seats:{' '}
                {usageSummary.activeMembers}/{currentPlan.maxDevelopers} · Authorised Repos:{' '}
                {usageSummary.authorisedRepositories}/{currentPlan.maxRepositories}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = p.id === activePlanId;
            return (
              <div
                key={p.id}
                className={`p-4 rounded-xl border ${
                  isCurrent
                    ? 'border-blue-700 dark:border-blue-500 bg-slate-50 dark:bg-slate-950'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <p className="font-display font-semibold text-slate-950 dark:text-white">
                    {p.name}
                  </p>
                  <p className="font-mono tabular-nums text-sm font-bold">
                    £{p.monthlyPriceGbp}/mo
                  </p>
                </div>
                <p className="mt-1 text-xs font-mono tabular-nums text-slate-500">
                  {p.maxDevelopers} devs · {p.maxRepositories} repos
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={() => handlePlanSwitch(p.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    {isCurrent ? 'Current Plan' : 'Select Plan'}
                  </button>
                  {dbUser?.isPlatformAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditingPlan({ ...p })}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Configure Price
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Platform Admin Plan Price & Limits Editor */}
        {dbUser?.isPlatformAdmin && editingPlan && (
          <form
            onSubmit={handleSaveAdminPlan}
            className="p-5 rounded-xl border border-blue-200 dark:border-blue-900 bg-slate-50 dark:bg-slate-950 space-y-4"
          >
            <h3 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
              Admin Plan Configuration: {editingPlan.name}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Monthly Price (£ GBP)</label>
                <input
                  type="number"
                  min={0}
                  value={editingPlan.monthlyPriceGbp}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, monthlyPriceGbp: Number(e.target.value) } : null
                    )
                  }
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Max Developers</label>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.maxDevelopers}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, maxDevelopers: Number(e.target.value) } : null
                    )
                  }
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Max Repositories</label>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.maxRepositories}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, maxRepositories: Number(e.target.value) } : null
                    )
                  }
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-800 text-white cursor-pointer"
              >
                Save Plan Configuration
              </button>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Immutable Audit Log */}
      {auditLogs.length > 0 && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
            Organisation Security & Audit Log
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Timestamp</th>
                  <th className="py-2 pr-4 font-medium">Actor</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 font-medium">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {auditLogs.slice(0, 20).map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 font-mono tabular-nums text-slate-500">
                      {new Date(log.createdAt).toLocaleString('en-GB')}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                      {log.actorEmail}
                    </td>
                    <td className="py-2 pr-4 font-mono text-slate-900 dark:text-white">
                      {log.action}
                    </td>
                    <td className="py-2 font-mono text-slate-500">
                      {log.resourceType}
                      {log.resourceId ? ` #${log.resourceId}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Secure Data Deletion */}
      {activeOrg?.role === 'owner' && (
        <div className="p-6 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 space-y-3">
          <h2 className="font-display text-base font-semibold text-red-800 dark:text-red-400">
            Secure Organisation Data Deletion
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Permanently delete this organisation and cascade-remove all repositories, Decision DNA
            records, incident postmortems, impact reports, and AI conversations.
          </p>
          {!confirmDeleteOrg ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteOrg(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Organisation Data</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-red-700 dark:text-red-400">
                Confirm permanent deletion of “{activeOrg.name}”?
              </span>
              <button
                type="button"
                onClick={handleDeleteOrg}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-red-700 text-white cursor-pointer"
              >
                Confirm Permanent Deletion
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOrg(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
