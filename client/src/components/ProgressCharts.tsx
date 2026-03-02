import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ComposedChart,
} from 'recharts';
import { Scale, Heart, Droplet, Activity, Ruler, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import {
  fromKg, fromCm, fromMgdl,
  getUnitConfig,
  type UnitsPreference,
} from '@shared/units';

interface MetricEntry {
  normalizedValue: number | null;
  valueJson: any;
  timestamp: string | Date;
  type: string;
}

interface ProgressChartsProps {
  metrics: {
    weight: MetricEntry[];
    bp: MetricEntry[];
    glucose: MetricEntry[];
    ketones: MetricEntry[];
    waist: MetricEntry[];
  };
  unitLabels: Record<string, string>;
  unitsPref: UnitsPreference;
}

const STORAGE_KEY = 'progress-charts-collapsed';
const THIRTY_DAYS_AGO = () => subDays(new Date(), 30);

// Convert normalizedValue to display units
function toDisplayValue(val: number, type: string, unitsPref: UnitsPreference): number {
  const config = getUnitConfig(unitsPref);
  switch (type) {
    case 'WEIGHT': return fromKg(val, config.weight);
    case 'WAIST': return fromCm(val, config.length);
    case 'GLUCOSE': return fromMgdl(val, config.glucose);
    case 'KETONES': return val;
    default: return val;
  }
}

// Prepare chart data: filter to 30 days, sort chronologically, convert units
function prepareData(
  entries: MetricEntry[],
  type: string,
  unitsPref: UnitsPreference,
): Array<{ date: string; value: number; ts: number }> {
  const cutoff = THIRTY_DAYS_AGO();
  return entries
    .filter(e => new Date(e.timestamp) >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(e => {
      let val: number | null = null;
      if (e.normalizedValue != null) {
        val = toDisplayValue(e.normalizedValue, type, unitsPref);
      } else {
        val = (e.valueJson as { value?: number })?.value ?? null;
      }
      return val != null ? {
        date: format(new Date(e.timestamp), 'MMM d'),
        value: Math.round(val * 100) / 100,
        ts: new Date(e.timestamp).getTime(),
      } : null;
    })
    .filter((d): d is { date: string; value: number; ts: number } => d != null);
}

// Prepare BP data: two values per entry
function prepareBpData(entries: MetricEntry[]): Array<{ date: string; systolic: number; diastolic: number; ts: number }> {
  const cutoff = THIRTY_DAYS_AGO();
  return entries
    .filter(e => new Date(e.timestamp) >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(e => {
      const vj = e.valueJson as { systolic?: number; diastolic?: number };
      if (vj?.systolic == null || vj?.diastolic == null) return null;
      return {
        date: format(new Date(e.timestamp), 'MMM d'),
        systolic: Math.round(vj.systolic),
        diastolic: Math.round(vj.diastolic),
        ts: new Date(e.timestamp).getTime(),
      };
    })
    .filter((d): d is { date: string; systolic: number; diastolic: number; ts: number } => d != null);
}

// Custom tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-md text-sm">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function ProgressCharts({ metrics, unitLabels, unitsPref }: ProgressChartsProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  };

  const weightData = useMemo(() => prepareData(metrics.weight, 'WEIGHT', unitsPref), [metrics.weight, unitsPref]);
  const bpData = useMemo(() => prepareBpData(metrics.bp), [metrics.bp]);
  const glucoseData = useMemo(() => prepareData(metrics.glucose, 'GLUCOSE', unitsPref), [metrics.glucose, unitsPref]);
  const ketonesData = useMemo(() => prepareData(metrics.ketones, 'KETONES', unitsPref), [metrics.ketones, unitsPref]);
  const waistData = useMemo(() => prepareData(metrics.waist, 'WAIST', unitsPref), [metrics.waist, unitsPref]);

  const hasAnyData = weightData.length > 0 || bpData.length > 0 || glucoseData.length > 0 || ketonesData.length > 0 || waistData.length > 0;
  if (!hasAnyData) return null;

  const axisStyle = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
  const gridStyle = { strokeDasharray: '3 3', stroke: 'hsl(var(--border))' };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold text-foreground">Progress Charts</h2>
        </div>
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {/* Charts grid */}
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Weight Trend — ComposedChart with bars + trend line */}
          {weightData.length > 0 && (
            <Card className="p-4 border shadow-sm">
              <div className="flex items-center gap-1.5 mb-3">
                <Scale className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-muted-foreground">Weight Trend</span>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weightData}>
                    <CartesianGrid {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={axisStyle} tickLine={false} axisLine={false} width={40}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name={`Weight (${unitLabels.weight})`} fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} opacity={0.3} />
                    <Line dataKey="value" name={`Trend`} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Blood Pressure — Scatter plot with systolic (blue) + diastolic (green) */}
          {bpData.length > 0 && (
            <Card className="p-4 border shadow-sm">
              <div className="flex items-center gap-1.5 mb-3">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-muted-foreground">Blood Pressure</span>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} type="category" allowDuplicatedCategory={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltip />} />
                    <Scatter name="Systolic" data={bpData.map(d => ({ date: d.date, value: d.systolic }))} fill="hsl(217, 91%, 60%)" dataKey="value" />
                    <Scatter name="Diastolic" data={bpData.map(d => ({ date: d.date, value: d.diastolic }))} fill="hsl(142, 71%, 45%)" dataKey="value" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Blood Glucose — Line chart */}
          {glucoseData.length > 0 && (
            <Card className="p-4 border shadow-sm">
              <div className="flex items-center gap-1.5 mb-3">
                <Droplet className="w-4 h-4 text-[#004aad]" />
                <span className="text-sm font-medium text-muted-foreground">Blood Glucose</span>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={glucoseData}>
                    <CartesianGrid {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line dataKey="value" name={`Glucose (${unitLabels.glucose})`} stroke="#004aad" strokeWidth={2} dot={{ r: 3, fill: '#004aad' }} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Ketones — Bar chart */}
          {ketonesData.length > 0 && (
            <Card className="p-4 border shadow-sm">
              <div className="flex items-center gap-1.5 mb-3">
                <Activity className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-muted-foreground">Ketones</span>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ketonesData}>
                    <CartesianGrid {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} domain={[0, 'auto']} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name={`Ketones (${unitLabels.ketones})`} fill="hsl(271, 91%, 65%)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Waist Measurement — Scatter/dot plot */}
          {waistData.length > 0 && (
            <Card className="p-4 border shadow-sm">
              <div className="flex items-center gap-1.5 mb-3">
                <Ruler className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-medium text-muted-foreground">Waist Measurement</span>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid {...gridStyle} />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} type="category" allowDuplicatedCategory={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltip />} />
                    <Scatter name={`Waist (${unitLabels.waist})`} data={waistData.map(d => ({ date: d.date, value: d.value }))} fill="hsl(239, 84%, 67%)" dataKey="value" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

        </div>
      )}
    </div>
  );
}
