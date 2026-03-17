"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

const data = [
  { month: "Jan", revenue: 1200000 },
  { month: "Feb", revenue: 1500000 },
  { month: "Mar", revenue: 900000 },
  { month: "Apr", revenue: 1800000 },
  { month: "Mei", revenue: 2100000 },
  { month: "Jun", revenue: 1700000 },
]

export default function RevenueChart() {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-base font-semibold mb-3 text-gray-700">Revenue Trend</h2>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#6b7280' }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#6b7280' }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13 }}
            formatter={(value) =>
              `Rp ${Number(value).toLocaleString("id-ID")}`
            }
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#5e72e4"
            strokeWidth={3}
            dot={{ r: 4, stroke: '#5e72e4', strokeWidth: 2, fill: '#fff' }}
            activeDot={{ r: 6, stroke: '#5e72e4', strokeWidth: 2, fill: '#fff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}