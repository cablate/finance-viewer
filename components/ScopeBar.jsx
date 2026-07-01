"use client"

// ScopeBar：範圍切換（全部 / 個人 / 事業）。
// 單選、自帶 aria-pressed（取代未安裝的 ToggleGroup，仍達 a11y 語意）。
// 切 scope 更新 URL search params；scope=all 時清除參數（預設值不寫入 URL）。

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

const SCOPES = [
  { value: "all", label: "全部" },
  { value: "personal", label: "個人" },
  { value: "business", label: "事業" },
]

export default function ScopeBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get("scope") || "all"
  const pathname = usePathname()

  function setScope(value) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete("scope")
    else params.set("scope", value)
    const qs = params.toString()
    // 維持當前 route，只更新 query（scope 跨頁共享）。
    router.push(qs ? `?${qs}` : pathname)
  }

  return (
    <div
      role="group"
      aria-label="範圍"
      className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {SCOPES.map(({ value, label }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setScope(value)}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-3 text-xs font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
