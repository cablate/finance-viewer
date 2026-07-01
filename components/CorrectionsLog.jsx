"use client"

// CorrectionsLog — 修正紀錄（被動 log，AI 進化規則的原料）。
// 對應 endpoint GET /api/corrections，回傳 { rows, summary, total }。
// 顯示以「交易」為主體：同一筆交易可能被改多個欄位（多筆 correction），分組成一张卡片，
// 顯示商家／日期／金額 + 該筆所有變更（欄位 舊→新）。
// 左側 Summary 是以 match_key 聚合的「規則候選」（AI 第二環原料），點擊下鑽該比對鍵明細。

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { History, AlertTriangle, RefreshCw, X } from "lucide-react"
import { useCorrections } from "@/lib/hooks"
import { EDITABLE_LABELS as FIELD_LABEL } from "@/lib/constants"
import { formatDate, formatTWD } from "@/lib/format"
import ErrorBoundary from "@/components/ErrorBoundary"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function fieldLabel(name) {
  return FIELD_LABEL[name] || name
}

const PAGE_SIZE = 10

// 簡單分頁範圍：≤7 頁全顯示；超過用 ellipsis 折疊
function pageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push(null)
    out.push(sorted[i])
  }
  return out
}

function displayValue(v) {
  if (v === null || v === undefined || v === "") return "（空）"
  const s = String(v)
  // 防呆：值含 U+FFFD（替換字元，通常是 curl/PowerShell CP950 雙重編碼殘留）時，
  // 顯示占位而非把亂碼噴進表格。寫入路徑（fetch+request.json）不會腐蝕 UTF-8，
  // 僅防手動 curl/PowerShell 呼叫造成的髒資料。
  if (s.includes("�")) return "（編碼異常）"
  return s
}

// 規則候選摘要：以 match_key + 欄位 + 新值聚合（哪個比對鍵被一致校正成什麼）。
// 點列下鑽該比對鍵的明細（URL ?key= → getCorrections matchKey 過濾）。等同 AI 第二環的規則候選清單。
function SummaryTable({ rows, activeKey, onPick }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>比對鍵</TableHead>
          <TableHead>欄位</TableHead>
          <TableHead>校正為</TableHead>
          <TableHead className="text-right">次數</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const k = `${row.match_key}|${row.field_name}|${row.new_value}|${i}`
          const isActive = activeKey && activeKey === row.match_key
          return (
            <TableRow
              key={k}
              data-active={isActive}
              className={isActive ? "bg-muted/50" : "cursor-pointer hover:bg-muted/40"}
              onClick={() => onPick && onPick(row.match_key)}
              tabIndex={onPick ? 0 : undefined}
              role={onPick ? "button" : undefined}
              aria-pressed={onPick ? isActive : undefined}
              aria-label={onPick ? `下鑽比對鍵 ${row.match_key}` : undefined}
              onKeyDown={
                onPick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onPick(row.match_key)
                      }
                    }
                  : undefined
              }
            >
              <TableCell className="font-medium">{displayValue(row.match_key)}</TableCell>
              <TableCell className="text-muted-foreground">
                {fieldLabel(row.field_name)}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-normal">
                  {displayValue(row.new_value)}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// 交易為主體的明細：每張卡 = 一筆被修正過的交易，列出它所有的欄位變更。
