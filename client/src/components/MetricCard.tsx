import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricType } from '@/lib/dataAdapter';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';

/**
 * Format timestamp with appropriate date context
 * - Today: "8:30 AM"
 * - Yesterday: "Yesterday 8:30 AM"
 * - This week: "Mon 8:30 AM"
 * - Older: "Jan 5, 8:30 AM"
 */
function formatRelativeTimestamp(date: Date): string {
  if (isToday(date)) {
    return format(date, 'h:mm a');
  }
  if (isYesterday(date)) {
    return `Yesterday ${format(date, 'h:mm a')}`;
  }
  const daysAgo = differenceInDays(new Date(), date);
  if (daysAgo < 7) {
    return format(date, 'EEE h:mm a'); // "Mon 8:30 AM"
  }
  return format(date, 'MMM d, h:mm a'); // "Jan 5, 8:30 AM"
}

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  type: MetricType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color: string;
  icon: React.ElementType;
  onAdd: () => void;
  lastUpdated?: Date; // Changed from string to Date
}

export default function MetricCard({
  title,
  value,
  unit,
  type,
  trend,
  trendValue,
  color,
  icon: Icon,
  onAdd,
  lastUpdated
}: MetricCardProps) {
  return (
    <Card className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-card">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn("p-2 rounded-full bg-opacity-10", color)}>
          <Icon className={cn("h-4 w-4", color.replace('bg-', 'text-'))} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-bold tracking-tight">{value}</span>
            <span className="text-sm text-muted-foreground font-medium">{unit}</span>
          </div>
          {trend && (
            <div className={cn(
              "flex items-center text-xs font-medium px-2 py-0.5 rounded-full",
              trend === 'up' ? "text-green-600 bg-green-50" : 
              trend === 'down' ? "text-red-600 bg-red-50" : "text-gray-600 bg-gray-50"
            )}>
              {trend === 'up' ? <TrendingUp className="h-3 w-3 mr-1" /> : 
               trend === 'down' ? <TrendingDown className="h-3 w-3 mr-1" /> : 
               <Minus className="h-3 w-3 mr-1" />}
              {trendValue}
            </div>
          )}
        </div>
        
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `Last: ${formatRelativeTimestamp(lastUpdated)}` : 'No entry today'}
          </p>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary"
            onClick={onAdd}
          >
            <Plus className="h-5 w-5" />
            <span className="sr-only">Add {title}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
