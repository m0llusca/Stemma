# Stemma Omnichannel QA Hub Program Design

## Status

Approved section-by-section in conversation on 2026-06-28.

This spec defines the next deep implementation program for Stemma after the foundation work. It covers one-button integrations, deeper adapter runtime, live certification, messaging channels, AI Quality Ops, enterprise compliance readiness, UI systematization, and performance guarantees.

## Positioning

Stemma is an Omnichannel QA Hub: an operating system for support quality, CX control, source readiness, coaching, training, and compliance evidence.

The product has two mandatory layers:

- AI Quality Ops: AI drafts quality evaluations, highlights, risk tags, coaching suggestions, anomaly signals, and operational priorities. Humans approve final outcomes by default.
- Enterprise Compliance QA: source certification, evidence logs, SSO/SCIM/LDAP boundaries, audit trails, roles, and readiness states make the product acceptable to enterprise IT and security teams.

The 6-month target is to move Stemma from a strong operational prototype to a live-certified QA operating system where sources can be connected with minimal setup, every readiness claim is backed by evidence, and managers see the next best action instead of a collection of disconnected tables.

## Research Inputs

Lazyweb UI evidence:

- Stemma dashboard improvement report: https://www.lazyweb.com/report/lazyweb/299ab7b6-88e3-4262-81a8-4797e4103929/

Official competitor pages used for positioning and best-practice extraction:

- AmplifAI: https://www.amplifai.com/
- NICE: https://www.nice.com/
- EvaluAgent: https://www.evaluagent.com/
- Balto QA: https://www.balto.ai/call-center-quality-assurance-software/
- Cresta: https://cresta.com/
- Verint Quality and Compliance: https://www.verint.com/quality-and-compliance/?vrntabp=calabrio
- Scorebuddy: https://www.scorebuddycx.com/
- Convin: https://convin.ai/

Current API documentation checks already performed through Context7:

- Zendesk API reference, selected Context7 id `/websites/developer_zendesk_api-reference`. Relevant requirements: Support API authentication, ticket search, cursor pagination, incremental ticket export, and rate limits.
- Intercom OpenAPI, selected Context7 id `/intercom/intercom-openapi`. Relevant requirements: bearer authentication, `Intercom-Version`, conversations/tickets search, pagination, and webhook-capable resources.
- HubSpot developer documentation, selected Context7 id `/websites/developers_hubspot`. Relevant requirements: OAuth app requirements, CRM object APIs, tickets/conversations, webhooks, scopes, and pagination.

Every adapter implementation task must repeat a current-docs lookup before coding. Use Context7 first for vendor APIs and official documentation; if Context7 lacks the vendor, use the vendor's official developer documentation directly.

## Goals

- Make one-button source connection the primary integration model without overstating incomplete vendor support.
- Upgrade priority sources from declarative contracts to real runtime adapters with read, webhook or polling, sample import, diagnostics, and evidence.
- Add live certification as a first-class product and data model concept.
- Add Slack, Microsoft Teams, Telegram, and WhatsApp as staged action and ingest channels.
- Rewrite key product pages around one operating pattern: signals, action, details, evidence.
- Preserve and extend instant-feeling route performance, especially for pages that only enqueue work or show a summary.
- Strengthen semantic data colors so good, risky, bad, neutral, and informational numbers read immediately.
- Create a competitive analysis foundation that informs product priorities, design patterns, and future messaging.

## Non-Goals

- Fully localizing the whole product in this program. Localization remains important, but this phase only touches copy needed by the new integration, certification, messaging, and status surfaces.
- Making Stemma a primary real-time agent-assist product. Real-time guidance may become a later channel, but the near-term product remains QA operations, risk, coaching, training, and source evidence.
- Marking any integration `live-certified` from fixtures, docs, or stubs.
- Shipping write-back into customer source systems by default.
- Importing Telegram or WhatsApp conversations without explicit customer consent, retention rules, masking rules, and channel-specific compliance review.

## Program Workstreams

### 1. Source Connect Core

One connect pipeline becomes the integration contract for every source:

1. Auto-detect or validate tenant/base URL.
2. Run auth probe.
3. Run capability probe.
4. Run sample read/import.
5. Register or validate webhook when supported.
6. Fall back to polling only when this is explicit and visible.
7. Persist certification evidence.
8. Return one user-facing next step.

The UI must never present token-only or limited integrations as complete one-click installs. If setup needs a pasted token, admin permissions, vendor marketplace approval, or manual webhook setup, the copy must say that before the user starts.

### 2. Deep Adapters

Priority live-candidate sources:

