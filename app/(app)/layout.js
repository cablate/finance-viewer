"use client"

// 共享 shell（route group (app)）：側欄 + header(ScopeBar/SearchInput) + AIBanner + main。
// 多 route 架構——各 view 是獨立 page（/、/transactions、/trend、/corrections、/rules），
// 不再靠 ?mode= 驅動，從根本消除跨 view 的 URL param 互相污染。
// 補月：任何 route 下 URL 無 month 時，用 useMeta 最新月補上（replace 不進 history，維持當前 route）。

import { Suspense, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import AppSidebar from "@/components/AppSidebar"
import ScopeBar from "@/components/ScopeBar"
import SearchInput from "@/components/SearchInput"
import AIBanner from "@/components/AIBanner"
import ErrorBoundary from "@/components/ErrorBoundary"
import { useMeta } from "@/lib/hooks"
import { Skeleton } from "@/components/ui/skeleton"

// month 不影響渲染的 route（規則 / 修正紀錄是跨月累積資產，不必等補月）。
const NO_MONTH_ROUTES = ["/rules", "/corrections"]

// 從 useMeta 取最新月份（months.transaction 已由小到大排序）。
function latestMonth(meta) {
  if (!meta) return ""
  const list = meta?.months?.transaction
  if (!Array.isArray(list) || list.length === 0) return ""
  return list[list.length - 1]?.month || ""
}

function ShellContent({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: meta } = useMeta()

  const month = searchParams.get("month") || ""

  // 補月：URL 無 month 時補最新月（相對 query → 維持當前 route，只改 search params）。
  useEffect(() => {
    if (month) return
    if (!meta) return
    const lm = latestMonth(meta)
    if (!lm) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("month", lm)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [month, meta, searchParams, router])

  const lm = latestMonth(meta)
  const noMonthNeeded = NO_MONTH_ROUTES.includes(pathname)
  const isReady = noMonthNeeded || month !== "" || (meta && !lm)

  return (
    <AppSidebar>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <ScopeBar />
        <SearchInput />
      </header>
      <AIBanner />
      <main className="p-4">
        {!isReady ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-[28rem] w-full" />
          </div>
        ) : (
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-[28rem] w-full" />
                </div>
              }
            >
              {children}
            </Suspense>
          </ErrorBoundary>
        )}
      </main>
    </AppSidebar>
  )
}

export default function AppLayout({ children }) {
  // 最外層 Suspense：滿足 Next 15 useSearchParams 邊界要求（ScopeBar/SearchInput/各 view 皆讀 searchParams）。
  return (
    <Suspense
      fallback={
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[28rem] w-full" />
        </div>
      }
    >
      <ShellContent>{children}</ShellContent>
    </Suspense>
  )
}
