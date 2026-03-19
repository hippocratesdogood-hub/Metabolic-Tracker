import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { BarChart3, Target, CalendarDays, ChevronUp, ChevronDown, Settings } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface MetricEntry {
  normalizedValue: number | null;
  valueJson: any;
  timestamp: string | Date;
  type: string;
}

interface AdditionalInsightsProps {
  metrics: {
    weight: MetricEntry[];
    bp: MetricEntry[];
    glucose: MetricEntry[];
    ketones: MetricEntry[];
    waist: MetricEntry[];
  };
}

const STORAGE_KEY = 'additional-insights-collapsed';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-md text-sm">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.fill }}>
          {p.value}
        </p>
      ))}
    </div>
  );
}

export default function AdditionalInsights({ metrics }: AdditionalInsightsProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  };

  const allEntries = useMemo(() => [
    ...metrics.weight,
    ...metrics.bp,
    ...metrics.glucose,
    ...metrics.ketones,
    ...metrics.waist,
  ], [metrics]);

  // Data Completeness — count per metric type
  const completenessData = useMemo(() => [
    { name: 'Weight', count: metrics.weight.length },
    { name: 'Glucose', count: metrics.glucose.length },
    { name: 'Ketones', count: metrics.ketones.length },
    { name: 'BP', count: metrics.bp.length },
    { name: 'Waist', count: metrics.waist.length },
  ], [metrics]);

  // Logging Habits — summary stats
  const loggingStats = useMemo(() => {
    const total = allEntries.length;
    if (total === 0) return null;

    const timestamps = allEntries.map(e => new Date(e.timestamp));
    const earliest = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const totalDays = Math.max(1, differenceInDays(new Date(), earliest) + 1);

    // Count unique active days
    const activeDaySet = new Set(
      timestamps.map(t => `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`)
    );
    const activeDays = activeDaySet.size;

    const entriesPerDay = total / totalDays;
    const consistency = (activeDays / totalDays) * 100;
    const avgPerActiveDay = total / activeDays;

    return {
      total,
      entriesPerDay: entriesPerDay.toFixed(2),
      consistency: Math.round(consistency),
      activeDays,
      avgPerActiveDay: avgPerActiveDay.toFixed(2),
    };
  }, [allEntries]);

  // Weekly Activity — entries by day of week
  const weeklyData = useMemo(() => {
    const counts = new Array(7).fill(0);
    allEntries.forEach(e => {
      const day = new Date(e.timestamp).getDay();
      counts[day]++;
    });
    return DAY_NAMES.map((name, i) => ({ name, count: counts[i] }));
  }, [allEntries]);

  if (allEntries.length === 0) return null;

  const axisStyle = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
  const gridStyle = { strokeDasharray: '3 3', stroke: 'hsl(var(--border))' };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold text-foreground">Additional Insights</h2>
        </div>
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Data Completeness */}
          <Card className="p-4 border shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Data Completeness</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Which metrics you track most</p>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completenessData}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Logging Habits */}
          <Card className="p-4 border shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Logging Habits</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Your tracking consistency & patterns</p>

            {loggingStats && (
              <div className="space-y-4">
                {/* Top row — large stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold tracking-tight">{loggingStats.total}</div>
                    <div className="text-xs text-muted-foreground">Total Entries</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold tracking-tight">{loggingStats.entriesPerDay}</div>
                    <div className="text-xs text-muted-foreground">Entries/Day</div>
                  </div>
                </div>
                {/* Bottom row — secondary stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{loggingStats.consistency}%</div>
                    <div className="text-xs text-muted-foreground">Consistency</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{loggingStats.activeDays}</div>
                    <div className="text-xs text-muted-foreground">Active Days</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{loggingStats.avgPerActiveDay}</div>
                    <div className="text-xs text-muted-foreground">Avg/Day</div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Weekly Activity */}
          <Card className="p-4 border shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Weekly Activity</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Entries by day of week</p>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}
