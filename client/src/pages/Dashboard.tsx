import React, { useState } from 'react';
import { useData, MetricType } from '@/lib/mockData';
import MetricCard from '@/components/MetricCard';
import MetricEntryModal from '@/components/MetricEntryModal';
import { Scale, Activity, Droplet, Heart, Ruler } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user, getMetricsByType } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MetricType | null>(null);

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
          value={weight?.value.toFixed(1) || '--'}
          unit="lbs"
          type="WEIGHT"
          trend="down"
          trendValue="1.2 lbs"
          color="bg-blue-500"
          icon={Scale}
          onAdd={() => handleAddMetric('WEIGHT')}
          lastUpdated={weight ? format(weight.timestamp, 'h:mm a') : undefined}
        />
        <MetricCard
          title="Glucose (Fasting)"
          value={glucose?.value.toFixed(0) || '--'}
          unit="mg/dL"
          type="GLUCOSE"
          trend="neutral"
          trendValue="stable"
          color="bg-teal-500"
          icon={Droplet}
          onAdd={() => handleAddMetric('GLUCOSE')}
          lastUpdated={glucose ? format(glucose.timestamp, 'h:mm a') : undefined}
        />
        <MetricCard
          title="Ketones"
          value={ketones?.value.toFixed(1) || '--'}
          unit="mmol/L"
          type="KETONES"
          trend="up"
          trendValue="0.4"
          color="bg-purple-500"
          icon={Activity}
          onAdd={() => handleAddMetric('KETONES')}
          lastUpdated={ketones ? format(ketones.timestamp, 'h:mm a') : undefined}
        />
        <MetricCard
          title="Blood Pressure"
          value={bp ? `${bp.valueRaw.systolic}/${bp.valueRaw.diastolic}` : '--/--'}
          unit="mmHg"
          type="BP"
          trend="neutral"
          color="bg-red-500"
          icon={Heart}
          onAdd={() => handleAddMetric('BP')}
          lastUpdated={bp ? format(bp.timestamp, 'h:mm a') : undefined}
        />
        <MetricCard
          title="Waist"
          value={waist?.value.toFixed(1) || '--'}
          unit="in"
          type="WAIST"
          trend="down"
          trendValue="0.5 in"
          color="bg-indigo-500"
          icon={Ruler}
          onAdd={() => handleAddMetric('WAIST')}
          lastUpdated={waist ? format(waist.timestamp, 'h:mm a') : undefined}
        />
      </div>

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
