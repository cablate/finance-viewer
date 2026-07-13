# Financial Data Foundation: Phase 1 Operator Guide

Read this reference for account inventory, institution aliases, source evidence,
scope attestations, and source expectations. Phase 1 establishes identity and
evidence only. Structured statement ingestion, balances, credit-card schedules,
loans, investments, readiness APIs, and analysis datasets are not available yet.
Do not simulate them with generic JSON or direct DB writes.

## Bootstrap

1. `GET /api/health`; stop on non-200 or `ok != true`.
2. `GET /api/finance/capabilities`; use its enums/schema IDs as authority.
3. Read `entities`, `institutions`, `accounts`, `sources`,
   `scope-attestations`, and `source-expectations` relevant to the task.
4. Separate known facts, identity conflicts, missing scope, and unsupported
   contexts before proposing writes.

Every API error is shaped as:

```json
{"error":{"code":"VERSION_CONFLICT","message":"...","retryable":true}}
```

Never retry `IDENTITY_CONFLICT`, `HUMAN_CONFIRMATION_REQUIRED`, or
`UNSUPPORTED_CONTEXT` by changing facts silently.

## Typed Identity Writes

Create an account:

```json
POST /api/finance/accounts
{
  "display_name": "Everyday checking",
  "entity_key": "personal",
  "institution_key": "<stable key from institutions>",
  "account_kind": "bank",
  "currency": "TWD",
  "authority": "ai_inferred",
  "review_state": "needs_review"
}
```

AI-inferred account kind always remains `needs_review`. Two accounts may share
`display_name`; their stable keys and source aliases distinguish them. Never
merge based on display name. Add source identity through:

```json
POST /api/finance/accounts/:accountKey/aliases
{
  "source_system": "statement-parser-name",
  "alias_type": "source_account_id",
  "alias_value": "masked-or-provider-id",
  "authority": "institution_export",
  "review_state": "needs_review"
}
```

An alias already bound elsewhere returns `IDENTITY_CONFLICT`; stop for human
resolution. PATCH entity/institution/account/source/expectation with the entire
typed v1 body plus `expected_version`. On `VERSION_CONFLICT`, re-read the
resource and rebuild the proposal; never last-write-wins.

## Source Evidence

`POST /api/finance/sources` records metadata/fingerprint, not the statement
blob. Use a capabilities-supported `source_kind`, authority, period/as-of,
optional SHA-256, institution/account keys, and artifact status. Keep the real
file in ignored local paths. Do not send it to an arbitrary service or include
private rows in logs.

`official` means an institution statement/contract, not "AI found a web page".
Web evidence is `ai_researched` and must include an as-of/source note when the
later typed context supports it.

## Scope And Completeness

The existence of accounts or rows never proves all resources are known.
Attestations use these initial scope kinds:

- `cash_accounts`
- `credit_cards`
- `liabilities`
- `investments`
- `valued_items`

AI may create `unknown` or `declared_partial`. To propose
`declared_complete`, prepare the exact scope payload, then:

```json
POST /api/finance/human-confirmations
{
  "action_kind": "declare_scope_complete",
  "resource_type": "scope_attestation",
  "payload": {
    "entity_key": "personal",
    "scope_kind": "cash_accounts",
    "as_of_date": "2026-07-14",
    "coverage_state": "declared_complete",
    "authority": "user_confirmed",
    "included_note": "Human-readable inventory boundary"
  }
}
```

Report the proposal key and ask the user to inspect `/confirmations`. Stop.
Do not call browser-session/confirm routes or ask for the receipt. Confirmation
is payload-bound, expires after ten minutes, is one-time, and executes through
the browser flow. A new relevant account invalidates the earlier attestation.

Source expectations describe what data should recur and which analysis goals
it affects. AI-inferred expectations are hints. Only user-confirmed expectations
may later make a missing period a hard blocker.

## Backup Boundary

Backup/restore has no HTTP or AI route. A human local operator can use explicit
paths while the service is appropriately stopped:

```text
node scripts/finance-backup.mjs --db <explicit-db> --output <ignored-dir> [--include-sources]
node scripts/finance-restore.mjs --input <manifest> --target <new-db-path>
```

Restore never overwrites an existing target. DB-only backup explicitly omits
source artifacts. Bundles are sensitive and not encrypted by Last Say.

## Phase 1 Stop Conditions

- No account/source identity: create or resolve typed identity first.
- Alias collision: stop at `IDENTITY_CONFLICT`.
- Complete-scope proposal: hand off to `/confirmations`.
- Need balances, structured statement import, loan/card/investment facts,
  readiness, or analysis context: report that Phase 1 does not expose it yet.
- Options, futures, margin, DeFi, tax lots, or business consolidation: report
  `unsupported`; never store as `other` to claim complete support.
