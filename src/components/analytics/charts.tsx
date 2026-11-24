"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/utils";

/** Categorical slots in fixed order (validated reference palette — never cycled). */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const GRID = "#e2e8f0";
const AXIS = { fontSize: 11, fill: "#64748b" };

function ChartCard({ title, description, children, delay = 0 }: { title: string; description?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}>
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="h-64">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

const tooltipStyle = { borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -12px rgb(23 37 84 / .25)", fontSize: 12 };

export function PartnershipsOverTime({ data }: { data: { month: string; total: number; new: number }[] }) {
  return (
    <ChartCard title="Partnerships over time" description="Cumulative partnerships (all statuses)">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#94a3b8", strokeDasharray: 3 }} />
          <Line type="monotone" dataKey="total" name="Total partnerships" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RequestsVsAcceptances({ data }: { data: { month: string; sent: number; received: number; accepted: number }[] }) {
  return (
    <ChartCard title="Requests vs acceptances" description="Sent and received requests, and acceptances (either direction)" delay={0.05}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#475569" }} />
          <Bar dataKey="sent" name="Sent" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="received" name="Received" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="accepted" name="Accepted" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TypeDistribution({ data }: { data: { name: string; value: number }[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <ChartCard title="Partnership types" description="Partnerships by category" delay={0.1}>
      {sorted.length === 0 ? (
        <Empty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="value" name="Partnerships" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function MonthlyReferrals({ data }: { data: { month: string; received: number; sent: number }[] }) {
  return (
    <ChartCard title="Monthly referrals" description="Referrals received from and sent to partners" delay={0.05}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#475569" }} />
          <Bar dataKey="received" name="Received" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="sent" name="Sent" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DealPipeline({ data }: { data: { stage: string; count: number; value: number }[] }) {
  return (
    <ChartCard title="Deal pipeline" description="Expected value by stage (estimated, not revenue)" delay={0.1}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="stage" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v, "INR", true)} width={64} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} formatter={(v) => [formatCurrency(Number(v)), "Expected value"]} />
          <Bar dataKey="value" name="Expected value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function Engagement({ data }: { data: { month: string; actions: number }[] }) {
  return (
    <ChartCard title="Company engagement" description="Recorded platform activity by your team" delay={0.15}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="eng" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#94a3b8", strokeDasharray: 3 }} />
          <Area type="monotone" dataKey="actions" name="Actions" stroke={SERIES[0]} strokeWidth={2} fill="url(#eng)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data for this period</div>;
}
