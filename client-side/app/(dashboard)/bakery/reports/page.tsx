"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { formatCurrency } from "@/components/orders/formatters";
import { Download, PieChart as PieChartIcon } from "lucide-react";
import {
  bakeryReportStats,
  bakeryRevenueByWeek,
  bakeryStatusMix,
} from "@/components/bakery/mockData";

export default function ReportsPage() {
  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Owner Monitoring"
        description="Analytics for revenue and order health across time."
        icon={PieChartIcon}
        actions={
          <Button className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500">
            <Download size={16} />
            Export to Excel
          </Button>
        }
      />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Date Range</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 px-6 pb-6 pt-0">
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              From
            </span>
            <Input type="date" className="max-w-50" />
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              To
            </span>
            <Input type="date" className="max-w-50" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {bakeryReportStats.map((stat) => (
          <Card key={stat.title} className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-sm text-gray-600">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-xl font-semibold text-gray-900">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Revenue Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bakeryRevenueByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `Rp ${value / 1000000}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Order Status Mix</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bakeryStatusMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                  >
                    {bakeryStatusMix.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-gray-600">
              {bakeryStatusMix.map((status) => (
                <div key={status.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: status.color }}
                    />
                    {status.name}
                  </span>
                  <span>{status.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Insights</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0 text-sm text-gray-600">
          Use these charts to highlight peak weeks and ensure production capacity matches demand.
        </CardContent>
      </Card>
    </div>
  );
}
