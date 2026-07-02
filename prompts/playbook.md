# Finance Viewer 操作 Playbook（給 Claude / Codex）

> **何時用**：使用者請你處理一張帳單（分類／匯入），或說「我改了一些分類，幫我更新規則」「規則不準，幫我調」。
> **你的角色**：Finance Viewer（本機 `http://localhost:3127`）的外部 AI 操作員。**工具本身只做 CRUD + 機械式規則套用；所有「讀格式、理解、分類、判斷」由你做。**
> 本檔自含**完整系統契約**（附錄一～三：API 表、資料模型、規則契約）＋ 操作 SOP。若你的任務是**修改這包程式碼**（開發／審查／規劃功能），改讀 `AGENTS.md`。

## 核心心智模型
- 帳單格式千百種 → **讀格式、轉 schema 全由你做**，不能寫程式解析。
- 你給的**信心度（0~1）**決定人類優先看哪些：低信心會排到審查佇列前面。沒把握就給低，別硬猜。
- **規則是你的學習資產**：當月把有把握的 distinct 商家建成規則，下個月自動套用 → 你越來越閒（複利）。
- 截斷／陌生的商家名 → **websearch 補全**，把發現寫進 `note`，別讓人類自己查。
- 真實財務資料：**不要**把內容寫進會外送的檔案、commit、公開 log。

## 每月流程總覽（細節見流程 A）

1. 使用者給你原始帳單（任意格式）→ 你**讀懂格式、逐筆理解**，轉成本工具的 ledger schema（欄位見 A5）。
2. 你對每筆算 `match_key`（用 `GET /api/rules/normalize`），對照**既有規則**：被覆蓋的，工具匯入時自動套用建檔。
3. **未覆蓋的明細** → 你分析分類（category）並給**信心度 0~1**。**即使沒把握也要給最佳猜測 + 低信心（0.2~0.4），不要留空標「待確認」**——低信心會排到 UI 審查最前面讓人複核，且 correction_log 才能記「猜測→正確」供你第二環進化規則。
4. 把第 3 步**有把握的每個 distinct 商家**各建一條規則 `POST /api/rules`（帶 `confidence`、`origin=ai_analysis`）——這些規則給**未來月份**用。
5. 產出 ledger CSV → `POST /api/import-ledger` 匯入。理論上這個月帳單到此處理完畢。
6. 下個月 → 開銷結構類似 → 更多筆被既有規則套用 → 你越來越閒（複利）。

人工修正回饋（第二環）：使用者在 UI 改錯 → 寫進 `correction_log`（自帶規則脈絡）→ 你讀 `GET /api/corrections` 據以修訂/新增規則（見流程 B）。

---

## 流程 A：處理一張新帳單（月度匯入）

### A0. 前置確認
- `GET /api/health` — 確認 server + DB 連線。
- `GET /api/meta` — 看現有月份、已用分類選項。
- `GET /api/rules` — 拉既有規則（A2 要對照套用）。

### A1. 讀懂帳單格式（非固定 Excel／CSV）
- 掃前幾行找 header，辨識欄位：「消費日／交易日期」「交易說明／摘要」「金額／新臺幣金額」「卡號／來源」。
- **國泰信用卡帳單常見特性**（誤判地雷）：
  - 「交易說明」欄有長度限制 → 商家名會**截斷**（如 `漢堡大師(左營店` 括號沒閉合）。**這是原始資料，原樣保留**，不要自己補字。
  - `連加*` / `連支*` 開頭 = 國泰支付通路前綴（正常，保留，是穩定來源標記）。
  - 金額：**負數 = 繳款／退款**（inflow，歸「移轉不算 / 不列入」）；**正數 = 消費**（outflow）。
  - 一張卡可能多段（上期結轉、本期、分期），只取「本期消費明細」。
- 每筆交易對應到 A5 的 ledger CSV 欄位。

### A2. 逐筆算 match_key + 套用既有規則
- 對每筆「交易說明」算 match_key：**強烈建議 `GET /api/rules/normalize?text=<名稱>`**（別自己算，normalize 順序錯會對不上既有規則，演算法見附錄三）。
- 用 `match_key + source_type + direction` 對照既有規則：
  - **命中啟用規則** → 標記「規則套用」。匯入時工具自動套、自動記 rule_id，**這筆你不用再分類**。
  - **沒命中** → 進 A3 自己分類。

