import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  aiConversations,
  aiMessages,
  changeImpactReports,
  codeComponents,
  componentDependencies,
  engineeringDecisions,
  historicalIncidents,
  pullRequestsCommits,
  repositories,
  technicalDebtFindings,
  usageRecords,
} from '../../db/schema.ts';
import {
  generateChangeImpactAnalysis,
  generateGroundedAssistantAnswer,
} from '../../lib/gemini.ts';
import { isSafeExternalUrl } from '../../lib/security.ts';
import {
  type AuthRequest,
  recordAuditLog,
  requireAuth,
  requireOrgMembership,
} from '../../middleware/auth.ts';

export const intelligenceRouter = Router();

intelligenceRouter.use(requireAuth);

intelligenceRouter.get(
  '/orgs/:orgId/overview',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const [
        repos,
        components,
        deps,
        decisions,
        incidents,
        debt,
        reports,
        changes,
      ] = await Promise.all([
        db.select().from(repositories).where(eq(repositories.organizationId, orgId)),
        db.select().from(codeComponents).where(eq(codeComponents.organizationId, orgId)),
        db
          .select()
          .from(componentDependencies)
          .where(eq(componentDependencies.organizationId, orgId)),
        db
          .select()
          .from(engineeringDecisions)
          .where(eq(engineeringDecisions.organizationId, orgId))
          .orderBy(desc(engineeringDecisions.decidedAt)),
        db
          .select()
          .from(historicalIncidents)
          .where(eq(historicalIncidents.organizationId, orgId))
          .orderBy(desc(historicalIncidents.occurredAt)),
        db
          .select()
          .from(technicalDebtFindings)
          .where(eq(technicalDebtFindings.organizationId, orgId)),
        db
          .select()
          .from(changeImpactReports)
          .where(eq(changeImpactReports.organizationId, orgId))
          .orderBy(desc(changeImpactReports.createdAt))
          .limit(5),
        db
          .select()
          .from(pullRequestsCommits)
          .where(eq(pullRequestsCommits.organizationId, orgId))
          .orderBy(desc(pullRequestsCommits.occurredAt))
          .limit(10),
      ]);

      const authorisedRepos = repos.filter((r) => r.isAuthorised);
      const driftCount = deps.filter((d) => d.driftDetected).length;
      const openDebt = debt.filter((d) => d.status === 'open');
      const avgComplexity =
        components.length > 0
          ? Number(
              (
                components.reduce((acc, c) => acc + c.complexityScore, 0) /
                components.length
              ).toFixed(1)
            )
          : 0;

      const componentsWithKnownCoverage = components.filter(
        (c) => c.testCoveragePct !== null
      );
      const avgCoverage =
        componentsWithKnownCoverage.length > 0
          ? Math.round(
              componentsWithKnownCoverage.reduce(
                (acc, c) => acc + (c.testCoveragePct ?? 0),
                0
              ) / componentsWithKnownCoverage.length
            )
          : null;

      // Knowledge Coverage: % of indexed components referenced in at least one ADR or Incident record
      const documentedComponentNames = new Set<string>();
      for (const d of decisions) {
        for (const name of d.affectedComponentsJson) {
          documentedComponentNames.add(name);
        }
      }
      const coveredComponents = components.filter((c) =>
        documentedComponentNames.has(c.name)
      ).length;
      const knowledgeCoveragePct =
        components.length > 0
          ? Math.round((coveredComponents / components.length) * 100)
          : 0;

      res.json({
        isDemoWorkspace: req.orgContext!.isDemoWorkspace,
        metrics: {
          authorisedRepositories: {
            value: authorisedRepos.length,
            totalTracked: repos.length,
            formula: 'Count of repositories explicitly authorised for read-only indexing.',
          },
          architectureComplexity: {
            avgComplexity,
            totalComponents: components.length,
            totalEdges: deps.length,
            driftEdges: driftCount,
            formula:
              'Mean cyclomatic branch score across indexed components; drift equals undocumented dependency edges.',
          },
          technicalDebt: {
            openFindings: openDebt.length,
            highSeverity: openDebt.filter((d) => d.severity === 'high').length,
            avgTestCoveragePct: avgCoverage,
            formula:
              'Count of unresolved coupling, complexity, churn, and test-coverage findings.',
          },
          incidentMemory: {
            totalIncidents: incidents.length,
            sev1AndSev2: incidents.filter(
              (i) => i.severity === 'sev1' || i.severity === 'sev2'
            ).length,
            formula: 'Recorded postmortems, rollbacks, and production incident entries.',
          },
          knowledgeCoverage: {
            percentage: knowledgeCoveragePct,
            coveredComponents,
            totalComponents: components.length,
            totalDecisions: decisions.length,
            formula:
              '(Components linked to >= 1 ADR Decision / Total indexed components) * 100.',
          },
          changeRiskSummary: {
            reportsGenerated: reports.length,
            highOrCriticalReports: reports.filter(
              (r) => r.riskLevel === 'high' || r.riskLevel === 'critical'
            ).length,
            formula:
              'Proportion of evaluated change proposals classified high or critical risk.',
          },
        },
        recentReports: reports,
        recentDecisions: decisions.slice(0, 4),
        recentIncidents: incidents.slice(0, 4),
        recentChanges: changes.slice(0, 6),
        components,
      });
    } catch (error) {
      console.error('Failed to compute overview:', error);
      res.status(500).json({ error: 'Unable to compute engineering overview.' });
    }
  }
);

