import crypto from 'node:crypto';
import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  auditLogs,
  organizationInvitations,
  organizationMemberships,
  organizations,
  repositories,
  subscriptionPlans,
  usageRecords,
  users,
} from '../../db/schema.ts';
import {
  createDemoWorkspaceForUser,
  ensureSubscriptionPlansSeeded,
  getUserOrganizations,
} from '../../db/seed.ts';
import {
  type AuthRequest,
  recordAuditLog,
  requireAuth,
  requireOrgMembership,
} from '../../middleware/auth.ts';
import { createSha256Hash } from '../../lib/security.ts';

export const orgsRouter = Router();

orgsRouter.use(requireAuth);

orgsRouter.get('/me', async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    await ensureSubscriptionPlansSeeded();
    let memberships = await getUserOrganizations(user.id);

    if (memberships.length === 0) {
      await createDemoWorkspaceForUser(user.id, user.email);
      memberships = await getUserOrganizations(user.id);
    }

    res.json({
      user,
      organizations: memberships,
    });
  } catch (error) {
    console.error('Failed to load /api/me:', error);
    res.status(500).json({ error: 'Unable to load user workspace profile.' });
  }
});

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  ukCompanySize: z.enum(['15-49', '50-149', '150-249', '250+']).default('50-149'),
  engineerCount: z.number().int().min(1).max(2000).default(25),
  planSlug: z.string().trim().optional(),
});

orgsRouter.post('/orgs', async (req: AuthRequest, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid organisation details.',
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = req.dbUser!;
    const plans = await ensureSubscriptionPlansSeeded();
    const chosenPlan =
      plans.find((p) => p.slug === parsed.data.planSlug) ??
      plans.find((p) => p.slug === 'starter') ??
      plans[0];

    const baseSlug = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const uniqueSlug = `${baseSlug || 'uk-org'}-${Date.now().toString(36)}`;

    const [createdOrg] = await db
      .insert(organizations)
      .values({
        name: parsed.data.name,
        slug: uniqueSlug,
        ukCompanySize: parsed.data.ukCompanySize,
        engineerCount: parsed.data.engineerCount,
        planId: chosenPlan?.id ?? null,
        isDemoWorkspace: false,
        createdByUserId: user.id,
      })
      .returning();

    await db.insert(organizationMemberships).values({
      organizationId: createdOrg.id,
      userId: user.id,
      role: 'owner',
      status: 'active',
    });

    await recordAuditLog({
      organizationId: createdOrg.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: String(createdOrg.id),
      details: { name: createdOrg.name, isDemoWorkspace: false },
    });

    res.status(201).json({
      organization: {
        ...createdOrg,
        role: 'owner',
      },
    });
  } catch (error) {
    console.error('Failed to create organisation:', error);
    res.status(500).json({ error: 'Unable to create organisation.' });
  }
});

orgsRouter.post('/orgs/demo', async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    const org = await createDemoWorkspaceForUser(user.id, user.email);
    res.status(201).json({
      organization: {
        ...org,
        role: 'owner',
      },
    });
  } catch (error) {
    console.error('Failed to create demo workspace:', error);
    res.status(500).json({ error: 'Unable to create demo workspace.' });
  }
});

orgsRouter.delete(
  '/orgs/:orgId',
  requireOrgMembership(['owner']),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      await db.delete(organizations).where(eq(organizations.id, orgId));
      res.json({ deleted: true, organizationId: orgId });
    } catch (error) {
      console.error('Failed to delete organisation:', error);
      res.status(500).json({ error: 'Unable to securely delete organisation data.' });
    }
  }
);

orgsRouter.get(
  '/orgs/:orgId/members',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const members = await db
        .select({
          membershipId: organizationMemberships.id,
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          role: organizationMemberships.role,
          status: organizationMemberships.status,
          createdAt: organizationMemberships.createdAt,
        })
        .from(organizationMemberships)
        .innerJoin(users, eq(organizationMemberships.userId, users.id))
        .where(eq(organizationMemberships.organizationId, orgId))
        .orderBy(asc(organizationMemberships.createdAt));

      const invitations = await db
        .select({
          id: organizationInvitations.id,
          email: organizationInvitations.email,
          role: organizationInvitations.role,
          status: organizationInvitations.status,
          expiresAt: organizationInvitations.expiresAt,
          createdAt: organizationInvitations.createdAt,
        })
        .from(organizationInvitations)
        .where(eq(organizationInvitations.organizationId, orgId))
        .orderBy(desc(organizationInvitations.createdAt));

      res.json({ members, invitations });
    } catch (error) {
      console.error('Failed to fetch members:', error);
      res.status(500).json({ error: 'Unable to load organisation members.' });
    }
  }
);