function TransactionGroup({ group }) {
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 truncate font-medium" title={group.name}>
          {group.name}
        </span>
        <span className="tabular-nums text-sm text-muted-foreground">
          {Number(group.outflow) > 0
            ? `-${formatTWD(group.outflow)}`
            : Number(group.amount) !== 0
              ? formatTWD(group.amount)
              : ""}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {formatDate(group.date)}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {group.corrections.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-1.5 text-sm"
          >
            <span className="text-muted-foreground">{fieldLabel(c.field_name)}</span>
            <span className="text-muted-foreground/70 line-through">
              {displayValue(c.old_value)}
            </span>
            <span className="text-muted-foreground/60">→</span>
            <Badge variant="secondary" className="font-normal">
              {displayValue(c.new_value)}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground/70">
              {formatDate(c.corrected_at)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>載入修正紀錄失敗</AlertTitle>
      <AlertDescription>
        <p className="text-sm">{message || "請稍後再試。"}</p>
        {onRetry && (
          <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重試
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export default function CorrectionsLog() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // corrections 是跨月累積的 log，不依月份/scope 過濾。
  // 支援 ?key= 下鑽：summary 點擊某比對鍵 → 明細過濾到該鍵（規則候選 → 原始校正明細）。
  const matchKey = searchParams.get("key") || ""
  const paramParts = []
  if (matchKey) paramParts.push(`matchKey=${encodeURIComponent(matchKey)}`)
  paramParts.push("limit=1000")
  const params = paramParts.join("&")

  const { data, loading, error, refetch } = useCorrections(params)

  const [page, setPage] = useState(1)

  const rows = data?.rows || []
  const summary = data?.summary || []

  // 以交易分組：一筆交易可能被改多個欄位（多筆 correction）→ 聚合成一張卡。
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.transaction_id)) {
        map.set(r.transaction_id, {
          id: r.transaction_id,
          name: r.transaction_name || `#${r.transaction_id}`,
          date: r.transaction_date,
          outflow: r.transaction_outflow,
          amount: r.transaction_amount,
          corrections: [],
          lastAt: r.corrected_at,
        })
      }
      const g = map.get(r.transaction_id)
      g.corrections.push(r)
      if (r.corrected_at > g.lastAt) g.lastAt = r.corrected_at
    }
    // 依最近修正時間降序（最近改的在前）
    return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  }, [rows])

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageGroups = groups.slice(start, start + PAGE_SIZE)

  function handlePick(nextKey) {
    const sp = new URLSearchParams(searchParams)
    if (matchKey === nextKey) {
      sp.delete("key")
    } else {
      sp.set("key", nextKey)
    }
    setPage(1)
    router.push(`?${sp.toString()}`, { scroll: false })
  }

  function clearKey() {
    const sp = new URLSearchParams(searchParams)
    sp.delete("key")
    setPage(1)
    router.push(`?${sp.toString()}`, { scroll: false })
  }

  const isEmpty = !loading && !error && groups.length === 0

  return (
    <ErrorBoundary>
      <section className="space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">修正紀錄</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            所有在交易明細做過的修正，逐筆自動記錄。左側是「規則候選」聚合（給 AI 進化規則用），
            右側列出你改過的每一筆交易。
          </p>
        </header>

        {error ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : (
          <>
            {/* Summary：以 match_key 聚合的規則候選（AI 第二環原料） */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                規則候選（比對鍵 × 校正為）
              </h3>
              {loading ? (
                <TableSkeleton rows={4} />
              ) : summary.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無累積資料。</p>
              ) : (
                <div className="rounded-md border">
                  <SummaryTable rows={summary} activeKey={matchKey} onPick={handlePick} />
                </div>
              )}
              {matchKey && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>已套用篩選：比對鍵 = {matchKey}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={clearKey}>
                    <X className="mr-1 h-3 w-3" />
                    清除
                  </Button>
                </div>
              )}
            </div>

            {/* 明細：以交易為主體 */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">修正過的交易</h3>
                {!loading && groups.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    共 {groups.length} 筆交易
                  </span>
                )}
              </div>
              {loading ? (
                <TableSkeleton rows={5} />
              ) : isEmpty ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <History className="h-4 w-4" />
                    </EmptyMedia>
                    <EmptyTitle>尚無修正紀錄</EmptyTitle>
                    <EmptyDescription>
                      當你在交易明細調整分類、歸屬或必要性，這裡會逐筆累積每一次變更。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <ul className="space-y-2">
                    {pageGroups.map((g) => (
                      <TransactionGroup key={g.id} group={g} />
                    ))}
                  </ul>
                  {totalPages > 1 && (
                    <Pagination className="mx-0 justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            text="上一頁"
                            aria-disabled={safePage === 1}
                            className={safePage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            onClick={(e) => {
                              e.preventDefault()
                              if (safePage > 1) setPage(safePage - 1)
                            }}
                          />
                        </PaginationItem>
                        {pageRange(safePage, totalPages).map((p, i) =>
                          p === null ? (
                            <PaginationItem key={`ellipsis-${i}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={p}>
                              <PaginationLink
                                isActive={p === safePage}
                                className="cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault()
                                  setPage(p)
                                }}
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          ),
                        )}
                        <PaginationItem>
                          <PaginationNext
                            text="下一頁"
                            aria-disabled={safePage === totalPages}
                            className={safePage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            onClick={(e) => {
                              e.preventDefault()
                              if (safePage < totalPages) setPage(safePage + 1)
                            }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </ErrorBoundary>
  )
}