intelligenceRouter.get(
  '/orgs/:orgId/decisions',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const items = await db
        .select()
        .from(engineeringDecisions)
        .where(eq(engineeringDecisions.organizationId, orgId))
        .orderBy(desc(engineeringDecisions.decidedAt));
      res.json({ decisions: items });
    } catch (error) {
      console.error('Failed to fetch decisions:', error);
      res.status(500).json({ error: 'Unable to load engineering decisions.' });
    }
  }
);

const createDecisionSchema = z.object({
  title: z.string().trim().min(4).max(200),
  adrCode: z.string().trim().min(2).max(32),
  status: z.enum(['accepted', 'superseded', 'proposed']).default('accepted'),
  context: z.string().trim().min(10).max(4000),
  decision: z.string().trim().min(10).max(4000),
  consequences: z.string().trim().min(5).max(4000),
  authorName: z.string().trim().min(2).max(120),
  prRef: z.string().trim().max(80).optional(),
  commitSha: z.string().trim().max(64).optional(),
  affectedComponents: z.array(z.string().trim().min(1)).default([]),
  outcomeSummary: z.string().trim().max(1000).optional(),
  outcomeStatus: z
    .enum(['verified_positive', 'mixed_tradeoff', 'caused_incident', 'pending_review'])
    .default('pending_review'),
});

intelligenceRouter.post(
  '/orgs/:orgId/decisions',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    const parsed = createDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid decision record payload.',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [created] = await db
        .insert(engineeringDecisions)
        .values({
          organizationId: orgId,
          title: parsed.data.title,
          adrCode: parsed.data.adrCode,
          status: parsed.data.status,
          context: parsed.data.context,
          decision: parsed.data.decision,
          consequences: parsed.data.consequences,
          authorName: parsed.data.authorName,
          prRef: parsed.data.prRef ?? null,
          commitSha: parsed.data.commitSha ?? null,
          affectedComponentsJson: parsed.data.affectedComponents,
          outcomeSummary: parsed.data.outcomeSummary ?? null,
          outcomeStatus: parsed.data.outcomeStatus,
          isDemo: req.orgContext!.isDemoWorkspace,
        })
        .returning();

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'decision.created',
        resourceType: 'engineering_decision',
        resourceId: String(created.id),
        details: { adrCode: created.adrCode, title: created.title },
      });

      res.status(201).json({ decision: created });
    } catch (error) {
      console.error('Failed to create decision:', error);
      res.status(500).json({ error: 'Unable to save engineering decision.' });
    }
  }
);

