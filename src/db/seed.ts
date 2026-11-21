import { asc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  changeImpactReports,
  codeComponents,
  componentDependencies,
  engineeringDecisions,
  historicalIncidents,
  integrations,
  organizationMemberships,
  organizations,
  pullRequestsCommits,
  repositories,
  subscriptionPlans,
  technicalDebtFindings,
  usageRecords,
} from './schema.ts';

export async function ensureSubscriptionPlansSeeded() {
  const existing = await db
    .select()
    .from(subscriptionPlans)
    .orderBy(asc(subscriptionPlans.sortOrder));

  if (existing.length > 0) {
    return existing;
  }

  const defaultPlans = [
    {
      slug: 'starter',
      name: 'Starter',
      targetAudience: 'For early-stage engineering teams (up to 15 developers)',
      monthlyPriceGbp: 299,
      maxDevelopers: 15,
      maxRepositories: 5,
      featuresJson: [
        'Up to 15 developers',
        'Up to 5 GitHub repositories',
        'Engineering Decision Memory (ADR DNA)',
        'Basic Change Impact Reports',
        'Role-based organisation access & audit log',
      ],
      isActive: true,
      sortOrder: 1,
    },
    {
      slug: 'professional',
      name: 'Professional',
      targetAudience: 'For scaling UK engineering organisations (up to 50 developers)',
      monthlyPriceGbp: 699,
      maxDevelopers: 50,
      maxRepositories: 25,
      featuresJson: [
        'Up to 50 developers',
        'Up to 25 GitHub repositories',
        'Advanced Change Impact Predictor with dependency traversal',
        'Technical Mistake & Incident Memory',
        'Technical Debt Radar & hotspot scoring',
      ],
      isActive: true,
      sortOrder: 2,
    },
    {
      slug: 'enterprise',
      name: 'Enterprise',
      targetAudience: 'For multi-squad platform organisations (up to 150 developers)',
      monthlyPriceGbp: 1499,
      maxDevelopers: 150,
      maxRepositories: 100,
      featuresJson: [
        'Up to 150 developers',
        'Up to 100 GitHub repositories',
        'Advanced Architecture Intelligence & Drift Detection',
        'Extended RBAC & compliance audit exports',
        'Priority UK engineering onboarding & SLA support',
      ],
      isActive: true,
      sortOrder: 3,
    },
  ];

  const inserted = await db
    .insert(subscriptionPlans)
    .values(defaultPlans)
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    return inserted;
  }

  return await db
    .select()
    .from(subscriptionPlans)
    .orderBy(asc(subscriptionPlans.sortOrder));
}

