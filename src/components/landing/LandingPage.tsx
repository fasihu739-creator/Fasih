import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BookOpen,
  Bot,
  Check,
  GitFork,
  LayoutDashboard,
  Lock,
  Moon,
  Network,
  Plug,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CommandDashboardView } from '../dashboard/CommandDashboardView';
import { BrainCircuitMark, UkFlagMark } from '../layout/BrandHeaderMarks';

interface PublicPlan {
  id: number;
  slug: string;
  name: string;
  targetAudience: string;
  monthlyPriceGbp: number;
  maxDevelopers: number;
  maxRepositories: number;
  featuresJson: string[];
}

interface LandingPageProps {
  onEnterWorkspace: () => void;
}

const PREVIEW_NAV = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'intelligence', label: 'Code Intelligence', icon: Activity },
  { id: 'decisions', label: 'Decision Memory', icon: BookOpen },
  { id: 'impact', label: 'Change Impact', icon: ShieldAlert },
  { id: 'incidents', label: 'Incident History', icon: AlertOctagon },
  { id: 'architecture', label: 'Architecture Map', icon: Network },
  { id: 'debt', label: 'Tech Debt Radar', icon: GitFork },
  { id: 'assistant', label: 'AI Chat', icon: Bot },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export function LandingPage({ onEnterWorkspace }: LandingPageProps) {
  const { firebaseUser, signInWithGoogle, authError } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPreviewTab, setSelectedPreviewTab] = useState<string>('overview');

  const [demoForm, setDemoForm] = useState({
    fullName: '',
    workEmail: '',
    companyName: '',
    roleTitle: 'CTO / VP of Engineering',
    engineeringHeadcount: '15–50 engineers',
    notes: '',
  });
  const [demoStatus, setDemoStatus] = useState<{
    submitting: boolean;
    success: string | null;
    error: string | null;
  }>({ submitting: false, success: null, error: null });

  useEffect(() => {
    let active = true;
    fetch('/api/public/plans')
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data.plans)) {
          setPlans(data.plans);
        }
      })
      .catch((err) => console.error('Failed to load pricing plans:', err))
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handlePrimaryAuthAction = async () => {
    if (firebaseUser) {
      onEnterWorkspace();
      return;
    }
    await signInWithGoogle();
  };

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoStatus({ submitting: true, success: null, error: null });
    try {
      const res = await fetch('/api/public/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoForm),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Unable to submit demo request.');
      }
      setDemoStatus({
        submitting: false,
        success: payload.message,
        error: null,
      });
      setDemoForm({
        fullName: '',
        workEmail: '',
        companyName: '',
        roleTitle: 'CTO / VP of Engineering',
        engineeringHeadcount: '15–50 engineers',
        notes: '',
      });
    } catch (error) {
      setDemoStatus({
        submitting: false,
        success: null,
        error:
          error instanceof Error ? error.message : 'Unable to submit demo request.',
      });
    }
  };

  const handleSidebarPreviewClick = async (tabId: string) => {
    setSelectedPreviewTab(tabId);
    if (tabId !== 'overview') {
      if (firebaseUser) {
        onEnterWorkspace();
      } else {
        await signInWithGoogle();
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#06091A] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top 3-Zone Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#06091A]/95 backdrop-blur-md border-b border-slate-200 dark:border-indigo-500/20">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0"
          >
            Engineering Brain
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#command-preview"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Platform
            </a>
            <a
              href="#security"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#book-demo"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Book Demo
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handlePrimaryAuthAction}
              className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {firebaseUser ? 'Open Workspace' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Command Banner matching reference layout */}
        <section id="command-preview" className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-6 pb-16">
          <div className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-indigo-500/30 bg-white dark:bg-[#090F29] mb-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <BrainCircuitMark className="w-12 h-12 shrink-0" />
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                    AI Engineering Intelligence Brain
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-cyan-700 dark:text-cyan-300 font-medium">
                    Understand the Past. Predict the Impact. Protect the Future.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <p className="hidden xl:block text-sm text-slate-600 dark:text-slate-300 max-w-xs">
                  The AI Assistant &amp; Knowledge Engine for Software Development Teams
                </p>

                <div className="flex items-center gap-3">
                  <UkFlagMark className="w-11 h-7 rounded-[4px] shrink-0" />
                  <div className="text-xs leading-tight">
                    <p className="font-semibold text-slate-950 dark:text-white">
                      Perfect for UK
                    </p>
                    <p className="text-slate-500 dark:text-slate-300">
                      Software Companies
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {authError && (
              <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
                {authError}
              </p>
            )}
          </div>

          {/* Command-Centre Shell: Sidebar + Live Preview Dashboard */}
          <div className="rounded-2xl border border-slate-200 dark:border-indigo-500/30 bg-slate-100/70 dark:bg-[#080D24] p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row gap-5">
              {/* Left Sidebar */}
              <aside className="lg:w-52 shrink-0 flex flex-col justify-between rounded-xl border border-slate-200 dark:border-indigo-500/20 bg-white dark:bg-[#0B1230] p-3">
                <nav aria-label="Dashboard preview navigation" className="space-y-1">
                  {PREVIEW_NAV.map((item) => {
                    const Icon = item.icon;
                    const active = selectedPreviewTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSidebarPreviewClick(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          active
                            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-indigo-950/70'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </nav>

                <div className="mt-6 pt-3 border-t border-slate-200 dark:border-indigo-500/20 space-y-2">
                  <button
                    type="button"
                    onClick={handlePrimaryAuthAction}
                    className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                  >
                    {firebaseUser ? 'Enter Live Console' : 'Sign In with Google'}
                  </button>
                  <p className="text-[10px] text-center text-slate-500 dark:text-slate-400">
                    Demo Preview · Sign in for GitHub &amp; Gemini AI
                  </p>
                </div>
              </aside>

              {/* Center Command Dashboard */}
              <div className="flex-1 min-w-0">
                <CommandDashboardView
                  mode="preview"
                  onNavigateTab={(tab) => handleSidebarPreviewClick(tab)}
                  onRequireSignIn={handlePrimaryAuthAction}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Security & Governance Section */}
        <section
          id="security"
          className="border-t border-slate-200 dark:border-indigo-500/20 bg-white dark:bg-[#080E27] py-16"
        >
          <div className="max-w-[1440px] mx-auto px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-cyan-400 mb-1.5">
                  Enterprise Security &amp; Multi-Tenant Governance
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white">
                  Built for regulated UK engineering teams from day one
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Zero model training on customer code</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  title: 'Strict Multi-Tenant Isolation',
                  body: 'Every organisation’s repositories, decisions, incidents, reports, and AI threads are isolated in PostgreSQL with verified RBAC membership checks.',
                },
                {
                  title: 'Least-Privilege GitHub Access',
                  body: 'Only repositories explicitly authorised by an organisation admin are indexed. OAuth tokens are encrypted at rest with AES-256-GCM.',
                },
                {
                  title: 'Prompt Injection & Secret Redaction',
                  body: 'Repository code, commit messages, and PR comments are treated as untrusted input—scrubbed of tokens and isolated before AI analysis.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="p-6 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-slate-50 dark:bg-[#0D1535]/90"
                >
                  <Lock className="w-4 h-4 text-blue-600 dark:text-cyan-400 mb-3" />
                  <h3 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Configurable Pricing Section */}
        <section id="pricing" className="max-w-[1440px] mx-auto px-6 py-16">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white">
              Transparent plans for UK software teams
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Pricing and capacity caps are configurable via the Admin Dashboard and scale with your
              engineering headcount.
            </p>
          </div>

          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-72 rounded-xl border border-slate-200 dark:border-indigo-500/20 bg-white dark:bg-[#0D1535] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isFeatured = plan.slug === 'professional';
                return (
                  <div
                    key={plan.id}
                    className={`p-7 rounded-xl border flex flex-col justify-between ${
                      isFeatured
                        ? 'border-blue-600 dark:border-cyan-400/60 bg-white dark:bg-[#0E173B]'
                        : 'border-slate-200 dark:border-indigo-500/25 bg-white dark:bg-[#0D1535]/90'
                    }`}
                  >
                    <div>
                      <div className="flex items-baseline justify-between">
                        <h3 className="font-display text-xl font-bold text-slate-950 dark:text-white">
                          {plan.name}
                        </h3>
                        {isFeatured && (
                          <span className="text-xs font-medium text-blue-700 dark:text-cyan-400">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {plan.targetAudience}
                      </p>

                      <div className="mt-5 flex items-baseline gap-1">
                        <span className="font-mono tabular-nums text-3xl font-bold text-slate-950 dark:text-white">
                          £{plan.monthlyPriceGbp.toLocaleString('en-GB')}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          / month
                        </span>
                      </div>

                      <p className="mt-3 pb-4 border-b border-slate-200 dark:border-indigo-500/20 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        Up to {plan.maxDevelopers} developers · Up to {plan.maxRepositories} repos
                      </p>

                      <ul className="mt-4 space-y-2.5">
                        {plan.featuresJson.map((feat) => (
                          <li
                            key={feat}
                            className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
                          >
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={handlePrimaryAuthAction}
                      className={`mt-7 w-full py-2.5 px-4 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isFeatured
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-slate-900 dark:text-white border border-slate-200 dark:border-indigo-500/30'
                      }`}
                    >
                      {firebaseUser ? 'Manage in Workspace' : `Start with ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Book a Demo Form */}
        <section
          id="book-demo"
          className="border-t border-slate-200 dark:border-indigo-500/20 bg-white dark:bg-[#080E27] py-16"
        >
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-5">
              <h2 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
                Book a UK technical walkthrough
              </h2>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Discuss repository topology, ADR ingestion, and change-risk workflows with our
                platform engineering team.
              </p>
            </div>

            <form
              onSubmit={handleDemoSubmit}
              className="md:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-indigo-500/25 bg-slate-50 dark:bg-[#0D1535] space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name</label>
                  <input
                    required
                    value={demoForm.fullName}
                    onChange={(e) =>
                      setDemoForm((p) => ({ ...p, fullName: e.target.value }))
                    }
                    placeholder="Sarah Jenkins"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-white dark:bg-[#070B1E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={demoForm.workEmail}
                    onChange={(e) =>
                      setDemoForm((p) => ({ ...p, workEmail: e.target.value }))
                    }
                    placeholder="sarah@company.co.uk"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-white dark:bg-[#070B1E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Company</label>
                  <input
                    required
                    value={demoForm.companyName}
                    onChange={(e) =>
                      setDemoForm((p) => ({ ...p, companyName: e.target.value }))
                    }
                    placeholder="Northbridge Clearing Ltd"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-white dark:bg-[#070B1E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Engineering Team</label>
                  <select
                    value={demoForm.engineeringHeadcount}
                    onChange={(e) =>
                      setDemoForm((p) => ({
                        ...p,
                        engineeringHeadcount: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-indigo-500/30 bg-white dark:bg-[#070B1E]"
                  >
                    <option value="15–50 engineers">15–50 engineers</option>
                    <option value="51–100 engineers">51–100 engineers</option>
                    <option value="101–150 engineers">101–150 engineers</option>
                  </select>
                </div>
              </div>

              {demoStatus.error && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {demoStatus.error}
                </p>
              )}
              {demoStatus.success && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
                  {demoStatus.success}
                </p>
              )}

              <button
                type="submit"
                disabled={demoStatus.submitting}
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 text-white cursor-pointer"
              >
                {demoStatus.submitting ? 'Submitting...' : 'Schedule Technical Demo'}
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-indigo-500/20 py-7">
        <div className="max-w-[1440px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>AI Engineering Intelligence Brain · United Kingdom</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-indigo-500/30 hover:bg-slate-100 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light Theme</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark Theme</span>
                </>
              )}
            </button>
            <span>© 2026 AI Engineering Intelligence Brain</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
