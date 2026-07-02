"use client"

import { useSearchParams } from "next/navigation"
import { TrendingUp } from "lucide-react"

import { useTrend } from "@/lib/hooks"
import { formatMonth, formatTWD } from "@/lib/format"
import AutomationRateChart from "@/components/charts/AutomationRateChart"
import TrendChart from "@/components/charts/TrendChart"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// 把 URL search params 組成查詢字串供 useTrend。
// trend 端已排除 month（跨月聚合），這裡同步剔除 month 避免帶無意義的篩選。
// 其餘維度（category / search / view ...）沿用主狀態，讓圖表與其他檢視一致。
function buildTrendParams(searchParams) {
  const p = new URLSearchParams()
  for (const [key, value] of searchParams.entries()) {
    if (!value) continue
    if (key === "month") continue // 跨月聚合不帶 month
    p.set(key, value)
  }
  return p.toString()
}

// 月份拆分 Table：最新月份在前，方便閱讀。
function TrendTable({ data }) {
  const rows = [...data].reverse()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>月份</TableHead>
          <TableHead className="text-right">總支出</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.month}>
            <TableCell className="font-medium">
              {formatMonth(row.month)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatTWD(row.spend)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TrendSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-[280px] w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  )
}

// TrendView：每月支出走勢。內含 TrendChart + 月份拆分 Table。
// 載入用 Skeleton、無資料用 Empty、錯誤交由外層 ErrorBoundary（throw 出去）。
export default function TrendView() {
  const searchParams = useSearchParams()
  const params = buildTrendParams(searchParams)
  const { data, loading, error } = useTrend(params)

  // 非同步錯誤往外拋，由整合者包的 ErrorBoundary 統一顯示 Alert + 重試。
  if (error) throw error

  const trend = Array.isArray(data) ? data : []
  const automationTrend = trend.filter(
    (row) =>
      row?.month &&
      Number(row.rows) > 0 &&
      Number.isFinite(Number(row.automationRate)),
  )
  const showAutomationTrend = automationTrend.length >= 2
  const firstAutomation = showAutomationTrend
    ? automationTrend[0].automationRate
    : 0
  const lastAutomation = showAutomationTrend
    ? automationTrend[automationTrend.length - 1].automationRate
    : 0

  return (
    <div className="flex flex-col gap-6">
      {!loading && showAutomationTrend ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
              規則自動化率——越用越省力
            </CardTitle>
            <CardDescription>
              從 {Number(firstAutomation).toFixed(1)}% 到{" "}
              {Number(lastAutomation).toFixed(1)}%，規則庫開始接手重複判斷。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AutomationRateChart data={automationTrend} />
          </CardContent>
        </Card>
      ) : null}

      <Card aria-busy={loading || undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
            每月支出走勢
          </CardTitle>
          <CardDescription>
            各月總支出，圖表附無障礙資料表。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loading ? (
            <TrendSkeleton />
          ) : trend.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TrendingUp />
                </EmptyMedia>
                <EmptyTitle>尚無支出資料</EmptyTitle>
                <EmptyDescription>
                  目前篩選條件下找不到任何月份的支出紀錄。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <TrendChart data={trend} />
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  月份明細
                </h3>
                <TrendTable data={trend} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
