import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Shield, Users, Activity, AlertTriangle, TrendingUp, TrendingDown, 
  UserCheck, UserX, Calendar, Target, MessageSquare, Flame, Heart,
  Droplet, Scale, Ruler, ChevronRight
} from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const [range, setRange] = useState(7);
  const [coachFilter, setCoachFilter] = useState<string | undefined>();

  const isAdmin = currentUser?.role === 'admin';

  const { data: coaches = [] } = useQuery({
    queryKey: ['coaches'],
    queryFn: () => api.getCoaches(),
  });

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['analytics-overview', range, coachFilter],
    queryFn: () => api.getAnalyticsOverview(range, coachFilter),
    enabled: isAdmin,
  });

  const { data: flags, isLoading: loadingFlags } = useQuery({
    queryKey: ['analytics-flags', range, coachFilter],
    queryFn: () => api.getAnalyticsFlags(range, coachFilter),
    enabled: isAdmin,
  });

  const { data: macros, isLoading: loadingMacros } = useQuery({
    queryKey: ['analytics-macros', range, coachFilter],
    queryFn: () => api.getAnalyticsMacros(range, coachFilter),
    enabled: isAdmin,
  });

  const { data: outcomes, isLoading: loadingOutcomes } = useQuery({
    queryKey: ['analytics-outcomes', 30, coachFilter],
    queryFn: () => api.getAnalyticsOutcomes(30, coachFilter),
    enabled: isAdmin,
  });

  const { data: coachWorkload = [] } = useQuery({
    queryKey: ['analytics-coaches', range],
    queryFn: () => api.getAnalyticsCoaches(range),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Admin access required
      </div>
    );
  }

  const getFlagIcon = (type: string) => {
    switch (type) {
      case 'high_glucose': return <Droplet className="w-4 h-4 text-red-500" />;
      case 'elevated_bp': return <Heart className="w-4 h-4 text-red-500" />;
      case 'missed_logging': return <Calendar className="w-4 h-4 text-yellow-500" />;
      case 'low_ketones': return <Flame className="w-4 h-4 text-orange-500" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getFlagLabel = (type: string) => {
    switch (type) {
      case 'high_glucose': return 'High Glucose';
      case 'elevated_bp': return 'Elevated BP';
      case 'missed_logging': return 'Missed Logging';
      case 'low_ketones': return 'Low Ketones';
      default: return type;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2" data-testid="text-page-title">
            <Shield className="w-6 h-6 text-primary" />
            Admin Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Program oversight and analytics</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={range.toString()} onValueChange={(v) => setRange(parseInt(v))}>
            <SelectTrigger className="w-32" data-testid="select-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={coachFilter || "all"} onValueChange={(v) => setCoachFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-40" data-testid="select-coach">
              <SelectValue placeholder="All Coaches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Coaches</SelectItem>
              {coaches.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/admin/participants">
            <Button variant="outline" data-testid="link-participants">
              Manage Participants
            </Button>
          </Link>
          <Link href="/admin/prompts">
            <Button variant="outline" data-testid="link-prompts">
              Manage Prompts
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-participants">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.totalParticipants ?? '-'}</p>
                <p className="text-sm text-muted-foreground">Total Participants</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-active-participants">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <UserCheck className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.activeParticipants ?? '-'}</p>
                <p className="text-sm text-muted-foreground">Active (last {range}d)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-inactive-participants">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <UserX className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.inactiveParticipants ?? '-'}</p>
                <p className="text-sm text-muted-foreground">Inactive</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-new-participants">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overview?.newParticipants7Days ?? '-'}</p>
                <p className="text-sm text-muted-foreground">New (7 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-adherence">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Engagement & Adherence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">Average Weekly Adherence</span>
              <span className="text-lg font-bold">{overview?.averageWeeklyAdherence ?? 0}%</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">Participants with 3+ Day Streak</span>
              <div className="text-right">
                <span className="text-lg font-bold">{overview?.participantsWithStreak3Days ?? 0}</span>
                <span className="text-muted-foreground ml-1">({overview?.participantsWithStreak3DaysPercent ?? 0}%)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-flags">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Health Alerts ({flags?.flags?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <Droplet className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium">{flags?.highGlucoseCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">High Glucose</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <Heart className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium">{flags?.elevatedBpCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Elevated BP</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <Calendar className="w-4 h-4 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium">{flags?.missedLoggingCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Missed Logging</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                <Flame className="w-4 h-4 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">{flags?.lowKetonesCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Low Ketones</p>
                </div>
              </div>
            </div>
            {flags?.flags?.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {flags.flags.slice(0, 10).map((flag: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                    <div className="flex items-center gap-2">
                      {getFlagIcon(flag.type)}
                      <span className="font-medium">{flag.participantName}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{getFlagLabel(flag.type)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-macros">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Macro Adherence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">Meeting Protein Target (±10%)</span>
              <div className="text-right">
                <span className="text-lg font-bold text-green-600">{macros?.participantsMeetingProtein ?? 0}</span>
                <span className="text-muted-foreground ml-1">({macros?.participantsMeetingProteinPercent ?? 0}%)</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">Over Carb Target (+10%)</span>
              <div className="text-right">
                <span className="text-lg font-bold text-red-600">{macros?.participantsOverCarbs ?? 0}</span>
                <span className="text-muted-foreground ml-1">({macros?.participantsOverCarbsPercent ?? 0}%)</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">Avg Protein vs Target</span>
              <span className="text-lg font-bold">{macros?.averageProteinVsTarget ?? 0}%</span>
            </div>
            {macros?.totalWithTargets !== undefined && (
              <p className="text-xs text-muted-foreground text-center">
                n = {macros.totalWithTargets} participants with macro targets
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-outcomes">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Outcome Trends (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Weight Change</span>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${(outcomes?.weight?.meanChange ?? 0) < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {outcomes?.weight?.meanChange > 0 ? '+' : ''}{outcomes?.weight?.meanChange ?? 0} lbs
                </span>
                <p className="text-xs text-muted-foreground">n = {outcomes?.weight?.participantCount ?? 0}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Waist Change</span>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${(outcomes?.waist?.meanChange ?? 0) < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {outcomes?.waist?.meanChange > 0 ? '+' : ''}{outcomes?.waist?.meanChange ?? 0} in
                </span>
                <p className="text-xs text-muted-foreground">n = {outcomes?.waist?.participantCount ?? 0}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Fasting Glucose Change</span>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${(outcomes?.fastingGlucose?.meanChange ?? 0) < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {outcomes?.fastingGlucose?.meanChange > 0 ? '+' : ''}{outcomes?.fastingGlucose?.meanChange ?? 0} mg/dL
                </span>
                <p className="text-xs text-muted-foreground">n = {outcomes?.fastingGlucose?.participantCount ?? 0}</p>
              </div>
            </div>
            {(outcomes?.weight?.limitedData || outcomes?.waist?.limitedData || outcomes?.fastingGlucose?.limitedData) && (
              <p className="text-xs text-yellow-600 dark:text-yellow-500 text-center">
                Limited data — interpret cautiously
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-coach-workload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Coach Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coachWorkload.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No coaches assigned</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  <TableHead className="text-center">Participants</TableHead>
                  <TableHead className="text-center">Unread Messages</TableHead>
                  <TableHead className="text-center">Flagged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coachWorkload.map((coach: any) => (
                  <TableRow key={coach.coachId} data-testid={`row-coach-${coach.coachId}`}>
                    <TableCell className="font-medium">{coach.coachName}</TableCell>
                    <TableCell className="text-center">{coach.participantCount}</TableCell>
                    <TableCell className="text-center">
                      {coach.unreadMessages > 0 ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          {coach.unreadMessages}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {coach.flaggedParticipants > 0 ? (
                        <Badge variant="destructive">{coach.flaggedParticipants}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
