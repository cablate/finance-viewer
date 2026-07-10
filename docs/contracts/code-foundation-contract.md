---
schema_version: behavior-contract/v1
id: infrastructure.code-foundation
title: 程式品質、資料庫遷移與維運基礎
status: active
owner_surface: infrastructure
change_context:
  type: refactor
  reason: 開源使用者需要可重現的品質閘門、可回復的 schema 升級，以及穩定的健康檢查契約。
  non_goals:
    - 不改交易、分類、規則與報表的業務語意。
    - 不拆分 TransactionTable、Overview 或其他大型 UI 元件。
    - 不改 localhost port、真實資料庫路徑或外部 AI 操作流程。
---

# 程式基礎建設契約

## Behavior Boundary

本契約涵蓋靜態檢查、production 依賴稽核、release 驗證、SQLite schema 初始化／升級，以及 `/api/health`。任何失敗必須明確中止，不得留下半套 schema 或把內部錯誤以 HTML/stack trace 回給 API 呼叫者。

## Consumers And Entrypoints

- `npm run lint`
- `npm run audit:prod`
- `npm run verify:release`
- GitHub Actions CI 與 Dependabot
- `lib/db.js` 的 `openDatabase`、`initializeDatabase`、`migrateSchema`、`getDb`
- `GET /api/health`
- SQLite `PRAGMA user_version`

## Inputs And State

- Node.js 22.5 以上。
- 開發、測試與 build 必須透過 `FINANCE_DB_PATH` 使用隔離 SQLite。
- 新 DB 的 `user_version` 為 0；本程式可升級版本小於等於目前 `SCHEMA_VERSION` 的 DB。
- 若 DB 的 `user_version` 高於程式支援版本，必須拒絕啟動，避免舊程式誤寫新版資料。

## Outputs And Side Effects

- lint 必須是非互動、可在 CI 重現的 ESLint CLI，warning 也視為失敗。
- production dependency audit 遇到 moderate 以上漏洞時失敗。
- schema 建立與所有相容性 migration 在同一 SQLite transaction 完成；任一步失敗要完整 rollback。
- 成功初始化後寫入目前 `SCHEMA_VERSION`。
- DB 初始化失敗時不得留下未關閉的 singleton 連線。
- health 成功回 `{ ok, transactions, corrections, schema_version }`；失敗回 JSON `{ ok: false, error }` 與 HTTP 503。

## UI States

本變更沒有新增 UI。既有頁面的載入、空狀態、錯誤狀態與操作流程不得改變。

## Invariants

- `data/finance.sqlite` 不得用於開發、測試、build 或 release 驗證。
- `correction_log` 與 `rule_change_log` 保持 append-only。
- migration 不改交易金額、日期、來源或人工判斷。
- 新增品質工具不得進入 production runtime dependency。
- release verifier 必須繼續做測試、build、隱私掃描、demo 指標與證據圖檢查。
- release verifier 的 build 與 runtime smoke 必須使用 `.next-verify`，不得改寫正式服務的 `.next`。
- runtime smoke 只能建立／刪除固定的 `data/dev-verify-runtime.sqlite*`；呼叫端提供其他 DB 路徑時必須在任何檔案操作前失敗。

## Acceptance Examples

1. Given 一個缺少新欄位的舊 DB，when migration 中途因 schema 衝突失敗，then 先前已執行的 ALTER 與建表全部 rollback。
2. Given DB 的 `user_version` 高於程式支援版本，when initializeDatabase 執行，then 它在寫入任何 schema 前失敗並回報版本不相容。
3. Given 一個正常的空 DB，when initializeDatabase 完成，then `PRAGMA user_version` 等於 `SCHEMA_VERSION` 且所有核心表可查詢。
4. Given CI checkout，when 執行 `npm run verify:release`，then lint、測試、build、production audit 與隱私檢查全數非互動完成。
5. Given DB 可讀，when 呼叫 `/api/health`，then 回應包含目前 schema version；DB 不可用時仍回 JSON 503。

## Test Mapping

- Unit: `test/database-foundation.test.js`
- Unit: `test/unit-a-migrate-schema.test.js`
- Static: `npm run lint`
- Supply chain: `npm run audit:prod`
- Release: `npm run verify:release`
- Remote: GitHub Actions `CI`

## Evidence

- 變更前 `npm run lint` 會進入互動式設定並失敗。
- 變更前 `npm audit --omit=dev` 回報 Next 內含的 PostCSS advisory。
- 變更前 `initializeDatabase` 的 schema 與 ALTER 沒有共同 transaction，且 DB 沒有版本守門。

## Intentional Changes

- 新增 `PRAGMA user_version` 作為 schema 相容性標記。
- health response 新增 `schema_version`；失敗狀態固定為 JSON 503。
- release 驗證新增 lint 與 production dependency audit。

## Open Questions

- 大型前端元件拆分與瀏覽器回歸測試留待獨立變更處理。