- Zendesk
- Intercom
- HubSpot Service Hub
- Jira Service Management
- OTRS
- Znuny
- OTOBO

Required adapter capabilities:

- Source-specific auth probe.
- Base URL or tenant validation.
- Read one test ticket, conversation, request, or case-like object.
- Incremental sync or search-based backfill.
- Cursor or pagination persistence.
- Webhook registration/probe where the vendor supports it.
- Polling fallback when webhook support is unavailable or not automatable.
- Normalization into the shared conversation model.
- Evidence output for every run: endpoint, status, timestamp, cursor, imported count, skipped count, error class, and masked diagnostics.

Second-wave enterprise sources:

- Salesforce Service Cloud
- ServiceNow
- Microsoft Dynamics 365 Customer Service

These start as honest limited-to-live integrations. The first milestone is OAuth or client credentials, read probe, one representative record type, and clear readiness copy. They cannot be shown as production-complete until they pass live certification.

Data-source sources:

- YDB
- YTsaurus
- Custom API
- Generic Webhook

These require declarative mapping from table, path, or JSON schema into the conversation model. The first milestone is preview, validation, sample import, replay-safe ingestion, and error evidence.

### 3. Live Certification

Live certification is a product layer, not just a badge.

Each `CertificationRun` stores:

- workspace id
- source id
- integration id
- initiated by
- started and finished timestamps
- current status
- steps
- evidence entries
- masked diagnostics
- next required action

Certification steps:

1. Contract check: adapter contract exists, official docs are linked, scopes and permissions are listed.
2. Auth check: live or sandbox credentials pass vendor auth probe.
3. Capability check: read, search/list, pagination/cursor, and webhook/polling capability are confirmed.
4. Sample import: real source object imports into the shared conversation model.
5. Webhook or polling check: webhook receipt is confirmed, or polling fallback is explicitly recorded.
6. Evidence lock: result is immutable enough for audit and user-visible readiness.

Readiness states:

- `contract-ready`: code and contract exist.
- `stub-ready`: fixture or stub test path exists.
- `auth-ready`: credentials pass live probe.
- `webhook-ready`: webhook or polling path is verified.
- `live-certified`: protected live smoke run passed and evidence is stored.
- `limited`: source has known constraints.
- `blocked`: access, scopes, vendor setup, or configuration are missing.

UI behavior:

- One compact readiness badge per source.
- Evidence drawer on demand.
- Clear next action to move toward `live-certified`.
- No green production-ready language without live evidence.

### 4. Operations UX

All major authenticated surfaces move to one operating pattern:

`signals -> action -> details -> evidence`

This pattern applies to:

- Dashboard
- Reviews
- Training
- Integrations
- Analytics
- Admin system pages

Dashboard:

- It is a triage surface, not an activity log.
- Top metrics are semantic and scannable.
- The primary block is one dominant "do now" action.
- Activity becomes secondary, drawer-like, or lower priority.
- Source and risk issues are surfaced as routeable signals.

Reviews:

- Queue state is the main entity.
- Quick views and filters must keep stable layout dimensions.
- Sticky panels must share the same border and padding system as the app topbar and dashboard.

Training:

- Obligations, overdue learning, and risk are first-class.
- Good, risky, overdue, and neutral learning numbers use shared semantic colors.
- Actions are assign, open, close debt, and review evidence.

Integrations:

- Source readiness is the main entity.
- Source row/card shows logo, status, next step, last evidence, and compact metrics.
- Diagnostics, setup, certification, and history live inside the source detail flow instead of duplicating source entities across many tabs.

Analytics:

- Negative factors appear above positive factors.
- Good and bad values are visually distinct by semantic color and copy.
- "What got worse" comes before "what improved."

Lazyweb directions to incorporate during UI implementation:

- Status Rails: repeatable semantic status treatment.
- Focus Ladder: one dominant next best action.
- Activity Drawer: activity is secondary to triage.
- Ops Brief: concise narrative summary converts scattered signals into prioritized instructions.

Every major UI screen change must go through a Lazyweb report with the current screenshot before implementation.

### 5. Messaging Channels

Messaging is staged.

Stage 1: action channels.

- Slack
- Microsoft Teams
- Telegram
- WhatsApp

Use cases:

- Reviewer notification.
- Manager escalation.
- Overdue training.
- Queue without start.
- Source lost live certification.
- Risk spike.
- Review assigned.
- Certification blocked.

Stage 2: ingest channels.

- Telegram conversation ingest.
- WhatsApp conversation ingest.

Requirements before ingest:

