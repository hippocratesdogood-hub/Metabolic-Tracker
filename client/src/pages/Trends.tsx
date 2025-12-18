import React, { useState } from 'react';
import { useData, MetricType } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';

export default function Trends() {
  const { getMetricsByType } = useData();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('WEIGHT');
  const [range, setRange] = useState('30');

  const metrics = getMetricsByType(selectedMetric);
  
  // Process data for charts
  const chartData = metrics
    .filter(m => m.timestamp >= subDays(new Date(), parseInt(range)))
    .map(m => ({
      date: format(m.timestamp, 'MMM d'),
      value: m.value,
    }))
    .reverse();

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
              {selectedMetric === 'WEIGHT' && 'Weight History'}
              {selectedMetric === 'GLUCOSE' && 'Glucose History'}
              {selectedMetric === 'KETONES' && 'Ketone Levels'}
              {selectedMetric === 'WAIST' && 'Waist Circumference'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
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
                    domain={['auto', 'auto']}
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
            </div>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