intelligenceRouter.get(
  '/orgs/:orgId/incidents',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const items = await db
        .select()
        .from(historicalIncidents)
        .where(eq(historicalIncidents.organizationId, orgId))
        .orderBy(desc(historicalIncidents.occurredAt));
      res.json({ incidents: items });
    } catch (error) {
      console.error('Failed to fetch incidents:', error);
      res.status(500).json({ error: 'Unable to load historical incidents.' });
    }
  }
);

const createIncidentSchema = z.object({
  title: z.string().trim().min(4).max(200),
  incidentCode: z.string().trim().min(2).max(32),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']),
  category: z.enum([
    'bug',
    'deployment',
    'rollback',
    'database',
    'security',
    'performance',
  ]),
  rootCause: z.string().trim().min(10).max(4000),
  resolution: z.string().trim().min(10).max(4000),
  postmortemUrl: z.string().trim().max(400).optional(),
  prRef: z.string().trim().max(80).optional(),
  affectedComponents: z.array(z.string().trim().min(1)).default([]),
  downtimeMinutes: z.number().int().min(0).max(100000).default(0),
});

intelligenceRouter.post(
  '/orgs/:orgId/incidents',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid incident record payload.',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    if (
      parsed.data.postmortemUrl &&
      !isSafeExternalUrl(parsed.data.postmortemUrl)
    ) {
      res.status(400).json({ error: 'Postmortem URL must use http or https.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [created] = await db
        .insert(historicalIncidents)
        .values({
          organizationId: orgId,
          title: parsed.data.title,
          incidentCode: parsed.data.incidentCode,
          severity: parsed.data.severity,
          category: parsed.data.category,
          rootCause: parsed.data.rootCause,
          resolution: parsed.data.resolution,
          postmortemUrl: parsed.data.postmortemUrl ?? null,
          prRef: parsed.data.prRef ?? null,
          affectedComponentsJson: parsed.data.affectedComponents,
          downtimeMinutes: parsed.data.downtimeMinutes,
          isDemo: req.orgContext!.isDemoWorkspace,
        })
        .returning();

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'incident.recorded',
        resourceType: 'historical_incident',
        resourceId: String(created.id),
        details: { incidentCode: created.incidentCode, severity: created.severity },
      });

      res.status(201).json({ incident: created });
    } catch (error) {
      console.error('Failed to record incident:', error);
      res.status(500).json({ error: 'Unable to record historical incident.' });
    }
  }
);

intelligenceRouter.get(
  '/orgs/:orgId/architecture',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const [components, deps, repos] = await Promise.all([
        db
          .select()
          .from(codeComponents)
          .where(eq(codeComponents.organizationId, orgId)),
        db
          .select()
          .from(componentDependencies)
          .where(eq(componentDependencies.organizationId, orgId)),
        db
          .select()
          .from(repositories)
          .where(eq(repositories.organizationId, orgId)),
      ]);

      const compMap = new Map(components.map((c) => [c.id, c]));
      const edges = deps.map((d) => ({
        id: d.id,
        sourceId: d.sourceComponentId,
        targetId: d.targetComponentId,
        sourceName: compMap.get(d.sourceComponentId)?.name ?? 'Unknown',
        targetName: compMap.get(d.targetComponentId)?.name ?? 'Unknown',
        dependencyType: d.dependencyType,
        isDocumented: d.isDocumented,
        driftDetected: d.driftDetected,
        evidenceRef: d.evidenceRef,
      }));

      res.json({
        repositories: repos,
        components,
        edges,
        driftEdges: edges.filter((e) => e.driftDetected),
      });
    } catch (error) {
      console.error('Failed to load architecture graph:', error);
      res.status(500).json({ error: 'Unable to load architecture intelligence graph.' });
    }
  }
);

