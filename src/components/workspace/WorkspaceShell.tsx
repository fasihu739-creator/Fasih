import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BookOpen,
  Bot,
  GitFork,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  Plug,
  Settings,
  ShieldAlert,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CommandDashboardView } from '../dashboard/CommandDashboardView';
import { BrainCircuitMark, UkFlagMark } from '../layout/BrandHeaderMarks';
import { OverviewAndIntelligence } from './OverviewAndIntelligence';
import { ChangeImpactView } from './ChangeImpactView';
import { DecisionMemoryView, IncidentMemoryView } from './DecisionAndIncidentViews';
import { ArchitectureMapView, TechnicalDebtView } from './ArchitectureAndDebtViews';
import { AssistantView, IntegrationsView } from './AssistantAndIntegrationsViews';
import { SettingsAndAdminView } from './SettingsAndAdminView';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'intelligence', label: 'Engineering Intelligence', icon: Activity },
  { id: 'impact', label: 'Change Impact', icon: ShieldAlert },
  { id: 'decisions', label: 'Decision Memory', icon: BookOpen },
  { id: 'architecture', label: 'Architecture Map', icon: Network },
  { id: 'debt', label: 'Technical Debt', icon: GitFork },
  { id: 'incidents', label: 'Incident Memory', icon: AlertOctagon },
  { id: 'assistant', label: 'AI Assistant', icon: Bot },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type NavId = (typeof NAV_ITEMS)[number]['id'];

export function WorkspaceShell({ onBackToLanding }: { onBackToLanding: () => void }) {
  const { dbUser, organizations, activeOrg, selectOrganization, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<NavId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  if (!activeOrg) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#06091A] flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-xl border border-slate-200 dark:border-indigo-500/30 bg-white dark:bg-[#0D1535] text-center space-y-3">
          <h1 className="font-display text-xl font-bold text-slate-950 dark:text-white">
            Setting up your organisation workspace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Provisioning multi-tenant isolation and role-based permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#06091A] text-slate-900 dark:text-slate-100 flex">
      {/* Left Sidebar matching dark indigo command aesthetic */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-indigo-500/20 bg-white dark:bg-[#090F29] shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-indigo-500/20 flex items-center gap-3">
          <BrainCircuitMark className="w-9 h-9 shrink-0" />
          <button
            type="button"
            onClick={onBackToLanding}
            className="text-left cursor-pointer"
          >
            <p className="font-display text-sm font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
              Engineering Brain
            </p>
            <p className="text-[10px] text-cyan-700 dark:text-cyan-400">
              UK Intelligence Console
            </p>
          </button>
        </div>

        {/* Organisation Switcher */}
        <div className="p-4 border-b border-slate-200 dark:border-indigo-500/20">
          <label
            htmlFor="org-switcher"
            className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5"
          >
            Active Organisation
          </label>
          <select
            id="org-switcher"
            value={activeOrg.id}
            onChange={(e) => selectOrganization(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-slate-50 dark:bg-[#06091A] text-slate-900 dark:text-slate-100"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* 10-Section Navigation */}
        <nav aria-label="Workspace Navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-indigo-950/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-indigo-500/20 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <UkFlagMark className="w-7 h-4 rounded-[2px] shrink-0" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {dbUser?.email}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-indigo-500/30 hover:bg-slate-100 dark:hover:bg-indigo-950 cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-indigo-950 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#090F29]/95 backdrop-blur-sm border-b border-slate-200 dark:border-indigo-500/20 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-indigo-500/30"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>{activeOrg.name}</span>
              <span className="mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-950 dark:text-white">
                {currentNav.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeOrg.isDemoWorkspace && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                Demo Workspace ·{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="underline cursor-pointer"
                >
                  Create Production Org
                </button>
              </span>
            )}
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 max-w-full bg-white dark:bg-[#090F29] h-full p-4 flex flex-col z-10">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-indigo-500/20">
                <span className="font-display font-bold">Engineering Brain</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                        activeTab === item.id
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        <main className="flex-1 p-5 lg:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'overview' && (
            <CommandDashboardView
              mode="live"
              orgId={activeOrg.id}
              engineerCount={activeOrg.engineerCount}
              onNavigateTab={(tab) => setActiveTab(tab as NavId)}
            />
          )}
          {activeTab === 'intelligence' && (
            <OverviewAndIntelligence
              orgId={activeOrg.id}
              mode="intelligence"
              onNavigate={(tab) => setActiveTab(tab as NavId)}
            />
          )}
          {activeTab === 'impact' && <ChangeImpactView orgId={activeOrg.id} />}
          {activeTab === 'decisions' && <DecisionMemoryView orgId={activeOrg.id} />}
          {activeTab === 'architecture' && <ArchitectureMapView orgId={activeOrg.id} />}
          {activeTab === 'debt' && <TechnicalDebtView orgId={activeOrg.id} />}
          {activeTab === 'incidents' && <IncidentMemoryView orgId={activeOrg.id} />}
          {activeTab === 'assistant' && <AssistantView orgId={activeOrg.id} />}
          {activeTab === 'integrations' && <IntegrationsView orgId={activeOrg.id} />}
          {activeTab === 'settings' && <SettingsAndAdminView orgId={activeOrg.id} />}
        </main>
      </div>
    </div>
  );
}