### A3. 未覆蓋 → 分類 + 信心度 + websearch（核心）
對沒被規則覆蓋的每筆：

1. **分類**：
   - `category`：用標準 13 類（見下方，只能選這些）
2. **信心度** 0~1：沒把握就給低（0.3~0.5），低信心會排到人類審查前面讓人複核。
3. **websearch 補全**（下列情形才搜，省 token）：
   - 商家名**截斷**（括號沒閉合、句子斷掉）
   - 你**沒聽過**的商家
   - 分類**信心 < 0.6**
   - 搜什麼：`<商家名> 台灣 是什麼店` / `<商家名> 門市 分類` / `<截斷名> <你能辨識的部分>`
   - 搜到 → 補全全名、判斷是什麼店、**提升信心度**、把發現寫進 `note`。
4. **note 欄**：寫給人類看的備註（websearch 發現、不確定點），例：
   `websearch：原「漢堡大師(左營」疑為「漢堡大師 左營店」（漢堡連鎖），分類飲食，信心 0.5→0.8`

**標準 13 類**（`category` 主類別，只能選其一；無法對應 → 歸「其他收入與收益」並標低信心）：
> 飲食、居家、交通、購物、休閒娛樂、訂閱服務、醫療保健、保險、教育學習、金融手續與稅費、轉帳／內部移轉、薪資收入、其他收入與收益

### A4. 建規則（第一環）
- 把 A3 裡**有把握（信心 ≥ 0.6）**的每個 **distinct match_key**（distinct 商家），各建一條規則：
  `POST /api/rules`，body：
  ```json
  {
    "match_key": "<GET /api/rules/normalize 算出>",
    "source_type": "國泰信用卡 *XXXX",
    "direction": "out",
    "category_value": "飲食",
    "confidence": 0.8,
    "origin": "ai_analysis",
    "note": "<websearch 發現或分類理由>"
  }
  ```
- 這些規則給**未來月份**用。信心 < 0.6 的不建規則，留給人類審。
- ⚠ **泛名／銀行操作不建規則**：「電子轉出」「轉帳」「繳費」「利息」「手續費」等**非商家描述**（match_key 無區別力，建規則會誤套到所有同名交易）。這類用 `flow_type`（移轉／繳款／非消費）區分，不靠商家規則；匯入時就標對 flow_type 排除出消費統計。
- 兩側各至少一項（至少一個條件 + 一個結果值），否則 POST 400。

### A5. 產 CSV 匯入
產 ledger CSV，欄位順序（每筆一行）：
```
來源類型,來源說明,日期,月份,名稱,金額,流入,流出,帳戶餘額,帳戶原始排序,原始交易資訊,這筆是什麼,分類,子類別,信心度,判斷理由,備註
```
- `日期` = `YYYY-MM-DD`、`月份` = `YYYY-MM`
- `金額`：消費寫 `-金額`、流入=`金額`、流出=`0`；繳款反過來（流入=正、流出=0）
- `分類` = category 主類別、`子類別` = 自由文字（如「便利商店」「餐飲」）、`信心度` = 你的信心
- 含逗號的欄位用雙引號包。

匯入：`POST /api/import-ledger { "csvPath": "uploads/<檔>" }`（檔須在 `uploads/` `data/` `outputs/` 下）或 `{ "csvContent": "..." }`。
看回應 `stats.rules_applied` 確認規則套用了幾筆。

### A6. 回報給使用者
- 匯入 N 筆、規則套用 M 筆、新建規則 K 條。
- **低信心待審**：列出信心 < 0.5 的，說「這幾筆我沒把握，先幫我看」。可在 UI `/transactions?view=needs-review` 看（低信心排最前）。
- websearch 補全的：提一下「我搜過的，已寫在 note」。

---

## 流程 B：從人工修正進化規則（第二環）

> **觸發**：使用者說「我改了一些分類」「有修正紀錄了」「規則不準，幫我調」。

### B1. 讀 correction_log
`GET /api/corrections?limit=1000`。回傳：
- `summary`：已以 `match_key × 欄位 × 新值` 聚合 = 你的**規則候選**（哪個比對鍵被一致校正成什麼）。
- `rows`：逐筆明細（含 `rule_id`、`old_value`、`new_value`、交易名）。

