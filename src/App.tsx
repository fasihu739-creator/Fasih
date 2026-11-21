import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/landing/LandingPage';
import { WorkspaceShell } from './components/workspace/WorkspaceShell';

function AppRouter() {
  const { firebaseUser, loading } = useAuth();
  const [viewMode, setViewMode] = useState<'landing' | 'workspace'>('landing');

  useEffect(() => {
    if (firebaseUser) {
      setViewMode('workspace');
    } else {
      setViewMode('landing');
    }
  }, [firebaseUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Loading AI Engineering Intelligence Brain...
      </div>
    );
  }

  if (firebaseUser && viewMode === 'workspace') {
    return <WorkspaceShell onBackToLanding={() => setViewMode('landing')} />;
  }

  return <LandingPage onEnterWorkspace={() => setViewMode('workspace')} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