intelligenceRouter.get(
  '/orgs/:orgId/technical-debt',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const findings = await db
        .select()
        .from(technicalDebtFindings)
        .where(eq(technicalDebtFindings.organizationId, orgId))
        .orderBy(desc(technicalDebtFindings.createdAt));

      res.json({ findings });
    } catch (error) {
      console.error('Failed to load technical debt findings:', error);
      res.status(500).json({ error: 'Unable to load technical debt radar.' });
    }
  }
);

intelligenceRouter.post(
  '/orgs/:orgId/technical-debt/scan',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const [components, deps, existing] = await Promise.all([
        db.select().from(codeComponents).where(eq(codeComponents.organizationId, orgId)),
        db
          .select()
          .from(componentDependencies)
          .where(eq(componentDependencies.organizationId, orgId)),
        db
          .select()
          .from(technicalDebtFindings)
          .where(eq(technicalDebtFindings.organizationId, orgId)),
      ]);

      const existingTitles = new Set(existing.map((f) => f.title));
      const newFindings: Array<typeof technicalDebtFindings.$inferInsert> = [];

      for (const comp of components) {
        if (comp.complexityScore >= 14) {
          const title = `High cyclomatic complexity (${comp.complexityScore}) in ${comp.name}`;
          if (!existingTitles.has(title)) {
            newFindings.push({
              organizationId: orgId,
              repositoryId: comp.repositoryId,
              componentId: comp.id,
              category: 'complexity',
              severity: comp.complexityScore >= 20 ? 'high' : 'medium',
              title,
              explanation: `${comp.filePath} exhibits elevated branching complexity (${comp.complexityScore}) across ${comp.linesOfCode} LOC.`,
              evidence: `File: ${comp.filePath} · Complexity: ${comp.complexityScore} · LOC: ${comp.linesOfCode}`,
              remediationPlan:
                'Decompose conditional branches into focused unit-tested domain helpers.',
              status: 'open',
              isDemo: req.orgContext!.isDemoWorkspace,
            });
          }
        }

        if (comp.testCoveragePct !== null && comp.testCoveragePct < 60) {
          const title = `Insufficient test coverage (${comp.testCoveragePct}%) in ${comp.name}`;
          if (!existingTitles.has(title)) {
            newFindings.push({
              organizationId: orgId,
              repositoryId: comp.repositoryId,
              componentId: comp.id,
              category: 'test_coverage',
              severity: 'high',
              title,
              explanation: `${comp.name} has ${comp.testCoveragePct}% verified coverage alongside ${comp.churnCount} recorded modifications.`,
              evidence: `File: ${comp.filePath} · Coverage: ${comp.testCoveragePct}% · Churn: ${comp.churnCount}`,
              remediationPlan:
                'Add automated unit and integration tests covering failure and boundary states.',
              status: 'open',
              isDemo: req.orgContext!.isDemoWorkspace,
            });
          }
        }
      }

      const compMap = new Map(components.map((c) => [c.id, c]));
      for (const edge of deps) {
        if (edge.driftDetected) {
          const src = compMap.get(edge.sourceComponentId)?.name ?? 'Source';
          const tgt = compMap.get(edge.targetComponentId)?.name ?? 'Target';
          const title = `Architecture drift coupling: ${src} -> ${tgt}`;
          if (!existingTitles.has(title)) {
            newFindings.push({
              organizationId: orgId,
              repositoryId: edge.repositoryId,
              componentId: edge.sourceComponentId,
              category: 'coupling',
              severity: 'high',
              title,
              explanation: `Undocumented ${edge.dependencyType} dependency detected between ${src} and ${tgt}.`,
              evidence: edge.evidenceRef ?? `${src} -> ${tgt}`,
              remediationPlan:
                'Align implementation with documented service boundaries or ratify an ADR.',
              status: 'open',
              isDemo: req.orgContext!.isDemoWorkspace,
            });
          }
        }
      }

      if (newFindings.length > 0) {
        await db.insert(technicalDebtFindings).values(newFindings);
      }

      const allFindings = await db
        .select()
        .from(technicalDebtFindings)
        .where(eq(technicalDebtFindings.organizationId, orgId))
        .orderBy(desc(technicalDebtFindings.createdAt));

      res.json({
        scannedComponents: components.length,
        newlyDetected: newFindings.length,
        findings: allFindings,
      });
    } catch (error) {
      console.error('Technical debt scan failed:', error);
      res.status(500).json({ error: 'Unable to run technical debt scan.' });
    }
  }
);

const updateDebtStatusSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved']),
});

intelligenceRouter.patch(
  '/orgs/:orgId/technical-debt/:findingId',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    const parsed = updateDebtStatusSchema.safeParse(req.body);
    const findingId = Number(req.params.findingId);
    if (!parsed.success || !Number.isInteger(findingId)) {
      res.status(400).json({ error: 'Valid finding ID and status required.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [updated] = await db
        .update(technicalDebtFindings)
        .set({ status: parsed.data.status })
        .where(
          and(
            eq(technicalDebtFindings.id, findingId),
            eq(technicalDebtFindings.organizationId, orgId)
          )
        )
        .returning();

      if (!updated) {
        res.status(404).json({ error: 'Finding not found.' });
        return;
      }

      res.json({ finding: updated });
    } catch (error) {
      console.error('Failed to update debt status:', error);
      res.status(500).json({ error: 'Unable to update technical debt finding.' });
    }
  }
);

intelligenceRouter.get(
  '/orgs/:orgId/impact',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const reports = await db
        .select()
        .from(changeImpactReports)
        .where(eq(changeImpactReports.organizationId, orgId))
        .orderBy(desc(changeImpactReports.createdAt));

      const components = await db
        .select()
        .from(codeComponents)
        .where(eq(codeComponents.organizationId, orgId));

      res.json({ reports, components });
    } catch (error) {
      console.error('Failed to fetch change impact reports:', error);
      res.status(500).json({ error: 'Unable to load change impact reports.' });
    }
  }
);

const analyzeImpactSchema = z.object({
  title: z.string().trim().min(4).max(200),
  proposedChangeSummary: z.string().trim().min(10).max(5000),
  targetFiles: z.array(z.string().trim().min(1)).default([]),
});

