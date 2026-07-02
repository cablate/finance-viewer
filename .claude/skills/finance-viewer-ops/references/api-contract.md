# API Contract

Default server: `http://localhost:3127`, unless the active dev server uses another port.

All API responses should be JSON. Errors should use an `{ "error": "..." }` envelope.

## Core Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Check server and DB. Returns `{ok, transactions, corrections}`. |
| GET | `/api/meta` | Read categories, source metadata, and review counts. |
| GET | `/api/transactions?month=&scope=&category=&search=&sort=&limit=&offset=&view=` | List transactions. |
| GET | `/api/transactions/:id` | Read one transaction. |
| PATCH | `/api/transactions/:id` | Correct one transaction. Only editable fields are allowed. |
| POST | `/api/transactions/batch` | Batch corrections. Body `{corrections:[{id, ...fields}]}`, max 500. |
| POST | `/api/transactions/review` | Mark transactions reviewed. |
| GET | `/api/corrections?field=&matchKey=&limit=` | Read correction history and summary. |
| POST | `/api/import-ledger` | Import ledger CSV. Body `{csvPath, sourcePath}` or `{csvContent, sourcePath}`. |
| GET | `/api/rules?enabled=&maxConfidence=&origin=&q=` | List classification rules. |
| POST | `/api/rules` | Create a classification rule. |
| GET | `/api/rules/:id` | Read one rule. |
| PATCH | `/api/rules/:id` | Update a rule. |
| DELETE | `/api/rules/:id` | Delete a rule when safe. |
| GET | `/api/rules/normalize?text=` | Normalize raw merchant text into a rule `match_key`. |
| GET | `/api/summary?month=&scope=&view=` | Aggregate summary. |
| GET | `/api/breakdown?dimension=&month=` | Breakdown aggregates. |
| GET | `/api/trend?scope=` | Trend aggregates. |

## Editable Transaction Fields

Only these are operator-editable:

- `category_primary`
- `memo`

Do not change transaction date, amount, merchant name, source, or balance through correction APIs.

Successful transaction correction sets `classification_source = human` and writes `correction_log`.

## Rule Model

Rule condition fields:

- `match_key`
- `source_type`
- `direction`: `in` or `out`

Rule output:

- `category_value`

Rule metadata:

- `confidence`: 0 to 1
- `sample_count`
- `origin`: `ai_analysis`, `human_correction`, or `bootstrap`
- `enabled`
- `note`
- `applied_count`
- `overridden_count`

Create rules only when condition fields and output are present.

## Transaction Classification Fields

- `classification_source`: `rule`, `ai`, `human`, or `pending`
- `rule_id`: the rule used, if any
- `ai_confidence`: 0 to 1
- `judgment_reason`: human-readable reason for AI classification

## Import Contract

Allowed import locations:

- `outputs/`
- `uploads/`
- `data/`

Do not commit files in these directories.

After import, inspect:

- imported row count
- skipped or duplicate count
- `stats.rules_applied`
- errors

## DB Aggregate QA Queries

Use aggregate checks without printing details:

```sql
select statement_month, count(*) from transactions group by statement_month order by statement_month;
select classification_source, count(*) from transactions group by classification_source;
select count(*) from transactions where judgment_reason is null or trim(judgment_reason) = '';
select count(distinct judgment_reason) from transactions;
select count(*) from classification_rules where note is null or trim(note) = '';
select count(*) from classification_rules where confidence < 0.6;
select sum(applied_count) from classification_rules;
select count(*) from correction_log;
```
