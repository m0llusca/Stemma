# Support QA Platform Design

Date: 2026-05-02

## Goal

Build a web application for quality control of support agent answers. The product must support human agents and AI agents under one QA model, start with a fast manual QA workflow, and leave a clear path to integrations, AutoQA, calibration, coaching, and enterprise reporting.

The MVP is digital-first: chat, email, tickets, and messengers. Voice/call-center support is a later module based on transcripts and call metadata.

## Product Approach

Chosen approach: QA Core First.

The MVP focuses on the QA analyst's daily workflow: find a conversation, inspect context, evaluate it with a scorecard, classify the root cause, record risk, and create a coaching or process follow-up. Integrations and AI scoring are designed into the data model, but the first release does not depend on broad connector coverage or automated scoring.

Later phases expand into an Integration Hub and AI-assisted QA.

## Roles

MVP role:

- QA analyst: reviews conversations, applies scorecards, attaches evidence, records findings, and creates follow-up actions.

Full product roles:

- Support lead: monitors team quality, trends, risk, and coaching backlog.
- Admin: manages scorecards, users, roles, integrations, sampling rules, and retention settings.
- Agent: receives feedback and coaching tasks.
- Integration developer: connects custom support or AI-agent systems via API and webhooks.

## QA Methodology

The core review unit is a conversation review. Each review uses a versioned scorecard with weighted criteria, comments, and evidence references linked to specific messages or metadata.

Base criteria:

- Accuracy
- Resolution quality
- Policy and compliance
- Tone and empathy
- Process adherence
- Writing clarity
- Customer effort

Future AI-agent criteria:

- Grounding and source use
- Tool-use correctness
- Handoff quality
- Hallucination risk
- Safety and escalation behavior

Reviews can be created by a human, AI, or calibration workflow. The data model stores `review_source`, `confidence`, `evidence_refs`, `rubric_version`, and, for AI-generated reviews, `model_version`.

## MVP UX

The main interface is an Investigation Board, simplified for MVP speed.

Workflow:

1. Select a conversation from the QA queue.
2. Inspect context: customer, channel, source system, SLA/CSAT metadata, tags, previous context if available.
3. Mark facts: issue type, outcome, evidence snippets, notable messages.
4. Complete the scorecard: criterion scores, pass/fail checks, N/A, required comments.
5. Record follow-up: root cause, risk level, coaching action, process/product/policy finding.

Layout:

- Left: queue and filters.
- Center: conversation timeline and metadata.
- Right: review panel with scorecard, findings, risk, and action controls.

The MVP avoids a heavy wizard. Mandatory fields are enforced by scorecard policy rather than by forcing every review through multiple screens.

## Data Model

Core entities:

- `Workspace`
- `User`
- `Role`
- `Integration`
- `Conversation`
- `Message`
- `Participant`
- `Scorecard`
- `ScorecardCriterion`
- `Review`
- `CriterionScore`
- `Finding`
- `CoachingAction`
- `AuditLog`

Integration fields:

- `external_source`
- `external_id`
- `external_url`
- `sync_cursor`
- `raw_payload_ref`
- `last_synced_at`

Review fields:

- `review_source`
- `reviewer_id`
- `scorecard_id`
- `rubric_version`
- `status`
- `total_score`
- `confidence`
- `evidence_refs`
- `finalized_at`

Finding fields:

- `root_cause`
- `risk_level`
- `owner_type`
- `category`
- `coaching_action_id`
- `source_message_refs`

## Integration Strategy

MVP integration options:

- CSV/JSON upload.
- Custom API ingest.
- One native SaaS connector, recommended: Zendesk.

Raised priority after MVP:

- Znuny / OTRS Community Edition 6.x / OTOBO as an OTRS-family connector.

The first connector wave should cover two different integration classes:

- Zendesk: representative SaaS helpdesk integration.
- Znuny/OTRS/OTOBO: representative self-hosted, legacy, and ITSM-style integration.

Next connector wave:

- Intercom
- Freshdesk
- HubSpot Service Hub
- Jira Service Management
- Zoho Desk
- Help Scout
- Front
- Gorgias

Enterprise and CCaaS wave:

- Salesforce Service Cloud
- ServiceNow CSM
- Dynamics 365 Customer Service
- Genesys
- NICE
- Five9
- Talkdesk

Automation and bridge integrations:

- Zapier
- Make
- n8n
- Generic inbound and outbound webhooks

## OTRS-Family Integration

The OTRS-family connector must be treated as a first-class self-hosted integration, not just a generic custom API.

Supported targets:

- Znuny current and LTS versions.
- OTOBO supported releases.
- OTRS Community Edition 6.x as legacy best-effort.

Important version notes:

- OTRS Community Edition 6.x is end-of-life and should be labeled as high-risk because security fixes are not available from the original manufacturer.
- Znuny is the preferred open-source continuation path for former OTRS Community Edition users.
- OTOBO is another OTRS fork and should be handled as a sibling connector with similar GenericInterface concepts.

Technical approach:

- Use GenericInterface REST/SOAP web services.
- Detect or guide configuration for `TicketSearch`, `TicketGet`, `TicketUpdate`, `TicketHistoryGet`, and article operations.
- Support `SessionID` and `UserLogin+Password`; support API key/token modes where the target system provides them.
- Provide a setup wizard for base URL, service name, auth mode, and route tests.
- Run diagnostics for `nph-genericinterface.pl`, operation availability, permissions, response shape, and ticket/article visibility.

Connector caveat:

Standard OTRS-family installations may not expose the exact web service routes needed by default. The app should provide importable YAML templates and clear diagnostics rather than assuming a uniform REST API.

