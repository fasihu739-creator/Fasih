import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  isPlatformAdmin: boolean;
}

export interface OrganizationSummary {
  id: number;
  name: string;
  slug: string;
  ukCompanySize: string;
  engineerCount: number;
  planId: number | null;
  isDemoWorkspace: boolean;
  role: 'owner' | 'admin' | 'architect' | 'engineer' | 'viewer';
  createdAt: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  dbUser: DbUser | null;
  organizations: OrganizationSummary[];
  activeOrg: OrganizationSummary | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  selectOrganization: (orgId: number) => void;
  refreshProfile: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  }, []);

  const fetchProfile = useCallback(async (user: User) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load workspace profile.');
      }
      const data = await res.json();
      setDbUser(data.user);
      setOrganizations(data.organizations);
      setActiveOrgId((prev) => {
        if (prev && data.organizations.some((o: OrganizationSummary) => o.id === prev)) {
          return prev;
        }
        return data.organizations[0]?.id ?? null;
      });
      setAuthError(null);
    } catch (error) {
      console.error('Profile sync error:', error);
      setAuthError(
        error instanceof Error ? error.message : 'Unable to authenticate with backend.'
      );
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchProfile(user);
      } else {
        setDbUser(null);
        setOrganizations([]);
        setActiveOrgId(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Google sign-in popup was cancelled or blocked.'
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      await fetchProfile(auth.currentUser);
    }
  }, [fetchProfile]);

  const activeOrg =
    organizations.find((o) => o.id === activeOrgId) ?? organizations[0] ?? null;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        organizations,
        activeOrg,
        loading,
        authError,
        signInWithGoogle,
        signOut,
        selectOrganization: setActiveOrgId,
        refreshProfile,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