intelligenceRouter.post(
  '/orgs/:orgId/impact/analyze',
  requireOrgMembership(['owner', 'admin', 'architect', 'engineer']),
  async (req: AuthRequest, res) => {
    const parsed = analyzeImpactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Provide a descriptive title and proposed change summary.',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      const [components, deps, decisions, incidents, changes] = await Promise.all([
        db.select().from(codeComponents).where(eq(codeComponents.organizationId, orgId)),
        db
          .select()
          .from(componentDependencies)
          .where(eq(componentDependencies.organizationId, orgId)),
        db
          .select()
          .from(engineeringDecisions)
          .where(eq(engineeringDecisions.organizationId, orgId)),
        db
          .select()
          .from(historicalIncidents)
          .where(eq(historicalIncidents.organizationId, orgId)),
        db
          .select()
          .from(pullRequestsCommits)
          .where(eq(pullRequestsCommits.organizationId, orgId)),
      ]);

      const queryTokens = `${parsed.data.title} ${parsed.data.proposedChangeSummary} ${parsed.data.targetFiles.join(' ')}`
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((w) => w.length >= 3);

      // 1. Identify seed components matching target files or keywords
      const seedComponents = components.filter((c) => {
        const pathMatch = parsed.data.targetFiles.some(
          (tf) =>
            c.filePath.toLowerCase().includes(tf.toLowerCase()) ||
            c.name.toLowerCase().includes(tf.toLowerCase())
        );
        if (pathMatch) return true;
        const compText = `${c.name} ${c.filePath}`.toLowerCase();
        return queryTokens.some((tok) => compText.includes(tok));
      });

      const compMap = new Map(components.map((c) => [c.id, c]));
      const affectedIdSet = new Set(seedComponents.map((c) => c.id));
      const matchedEdges: Array<{
        from: string;
        to: string;
        type: string;
        driftDetected?: boolean;
      }> = [];

      // 2. Traverse 2-hop upstream/downstream dependencies
      for (let hop = 0; hop < 2; hop++) {
        for (const edge of deps) {
          if (
            affectedIdSet.has(edge.sourceComponentId) ||
            affectedIdSet.has(edge.targetComponentId)
          ) {
            affectedIdSet.add(edge.sourceComponentId);
            affectedIdSet.add(edge.targetComponentId);
          }
        }
      }

      for (const edge of deps) {
        if (
          affectedIdSet.has(edge.sourceComponentId) &&
          affectedIdSet.has(edge.targetComponentId)
        ) {
          matchedEdges.push({
            from: compMap.get(edge.sourceComponentId)?.name ?? 'Unknown',
            to: compMap.get(edge.targetComponentId)?.name ?? 'Unknown',
            type: edge.dependencyType,
            driftDetected: edge.driftDetected,
          });
        }
      }

      const affectedServices = Array.from(affectedIdSet)
        .map((id) => compMap.get(id)?.name)
        .filter((n): n is string => Boolean(n));

      const affectedLower = new Set(affectedServices.map((s) => s.toLowerCase()));

      // 3. Match related Decision DNA records
      const matchedDecisions = decisions.filter((d) => {
        const compOverlap = d.affectedComponentsJson.some((c) =>
          affectedLower.has(c.toLowerCase())
        );
        const textOverlap = queryTokens.some((tok) =>
          `${d.title} ${d.decision}`.toLowerCase().includes(tok)
        );
        return compOverlap || textOverlap;
      });

      // 4. Match historical incidents
      const matchedIncidents = incidents.filter((inc) => {
        const compOverlap = inc.affectedComponentsJson.some((c) =>
          affectedLower.has(c.toLowerCase())
        );
        const textOverlap = queryTokens.some((tok) =>
          `${inc.title} ${inc.rootCause}`.toLowerCase().includes(tok)
        );
        return compOverlap || textOverlap;
      });

      // 5. Match similar PRs/commits
      const matchedChanges = changes
        .filter((ch) => {
          const fileOverlap = ch.changedFilesJson.some((f) =>
            parsed.data.targetFiles.some((tf) => f.includes(tf))
          );
          const textOverlap = queryTokens.some((tok) =>
            `${ch.title} ${ch.summary ?? ''}`.toLowerCase().includes(tok)
          );
          return fileOverlap || textOverlap;
        })
        .slice(0, 6);

      // 6. Synthesize grounded impact report using server-side Gemini AI
      const aiResult = await generateChangeImpactAnalysis({
        proposedChangeSummary: parsed.data.proposedChangeSummary,
        targetFiles: parsed.data.targetFiles,
        matchedAffectedServices: affectedServices,
        matchedDependencyChains: matchedEdges,
        matchedDecisions: matchedDecisions.map((d) => ({
          id: d.id,
          adrCode: d.adrCode,
          title: d.title,
          decision: d.decision,
          prRef: d.prRef,
        })),
        matchedIncidents: matchedIncidents.map((i) => ({
          id: i.id,
          incidentCode: i.incidentCode,
          title: i.title,
          severity: i.severity,
          rootCause: i.rootCause,
        })),
        matchedSimilarChanges: matchedChanges.map((c) => ({
          externalRef: c.externalRef,
          title: c.title,
          authorLogin: c.authorLogin,
        })),
      });

      const evidenceLinks = [
        ...matchedDecisions.map((d) => ({
          label: `${d.adrCode}: ${d.title}`,
          ref: d.prRef ?? d.adrCode,
          kind: 'decision',
        })),
        ...matchedIncidents.map((i) => ({
          label: `${i.incidentCode}: ${i.title}`,
          ref: i.incidentCode,
          kind: 'incident',
        })),
        ...parsed.data.targetFiles.map((tf) => ({
          label: tf,
          ref: tf,
          kind: 'file',
        })),
      ];

      const [savedReport] = await db
        .insert(changeImpactReports)
        .values({
          organizationId: orgId,
          requestedByUserId: req.dbUser!.id,
          title: parsed.data.title,
          proposedChangeSummary: parsed.data.proposedChangeSummary,
          targetFilesJson: parsed.data.targetFiles,
          affectedServicesJson: affectedServices,
          dependencyChainJson: matchedEdges,
          relatedDecisionsJson: matchedDecisions.map((d) => ({
            id: d.id,
            adrCode: d.adrCode,
            title: d.title,
            prRef: d.prRef,
          })),
          similarChangesJson: matchedChanges.map((c) => ({
            externalRef: c.externalRef,
            title: c.title,
            authorLogin: c.authorLogin,
          })),
          relevantIncidentsJson: matchedIncidents.map((i) => ({
            id: i.id,
            incidentCode: i.incidentCode,
            title: i.title,
            severity: i.severity,
            rootCause: i.rootCause,
          })),
          confirmedFactsJson: aiResult.confirmedFacts,
          aiHypothesesJson: aiResult.aiHypotheses,
          recommendedTestsJson: aiResult.recommendedTests,
          potentialRisksJson: aiResult.potentialRisks,
          riskLevel: aiResult.riskLevel,
          confidenceLevel: aiResult.confidenceLevel,
          limitations: aiResult.limitations,
          evidenceLinksJson: evidenceLinks,
          isDemo: req.orgContext!.isDemoWorkspace,
        })
        .returning();

      await db.insert(usageRecords).values({
        organizationId: orgId,
        metricKey: 'impact_reports_generated',
        quantity: 1,
        periodLabel: new Date().toISOString().slice(0, 7),
      });

      await recordAuditLog({
        organizationId: orgId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
        action: 'impact_report.generated',
        resourceType: 'change_impact_report',
        resourceId: String(savedReport.id),
        details: { riskLevel: savedReport.riskLevel, confidence: savedReport.confidenceLevel },
      });

      res.status(201).json({ report: savedReport });
    } catch (error) {
      console.error('Failed to run Change Impact Predictor:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to complete change impact analysis.',
      });
    }
  }
);