export async function createDemoWorkspaceForUser(userId: number, userEmail: string) {
  const plans = await ensureSubscriptionPlansSeeded();
  const proPlan = plans.find((p) => p.slug === 'professional') ?? plans[0];

  const slug = `albion-pay-demo-${userId}-${Date.now().toString(36)}`;
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'AlbionPay UK (Demo Workspace)',
      slug,
      ukCompanySize: '50-149',
      engineerCount: 38,
      planId: proPlan?.id ?? null,
      isDemoWorkspace: true,
      createdByUserId: userId,
    })
    .returning();

  await db.insert(organizationMemberships).values({
    organizationId: org.id,
    userId,
    role: 'owner',
    status: 'active',
  });

  await db.insert(integrations).values([
    {
      organizationId: org.id,
      provider: 'github',
      status: 'connected',
      accountLogin: 'albionpay-uk-demo',
      scopesJson: ['repo:read', 'metadata:read', 'pull_requests:read'],
      installationMetaJson: { isDemo: true, note: 'Explicitly labelled Demo Workspace' },
      connectedByUserId: userId,
    },
    {
      organizationId: org.id,
      provider: 'jira',
      status: 'disconnected',
      scopesJson: [],
    },
    {
      organizationId: org.id,
      provider: 'linear',
      status: 'disconnected',
      scopesJson: [],
    },
    {
      organizationId: org.id,
      provider: 'slack',
      status: 'disconnected',
      scopesJson: [],
    },
    {
      organizationId: org.id,
      provider: 'notion',
      status: 'disconnected',
      scopesJson: [],
    },
  ]);

  const [paymentsRepo, ledgerRepo, gatewayRepo] = await db
    .insert(repositories)
    .values([
      {
        organizationId: org.id,
        externalId: 'demo-repo-payments',
        fullName: 'albionpay-uk/payment-orchestrator',
        defaultBranch: 'main',
        primaryLanguage: 'TypeScript',
        isAuthorised: true,
        isDemo: true,
        syncStatus: 'synced',
        fileCount: 142,
        commitCount: 684,
        prCount: 118,
        lastSyncedAt: new Date(),
      },
      {
        organizationId: org.id,
        externalId: 'demo-repo-ledger',
        fullName: 'albionpay-uk/settlement-ledger',
        defaultBranch: 'main',
        primaryLanguage: 'Python',
        isAuthorised: true,
        isDemo: true,
        syncStatus: 'synced',
        fileCount: 96,
        commitCount: 412,
        prCount: 74,
        lastSyncedAt: new Date(),
      },
      {
        organizationId: org.id,
        externalId: 'demo-repo-gateway',
        fullName: 'albionpay-uk/openbanking-gateway',
        defaultBranch: 'main',
        primaryLanguage: 'TypeScript',
        isAuthorised: true,
        isDemo: true,
        syncStatus: 'synced',
        fileCount: 78,
        commitCount: 295,
        prCount: 51,
        lastSyncedAt: new Date(),
      },
    ])
    .returning();

  const [
    paymentService,
    idempotencyMod,
    stripeWebhookApi,
    settlementService,
    ledgerDb,
    gatewayApi,
    fraudRuleMod,
  ] = await db
    .insert(codeComponents)
    .values([
      {
        organizationId: org.id,
        repositoryId: paymentsRepo.id,
        name: 'PaymentOrchestratorService',
        componentType: 'service',
        filePath: 'src/services/payment-orchestrator.ts',
        language: 'TypeScript',
        linesOfCode: 640,
        complexityScore: 18,
        testCoveragePct: 68,
        churnCount: 27,
        isDemo: true,
      },
      {
        organizationId: org.id,
        repositoryId: paymentsRepo.id,
        name: 'IdempotencyGuard',
        componentType: 'module',
        filePath: 'src/middleware/idempotency-guard.ts',
        language: 'TypeScript',
        linesOfCode: 215,
        complexityScore: 9,
        testCoveragePct: 84,
        churnCount: 11,
        isDemo: true,
      },
      {
        organizationId: org.id,
        repositoryId: paymentsRepo.id,
        name: 'StripeWebhookEndpoint',
        componentType: 'api',
        filePath: 'src/routes/webhooks/stripe.ts',
        language: 'TypeScript',
        linesOfCode: 310,
        complexityScore: 14,
        testCoveragePct: 52,
        churnCount: 19,
        isDemo: true,
      },
      {
        organizationId: org.id,
        repositoryId: ledgerRepo.id,
        name: 'FasterPaymentsSettlementWorker',
        componentType: 'service',
        filePath: 'app/workers/settlement_worker.py',
        language: 'Python',
        linesOfCode: 495,
        complexityScore: 16,
        testCoveragePct: 61,
        churnCount: 22,
        isDemo: true,
      },
      {
        organizationId: org.id,
        repositoryId: ledgerRepo.id,
        name: 'LedgerPostgresCluster',
        componentType: 'database',
        filePath: 'db/migrations/014_ledger_entries.sql',
        language: 'SQL',
        linesOfCode: 180,
        complexityScore: 7,
        testCoveragePct: 90,
        churnCount: 8,
        isDemo: true,
      },
      {
        organizationId: org.id,
        repositoryId: gatewayRepo.id,
        name: 'OpenBankingConsentAPI',
        componentType: 'api',
        filePath: 'src/routes/v2/consent.ts',
        language: 'TypeScript',
        linesOfCode: 275,
        complexityScore: 11,
        testCoveragePct: 76,
        churnCount: 9,
        isDemo: true,
      },
      {
        organizationId: org.id,
        repositoryId: paymentsRepo.id,
        name: 'VelocityFraudEvaluator',
        componentType: 'module',
        filePath: 'src/risk/velocity-evaluator.ts',
        language: 'TypeScript',
        linesOfCode: 390,
        complexityScore: 15,
        testCoveragePct: 41,
        churnCount: 16,
        isDemo: true,
      },
    ])
    .returning();

  await db.insert(componentDependencies).values([
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      sourceComponentId: stripeWebhookApi.id,
      targetComponentId: paymentService.id,
      dependencyType: 'calls_api',
      isDocumented: true,
      driftDetected: false,
      evidenceRef: 'src/routes/webhooks/stripe.ts:44',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      sourceComponentId: paymentService.id,
      targetComponentId: idempotencyMod.id,
      dependencyType: 'imports',
      isDocumented: true,
      driftDetected: false,
      evidenceRef: 'src/services/payment-orchestrator.ts:12',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      sourceComponentId: paymentService.id,
      targetComponentId: settlementService.id,
      dependencyType: 'publishes_event',
      isDocumented: true,
      driftDetected: false,
      evidenceRef: 'src/services/payment-orchestrator.ts:198',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: ledgerRepo.id,
      sourceComponentId: settlementService.id,
      targetComponentId: ledgerDb.id,
      dependencyType: 'reads_db',
      isDocumented: true,
      driftDetected: false,
      evidenceRef: 'app/workers/settlement_worker.py:117',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: gatewayRepo.id,
      sourceComponentId: gatewayApi.id,
      targetComponentId: paymentService.id,
      dependencyType: 'calls_api',
      isDocumented: true,
      driftDetected: false,
      evidenceRef: 'src/routes/v2/consent.ts:89',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      sourceComponentId: stripeWebhookApi.id,
      targetComponentId: ledgerDb.id,
      dependencyType: 'reads_db',
      isDocumented: false,
      driftDetected: true,
      evidenceRef: 'src/routes/webhooks/stripe.ts:162 (direct ledger table read bypassing settlement worker)',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      sourceComponentId: paymentService.id,
      targetComponentId: fraudRuleMod.id,
      dependencyType: 'imports',
      isDocumented: true,
      driftDetected: false,
      evidenceRef: 'src/services/payment-orchestrator.ts:15',
      isDemo: true,
    },
  ]);

  await db.insert(pullRequestsCommits).values([
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      refType: 'pr',
      externalRef: 'PR #412',
      title: 'Enforce 24h Redis idempotency window on Faster Payments retries',
      authorLogin: 'h.henderson',
      changedFilesJson: [
        'src/middleware/idempotency-guard.ts',
        'src/services/payment-orchestrator.ts',
      ],
      additions: 148,
      deletions: 39,
      summary: 'Prevents duplicate settlement postings during gateway timeout retries.',
      occurredAt: new Date('2026-06-14T10:20:00Z'),
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      refType: 'pr',
      externalRef: 'PR #438',
      title: 'Add fallback ledger lookup in Stripe webhook reconciliation',
      authorLogin: 'm.patel',
      changedFilesJson: ['src/routes/webhooks/stripe.ts'],
      additions: 64,
      deletions: 12,
      summary: 'Added direct read against ledger_entries during webhook replay.',
      occurredAt: new Date('2026-09-03T14:45:00Z'),
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: ledgerRepo.id,
      refType: 'pr',
      externalRef: 'PR #189',
      title: 'Batch settlement locks by sort-code partition to eliminate deadlocks',
      authorLogin: 'c.barton',
      changedFilesJson: [
        'app/workers/settlement_worker.py',
        'db/migrations/014_ledger_entries.sql',
      ],
      additions: 210,
      deletions: 94,
      summary: 'Introduced deterministic row ordering for multi-currency GBP/EUR batches.',
      occurredAt: new Date('2026-08-21T09:15:00Z'),
      isDemo: true,
    },
  ]);

  await db.insert(engineeringDecisions).values([
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      title: 'Enforce server-side idempotency keys before Faster Payments dispatch',
      adrCode: 'ADR-014',
      status: 'accepted',
      context:
        'Upstream mobile clients retried timed-out HTTP POST /payments calls within 800ms, creating risk of duplicate GBP transfers.',
      decision:
        'Require a client-supplied UUIDv4 Idempotency-Key cached atomically with payload hash for 24 hours in IdempotencyGuard prior to orchestration.',
      consequences:
        'Adds 4ms median latency per payment request; requires Redis cluster availability or graceful fail-closed policy.',
      authorName: 'Hannah Henderson (Principal Architect)',
      prRef: 'PR #412',
      commitSha: '9f3a81c',
      affectedComponentsJson: ['PaymentOrchestratorService', 'IdempotencyGuard'],
      outcomeSummary:
        'Zero duplicate Faster Payments postings recorded over 6 months following rollout.',
      outcomeStatus: 'verified_positive',
      isDemo: true,
      decidedAt: new Date('2026-06-14T11:00:00Z'),
    },
    {
      organizationId: org.id,
      repositoryId: ledgerRepo.id,
      title: 'Isolate LedgerPostgresCluster writes strictly inside FasterPaymentsSettlementWorker',
      adrCode: 'ADR-019',
      status: 'accepted',
      context:
        'Multiple services querying and locking ledger_entries concurrently caused serialization conflicts during Friday payroll peaks.',
      decision:
        'Only FasterPaymentsSettlementWorker may read/write LedgerPostgresCluster directly; upstream APIs must consume settlement events.',
      consequences:
        'Simplifies schema evolution and lock ordering, but introduces eventual consistency (up to 400ms) for webhook consumers.',
      authorName: 'Callum Barton (Head of Platform Engineering)',
      prRef: 'PR #189',
      commitSha: '4c21e0b',
      affectedComponentsJson: ['FasterPaymentsSettlementWorker', 'LedgerPostgresCluster'],
      outcomeSummary:
        'Mixed tradeoff: deadlocks dropped 94%, though PR #438 later bypassed this rule in StripeWebhookEndpoint.',
      outcomeStatus: 'mixed_tradeoff',
      isDemo: true,
      decidedAt: new Date('2026-08-21T12:30:00Z'),
    },
  ]);

  await db.insert(historicalIncidents).values([
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      title: 'Duplicate GBP settlement batch triggered during Redis failover',
      incidentCode: 'INC-2026-041',
      severity: 'sev1',
      category: 'database',
      rootCause:
        'IdempotencyGuard fell back to pass-through mode when Redis primary elected a new leader, allowing two concurrent webhook deliveries to dispatch settlement events.',
      resolution:
        'Changed IdempotencyGuard to fail-closed on lock acquisition errors (PR #412) and added a unique constraint on settlement_reference in LedgerPostgresCluster.',
      prRef: 'PR #412',
      affectedComponentsJson: [
        'PaymentOrchestratorService',
        'IdempotencyGuard',
        'StripeWebhookEndpoint',
      ],
      downtimeMinutes: 42,
      occurredAt: new Date('2026-06-08T16:10:00Z'),
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: ledgerRepo.id,
      title: 'Friday payroll settlement latency spike and rollback after schema lock',
      incidentCode: 'INC-2026-058',
      severity: 'sev2',
      category: 'rollback',
      rootCause:
        'Concurrent reads from StripeWebhookEndpoint held shared locks on ledger_entries while settlement worker attempted batch updates.',
      resolution:
        'Rolled back webhook reconciliation job and scheduled removal of direct ledger table reads per ADR-019.',
      prRef: 'PR #438',
      affectedComponentsJson: [
        'StripeWebhookEndpoint',
        'FasterPaymentsSettlementWorker',
        'LedgerPostgresCluster',
      ],
      downtimeMinutes: 28,
      occurredAt: new Date('2026-09-11T17:05:00Z'),
      isDemo: true,
    },
  ]);

  await db.insert(technicalDebtFindings).values([
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      componentId: stripeWebhookApi.id,
      category: 'coupling',
      severity: 'high',
      title: 'Undocumented direct ledger database read in StripeWebhookEndpoint',
      explanation:
        'StripeWebhookEndpoint queries LedgerPostgresCluster directly (line 162), violating ADR-019 boundary isolation and contributing to lock contention.',
      evidence: 'Drift edge detected: StripeWebhookEndpoint -> LedgerPostgresCluster (PR #438)',
      remediationPlan:
        'Replace direct SQL query with an idempotent read-model API endpoint exposed by FasterPaymentsSettlementWorker.',
      status: 'open',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      componentId: fraudRuleMod.id,
      category: 'test_coverage',
      severity: 'high',
      title: 'Low test coverage (41%) in high-churn VelocityFraudEvaluator module',
      explanation:
        'VelocityFraudEvaluator has been modified 16 times in 90 days with complexity score 15, yet only 41% line coverage is verified.',
      evidence: 'Churn: 16 commits · Complexity: 15 · Coverage: 41%',
      remediationPlan:
        'Add boundary test cases for GBP velocity thresholds and clock-skew edge cases before next ruleset release.',
      status: 'open',
      isDemo: true,
    },
    {
      organizationId: org.id,
      repositoryId: paymentsRepo.id,
      componentId: paymentService.id,
      category: 'complexity',
      severity: 'medium',
      title: 'High fan-out and cyclomatic complexity (18) in PaymentOrchestratorService',
      explanation:
        'PaymentOrchestratorService acts as a hub across 5 downstream/upstream components with 27 recent changes.',
      evidence: 'LOC: 640 · Complexity: 18 · Inbound/Outbound edges: 5',
      remediationPlan:
        'Extract provider-specific retry policies into isolated strategy modules with contract tests.',
      status: 'acknowledged',
      isDemo: true,
    },
  ]);

  await db.insert(changeImpactReports).values({
    organizationId: org.id,
    repositoryId: paymentsRepo.id,
    requestedByUserId: userId,
    title: 'Modify retry timeout and idempotency fallback in PaymentOrchestratorService',
    proposedChangeSummary:
      'Update PaymentOrchestratorService retry backoff from 300ms to 1200ms and adjust IdempotencyGuard cache TTL validation during Stripe webhook reconciliation.',
    targetFilesJson: [
      'src/services/payment-orchestrator.ts',
      'src/middleware/idempotency-guard.ts',
    ],
    affectedServicesJson: [
      'PaymentOrchestratorService',
      'IdempotencyGuard',
      'StripeWebhookEndpoint',
      'FasterPaymentsSettlementWorker',
      'OpenBankingConsentAPI',
    ],
    dependencyChainJson: [
      {
        from: 'OpenBankingConsentAPI',
        to: 'PaymentOrchestratorService',
        type: 'calls_api',
      },
      {
        from: 'StripeWebhookEndpoint',
        to: 'PaymentOrchestratorService',
        type: 'calls_api',
      },
      {
        from: 'PaymentOrchestratorService',
        to: 'FasterPaymentsSettlementWorker',
        type: 'publishes_event',
      },
      {
        from: 'StripeWebhookEndpoint',
        to: 'LedgerPostgresCluster',
        type: 'reads_db',
        driftDetected: true,
      },
    ],
    relatedDecisionsJson: [
      {
        id: 1,
        adrCode: 'ADR-014',
        title: 'Enforce server-side idempotency keys before Faster Payments dispatch',
        prRef: 'PR #412',
      },
      {
        id: 2,
        adrCode: 'ADR-019',
        title: 'Isolate LedgerPostgresCluster writes strictly inside FasterPaymentsSettlementWorker',
        prRef: 'PR #189',
      },
    ],
    similarChangesJson: [
      {
        externalRef: 'PR #412',
        title: 'Enforce 24h Redis idempotency window on Faster Payments retries',
        authorLogin: 'h.henderson',
      },
      {
        externalRef: 'PR #438',
        title: 'Add fallback ledger lookup in Stripe webhook reconciliation',
        authorLogin: 'm.patel',
      },
    ],
    relevantIncidentsJson: [
      {
        id: 1,
        incidentCode: 'INC-2026-041',
        title: 'Duplicate GBP settlement batch triggered during Redis failover',
        severity: 'sev1',
        rootCause:
          'IdempotencyGuard fell back to pass-through mode when Redis primary elected a new leader.',
      },
      {
        id: 2,
        incidentCode: 'INC-2026-058',
        title: 'Friday payroll settlement latency spike and rollback after schema lock',
        severity: 'sev2',
        rootCause:
          'Concurrent reads from StripeWebhookEndpoint held shared locks on ledger_entries.',
      },
    ],
    confirmedFactsJson: [
      'PaymentOrchestratorService directly depends on IdempotencyGuard and publishes events to FasterPaymentsSettlementWorker.',
      'ADR-014 mandates fail-closed 24h idempotency enforcement following SEV-1 incident INC-2026-041.',
      'An undocumented drift dependency currently connects StripeWebhookEndpoint directly to LedgerPostgresCluster (PR #438).',
    ],
    aiHypothesesJson: [
      'Extending retry backoff to 1200ms could keep upstream OpenBankingConsentAPI HTTP connections open longer under gateway latency.',
      'Modifying IdempotencyGuard TTL logic without preserving fail-closed Redis behaviour may re-expose duplicate settlement edge cases seen in INC-2026-041.',
    ],
    recommendedTestsJson: [
      'Integration test: Redis failover simulation verifying IdempotencyGuard fails closed (returns 503 rather than dispatching duplicate transfer).',
      'Contract test: OpenBankingConsentAPI timeout budget >= PaymentOrchestratorService worst-case retry duration.',
      'Load test: StripeWebhookEndpoint concurrent replay against LedgerPostgresCluster under settlement batch load.',
    ],
    potentialRisksJson: [
      {
        area: 'Duplicate Settlement / Idempotency',
        severity: 'high',
        rationale: 'Historical SEV-1 (INC-2026-041) originated in IdempotencyGuard fallback handling.',
      },
      {
        area: 'Upstream HTTP Timeout Cascade',
        severity: 'moderate',
        rationale: '1200ms backoff may exceed OpenBankingConsentAPI downstream SLA.',
      },
    ],
    riskLevel: 'high',
    confidenceLevel: 'high',
    limitations:
      'Demo Workspace report grounded in seeded AlbionPay UK payment repositories. Connect your organisation GitHub repositories for live production codebase analysis.',
    evidenceLinksJson: [
      { label: 'ADR-014 (PR #412)', ref: 'ADR-014', kind: 'decision' },
      { label: 'INC-2026-041', ref: 'INC-2026-041', kind: 'incident' },
      { label: 'src/services/payment-orchestrator.ts', ref: 'src/services/payment-orchestrator.ts', kind: 'file' },
    ],
    isDemo: true,
  });

  await db.insert(usageRecords).values([
    {
      organizationId: org.id,
      metricKey: 'indexed_repositories',
      quantity: 3,
      periodLabel: '2026-11',
    },
    {
      organizationId: org.id,
      metricKey: 'impact_reports_generated',
      quantity: 1,
      periodLabel: '2026-11',
    },
  ]);

  await db.insert(auditLogs).values({
    organizationId: org.id,
    actorUserId: userId,
    actorEmail: userEmail,
    action: 'demo_workspace.provisioned',
    resourceType: 'organization',
    resourceId: String(org.id),
    detailsJson: { isDemoWorkspace: true, template: 'AlbionPay UK Payments Demo' },
  });

  return org;
}

export async function getUserOrganizations(userId: number) {
  return await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ukCompanySize: organizations.ukCompanySize,
      engineerCount: organizations.engineerCount,
      planId: organizations.planId,
      isDemoWorkspace: organizations.isDemoWorkspace,
      createdAt: organizations.createdAt,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizationMemberships.organizationId, organizations.id)
    )
    .where(eq(organizationMemberships.userId, userId));
}
