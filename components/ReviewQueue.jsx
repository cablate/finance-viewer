"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Inbox,
  ListChecks,
  RefreshCw,
} from "lucide-react"

import { useReviewQueue } from "@/lib/hooks"
import { formatDate, formatTWD } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "@/components/ui/alert"

// 與 lib/queries/review.js getReviewQueue 的 SQL 一致的「待確認」判定值。
const UNCERTAIN_OWNER = "待確認"
const UNCERTAIN_CATEGORY = "待確認"
const UNCERTAIN_NECESSITY = "需確認"

// 找出某筆 sample 哪些欄位落到「待確認」狀態，用來顯示原因 Badge。
function getReasons(sample) {
  const reasons = []
  if (sample?.owner_primary === UNCERTAIN_OWNER) reasons.push({ key: "owner", label: "歸屬待確認" })
  if (sample?.category_primary === UNCERTAIN_CATEGORY) reasons.push({ key: "category", label: "分類待確認" })
  if (sample?.necessity === UNCERTAIN_NECESSITY) reasons.push({ key: "necessity", label: "必要性需確認" })
  return reasons
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-9 w-16" />
        <Skeleton className="mt-1 h-3 w-32" />
      </CardHeader>
    </Card>
  )
}

function SampleRowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-28 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
    </div>
  )
}

export default function ReviewQueue() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data, loading, error, refetch } = useReviewQueue()

  // 下鑽到 transactions mode 並以 view=review 篩選 review 佇列。
  const buildDrillUrl = useCallback(() => {
    const next = new URLSearchParams()
    const month = searchParams.get("month")
    const scope = searchParams.get("scope")
    if (month) next.set("month", month)
    if (scope && scope !== "all") next.set("scope", scope)
    next.set("mode", "transactions")
    next.set("view", "review")
    const qs = next.toString()
    return qs ? `/?${qs}` : "/"
  }, [searchParams])

  const handleDrill = useCallback(() => {
    router.push(buildDrillUrl())
  }, [router, buildDrillUrl])

  if (loading) {
    return (
      <section className="flex flex-col gap-6" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SampleRowSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>無法載入待審核清單</AlertTitle>
        <AlertDescription>
          {error?.message || "請稍後再試，或點重試重新取得資料。"}
        </AlertDescription>
        <AlertAction>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw />
            重試
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  const uncertainCount = Number(data?.uncertain_count) || 0
  const unreviewedCount = Number(data?.unreviewed_count) || 0
  const samples = Array.isArray(data?.samples) ? data.samples : []
  const allClear = uncertainCount === 0 && unreviewedCount === 0

  if (allClear) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 />
          </EmptyMedia>
          <EmptyTitle>沒有待審核項目</EmptyTitle>
          <EmptyDescription>
            目前沒有待確認欄位，也沒有未審核的交易。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5" aria-hidden="true" />
              待確認欄位
            </CardDescription>
            <CardTitle className="text-4xl font-semibold tabular-nums">
              {uncertainCount.toLocaleString()}
            </CardTitle>
            <CardDescription>
              歸屬、分類或必要性標記為待確認的交易筆數
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Inbox className="size-3.5" aria-hidden="true" />
              尚未審核
            </CardDescription>
            <CardTitle className="text-4xl font-semibold tabular-nums">
              {unreviewedCount.toLocaleString()}
            </CardTitle>
            <CardDescription>
              待分析（尚未分類）的交易筆數
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ListChecks className="size-4" aria-hidden="true" />
            待確認交易樣本
            <span className="text-muted-foreground">
              （最多 {samples.length} 筆）
            </span>
          </h3>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0"
            onClick={handleDrill}
          >
            前往審核
            <ArrowRight />
          </Button>
        </div>

        {samples.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle2 />
              </EmptyMedia>
              <EmptyTitle>目前沒有待確認樣本</EmptyTitle>
              <EmptyDescription>
                雖有未審核交易，但暫無欄位被標記為待確認。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {samples.map((sample) => {
              const reasons = getReasons(sample)
              return (
                <li key={sample.id}>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className={cn(
                      "h-auto w-full justify-between gap-3 py-3 text-left",
                    )}
                    onClick={handleDrill}
                    aria-label={`審核交易：${sample.name}（${formatDate(
                      sample.transaction_date,
                    )}）`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" aria-hidden="true" />
                        {formatDate(sample.transaction_date)}
                      </span>
                      <span className="w-full truncate font-medium text-foreground">
                        {sample.name}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {reasons.length > 0 ? (
                          reasons.map((r) => (
                            <Badge key={r.key} variant="secondary">
                              {r.label}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline">未審核</Badge>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-medium tabular-nums text-foreground">
                        {formatTWD(sample.amount)}
                      </span>
                      <ArrowRight
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </span>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

    </section>
  )
}
