import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useData, MetricType } from '@/lib/dataAdapter';
import { api } from '@/lib/api';
import MetricCard from '@/components/MetricCard';
import MetricEntryModal from '@/components/MetricEntryModal';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Scale, Activity, Droplet, Heart, Ruler, Utensils, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';

export default function Dashboard() {
  const { user, getMetricsByType } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MetricType | null>(null);

  const { data: macroProgress } = useQuery({
    queryKey: ['macro-progress'],
    queryFn: () => api.getMacroProgress(),
  });

  const { data: dashboardStats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.getDashboardStats(),
  });

  const handleAddMetric = (type: MetricType) => {
    setSelectedType(type);
    setModalOpen(true);
  };

  const getLatestMetric = (type: MetricType) => {
    const metrics = getMetricsByType(type);
    if (metrics.length === 0) return null;
    return metrics[0];
  };

  const weight = getLatestMetric('WEIGHT');
  const glucose = getLatestMetric('GLUCOSE');
  const ketones = getLatestMetric('KETONES');
  const bp = getLatestMetric('BP');
  const waist = getLatestMetric('WAIST');

  // Get trend data from API
  const weightTrend = dashboardStats?.trends?.weight;
  const glucoseTrend = dashboardStats?.trends?.glucose;
  const ketonesTrend = dashboardStats?.trends?.ketones;
  const waistTrend = dashboardStats?.trends?.waist;

  // Helper to convert API trend to MetricCard format
  const getTrendDirection = (trend: typeof weightTrend, invertForPositive: boolean = false) => {
    if (!trend || trend.direction === 'neutral') return 'neutral' as const;
    // For weight and waist, "down" is good
    // For ketones, "up" is good
    if (invertForPositive) {
      return trend.direction === 'up' ? 'up' as const : 'down' as const;
    }
    return trend.direction === 'down' ? 'down' as const : 'up' as const;
  };

  // Generate a personalized focus message based on data
  const getFocusMessage = () => {
    if (!dashboardStats) {
      return "Log your first metrics to get personalized recommendations.";
    }

    if (glucoseTrend && glucoseTrend.direction === 'up') {
      return "Your fasting glucose is trending slightly higher. Try to prioritize fiber at your first meal today and get a 10-minute walk in after eating.";
    }

    if (ketonesTrend && ketonesTrend.direction === 'down') {
      return "Your ketone levels have dipped. Consider extending your overnight fast or reducing carb intake to boost ketone production.";
    }

    if (weightTrend && weightTrend.isPositive && weightTrend.value) {
      return `Great progress! You've lost ${weightTrend.value} recently. Keep up the momentum with consistent logging.`;
    }

    if (dashboardStats.streak >= 7) {
      return `Amazing ${dashboardStats.streak}-day streak! Your consistency is paying off. Focus on protein at every meal today.`;
    }

    if (dashboardStats.streak >= 3) {
      return "You're building great habits! Try to hit your protein target today for better energy levels.";
    }

    return "Focus on logging consistently today. Small daily actions lead to big transformations!";
  };

  // Generate streak message
  const getStreakMessage = () => {
    if (statsLoading) return "Loading...";
    if (!dashboardStats) return "Start logging to build your streak!";

    if (dashboardStats.streak === 0) {
      return "Start logging today to begin your streak!";
    }
    if (dashboardStats.streak === 1) {
      return "Great start! Keep logging tomorrow.";
    }
    if (dashboardStats.streak < 7) {
      return `You're on a ${dashboardStats.streak}-day streak!`;
    }
    if (dashboardStats.streak < 30) {
      return `Amazing ${dashboardStats.streak}-day streak!`;
    }
    return `Incredible ${dashboardStats.streak}-day streak!`;
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            Good morning, {user.name.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            {statsLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading your progress...
              </span>
            ) : (
              getStreakMessage()
            )}
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-sm font-medium text-primary">{format(new Date(), 'EEEE, MMMM do')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Weight"
          value={(weight?.valueJson as { value?: number })?.value?.toFixed(1) || '--'}
          unit="lbs"
          type="WEIGHT"
          trend={weightTrend ? getTrendDirection(weightTrend) : undefined}
          trendValue={weightTrend?.value || undefined}
          color="bg-blue-500"
          icon={Scale}
          onAdd={() => handleAddMetric('WEIGHT')}
          lastUpdated={weight ? new Date(weight.timestamp) : undefined}
        />
        <MetricCard
          title="Glucose (Fasting)"
          value={(glucose?.valueJson as { value?: number })?.value?.toFixed(0) || '--'}
          unit="mg/dL"
          type="GLUCOSE"
          trend={glucoseTrend ? getTrendDirection(glucoseTrend) : undefined}
          trendValue={glucoseTrend?.value || undefined}
          color="bg-[#004aad]"
          icon={Droplet}
          onAdd={() => handleAddMetric('GLUCOSE')}
          lastUpdated={glucose ? new Date(glucose.timestamp) : undefined}
        />
        <MetricCard
          title="Ketones"
          value={(ketones?.valueJson as { value?: number })?.value?.toFixed(1) || '--'}
          unit="mmol/L"
          type="KETONES"
          trend={ketonesTrend ? getTrendDirection(ketonesTrend, true) : undefined}
          trendValue={ketonesTrend?.value || undefined}
          color="bg-purple-500"
          icon={Activity}
          onAdd={() => handleAddMetric('KETONES')}
          lastUpdated={ketones ? new Date(ketones.timestamp) : undefined}
        />
        <MetricCard
          title="Blood Pressure"
          value={bp?.valueJson ? `${(bp.valueJson as { systolic?: number; diastolic?: number }).systolic}/${(bp.valueJson as { systolic?: number; diastolic?: number }).diastolic}` : '--/--'}
          unit="mmHg"
          type="BP"
          trend="neutral"
          color="bg-red-500"
          icon={Heart}
          onAdd={() => handleAddMetric('BP')}
          lastUpdated={bp ? new Date(bp.timestamp) : undefined}
        />
        <MetricCard
          title="Waist"
          value={(waist?.valueJson as { value?: number })?.value?.toFixed(1) || '--'}
          unit="in"
          type="WAIST"
          trend={waistTrend ? getTrendDirection(waistTrend) : undefined}
          trendValue={waistTrend?.value || undefined}
          color="bg-indigo-500"
          icon={Ruler}
          onAdd={() => handleAddMetric('WAIST')}
          lastUpdated={waist ? new Date(waist.timestamp) : undefined}
        />
      </div>

      {macroProgress?.target ? (
        <Card className="border-none shadow-md" data-testid="card-macro-progress">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-semibold">Today's Nutrition</h3>
              </div>
              <Link href="/food" className="text-xs text-primary hover:underline" data-testid="link-log-food">
                Log Food
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Protein</span>
                  <span className="font-medium">{macroProgress.consumed.protein}g / {macroProgress.target.protein || 0}g</span>
                </div>
                <Progress value={Math.min(100, macroProgress.target.protein ? (macroProgress.consumed.protein / macroProgress.target.protein) * 100 : 0)} className="h-2" />
                <span className="text-xs text-muted-foreground">{macroProgress.remaining?.protein >= 0 ? `${macroProgress.remaining.protein}g left` : `${Math.abs(macroProgress.remaining?.protein || 0)}g over`}</span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Carbs</span>
                  <span className="font-medium">{macroProgress.consumed.carbs}g / {macroProgress.target.carbs || 0}g</span>
                </div>
                <Progress value={Math.min(100, macroProgress.target.carbs ? (macroProgress.consumed.carbs / macroProgress.target.carbs) * 100 : 0)} className="h-2" />
                <span className="text-xs text-muted-foreground">{macroProgress.remaining?.carbs >= 0 ? `${macroProgress.remaining.carbs}g left` : `${Math.abs(macroProgress.remaining?.carbs || 0)}g over`}</span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Fat</span>
                  <span className="font-medium">{macroProgress.consumed.fat}g / {macroProgress.target.fat || 0}g</span>
                </div>
                <Progress value={Math.min(100, macroProgress.target.fat ? (macroProgress.consumed.fat / macroProgress.target.fat) * 100 : 0)} className="h-2" />
                <span className="text-xs text-muted-foreground">{macroProgress.remaining?.fat >= 0 ? `${macroProgress.remaining.fat}g left` : `${Math.abs(macroProgress.remaining?.fat || 0)}g over`}</span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Calories</span>
                  <span className="font-medium">{macroProgress.consumed.calories} / {macroProgress.target.calories || 0}</span>
                </div>
                <Progress value={Math.min(100, macroProgress.target.calories ? (macroProgress.consumed.calories / macroProgress.target.calories) * 100 : 0)} className="h-2" />
                <span className="text-xs text-muted-foreground">{macroProgress.remaining?.calories >= 0 ? `${macroProgress.remaining.calories} left` : `${Math.abs(macroProgress.remaining?.calories || 0)} over`}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-md border-dashed" data-testid="card-macro-prompt">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Utensils className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-heading font-semibold">Nutrition Tracking</h3>
                <p className="text-sm text-muted-foreground">
                  Your coach will set your daily macro targets. Once set, you'll see your nutrition progress here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested Focus Section */}
      <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/10 rounded-2xl p-6">
        <h3 className="font-heading font-semibold text-lg mb-2 flex items-center gap-2">
          <span className="text-xl">✨</span> Today's Focus
        </h3>
        <p className="text-muted-foreground">
          {getFocusMessage()}
        </p>
      </div>

      <MetricEntryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={selectedType}
      />
    </div>
  );
}