intelligenceRouter.get(
  '/orgs/:orgId/assistant',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.orgContext!.organizationId;
      const convs = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.organizationId, orgId))
        .orderBy(desc(aiConversations.createdAt))
        .limit(20);

      const activeConvId = req.query.conversationId
        ? Number(req.query.conversationId)
        : convs[0]?.id;

      let messages: Array<typeof aiMessages.$inferSelect> = [];
      if (activeConvId && Number.isInteger(activeConvId)) {
        messages = await db
          .select()
          .from(aiMessages)
          .where(
            and(
              eq(aiMessages.conversationId, activeConvId),
              eq(aiMessages.organizationId, orgId)
            )
          )
          .orderBy(asc(aiMessages.createdAt));
      }

      res.json({ conversations: convs, activeConversationId: activeConvId ?? null, messages });
    } catch (error) {
      console.error('Failed to load AI assistant history:', error);
      res.status(500).json({ error: 'Unable to load assistant conversations.' });
    }
  }
);

const askAssistantSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  conversationId: z.number().int().positive().optional(),
});

intelligenceRouter.post(
  '/orgs/:orgId/assistant/ask',
  requireOrgMembership(),
  async (req: AuthRequest, res) => {
    const parsed = askAssistantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a clear engineering question.' });
      return;
    }

    try {
      const orgId = req.orgContext!.organizationId;
      let conversationId = parsed.data.conversationId;

      if (conversationId) {
        const existingConv = await db
          .select()
          .from(aiConversations)
          .where(
            and(
              eq(aiConversations.id, conversationId),
              eq(aiConversations.organizationId, orgId)
            )
          )
          .limit(1);
        if (existingConv.length === 0) {
          res.status(404).json({ error: 'Conversation not found in this organisation.' });
          return;
        }
      } else {
        const [newConv] = await db
          .insert(aiConversations)
          .values({
            organizationId: orgId,
            userId: req.dbUser!.id,
            title: parsed.data.question.slice(0, 72),
          })
          .returning();
        conversationId = newConv.id;
      }

      const [userMsg] = await db
        .insert(aiMessages)
        .values({
          conversationId,
          organizationId: orgId,
          role: 'user',
          content: parsed.data.question,
        })
        .returning();

      const [repos, components, deps, decisions, incidents, changes] =
        await Promise.all([
          db.select().from(repositories).where(eq(repositories.organizationId, orgId)),
          db.select().from(codeComponents).where(eq(codeComponents.organizationId, orgId)),
          db
            .select()
            .from(componentDependencies)
            .where(eq(componentDependencies.organizationId, orgId)),
          db
            .select()
            .from(engineeringDecisions)
            .where(eq(engineeringDecisions.organizationId, orgId)),
          db
            .select()
            .from(historicalIncidents)
            .where(eq(historicalIncidents.organizationId, orgId)),
          db
            .select()
            .from(pullRequestsCommits)
            .where(eq(pullRequestsCommits.organizationId, orgId))
            .orderBy(desc(pullRequestsCommits.occurredAt))
            .limit(15),
        ]);

      const compMap = new Map(components.map((c) => [c.id, c]));

      const grounded = await generateGroundedAssistantAnswer(parsed.data.question, {
        organizationName: req.orgContext!.organizationName,
        isDemoWorkspace: req.orgContext!.isDemoWorkspace,
        repositories: repos.map((r) => ({
          fullName: r.fullName,
          primaryLanguage: r.primaryLanguage,
        })),
        components: components.map((c) => ({
          name: c.name,
          componentType: c.componentType,
          filePath: c.filePath,
          complexityScore: c.complexityScore,
          testCoveragePct: c.testCoveragePct,
          churnCount: c.churnCount,
        })),
        dependencies: deps.map((d) => ({
          from: compMap.get(d.sourceComponentId)?.name ?? 'Unknown',
          to: compMap.get(d.targetComponentId)?.name ?? 'Unknown',
          dependencyType: d.dependencyType,
          driftDetected: d.driftDetected,
        })),
        decisions: decisions.map((d) => ({
          id: d.id,
          adrCode: d.adrCode,
          title: d.title,
          decision: d.decision,
          consequences: d.consequences,
          authorName: d.authorName,
          prRef: d.prRef,
          outcomeStatus: d.outcomeStatus,
        })),
        incidents: incidents.map((i) => ({
          id: i.id,
          incidentCode: i.incidentCode,
          title: i.title,
          severity: i.severity,
          category: i.category,
          rootCause: i.rootCause,
          resolution: i.resolution,
          prRef: i.prRef,
        })),
        recentChanges: changes.map((c) => ({
          externalRef: c.externalRef,
          title: c.title,
          authorLogin: c.authorLogin,
          changedFiles: c.changedFilesJson,
        })),
      });

      const [assistantMsg] = await db
        .insert(aiMessages)
        .values({
          conversationId,
          organizationId: orgId,
          role: 'assistant',
          content: grounded.answer,
          citationsJson: grounded.citations,
          confirmedFactsJson: grounded.confirmedFacts,
          hypothesesJson: grounded.hypotheses,
          confidence: grounded.confidence,
          limitations: grounded.limitations,
        })
        .returning();

      res.status(201).json({
        conversationId,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
      });
    } catch (error) {
      console.error('AI Assistant query failed:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to process AI Engineering Assistant request.',
      });
    }
  }
);
