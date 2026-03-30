import React, { useState } from 'react';
import { useData, MetricType } from '@/lib/dataAdapter';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { TrendingUp, StickyNote } from 'lucide-react';
import { getUnitLabels, fromKg, fromCm, fromMgdl, type UnitsPreference } from '@shared/units';
import { cn } from '@/lib/utils';

export default function Trends() {
  const { getMetricsByType } = useData();
  const { user } = useAuth();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('WEIGHT');
  const [range, setRange] = useState('30');
  const unitsPref = (user?.unitsPreference ?? "US") as UnitsPreference;
  const unitLabels = getUnitLabels(unitsPref);

  const metrics = getMetricsByType(selectedMetric);

  // Extract display value from a metric entry, converting from storage units if needed
  const extractValue = (m: any): number | null => {
    const vj = m.valueJson as Record<string, any>;
    if (m.normalizedValue != null) {
      // New data: normalizedValue is in storage units, convert for display
      switch (selectedMetric) {
        case 'WEIGHT': return Math.round(fromKg(m.normalizedValue, unitsPref === 'Metric' ? 'kg' : 'lbs') * 10) / 10;
        case 'WAIST': return Math.round(fromCm(m.normalizedValue, unitsPref === 'Metric' ? 'cm' : 'inches') * 10) / 10;
        case 'GLUCOSE': return Math.round(fromMgdl(m.normalizedValue, unitsPref === 'Metric' ? 'mmol/L' : 'mg/dL') * 10) / 10;
        case 'KETONES': return Math.round(m.normalizedValue * 10) / 10;
        case 'BP': return null; // BP uses valueJson, handled below
        default: return m.normalizedValue;
      }
    }
    // BP always uses valueJson (systolic for trending)
    if (selectedMetric === 'BP') {
      return vj?.systolic ?? null;
    }
    // Legacy data: use raw valueJson
    return vj?.value ?? null;
  };

  // Filter metrics by date range
  const filteredMetrics = metrics
    .filter(m => new Date(m.timestamp) >= subDays(new Date(), parseInt(range)));

  // Process data for charts
  const chartData = filteredMetrics
    .map(m => ({
      date: format(m.timestamp, 'MMM d'),
      value: extractValue(m),
    }))
    .filter(d => d.value != null)
    .reverse();

  // Build history table data (most recent first)
  const historyData = filteredMetrics
    .map(m => {
      const val = extractValue(m);
      const vj = m.valueJson as Record<string, any>;
      let displayValue = val != null ? String(val) : '--';
      if (selectedMetric === 'BP' && vj) {
        displayValue = `${vj.systolic ?? '--'}/${vj.diastolic ?? '--'}`;
      }
      return {
        id: m.id,
        date: format(m.timestamp, 'MMM d, yyyy'),
        time: format(m.timestamp, 'h:mm a'),
        displayValue,
        notes: (m as any).notes as string | null,
      };
    });

  return (
    <div className="space-y-6 pb-20">
       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Trends & Insights</h1>
          <p className="text-muted-foreground">Visualize your metabolic transformation.</p>
        </div>
        
        <div className="flex items-center gap-2">
           <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as MetricType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WEIGHT">Weight</SelectItem>
              <SelectItem value="GLUCOSE">Glucose</SelectItem>
              <SelectItem value="KETONES">Ketones</SelectItem>
              <SelectItem value="WAIST">Waist</SelectItem>
              <SelectItem value="BP">Blood Pressure</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="30" onValueChange={setRange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="7">7 Days</TabsTrigger>
          <TabsTrigger value="30">30 Days</TabsTrigger>
          <TabsTrigger value="90">90 Days</TabsTrigger>
        </TabsList>

        <Card className="mt-6 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              {selectedMetric === 'WEIGHT' && `Weight (${unitLabels.weight})`}
              {selectedMetric === 'GLUCOSE' && `Glucose (${unitLabels.glucose})`}
              {selectedMetric === 'KETONES' && `Ketones (${unitLabels.ketones})`}
              {selectedMetric === 'WAIST' && `Waist (${unitLabels.waist})`}
              {selectedMetric === 'BP' && `Blood Pressure — Systolic (${unitLabels.bp})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">No data yet</p>
                  <p className="text-sm mt-1">
                    Log {selectedMetric === 'WEIGHT' ? 'your weight' : selectedMetric === 'GLUCOSE' ? 'your glucose' : selectedMetric === 'KETONES' ? 'your ketones' : selectedMetric === 'BP' ? 'your blood pressure' : 'your waist measurement'} from the Dashboard to see trends here.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: 'var(--radius)'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </Tabs>

      {/* History Table with Notes */}
      {historyData.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Entry History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {historyData.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-start justify-between gap-4 py-2.5 px-3 rounded-lg",
                    entry.notes ? "bg-muted/50" : "hover:bg-muted/30"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{entry.displayValue}</span>
                      <span className="text-xs text-muted-foreground">{entry.date} at {entry.time}</span>
                    </div>
                    {entry.notes && (
                      <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{entry.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