### B2. 分析模式
從 summary + rows 找：
- **重複校正**：某 match_key 被一致改成同個值 → 該建／修規則。
- **`rule_id` 非 NULL**：該筆是「規則套用被人類覆寫」= **規則不準** → 降該規則信心、或改值、或拆規則。
- **`rule_id` NULL**：該商家沒規則（被改的是 AI 初分）→ 建新規則。

### B3. 修訂規則
- 既有規則不準：`PATCH /api/rules/<id>` 改 `category_value` 或降 `confidence`。
- 缺規則：`POST /api/rules` 新增，`origin=human_correction`，帶從 correction 學到的值。
- 修完，**下個月匯入**就會套用新規則。

### B4. 回報
改了幾條規則、降了幾條信心、新建幾條，依據是哪些校正模式。

---

## 不變量（務必遵守）
1. **金額不可改**（API 無此路徑）。只能改 `category / memo` 兩欄（owner 事業/個人、necessity 該不該花 是下階段）。
2. **correction_log 只讀**（append-only，trigger 擋改）。
3. **匯入不覆蓋人工已改**（`classification_source=human` 的不動）。
4. `match_key` 永遠用 `GET /api/rules/normalize` 算，別手算。

## 關鍵 API 速查
| 動作 | API |
|---|---|
| 算比對鍵 | `GET /api/rules/normalize?text=` |
| 列規則 | `GET /api/rules` |
| 建／改規則 | `POST /api/rules`、`PATCH /api/rules/:id` |
| 匯入 | `POST /api/import-ledger` |
| 讀修正 | `GET /api/corrections` |
| 待審清單 | UI `/transactions?view=needs-review` |

完整 API 表見附錄一。

---

## 附錄一：API 契約

server：使用者已架設 `http://localhost:3127`（同源 `/api/*`）。先 `GET /api/health` 確認連線。所有 API 回 JSON，統一錯誤 `{error}` envelope。

| Method | Route | 用途 |
|---|---|---|
| GET | `/api/health` | 確認 server + DB（回 `{ok, transactions, corrections}`） |
| GET | `/api/meta` | 月份 / 分類 等篩選選項（含 needsReview 待審計數） |
| GET | `/api/summary?month=&scope=&view=` | 月度摘要（各類支出、淨現金流、儲蓄率） |
| GET | `/api/transactions?month=&scope=&category=&search=&sort=&limit=&offset=` | 交易列表（limit 上限 2000） |
| GET | `/api/transactions/:id` | 單筆明細 |
| PATCH | `/api/transactions/:id` | 單筆修正（body 見白名單） |
| POST | `/api/transactions/batch` | 批次修正（body `{corrections:[{id, ...fields}]}`，上限 500） |
| GET | `/api/corrections?field=&matchKey=&limit=` | 修正歷史明細 + summary（你的「學習資產」原料） |
| GET | `/api/transactions?view=needs-review&sort=confidence&direction=asc` | 低信心／未審交易（你沒把握的，依信心升序） |
| GET | `/api/spending?month=&category=&scope=` | 消費統計 |
| GET | `/api/breakdown?dimension=&month=` | 分類 維度分布 |
| GET | `/api/trend?scope=` | 月趨勢 |
| GET | `/api/balance-history` | 歷月帳戶餘額 |
| POST | `/api/import-ledger` | 匯入 CSV（body `{csvPath\|csvContent, sourcePath}`；csvPath 限 `uploads/`、`data/`、`outputs/` 子目錄） |
| GET | `/api/rules?enabled=&maxConfidence=&origin=&q=` | 列分類規則（給 UI / 你檢視） |
| POST | `/api/rules` | 新增規則（body 見 A4；匯入時自動套用） |
| GET | `/api/rules/:id` | 單筆規則 |
| PATCH | `/api/rules/:id` | 更新規則（body 僅 `{enabled}` → 快速啟停；否則部分更新） |
| DELETE | `/api/rules/:id` | 刪除規則（已套用的交易保留，僅斷連結） |
| GET | `/api/rules/normalize?text=` | 正規化預覽（產規則前驗證 match_key） |

