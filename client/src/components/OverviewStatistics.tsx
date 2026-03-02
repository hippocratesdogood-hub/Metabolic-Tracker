import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Scale, Heart, Droplet, Activity, Ruler, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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

interface TrendInfo {
  direction: 'up' | 'down' | 'neutral';
  value: string | null;
  isPositive: boolean;
}

interface OverviewStatisticsProps {
  metrics: {
    weight: MetricEntry[];
    bp: MetricEntry[];
    glucose: MetricEntry[];
    ketones: MetricEntry[];
    waist: MetricEntry[];
  };
  trends?: {
    weight?: TrendInfo;
    glucose?: TrendInfo;
    ketones?: TrendInfo;
    waist?: TrendInfo;
    bp?: TrendInfo;
  };
  unitLabels: Record<string, string>;
  unitsPref: UnitsPreference;
}

interface MetricStats {
  latest: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

// Extract numeric value from a metric entry
function getValue(entry: MetricEntry, type: string): number | null {
  if (type === 'BP') {
    const vj = entry.valueJson as { systolic?: number };
    return vj?.systolic ?? null;
  }
  if (entry.normalizedValue != null) return entry.normalizedValue;
  const vj = entry.valueJson as { value?: number };
  return vj?.value ?? null;
}

// Compute stats from entries (entries are sorted desc by timestamp)
function computeStats(entries: MetricEntry[], type: string): MetricStats {
  if (entries.length === 0) {
    return { latest: null, avg: null, min: null, max: null, count: 0 };
  }

  const values = entries.map(e => getValue(e, type)).filter((v): v is number => v != null);
  if (values.length === 0) {
    return { latest: null, avg: null, min: null, max: null, count: entries.length };
  }

  const latest = values[0]; // entries sorted desc, so first is latest
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  return { latest, avg, min, max, count: entries.length };
}

// Convert normalized value to display units
function toDisplayValue(
  normalizedVal: number,
  type: string,
  unitsPref: UnitsPreference,
): number {
  const config = getUnitConfig(unitsPref);
  switch (type) {
    case 'WEIGHT': return fromKg(normalizedVal, config.weight);
    case 'WAIST': return fromCm(normalizedVal, config.length);
    case 'GLUCOSE': return fromMgdl(normalizedVal, config.glucose);
    case 'KETONES': return normalizedVal; // always mmol/L
    case 'BP': return normalizedVal; // always mmHg
    default: return normalizedVal;
  }
}

function formatVal(val: number | null, type: string, unitsPref: UnitsPreference): string {
  if (val == null) return '--';
  const display = type === 'BP' ? val : toDisplayValue(val, type, unitsPref);
  if (type === 'KETONES') return display.toFixed(1);
  return Math.round(display).toString();
}

const STORAGE_KEY = 'overview-stats-collapsed';

const metricConfigs = [
  { key: 'weight', type: 'WEIGHT', label: 'Weight', icon: Scale, iconColor: 'text-blue-500', unitKey: 'weight' },
  { key: 'bp', type: 'BP', label: 'Blood Pressure', icon: Heart, iconColor: 'text-red-500', unitKey: 'bp' },
  { key: 'glucose', type: 'GLUCOSE', label: 'Blood Glucose', icon: Droplet, iconColor: 'text-[#004aad]', unitKey: 'glucose' },
  { key: 'ketones', type: 'KETONES', label: 'Ketones', icon: Activity, iconColor: 'text-purple-500', unitKey: 'ketones' },
  { key: 'waist', type: 'WAIST', label: 'Waist', icon: Ruler, iconColor: 'text-indigo-500', unitKey: 'waist' },
] as const;

// For weight, glucose, waist, BP — "down" is positive. For ketones — "up" is positive.
function getTrendDotColor(trend?: TrendInfo): string {
  if (!trend || trend.direction === 'neutral') return 'bg-gray-400';
  return trend.isPositive ? 'bg-green-500' : 'bg-red-500';
}

export default function OverviewStatistics({ metrics, trends, unitLabels, unitsPref }: OverviewStatisticsProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  };

  // Check if there's any data at all
  const hasAnyData = Object.values(metrics).some(arr => arr.length > 0);
  if (!hasAnyData) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold text-foreground">Overview Statistics</h2>
        </div>
        <div className="flex items-center gap-4">
          {/* Legend — hidden on mobile */}
          {!collapsed && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Increasing</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Stable</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Declining</span>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {metricConfigs.map(({ key, type, label, icon: Icon, iconColor, unitKey }) => {
            const entries = metrics[key as keyof typeof metrics];
            const stats = computeStats(entries, type);
            const trend = trends?.[key as keyof NonNullable<typeof trends>];
            const unit = unitLabels[unitKey] || '';

            if (stats.count === 0) return null;

            return (
              <Card key={key} className="min-w-[180px] flex-1 p-4 border shadow-sm space-y-3">
                {/* Top row: icon + label + trend dot */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn("w-4 h-4", iconColor)} />
                    <span className="text-sm font-medium text-muted-foreground truncate">{label}</span>
                  </div>
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", getTrendDotColor(trend))} />
                </div>

                {/* Latest value */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-tight">
                    {formatVal(stats.latest, type, unitsPref)}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium">{unit}</span>
                </div>

                {/* Footer stats */}
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                  <div className="text-center">
                    <div className="font-semibold text-foreground">{formatVal(stats.avg, type, unitsPref)}</div>
                    <div>Avg</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-foreground">
                      {formatVal(stats.min, type, unitsPref)}-{formatVal(stats.max, type, unitsPref)}
                    </div>
                    <div>Range</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-foreground">{stats.count}</div>
                    <div>Entries</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