- Consent model.
- Workspace retention policy.
- PII masking.
- Source evidence.
- Replay-safe event handling.
- Channel-specific compliance review.

Messaging must be modeled as an integration family with the same certification and evidence concepts as helpdesk sources.

### 6. AI Quality Ops

AI output is advisory by default.

Allowed near-term AI outputs:

- Draft score.
- Evidence highlights.
- Risk tags.
- Coaching suggestion.
- Training recommendation.
- Anomaly signal.
- Summary of why a review should be prioritized.

Human approval rules:

- Final score requires human confirmation unless explicitly configured otherwise.
- High-risk and compliance categories always require human approval.
- Every AI-assisted decision records model version, prompt/version marker, evidence refs, human outcome, and override reason when changed.

AI must improve throughput and prioritization without turning the audit trail into a black box.

### 7. Performance And Runtime

The app must feel instant even when heavy source work runs asynchronously.

Route shell contract:

- Login and authenticated app shell stay lightweight.
- Pages that only enqueue work must not import LDAP, SCIM, worker runtime, vendor SDKs, Prisma-heavy registries, or adapter runtime directly.
- Heavy code lives behind server actions, route handlers, workers, or deferred panels.
- UI receives serializable summaries first.

Loading contract:

- Every heavy route has a route-level or local loading boundary.
- Quick-view toggles do not create blank gaps.
- Sticky panels maintain consistent topbar-compatible padding, borders, and width behavior.

Performance budgets:

- Warm route shell target: under 300 ms in local/dev smoke conditions.
- Primary summary target: under 800 ms in local/dev smoke conditions.
- Heavy diagnostics, certification, and import details load asynchronously.

Regression guards:

- Import guard for disallowed heavy modules in lightweight pages and enqueue-only routes.
- Smoke tests for authenticated route shells.
- Playwright checks for quick views, sticky panels, topbar boundaries, and empty states.
- Bundle or source-size alerts for routes that cross agreed thresholds.

## Competitive Analysis Model

### Segments

QA workflow platforms:

- EvaluAgent
- Scorebuddy

Best practices to adopt:

- Clear QA workflows.
- Scorecard-centered review flows.
- Calibration and coaching surfaces.
- Manager-readable quality status.

Stemma differentiation:

- Stronger source certification.
- Better source readiness evidence.
- One-button connect as a product wedge.
- AI and compliance under one operating model.

Real-time coaching and AI assist:

- Balto
- Cresta

Best practices to adopt:

- Next-best-action clarity.
- Coaching loop.
- Fast prioritization.
- Operational language around measurable behavior change.

Stemma differentiation:

- Stemma is not primarily a live call assistant.
- It owns QA operations, risk, training, evidence, and post-interaction improvement.

Enterprise WEM and compliance suites:

- NICE
- Verint and Calabrio context

Best practices to adopt:

- Governance.
- Auditability.
- Enterprise roles and permissions.
- Compliance framing.
- Broad operational coverage.

Stemma differentiation:

- Less suite complexity.
- Faster source-first setup.
- More honest integration readiness.
- Better fit for teams that need omnichannel QA without a full WEM suite migration.

Performance and coaching operations:

- AmplifAI

Best practices to adopt:

- Manager action framing.
- Coaching plan language.
- Performance uplift narrative.
- Compact leadership surfaces.

Stemma differentiation:

- Quality source evidence and certification are core, not adjacent.
- QA, coaching, training, and integrations live in one system.

Conversation intelligence and auto-QA:

- Convin

Best practices to adopt:

- Broad conversation coverage.
- Automated QA suggestions.
- Insights from conversation data.

Stemma differentiation:

- Human-approved AI for controlled QA.
- Enterprise readiness states.
- Evidence-first source integration.
- Stronger operational routing from insight to action.

## Source Documentation Gate

Adapter tasks must start with current official documentation verification. The implementation plan should include one docs subtask per source.

Initial official documentation targets:

- Zendesk: https://developer.zendesk.com/api-reference/
- Freshdesk: https://developers.freshdesk.com/api/
- Intercom: https://developers.intercom.com/
- HubSpot: https://developers.hubspot.com/
- Jira Service Management: https://developer.atlassian.com/cloud/jira/service-desk/rest/
- Salesforce REST API: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
- ServiceNow REST APIs: https://developer.servicenow.com/dev.do#!/reference/api/
- Microsoft Dynamics 365 Customer Service: https://learn.microsoft.com/en-us/dynamics365/customer-service/
- OTRS GenericInterface: https://doc.otrs.com/doc/manual/admin/6.0/en/html/genericinterface.html
- Znuny documentation: https://doc.znuny.org/
- OTOBO documentation: https://doc.otobo.org/
- YDB documentation: https://ydb.tech/docs/en/
- YTsaurus documentation: https://ytsaurus.tech/docs/en/
- Slack API: https://api.slack.com/
- Microsoft Teams platform: https://learn.microsoft.com/en-us/microsoftteams/platform/
- Telegram Bot API: https://core.telegram.org/bots/api
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/

