import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  targetAudience: text('target_audience').notNull(),
  monthlyPriceGbp: integer('monthly_price_gbp').notNull(),
  maxDevelopers: integer('max_developers').notNull(),
  maxRepositories: integer('max_repositories').notNull(),
  featuresJson: jsonb('features_json').$type<string[]>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ukCompanySize: text('uk_company_size').notNull().default('50-149'),
  engineerCount: integer('engineer_count').notNull().default(25),
  planId: integer('plan_id').references(() => subscriptionPlans.id),
  isDemoWorkspace: boolean('is_demo_workspace').notNull().default(false),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull().default('engineer'), // owner | admin | architect | engineer | viewer
    status: text('status').notNull().default('active'), // active | suspended
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('org_user_unique_idx').on(table.organizationId, table.userId),
  ]
);

export const organizationInvitations = pgTable('organization_invitations', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('engineer'),
  invitedByUserId: integer('invited_by_user_id').references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  status: text('status').notNull().default('pending'), // pending | accepted | revoked
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usageRecords = pgTable('usage_records', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  metricKey: text('metric_key').notNull(),
  quantity: integer('quantity').notNull().default(0),
  periodLabel: text('period_label').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  detailsJson: jsonb('details_json').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const integrations = pgTable('integrations', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  provider: text('provider').notNull(), // github | jira | linear | slack | notion | cicd
  status: text('status').notNull().default('disconnected'), // connected | disconnected | error
  accountLogin: text('account_login'),
  scopesJson: jsonb('scopes_json').$type<string[]>(),
  accessTokenEncrypted: text('access_token_encrypted'),
  installationMetaJson: jsonb('installation_meta_json').$type<Record<string, unknown>>(),
  connectedByUserId: integer('connected_by_user_id').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const repositories = pgTable('repositories', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  externalId: text('external_id').notNull(),
  fullName: text('full_name').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  primaryLanguage: text('primary_language').default('TypeScript'),
  isAuthorised: boolean('is_authorised').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  syncStatus: text('sync_status').notNull().default('pending'), // pending | synced | error
  fileCount: integer('file_count').notNull().default(0),
  commitCount: integer('commit_count').notNull().default(0),
  prCount: integer('pr_count').notNull().default(0),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const codeComponents = pgTable('code_components', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  componentType: text('component_type').notNull(), // service | module | api | database
  filePath: text('file_path').notNull(),
  language: text('language').notNull().default('TypeScript'),
  linesOfCode: integer('lines_of_code').notNull().default(0),
  complexityScore: integer('complexity_score').notNull().default(1),
  testCoveragePct: integer('test_coverage_pct'),
  churnCount: integer('churn_count').notNull().default(0),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const componentDependencies = pgTable('component_dependencies', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  sourceComponentId: integer('source_component_id')
    .references(() => codeComponents.id, { onDelete: 'cascade' })
    .notNull(),
  targetComponentId: integer('target_component_id')
    .references(() => codeComponents.id, { onDelete: 'cascade' })
    .notNull(),
  dependencyType: text('dependency_type').notNull().default('imports'), // imports | calls_api | reads_db | publishes_event
  isDocumented: boolean('is_documented').notNull().default(true),
  driftDetected: boolean('drift_detected').notNull().default(false),
  evidenceRef: text('evidence_ref'),
  isDemo: boolean('is_demo').notNull().default(false),
});

export const pullRequestsCommits = pgTable('pull_requests_commits', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  refType: text('ref_type').notNull(), // pr | commit
  externalRef: text('external_ref').notNull(),
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  changedFilesJson: jsonb('changed_files_json').$type<string[]>().notNull(),
  additions: integer('additions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
  summary: text('summary'),
  externalUrl: text('external_url'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
});

export const engineeringDecisions = pgTable('engineering_decisions', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id').references(() => repositories.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  adrCode: text('adr_code').notNull(),
  status: text('status').notNull().default('accepted'), // accepted | superseded | proposed
  context: text('context').notNull(),
  decision: text('decision').notNull(),
  consequences: text('consequences').notNull(),
  authorName: text('author_name').notNull(),
  prRef: text('pr_ref'),
  commitSha: text('commit_sha'),
  affectedComponentsJson: jsonb('affected_components_json').$type<string[]>().notNull(),
  outcomeSummary: text('outcome_summary'),
  outcomeStatus: text('outcome_status').notNull().default('verified_positive'), // verified_positive | mixed_tradeoff | caused_incident | pending_review
  isDemo: boolean('is_demo').notNull().default(false),
  decidedAt: timestamp('decided_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const historicalIncidents = pgTable('historical_incidents', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id').references(() => repositories.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  incidentCode: text('incident_code').notNull(),
  severity: text('severity').notNull(), // sev1 | sev2 | sev3 | sev4
  category: text('category').notNull(), // bug | deployment | rollback | database | security | performance
  rootCause: text('root_cause').notNull(),
  resolution: text('resolution').notNull(),
  postmortemUrl: text('postmortem_url'),
  prRef: text('pr_ref'),
  affectedComponentsJson: jsonb('affected_components_json').$type<string[]>().notNull(),
  downtimeMinutes: integer('downtime_minutes').notNull().default(0),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const changeImpactReports = pgTable('change_impact_reports', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id').references(() => repositories.id, {
    onDelete: 'set null',
  }),
  requestedByUserId: integer('requested_by_user_id').references(() => users.id),
  title: text('title').notNull(),
  proposedChangeSummary: text('proposed_change_summary').notNull(),
  targetFilesJson: jsonb('target_files_json').$type<string[]>().notNull(),
  affectedServicesJson: jsonb('affected_services_json').$type<string[]>().notNull(),
  dependencyChainJson: jsonb('dependency_chain_json').$type<
    Array<{ from: string; to: string; type: string; driftDetected?: boolean }>
  >().notNull(),
  relatedDecisionsJson: jsonb('related_decisions_json').$type<
    Array<{ id: number; adrCode: string; title: string; prRef?: string | null }>
  >().notNull(),
  similarChangesJson: jsonb('similar_changes_json').$type<
    Array<{ externalRef: string; title: string; authorLogin: string }>
  >().notNull(),
  relevantIncidentsJson: jsonb('relevant_incidents_json').$type<
    Array<{ id: number; incidentCode: string; title: string; severity: string; rootCause: string }>
  >().notNull(),
  confirmedFactsJson: jsonb('confirmed_facts_json').$type<string[]>().notNull(),
  aiHypothesesJson: jsonb('ai_hypotheses_json').$type<string[]>().notNull(),
  recommendedTestsJson: jsonb('recommended_tests_json').$type<string[]>().notNull(),
  potentialRisksJson: jsonb('potential_risks_json').$type<
    Array<{ area: string; severity: string; rationale: string }>
  >().notNull(),
  riskLevel: text('risk_level').notNull(), // low | moderate | high | critical
  confidenceLevel: text('confidence_level').notNull(), // low | medium | high
  limitations: text('limitations').notNull(),
  evidenceLinksJson: jsonb('evidence_links_json').$type<
    Array<{ label: string; ref: string; kind: string }>
  >().notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const technicalDebtFindings = pgTable('technical_debt_findings', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  repositoryId: integer('repository_id').references(() => repositories.id, {
    onDelete: 'set null',
  }),
  componentId: integer('component_id').references(() => codeComponents.id, {
    onDelete: 'set null',
  }),
  category: text('category').notNull(), // coupling | duplication | complexity | test_coverage | outdated_dependency | churn_hotspot
  severity: text('severity').notNull(), // low | medium | high
  title: text('title').notNull(),
  explanation: text('explanation').notNull(),
  evidence: text('evidence').notNull(),
  remediationPlan: text('remediation_plan').notNull(),
  status: text('status').notNull().default('open'), // open | acknowledged | resolved
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiMessages = pgTable('ai_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => aiConversations.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: integer('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // user | assistant
  content: text('content').notNull(),
  citationsJson: jsonb('citations_json').$type<
    Array<{ kind: string; ref: string; title: string }>
  >(),
  confirmedFactsJson: jsonb('confirmed_facts_json').$type<string[]>(),
  hypothesesJson: jsonb('hypotheses_json').$type<string[]>(),
  confidence: text('confidence'),
  limitations: text('limitations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const demoRequests = pgTable('demo_requests', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  workEmail: text('work_email').notNull(),
  companyName: text('company_name').notNull(),
  roleTitle: text('role_title').notNull(),
  engineeringHeadcount: text('engineering_headcount').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  plan: one(subscriptionPlans, {
    fields: [organizations.planId],
    references: [subscriptionPlans.id],
  }),
  memberships: many(organizationMemberships),
  repositories: many(repositories),
  decisions: many(engineeringDecisions),
  incidents: many(historicalIncidents),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMemberships),
}));

export const organizationMembershipsRelations = relations(
  organizationMemberships,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMemberships.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMemberships.userId],
      references: [users.id],
    }),
  })
);
