# AGENTS.md — 給 AI 編程助手（Codex / Claude Code）的操作指引

> Finance Viewer 是**使用者本機架設的財務資料伺服器**（SQLite + REST API + Web UI）。
> **這個工具本身不做 AI。** 你（AI agent）在外部，透過本檔與下列 API 操作資料、做分析。

## 你的角色

1. 使用者請你分析原始銀行帳單 → 你產出**含 AI 初分值**的 CSV ledger
2. 你（或使用者）打 `POST /api/import-ledger` 匯入 CSV
3. 使用者在 Web UI（http://localhost:3127）逐筆**人工終審**
4. 你可打 `/api/*` 做後續：查審查佇列、批次修正、讀 correction_log 產出分類規則分析、做月度報告

## server 在哪

使用者已架設：`http://localhost:3127`（同源 `/api/*`）。先 `GET /api/health` 確認連線。

## API（本機同源，JSON，統一錯誤 `{error}` envelope）

| Method | Route | 用途 |
|---|---|---|
| GET | `/api/health` | 確認 server + DB（回 `{ok, transactions, corrections}`） |
| GET | `/api/meta` | 月份 / 分類 / 歸屬 / 必要性 等篩選選項 |
| GET | `/api/summary?month=&scope=&view=` | 月度摘要（各類支出、淨現金流、儲蓄率） |
| GET | `/api/transactions?month=&scope=&category=&search=&sort=&limit=&offset=` | 交易列表（limit 上限 2000） |
| GET | `/api/transactions/:id` | 單筆明細 |
| PATCH | `/api/transactions/:id` | 單筆修正（body 見下方白名單） |
| POST | `/api/transactions/batch` | 批次修正（body `{corrections:[{id, ...fields}]}`，上限 500） |
| GET | `/api/review-queue?limit=` | 待確認 / 未審 計數 + 樣本 |
| GET | `/api/corrections?field=&limit=` | 修正歷史明細 + summary（你的「學習資產」原料） |
| GET | `/api/spending?month=&category=&scope=` | 消費統計 |
| GET | `/api/breakdown?dimension=&month=&scope=` | 分類 / 歸屬 / 必要性 維度分布 |
| GET | `/api/trend?scope=` | 月趨勢 |
| GET | `/api/balance-history` | 歷月帳戶餘額 |
| POST | `/api/import-ledger` | 匯入 CSV（body `{csvPath\|csvContent, sourcePath}`；csvPath 限 `uploads/`、`data/`、`outputs/` 子目錄） |

## 可編輯欄位白名單（PATCH / batch）

只有這四個欄位可改，**金額 / 日期 / 來源完全不可改**：

- `owner_primary`：個人 / 事業 / 事業候選 / 移轉不算 / 待確認
- `category_primary`：任意（從 `/api/meta` 取已用分類）
- `necessity`：必要 / 事業必要 / 可節省 / 可優化 / 需確認 / 不列入
- `memo`：任意文字

## 資料模型重點

- `transactions.amount / inflow / outflow / balance` 是 **cents（元 ×100）**。顯示時除 100。
- `correction_log` 是 **append-only**（trigger 阻擋 UPDATE/DELETE）—— 你只能讀，不能改歷史。
- `dedupe_key`：信用卡家族 = `hash(sourceType, date, name, amount)`；重匯不覆蓋人工已改的 owner/category/necessity。

## 不變量（務必遵守）

1. **金額欄位不可改**（API 無此路徑）
2. **只改白名單四欄**
3. **不雙向同步**：匯入不覆蓋人工修正
4. **correction_log 只讀**

## 典型任務食譜

### 1. 匯入新月分帳單
你分析原始 CSV → 產出含初分的 ledger CSV → `POST /api/import-ledger {csvPath: "uploads/..."}`

### 2. 批次改分類
```
GET /api/transactions?category=待確認&month=2026-06
→ 整理成 corrections: [{id:1, owner_primary:"事業"}, {id:2, owner_primary:"事業"}, ...]
POST /api/transactions/batch {corrections: [...]}
```

### 3. 產出分類規則分析（給人決策）
```
GET /api/corrections?limit=1000
→ 分析重複的 (field, old_value → new_value) 模式
→ 整理成「建議規則清單」給使用者審核
```
（目前不自動套用下次匯入，僅產出建議）

### 4. 月度分析報告
```
GET /api/summary?month=2026-06
GET /api/breakdown?dimension=category&month=2026-06
GET /api/trend
→ 整理成自然語言月報
```

## 重要：你看到的是真實財務資料

`data/finance.sqlite` 是使用者的真實帳單。**不要**把內容寫進任何會外送的檔案、commit、或公開 log。分析結果輸出給使用者本人即可。