const inviteSchema = z.object({
  email: z.string().trim().email().max(180),
  role: z.enum(['admin', 'architect', 'engineer', 'viewer']),
});

orgsRouter.post(
  '/orgs/:orgId/invitations',
  requireOrgMembership(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and role are required.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const user = req.dbUser!;
      const rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = createSha256Hash(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [invitation] = await db
        .insert(organizationInvitations)
        .values({
          organizationId: orgId,
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.role,
          invitedByUserId: user.id,
          tokenHash,
          status: 'pending',
          expiresAt,
        })
        .returning();

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'member.invited',
        resourceType: 'invitation',
        resourceId: String(invitation.id),
        details: { invitedEmail: invitation.email, role: invitation.role },
      });

      res.status(201).json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        },
      });
    } catch (error) {
      console.error('Failed to create invitation:', error);
      res.status(500).json({ error: 'Unable to create member invitation.' });
    }
  }
);

const updateRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'architect', 'engineer', 'viewer']),
});

orgsRouter.patch(
  '/orgs/:orgId/members/:membershipId',
  requireOrgMembership(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const parsed = updateRoleSchema.safeParse(req.body);
    const membershipId = Number(req.params.membershipId);
    if (!parsed.success || !Number.isInteger(membershipId)) {
      res.status(400).json({ error: 'Valid membership ID and role required.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [updated] = await db
        .update(organizationMemberships)
        .set({ role: parsed.data.role })
        .where(
          and(
            eq(organizationMemberships.id, membershipId),
            eq(organizationMemberships.organizationId, orgId)
          )
        )
        .returning();

      if (!updated) {
        res.status(404).json({ error: 'Membership record not found.' });
        return;
      }

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'member.role_updated',
        resourceType: 'membership',
        resourceId: String(membershipId),
        details: { newRole: parsed.data.role },
      });

      res.json({ membership: updated });
    } catch (error) {
      console.error('Failed to update role:', error);
      res.status(500).json({ error: 'Unable to update member role.' });
    }
  }
);

orgsRouter.get(
  '/orgs/:orgId/audit-logs',
  requireOrgMembership(['owner', 'admin', 'architect']),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, orgId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);
      res.json({ auditLogs: logs });
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      res.status(500).json({ error: 'Unable to load audit logs.' });
    }
  }
);

orgsRouter.get(
  '/orgs/:orgId/billing',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      await ensureSubscriptionPlansSeeded();

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      const plans = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(asc(subscriptionPlans.sortOrder));

      const members = await db
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.organizationId, orgId));

      const repos = await db
        .select()
        .from(repositories)
        .where(eq(repositories.organizationId, orgId));

      const usage = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.organizationId, orgId))
        .orderBy(desc(usageRecords.recordedAt))
        .limit(20);

      const activePlan =
        plans.find((p) => p.id === org?.planId) ?? plans[0] ?? null;

      res.json({
        organization: org,
        activePlan,
        availablePlans: plans,
        usageSummary: {
          activeMembers: members.length,
          authorisedRepositories: repos.filter((r) => r.isAuthorised).length,
          totalRepositories: repos.length,
        },
        usageRecords: usage,
      });
    } catch (error) {
      console.error('Failed to fetch billing details:', error);
      res.status(500).json({ error: 'Unable to load billing and usage metrics.' });
    }
  }
);

const changePlanSchema = z.object({
  planId: z.number().int().positive(),
});

orgsRouter.post(
  '/orgs/:orgId/billing/plan',
  requireOrgMembership(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const parsed = changePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid planId is required.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, parsed.data.planId))
        .limit(1);

      if (!plan) {
        res.status(404).json({ error: 'Subscription plan not found.' });
        return;
      }

      const [updatedOrg] = await db
        .update(organizations)
        .set({ planId: plan.id })
        .where(eq(organizations.id, orgId))
        .returning();

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'billing.plan_changed',
        resourceType: 'organization',
        resourceId: String(orgId),
        details: { planSlug: plan.slug, monthlyPriceGbp: plan.monthlyPriceGbp },
      });

      res.json({ organization: updatedOrg, activePlan: plan });
    } catch (error) {
      console.error('Failed to update plan:', error);
      res.status(500).json({ error: 'Unable to change subscription plan.' });
    }
  }
);
