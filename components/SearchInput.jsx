"use client"

// SearchInput：header 搜尋框。debounce 300ms 後把 ?search= 寫入 URL。
// search 存在時 app/page.js 會覆寫成 TransactionTable 帶 search（搜尋結果）。
// 清空時清除 search（回到原 mode）。修正 audit 指出「前端無搜尋 input」的缺口。

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

export default function SearchInput() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get("search") || "")

  // 外部清除（如切 mode）時同步本地值。
  useEffect(() => {
    setValue(searchParams.get("search") || "")
  }, [searchParams])

  // debounce push：value 變動後 300ms 更新 URL。
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      const v = value.trim()
      if (v) params.set("search", v)
      else params.delete("search")
      const qs = params.toString()
      router.replace(qs ? `/?${qs}` : "/", { scroll: false })
    }, 300)
    return () => clearTimeout(handle)
  }, [value, searchParams, router])

  return (
    <div className="relative w-full max-w-xs">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜尋交易名稱 / 備註…"
        aria-label="搜尋交易"
        className="h-9 pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="清除搜尋"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
