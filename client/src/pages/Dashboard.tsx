import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useData, MetricType } from '@/lib/dataAdapter';
import { api } from '@/lib/api';
import MetricCard from '@/components/MetricCard';
import MetricEntryModal from '@/components/MetricEntryModal';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Scale, Activity, Droplet, Heart, Ruler, Utensils } from 'lucide-react';
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

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            Good morning, {user.name.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            Let's make today magical. You're on a 14-day streak!
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-sm font-medium text-primary">{format(new Date(), 'EEEE, MMMM do')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Weight"
          value={weight?.valueJson?.value?.toFixed(1) || '--'}
          unit="lbs"
          type="WEIGHT"
          trend="down"
          trendValue="1.2 lbs"
          color="bg-blue-500"
          icon={Scale}
          onAdd={() => handleAddMetric('WEIGHT')}
          lastUpdated={weight ? format(new Date(weight.timestamp), 'h:mm a') : undefined}
        />
        <MetricCard
          title="Glucose (Fasting)"
          value={glucose?.valueJson?.value?.toFixed(0) || '--'}
          unit="mg/dL"
          type="GLUCOSE"
          trend="neutral"
          trendValue="stable"
          color="bg-teal-500"
          icon={Droplet}
          onAdd={() => handleAddMetric('GLUCOSE')}
          lastUpdated={glucose ? format(new Date(glucose.timestamp), 'h:mm a') : undefined}
        />
        <MetricCard
          title="Ketones"
          value={ketones?.valueJson?.value?.toFixed(1) || '--'}
          unit="mmol/L"
          type="KETONES"
          trend="up"
          trendValue="0.4"
          color="bg-purple-500"
          icon={Activity}
          onAdd={() => handleAddMetric('KETONES')}
          lastUpdated={ketones ? format(new Date(ketones.timestamp), 'h:mm a') : undefined}
        />
        <MetricCard
          title="Blood Pressure"
          value={bp?.valueJson ? `${bp.valueJson.systolic}/${bp.valueJson.diastolic}` : '--/--'}
          unit="mmHg"
          type="BP"
          trend="neutral"
          color="bg-red-500"
          icon={Heart}
          onAdd={() => handleAddMetric('BP')}
          lastUpdated={bp ? format(new Date(bp.timestamp), 'h:mm a') : undefined}
        />
        <MetricCard
          title="Waist"
          value={waist?.valueJson?.value?.toFixed(1) || '--'}
          unit="in"
          type="WAIST"
          trend="down"
          trendValue="0.5 in"
          color="bg-indigo-500"
          icon={Ruler}
          onAdd={() => handleAddMetric('WAIST')}
          lastUpdated={waist ? format(new Date(waist.timestamp), 'h:mm a') : undefined}
        />
      </div>

      {macroProgress?.target && (
        <Card className="border-none shadow-md" data-testid="card-macro-progress">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-semibold">Today's Nutrition</h3>
              </div>
              <Link href="/food" className="text-xs text-primary hover:underline">
                Log Food
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Protein</span>
                  <span className="font-medium">{macroProgress.consumed.protein}g / {macroProgress.target.protein || 0}g</span>
                </div>
                <Progress value={macroProgress.target.protein ? (macroProgress.consumed.protein / macroProgress.target.protein) * 100 : 0} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Carbs</span>
                  <span className="font-medium">{macroProgress.consumed.carbs}g / {macroProgress.target.carbs || 0}g</span>
                </div>
                <Progress value={macroProgress.target.carbs ? (macroProgress.consumed.carbs / macroProgress.target.carbs) * 100 : 0} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Fat</span>
                  <span className="font-medium">{macroProgress.consumed.fat}g / {macroProgress.target.fat || 0}g</span>
                </div>
                <Progress value={macroProgress.target.fat ? (macroProgress.consumed.fat / macroProgress.target.fat) * 100 : 0} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Calories</span>
                  <span className="font-medium">{macroProgress.consumed.calories} / {macroProgress.target.calories || 0}</span>
                </div>
                <Progress value={macroProgress.target.calories ? (macroProgress.consumed.calories / macroProgress.target.calories) * 100 : 0} className="h-2" />
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
          Your fasting glucose is trending slightly higher. Try to prioritize fiber at your first meal today and get a 10-minute walk in after eating.
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