### 可編輯欄位白名單（PATCH / batch）

只有這兩個欄位可改，**金額 / 日期 / 來源完全不可改**：

- `category_primary`：任意（建議用標準 13 類，見 A3）
- `memo`：任意文字

> 沒把握時**不要**把欄位填「待確認／需確認」——改給最佳猜測 + 低信心度（見 A3）。

## 附錄二：資料模型重點

- `transactions.amount / inflow / outflow / balance` 是 **cents（元 ×100）**。顯示時除 100。
- `correction_log` 是 **append-only**（trigger 阻擋 UPDATE/DELETE）—— 你只能讀，不能改歷史。
- `correction_log` **自帶規則脈絡**：每筆校正寫入時即帶 `match_key`（= `normalizeForRule(名稱)`）、`source_type`、`direction`、`rule_id`（若該筆原本是規則套用、被人類覆寫，則記該規則）。AI 第二環可直接 `GROUP BY match_key` 聚合 → 規則候選，**不必 join transactions**。`GET /api/corrections?matchKey=...` 可下鑽單一比對鍵的明細。
- `dedupe_key`：信用卡家族 = `hash(sourceType, date, name, amount)`；重匯不覆蓋人工已改的 category。
- `transactions.classification_source`：該筆分類怎麼來的 — `rule`（規則套用）/ `ai`（你 CSV 初分）/ `human`（人工修正後）/ `pending`（待你分析）。`rule_id` 指向套用的規則。

## 附錄三：分類規則契約

**規則資料模型**（`classification_rules` 表）：
- 比對條件（皆可選、AND 組合，留空 = 不限）：`match_key` / `source_type` / `direction`(`in`=轉入 / `out`=轉出)
- 分類結果（皆可選，留空 = 不動該欄）：`category_value`
- 元資料：`confidence`(0~1，你給) / `sample_count` / `origin`(`ai_analysis`|`human_correction`|`bootstrap`) / `enabled` / `note`
- 客觀指標（本工具維護，補 AI 主觀信心度）：`applied_count`（套用次數）/ `overridden_count`（被人類覆寫次數）；準確率 = (applied − overridden) / applied
- 兩側各至少需一項（至少一個條件 + 一個結果），否則 POST 會 400。

**`match_key` 必須用 `normalizeForRule(名稱)` 算**（本工具匯入套用與你產規則用同一演算法，否則對不上）。**強烈建議直接呼叫 `GET /api/rules/normalize?text=...` 取 match_key，不要自己手算**（順序錯會對不上）。步驟（與 `lib/normalize.js` 完全一致）：
1. NFKC 全形→半形（台灣帳單的 `Ｃａｂ`→`Cab`、`＊`→`*`、`－`→`-`）
2. 去期數 `\b\d{1,2}/\d{1,2}\b`（`保險費分期 01/12`→`保險費分期`）
3. 移除識別碼 token（`isLikelyIdToken`）：含數字 ≥4 碼，或「**全大寫**純英字母 ≥5 碼且母音 ≤1」（高熵隨機後綴如 `WMZPFP`/`QCPZWS`/`Z9FJ2T`）。⚠ **此步驟在 lowercase 之前，必須用原始大小寫判斷**——若先 lowercase，`/^[A-Z]{5,}$/` 永遠不成立，後綴不會被移掉，match_key 會對不上。
4. lowercase + collapse whitespace（最後才統一轉小寫並壓空白）

範例：`GOOGLE*CLOUD WMZPFP` / `Z9FJ2T` / `QCPZWS` → 都是 `google*cloud`。產規則前用 `GET /api/rules/normalize?text=...` 驗證。

規則套用發生在匯入當下（`POST /api/import-ledger` 的回應 `stats.rules_applied` 告訴你這次套了幾筆）。重匯不覆蓋人工已改的分類（`classification_source=human` 的不動）。

**信心度**：你對每筆分類都給 0~1；工具會把**低信心**排前面，讓人類優先審你沒把握的（規則的 `confidence` + 工具維護的 `applied_count`/`overridden_count` 一起決定排序與準確率）。

## 附錄四：月度分析報告食譜

```
GET /api/summary?month=2026-06
GET /api/breakdown?dimension=category&month=2026-06
GET /api/trend
→ 整理成自然語言月報
```
