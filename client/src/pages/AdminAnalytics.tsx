import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  BarChart3, Users, Scale, Heart, Droplet, Activity,
  TrendingUp, TrendingDown, ChevronUp, ChevronDown, Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '6m', value: 180 },
  { label: '1y', value: 365 },
];

function KPICard({ icon: Icon, iconColor, title, value, subtitle, delta, invertColor = false }: {
  icon: any;
  iconColor: string;
  title: string;
  value: string | number;
  subtitle: string;
  delta?: number | null;
  invertColor?: boolean;
}) {
  const hasDelta = delta !== null && delta !== undefined && !isNaN(delta);
  const isGood = hasDelta && (invertColor ? delta! < 0 : delta! > 0);
  const isBad = hasDelta && (invertColor ? delta! > 0 : delta! < 0);

  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn("w-4 h-4", iconColor)} />
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        {hasDelta && (
          <div className={cn(
            "flex items-center gap-1 mt-1.5 text-xs font-medium",
            isGood ? "text-green-600" : isBad ? "text-red-600" : "text-muted-foreground"
          )}>
            {delta! > 0 ? <ChevronUp className="w-3.5 h-3.5" /> :
             delta! < 0 ? <ChevronDown className="w-3.5 h-3.5" /> :
             <Minus className="w-3.5 h-3.5" />}
            <span>{Math.abs(delta!).toFixed(1)} vs prior period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const weightChartConfig: ChartConfig = {
  avgWeight: { label: "Avg Weight (lbs)", color: "hsl(var(--primary))" },
};
const bpChartConfig: ChartConfig = {
  avgSystolic: { label: "Avg Systolic (mmHg)", color: "hsl(0 84% 60%)" },
};
const glucoseChartConfig: ChartConfig = {
  avgGlucose: { label: "Avg Glucose (mg/dL)", color: "hsl(221 83% 53%)" },
};
const engagementChartConfig: ChartConfig = {
  engagementCount: { label: "Food Entries", color: "hsl(142 71% 45%)" },
};
const demographicChartConfig: ChartConfig = {
  count: { label: "Patients", color: "hsl(var(--primary))" },
};

export default function AdminAnalytics() {
  const { user: currentUser } = useAuth();
  const [range, setRange] = useState(90);
  const [coachFilter, setCoachFilter] = useState<string | undefined>();

  const isAdminOrCoach = currentUser?.role === 'admin' || currentUser?.role === 'coach';

  const { data: coaches = [] } = useQuery({
    queryKey: ['coaches'],
    queryFn: () => api.getCoaches(),
  });

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview', range, coachFilter],
    queryFn: () => api.getAnalyticsOverview(range, coachFilter),
    enabled: isAdminOrCoach,
  });

  const { data: outcomes } = useQuery({
    queryKey: ['analytics-outcomes-compare', range, coachFilter],
    queryFn: () => api.getAnalyticsOutcomes(range, coachFilter, true),
    enabled: isAdminOrCoach,
  });

  const { data: trends = [] } = useQuery({
    queryKey: ['analytics-trends', range, coachFilter],
    queryFn: () => api.getAnalyticsTrends(range, coachFilter),
    enabled: isAdminOrCoach,
  });

  const { data: demographics } = useQuery({
    queryKey: ['analytics-demographics', coachFilter],
    queryFn: () => api.getAnalyticsDemographics(coachFilter),
    enabled: isAdminOrCoach,
  });

  if (!isAdminOrCoach) {
    return <div className="p-8 text-center text-muted-foreground">Admin access required</div>;
  }

  const getDelta = (metric: string): number | null => {
    if (!outcomes?.previous) return null;
    const current = (outcomes as any)?.[metric]?.meanChange ?? 0;
    const previous = (outcomes as any)?.previous?.[metric]?.meanChange ?? 0;
    return current - previous;
  };

  const totalEntries = trends.reduce((sum: number, t: any) => sum + (t.engagementCount || 0), 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Analytics
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {overview?.totalParticipants ?? 0} Total Patients
            </span>
            <span>{overview?.activeParticipants ?? 0} Active</span>
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              {overview?.averageWeeklyAdherence ?? 0}% Compliance
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {RANGE_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={range === opt.value ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <Select value={coachFilter || "all"} onValueChange={(v) => setCoachFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All Coaches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Coaches</SelectItem>
              {coaches.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Performance Metrics */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Key Performance Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard
            icon={Users}
            iconColor="text-primary"
            title="Patient Overview"
            value={overview?.totalParticipants ?? 0}
            subtitle="Total Patients"
          />
          <KPICard
            icon={Scale}
            iconColor="text-emerald-600"
            title="Weight Trends"
            value={`${(outcomes?.weight?.meanChange ?? 0) > 0 ? '+' : ''}${outcomes?.weight?.meanChange ?? 0}`}
            subtitle="Avg Weight Change"
            delta={getDelta('weight')}
            invertColor
          />
          <KPICard
            icon={Heart}
            iconColor="text-red-500"
            title="BP Trends"
            value={`${(outcomes?.bp?.meanChange ?? 0) > 0 ? '+' : ''}${outcomes?.bp?.meanChange ?? 0}`}
            subtitle="Avg BP Change"
            delta={getDelta('bp')}
            invertColor
          />
          <KPICard
            icon={Droplet}
            iconColor="text-blue-600"
            title="Glucose Trends"
            value={`${(outcomes?.fastingGlucose?.meanChange ?? 0) > 0 ? '+' : ''}${outcomes?.fastingGlucose?.meanChange ?? 0}`}
            subtitle="Avg Glucose Change"
            delta={getDelta('fastingGlucose')}
            invertColor
          />
          <KPICard
            icon={Activity}
            iconColor="text-violet-600"
            title="Compliance Rate"
            value={`${overview?.averageWeeklyAdherence ?? 0}%`}
            subtitle={`Patient Compliance`}
          />
        </div>
      </div>

      {/* Health Trends & Progress */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Health Trends & Progress
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Scale className="w-4 h-4 text-muted-foreground" />
                Weight Loss Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trends.length > 0 ? (
                <ChartContainer config={weightChartConfig} className="h-[200px] w-full">
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="weekLabel" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="avgWeight" stroke="var(--color-avgWeight)" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-muted-foreground" />
                Blood Pressure Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trends.length > 0 ? (
                <ChartContainer config={bpChartConfig} className="h-[200px] w-full">
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="weekLabel" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="avgSystolic" stroke="var(--color-avgSystolic)" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Droplet className="w-4 h-4 text-muted-foreground" />
                Blood Glucose Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trends.length > 0 ? (
                <ChartContainer config={glucoseChartConfig} className="h-[200px] w-full">
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="weekLabel" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="avgGlucose" stroke="var(--color-avgGlucose)" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Patient Engagement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trends.length > 0 ? (
                <ChartContainer config={engagementChartConfig} className="h-[200px] w-full">
                  <BarChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="weekLabel" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="engagementCount" fill="var(--color-engagementCount)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Patient Demographics & Risk */}
      <div>
        <h2 className="text-sm font-heading font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Patient Demographics & Risk
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Age Distribution</CardTitle>
                <span className="text-xs text-muted-foreground">{demographics?.participantsWithDob ?? 0} total</span>
              </div>
            </CardHeader>
            <CardContent>
              {demographics?.ageDistribution?.some((d: any) => d.count > 0) ? (
                <ChartContainer config={demographicChartConfig} className="h-[280px] w-full">
                  <BarChart data={demographics.ageDistribution} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" fontSize={11} tickLine={false} axisLine={false} width={45} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No date of birth data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Weight Distribution</CardTitle>
                <span className="text-xs text-muted-foreground">{demographics?.participantsWithWeight ?? 0} total</span>
              </div>
            </CardHeader>
            <CardContent>
              {demographics?.weightDistribution?.some((d: any) => d.count > 0) ? (
                <ChartContainer config={demographicChartConfig} className="h-[280px] w-full">
                  <BarChart data={demographics.weightDistribution} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" fontSize={11} tickLine={false} axisLine={false} width={75} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No weight data available</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
