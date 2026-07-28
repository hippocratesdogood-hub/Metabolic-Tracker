import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Check, ClipboardCheck, Pencil } from 'lucide-react';
import { api } from '@/lib/api';

const FLAG_LABELS: Record<string, string> = {
  bf_low: 'Body fat implausibly low — likely mismeasurement',
  bf_high: "Body fat above the formula's reliable range — likely mismeasurement",
  calories_low: 'Calorie target below the clinical floor',
  fat_low: 'Fat below 40 g — approaching essential fatty acid concerns',
  protein_high: 'Protein above 250 g — implausible for this population',
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  very: 'Very active',
};

interface QueueRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  sex: 'male' | 'female';
  heightIn: number;
  weightLb: number;
  waistIn: number;
  neckIn: number;
  hipIn: number | null;
  activityLevel: string;
  bodyFatPct: number;
  lbmLb: number;
  calculatedProteinG: number;
  calculatedCarbsG: number;
  calculatedFatG: number;
  calculatedCalories: number;
  flags: string[];
  createdAt: string;
}

/**
 * Review queue for member-run macro calculations (spec §8). Rendered on the
 * Participants page; renders nothing while the queue is empty. Flagged rows
 * arrive first from the server.
 */
export default function MacroReviewQueue() {
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState<QueueRow | null>(null);

  const { data: queue } = useQuery<QueueRow[]>({
    queryKey: ['macro-review-queue'],
    queryFn: () => api.getMacroReviewQueue(),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.reviewMacroCalculation>[1] }) =>
      api.reviewMacroCalculation(id, data),
    onSuccess: (_result, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['macro-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['participant-targets'] });
      toast.success(data.action === 'adjust' ? 'Target adjusted and approved' : 'Target approved');
      setAdjusting(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Review failed'),
  });

  if (!queue || queue.length === 0) return null;

  return (
    <Card className="border-primary/30" data-testid="card-macro-review-queue">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          Macro targets awaiting review
          <Badge variant="secondary">{queue.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {queue.map((row) => (
          <div
            key={row.id}
            className="rounded-lg border border-border p-4 space-y-2"
            data-testid={`row-macro-review-${row.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.userName}</span>
              <span className="text-xs text-muted-foreground">{row.userEmail}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                Calculated {format(new Date(row.createdAt), 'MMM d, yyyy h:mm a')}
              </span>
            </div>

            {row.flags.length > 0 && (
              <div className="space-y-1">
                {row.flags.map((flag) => (
                  <p key={flag} className="flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {FLAG_LABELS[flag] || flag}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><strong>{row.calculatedProteinG}g</strong> protein</span>
              <span><strong>{row.calculatedCarbsG}g</strong> net carbs</span>
              <span><strong>{row.calculatedFatG}g</strong> fat</span>
              <span><strong>{row.calculatedCalories.toLocaleString()}</strong> calories</span>
            </div>

            <p className="text-xs text-muted-foreground">
              From: {row.sex === 'female' ? 'female' : 'male'}, {Math.round(row.heightIn)}&quot; tall,{' '}
              {Math.round(row.weightLb)} lb, waist {row.waistIn}&quot;, neck {row.neckIn}&quot;
              {row.hipIn != null ? `, hip ${row.hipIn}"` : ''},{' '}
              {ACTIVITY_LABELS[row.activityLevel] || row.activityLevel} · est. body fat {row.bodyFatPct}% ·
              lean mass {Math.round(row.lbmLb)} lb
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => reviewMutation.mutate({ id: row.id, data: { action: 'approve' } })}
                disabled={reviewMutation.isPending}
                data-testid={`button-approve-${row.id}`}
              >
                <Check className="w-4 h-4 mr-1.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdjusting(row)}
                disabled={reviewMutation.isPending}
                data-testid={`button-adjust-${row.id}`}
              >
                <Pencil className="w-4 h-4 mr-1.5" /> Adjust
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <AdjustDialog
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onSubmit={(values) => adjusting && reviewMutation.mutate({ id: adjusting.id, data: { action: 'adjust', ...values } })}
        isLoading={reviewMutation.isPending}
      />
    </Card>
  );
}

function AdjustDialog({
  row,
  onClose,
  onSubmit,
  isLoading,
}: {
  row: QueueRow | null;
  onClose: () => void;
  onSubmit: (values: { calories: number; proteinG: number; carbsG: number; fatG: number }) => void;
  isLoading: boolean;
}) {
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [calories, setCalories] = useState('');

  // Prefill from the calculated values each time a row is opened
  React.useEffect(() => {
    if (row) {
      setProtein(String(row.calculatedProteinG));
      setCarbs(String(row.calculatedCarbsG));
      setFat(String(row.calculatedFatG));
      setCalories(String(row.calculatedCalories));
    }
  }, [row]);

  const valid = [protein, carbs, fat, calories].every((v) => v !== '' && Number.isFinite(Number(v)));

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust target for {row.userName}</DialogTitle>
          <DialogDescription>
            The calculated values stay on record; the member's live target becomes what you save here.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              proteinG: parseInt(protein),
              carbsG: parseInt(carbs),
              fatG: parseInt(fat),
              calories: parseInt(calories),
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adjust-protein">Protein (g)</Label>
              <Input id="adjust-protein" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-carbs">Net carbs (g)</Label>
              <Input id="adjust-carbs" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-fat">Fat (g)</Label>
              <Input id="adjust-fat" type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-calories">Calories</Label>
              <Input id="adjust-calories" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || isLoading} data-testid="button-save-adjustment">
              {isLoading ? 'Saving...' : 'Adjust & Approve'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
