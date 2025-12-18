import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { MetricType, useData } from '@/lib/dataAdapter';
import { format, subDays, startOfDay, isAfter, isBefore, isToday } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: MetricType | null;
}

const baseSchema = z.object({
  value: z.coerce.number().positive("Value must be positive"),
  unit: z.string(),
  context: z.string().optional(),
});

const bpSchema = z.object({
  systolic: z.coerce.number().min(50).max(300),
  diastolic: z.coerce.number().min(30).max(200),
  unit: z.string(),
});

export default function MetricEntryModal({ isOpen, onClose, type }: MetricEntryModalProps) {
  const { addMetric } = useData();
  const [systolic, setSystolic] = React.useState('');
  const [diastolic, setDiastolic] = React.useState('');
  const [value, setValue] = React.useState('');
  const [context, setContext] = React.useState('fasting');
  const [entryDate, setEntryDate] = React.useState<Date>(new Date());
  
  const minDate = subDays(startOfDay(new Date()), 7);
  const maxDate = new Date();
  const isBackfill = !isToday(entryDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;

    try {
      if (type === 'BP') {
        await addMetric({
          type,
          valueJson: { systolic: Number(systolic), diastolic: Number(diastolic) },
          timestamp: entryDate,
        });
      } else {
        await addMetric({
          type,
          valueJson: { value: Number(value), context: type === 'GLUCOSE' ? context : undefined },
          timestamp: entryDate,
        });
      }
      
      // Reset and close
      setSystolic('');
      setDiastolic('');
      setValue('');
      setEntryDate(new Date());
      onClose();
    } catch (error) {
      console.error('Failed to add metric:', error);
    }
  };

  if (!type) return null;

  const titles: Record<MetricType, string> = {
    BP: 'Log Blood Pressure',
    WAIST: 'Log Waist Circumference',
    GLUCOSE: 'Log Glucose',
    KETONES: 'Log Ketones',
    WEIGHT: 'Log Weight',
  };

  const units: Record<MetricType, string> = {
    BP: 'mmHg',
    WAIST: 'inches',
    GLUCOSE: 'mg/dL',
    KETONES: 'mmol/L',
    WEIGHT: 'lbs',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
          <DialogDescription>
            Enter your reading{isBackfill ? ` for ${format(entryDate, 'MMM d, yyyy')}` : ' for today'}.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start gap-2", isBackfill && "border-amber-500 text-amber-600")} data-testid="button-metric-date">
                  <CalendarIcon className="w-4 h-4" />
                  {isToday(entryDate) ? `Today, ${format(entryDate, 'MMM d')}` : format(entryDate, 'MMM d, yyyy')}
                  {isBackfill && <Clock className="w-3 h-3 ml-auto" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={entryDate}
                  onSelect={(date) => date && setEntryDate(date)}
                  disabled={(date) => isBefore(date, minDate) || isAfter(date, maxDate)}
                  initialFocus
                />
                <div className="p-2 border-t text-xs text-muted-foreground text-center">
                  Backfill entries up to 7 days
                </div>
              </PopoverContent>
            </Popover>
            {isBackfill && (
              <p className="text-xs text-amber-600">Backfilling for a past date</p>
            )}
          </div>
          {type === 'BP' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="systolic">Systolic (Top)</Label>
                <Input 
                  id="systolic" 
                  type="number" 
                  placeholder="120" 
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  required
                  className="text-lg font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="diastolic">Diastolic (Bottom)</Label>
                <Input 
                  id="diastolic" 
                  type="number" 
                  placeholder="80" 
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  required
                  className="text-lg font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="value">Value ({units[type]})</Label>
                <div className="relative">
                  <Input 
                    id="value" 
                    type="number" 
                    step="0.1"
                    placeholder="0.0" 
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    required
                    className="text-2xl font-mono h-14 pl-4"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    {units[type]}
                  </span>
                </div>
              </div>

              {type === 'GLUCOSE' && (
                <div className="space-y-2">
                  <Label>Context</Label>
                  <Select value={context} onValueChange={setContext}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fasting">Fasting (Morning)</SelectItem>
                      <SelectItem value="1hr">1h Post-Meal</SelectItem>
                      <SelectItem value="2hr">2h Post-Meal</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px]">Save Log</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