## Custom API

Custom integrations are required for proprietary helpdesks and AI-agent platforms.

Inbound API:

- `POST /conversations`
- `POST /conversations/{id}/messages`
- `POST /reviews/import`
- `POST /events`

Outbound API:

- `GET /reviews`
- `GET /reviews/{id}`
- `GET /findings`
- `GET /coaching-actions`

Outbound webhooks:

- `review.completed`
- `finding.created`
- `coaching.assigned`
- `scorecard.updated`

Custom API design must support idempotency keys, external IDs, source URLs, raw payload references, and replay-safe event processing.

## Error Handling

Expected data issues:

- Duplicate conversations and webhook retries.
- Missing or hidden messages.
- Private notes and system messages mixed into timelines.
- Attachments without accessible URLs.
- Different timestamp formats and time zones.
- HTML, Markdown, and plain text bodies.
- Deleted users or reassigned agents.
- Source systems with incomplete or custom fields.

Handling rules:

- Normalize data into internal conversation/message models.
- Store raw payload references for debugging.
- Deduplicate by source, external ID, message ID, and event ID/hash.
- Process webhooks asynchronously and make handlers idempotent.
- Show import errors in an integration health view.
- Never block review UI on non-critical enrichment failure.

## Security

MVP controls:

- Workspace-level tenant isolation.
- Roles: admin, QA analyst, viewer.
- Encrypted integration credentials.
- Audit log for review creation, edit, finalization, export, and source write-back.
- PII masking/redaction options.
- Explicit permission gate before writing private notes, tags, or fields back to a source system.

Future enterprise controls:

- SSO via SAML/OIDC.
- SCIM provisioning.
- Fine-grained RBAC.
- Data retention policies.
- Data residency controls.
- DPA/SOC2-ready operational controls.

## Reporting

MVP reports:

- Quality score by agent/team/channel/source.
- Score breakdown by category.
- Findings by root cause.
- High-risk conversations.
- Coaching backlog.
- Review throughput by QA analyst.

Later reports:

- Calibration variance.
- Human vs AI quality parity.
- Handoff quality.
- Fix leverage ratio.
- Trends by product/process/policy issue.
- Source-system integration health.

## Testing

Test coverage should match the risk of the workflow and integrations.

MVP tests:

- Unit tests for score calculation, weights, pass/fail criteria, N/A handling, and review finalization.
- Unit tests for message normalization.
- Contract tests for custom API ingest and export.
- Fixture tests for Zendesk and Znuny/OTRS-family payloads.
- End-to-end test for the main review workflow.
- Seed dataset with 20-30 representative conversations.
- Visual regression for the Investigation Board.

Future tests:

- Connector-specific integration tests.
- Webhook retry/replay tests.
- Calibration workflow tests.
- AutoQA evaluation and human override tests.

## Roadmap

Phase 1: MVP QA core

- Conversation import via CSV/JSON and custom API.
- Manual review queue.
- Investigation Board.
- Scorecard builder with versioning.
- Findings and coaching actions.
- Basic reporting.
- Roles and audit log.

Phase 2: First native connectors

- Zendesk connector.
- Znuny/OTRS/OTOBO connector with GenericInterface setup wizard.
- Integration health dashboard.
- Optional write-back for private notes/tags/fields.

Phase 3: Integration expansion

- Intercom, Freshdesk, HubSpot, Jira Service Management, Zoho Desk.
- Generic webhook ingest.
- More robust source-specific field mapping.

Phase 4: Leadership and coaching

- Support lead dashboards.
- Agent feedback view.
- Coaching workflow.
- Calibration sessions.

Phase 5: AutoQA

- AI-assisted scoring.
- Auto-flagging.
- Human-in-the-loop review queues.
- AI-agent specific criteria: grounding, tool use, handoff, hallucination risk.

Phase 6: Enterprise

- SSO, SCIM, advanced RBAC.
- Data retention and residency.
- Salesforce, ServiceNow, Dynamics, CCaaS integrations.
- Compliance-ready audit and export controls.

## Implementation Defaults

- First native SaaS connector: Zendesk.
- First self-hosted connector family: Znuny / OTRS Community Edition 6.x / OTOBO.
- Voice support is deferred until after digital workflows and integrations are stable.
- AutoQA is deferred until manual scoring and calibration data exist.

## Sources

- Zendesk QA scorecard: https://www.zendesk.com/blog/quality-assurance/workforce-optimization/qa-scorecard/
- Intercom QA across AI and human conversations: https://www.intercom.com/learning-center/qa-system-ai-human-conversations
- MaestroQA feature set: https://www.maestroqa.com/features
- HubSpot Conversations API: https://developers.hubspot.com/docs/guides/api/conversations/inbox-and-messages
- Atlassian Jira Service Management webhooks: https://developer.atlassian.com/cloud/jira/service-desk/webhooks/
- ServiceNow Case API: https://www.servicenow.com/docs/r/api-reference/rest-apis/case-api.html
- Zoho Desk API: https://desk.zoho.com/DeskAPIDocument
- Znuny: https://www.znuny.org/en
- OTRS Community Edition GenericInterface: https://otrscommunityedition.com/doc/manual/admin/6.0/en/html/genericinterface.html
- OTRS Community Edition 6.0.35 release: https://otrscommunityedition.com/news/2022-05-27/otrs-community-edition-version-6-0-35-released/
- OTOBO REST API guide: https://otobo-docs.softoft.de/en/administration/automation/rest-api/
- OTOBO lifecycle: https://endoflife.date/otobo
- OTRS Community Edition EOL note: https://otrs.com/otrs-software-solutions/otrs/otrs-community-edition/
