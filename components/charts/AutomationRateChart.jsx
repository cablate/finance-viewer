"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatMonth } from "@/lib/format"

const config = {
  automationRate: { label: "規則自動化率", color: "var(--chart-2)" },
}

function percentTick(value) {
  return `${Math.round(Number(value) || 0)}%`
}

export default function AutomationRateChart({ data = [], ariaLabel = "規則自動化率走勢圖" }) {
  return (
    <div role="figure" aria-label={ariaLabel}>
      <ChartContainer config={config} className="aspect-[16/7] w-full max-h-[280px]">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={formatMonth}
          />
          <YAxis
            width={44}
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={percentTick}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelKey="automationRate"
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.month
                    ? formatMonth(payload[0].payload.month)
                    : ""
                }
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">規則自動化率</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {Number(value).toFixed(1)}%
                    </span>
                  </div>
                )}
              />
            }
          />
          <Line
            id="automation-rate-line"
            type="monotone"
            dataKey="automationRate"
            stroke="var(--color-automationRate)"
            strokeWidth={2.5}
            isAnimationActive={false}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartContainer>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">月份</th>
            <th scope="col">規則自動化率</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <th scope="row">{formatMonth(row.month)}</th>
              <td>{Number(row.automationRate).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
