import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { and, eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import {
  auditLogs,
  organizationMemberships,
  organizations,
  users,
} from '../db/schema.ts';

export type OrgRole = 'owner' | 'admin' | 'architect' | 'engineer' | 'viewer';

export interface DbUserRecord {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  isPlatformAdmin: boolean;
}

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: DbUserRecord;
  orgContext?: {
    organizationId: number;
    role: OrgRole;
    organizationName: string;
    isDemoWorkspace: boolean;
  };
}

const ADMIN_SEED_EMAIL = 'fasihu739@gmail.com';

async function getOrCreateDbUser(decoded: DecodedIdToken): Promise<DbUserRecord> {
  const email = decoded.email ?? `${decoded.uid}@unknown.local`;
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.uid, decoded.uid))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    return {
      id: row.id,
      uid: row.uid,
      email: row.email,
      displayName: row.displayName,
      photoUrl: row.photoUrl,
      isPlatformAdmin: row.isPlatformAdmin,
    };
  }

  const shouldBePlatformAdmin = email.toLowerCase() === ADMIN_SEED_EMAIL;
  const inserted = await db
    .insert(users)
    .values({
      uid: decoded.uid,
      email,
      displayName: decoded.name ?? email.split('@')[0],
      photoUrl: decoded.picture ?? null,
      isPlatformAdmin: shouldBePlatformAdmin,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        displayName: decoded.name ?? email.split('@')[0],
        photoUrl: decoded.picture ?? null,
      },
    })
    .returning();

  const row = inserted[0];
  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    displayName: row.displayName,
    photoUrl: row.photoUrl,
    isPlatformAdmin: row.isPlatformAdmin,
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication token is empty.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decoded;
    req.dbUser = await getOrCreateDbUser(decoded);
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export function requireOrgMembership(allowedRoles?: OrgRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      res.status(401).json({ error: 'Unauthenticated user context.' });
      return;
    }

    const rawOrgId = req.params.orgId ?? req.headers['x-organization-id'];
    const organizationId = Number(rawOrgId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      res.status(400).json({ error: 'Valid organisation ID is required.' });
      return;
    }

    try {
      const rows = await db
        .select({
          membershipId: organizationMemberships.id,
          role: organizationMemberships.role,
          status: organizationMemberships.status,
          orgName: organizations.name,
          isDemoWorkspace: organizations.isDemoWorkspace,
        })
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizationMemberships.organizationId, organizations.id)
        )
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.userId, req.dbUser.id)
          )
        )
        .limit(1);

      if (rows.length === 0 || rows[0].status !== 'active') {
        res.status(403).json({
          error: 'Access denied: you do not belong to this organisation.',
        });
        return;
      }

      const role = rows[0].role as OrgRole;
      if (allowedRoles && !allowedRoles.includes(role)) {
        res.status(403).json({
          error: `Insufficient permissions. Required role: ${allowedRoles.join(', ')}.`,
        });
        return;
      }

      req.orgContext = {
        organizationId,
        role,
        organizationName: rows[0].orgName,
        isDemoWorkspace: rows[0].isDemoWorkspace,
      };
      next();
    } catch (error) {
      console.error('Tenant membership verification failed:', error);
      res.status(500).json({ error: 'Unable to verify organisation access.' });
    }
  };
}

export async function recordAuditLog(params: {
  organizationId: number;
  actorUserId: number;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      detailsJson: params.details ?? {},
    });
  } catch (error) {
    console.error('Failed to persist audit log:', error);
  }
}