If a docs target moves or becomes stale, the implementation task must replace it with the current official source before changing code.

## Architecture Boundaries

### Integration Core

The connect pipeline owns cross-source steps, state transitions, evidence output, and user-facing next actions.

Adapters own vendor-specific auth, endpoints, pagination, webhooks, mapping, and error translation.

UI owns source selection, readiness display, compact evidence, and repair actions. UI must not import adapter runtime or source SDKs.

### Certification

Certification runs are append-style evidence records. They can be superseded by newer runs, but past run evidence remains auditable.

The product must distinguish install readiness, runtime capability, and live certification. A source can be installable without being live-certified.

### Messaging

Messaging channels are integrations with their own auth, scopes, event model, and evidence. Notification delivery and conversation ingest are separate capabilities and should not be implied by one another.

### AI

AI suggestions attach to existing QA entities through evidence refs. They should not mutate final review state without an explicit human or policy decision.

### Performance

Heavy modules stay out of app shell, login, enqueue-only, and summary routes. Runtime guards should make this enforceable rather than relying on review discipline.

## Data Model Additions

Suggested entities for implementation planning:

- `CertificationRun`
- `CertificationStep`
- `CertificationEvidence`
- `IntegrationCapabilityProbe`
- `IntegrationWebhookProbe`
- `IntegrationSyncCursor`
- `MessagingChannel`
- `MessagingDelivery`
- `AiQualityDraft`
- `AiQualityDecision`

Existing integration and review entities should be reused where possible. Add new entities only where evidence, replay, audit, or human approval needs a durable record.

## Verification Strategy

Unit tests:

- Adapter contract tests for every source.
- Certification state transition tests.
- Evidence redaction tests.
- Messaging payload normalization tests.
- Semantic color mapping tests.
- Runtime import guard tests.

Integration tests:

- Stubbed vendor API probes.
- Sample import normalization.
- Webhook signature verification where applicable.
- Polling fallback behavior.
- Certification run persistence.

E2E tests:

- Login-first default route.
- Dashboard summary and focus actions.
- Reviews quick-view toggles without layout gaps.
- Integration source readiness flow.
- Certification evidence drawer.
- Analytics negative-before-positive layout.

Performance tests:

- Route shell smoke timing.
- Disallowed import checks.
- Deferred heavy panel behavior.
- Sticky/topbar width and padding consistency.

## Milestones

### 90-Day Milestone

- Source Connect Core formalized and tested.
- Zendesk, Intercom, HubSpot, Jira Service Management, and OTRS-family have deep adapter paths with read and webhook or polling evidence.
- Live certification data model and UI are shipped.
- Dashboard, reviews, training, integrations, and analytics follow the signals/action/details/evidence pattern.
- Slack and Teams action-channel notifications are available first, with Telegram and WhatsApp action-channel design ready or partially implemented.
- Route runtime and performance guards are in CI.

### 6-Month Milestone

- First-wave sources have protected live certification paths.
- Enterprise and data-source integrations move from limited to deeper runtime where customer access permits.
- Telegram and WhatsApp action channels are production-ready, and ingest channels are implemented only where consent and compliance requirements are satisfied.
- AI Quality Ops drafts, risk tags, coaching suggestions, and approval evidence are production-ready.
- Competitive analysis is translated into product surfaces, not only docs.
- Stemma can be credibly described as an Omnichannel QA Hub with AI Quality Ops and Enterprise Compliance QA.

## Success Criteria

- A source cannot show production-ready language unless live certification evidence exists.
- First-wave source setup gives the user one clear next action at every failure point.
- Dashboard and operational pages lead with priority signals and one obvious action.
- Negative factors are shown above positive factors in analytics.
- Semantic color tokens consistently distinguish good, warning, bad, neutral, and informational states.
- Lightweight routes do not import LDAP, SCIM, worker runtime, or adapter-heavy modules.
- Quick-view toggles and sticky panels no longer regress into layout gaps or inconsistent chrome.
- AI-generated QA output is auditable and human-approved by default.
- The implementation plan decomposes this spec into parallel subagent-friendly tracks without mixing source runtime, certification, UI, messaging, and performance into one task.
