import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FlaskConical, ArrowLeft, Trash2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { format } from 'date-fns';

type FlagSeverity = 'optimal' | 'borderline' | 'abnormal' | 'critical';

const CATEGORY_LABELS: Record<string, string> = {
  metabolic: 'Metabolic',
  lipid: 'Lipid Panel',
  inflammation: 'Inflammation',
  thyroid: 'Thyroid',
  hormones: 'Hormones',
  nutrients: 'Nutrients',
  liver: 'Liver',
  kidney: 'Kidney',
  cbc: 'CBC',
  derived: 'Derived',
};

const CATEGORY_ORDER = [
  'metabolic', 'lipid', 'inflammation', 'thyroid',
  'hormones', 'nutrients', 'liver', 'kidney', 'cbc', 'derived',
];

function severityClasses(severity: FlagSeverity): string {
  switch (severity) {
    case 'optimal':    return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900';
    case 'borderline': return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-900';
    case 'abnormal':   return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900';
    case 'critical':   return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900';
  }
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function LabResultsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [participantId, setParticipantId] = useState<string>('');
  const [biomarkerId, setBiomarkerId] = useState<string>('');
  const [value, setValue] = useState<string>('');
  const [collectedAt, setCollectedAt] = useState<string>(todayIso());
  const [notes, setNotes] = useState<string>('');
  const [lastScored, setLastScored] = useState<{
    biomarkerName: string;
    value: number;
    unit: string;
    label: string;
    severity: FlagSeverity;
    clinicalSummary: string;
  } | null>(null);

  const { data: participants = [] } = useQuery({
    queryKey: ['admin-participants'],
    queryFn: () => api.getParticipants(),
  });

  const { data: biomarkers = [] } = useQuery({
    queryKey: ['admin-biomarkers'],
    queryFn: () => api.getBiomarkers(),
  });

  const { data: labResults = [], isLoading: loadingLabs } = useQuery({
    queryKey: ['admin-lab-results', participantId],
    queryFn: () => api.getParticipantLabResults(participantId),
    enabled: !!participantId,
  });

  const biomarkersByCategory = useMemo(() => {
    const groups = new Map<string, typeof biomarkers>();
    for (const b of biomarkers) {
      const key = b.category;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }
    return CATEGORY_ORDER
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ category: cat, items: groups.get(cat)! }));
  }, [biomarkers]);

  const selectedBiomarker = biomarkers.find((b) => b.id === biomarkerId);

  const createLabResultMutation = useMutation({
    mutationFn: (payload: {
      userId: string;
      biomarkerId: string;
      value: number;
      collectedAt: string;
      notes?: string;
    }) => api.createLabResult(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-lab-results', participantId] });
      toast({ title: 'Saved', description: `${data.biomarker.name} recorded.` });
      setLastScored({
        biomarkerName: data.biomarker.name,
        value: data.result.value,
        unit: data.biomarker.unit,
        label: data.score.label,
        severity: data.score.severity,
        clinicalSummary: data.score.clinicalSummary,
      });
      setValue('');
      setNotes('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteLabResultMutation = useMutation({
    mutationFn: (id: string) => api.deleteLabResult(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-lab-results', participantId] });
      toast({ title: 'Deleted', description: 'Lab result removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    if (!participantId || !biomarkerId || value === '') {
      toast({
        title: 'Missing fields',
        description: 'Select a patient, a biomarker, and enter a value.',
        variant: 'destructive',
      });
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      toast({ title: 'Invalid value', description: 'Value must be a number.', variant: 'destructive' });
      return;
    }
    const collectedAtIso = new Date(`${collectedAt}T00:00:00`).toISOString();
    createLabResultMutation.mutate({
      userId: participantId,
      biomarkerId,
      value: num,
      collectedAt: collectedAtIso,
      notes: notes || undefined,
    });
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2" data-testid="text-page-title">
              <FlaskConical className="w-6 h-6 text-primary" />
              Lab Results
            </h1>
            <p className="text-muted-foreground">Enter patient lab values and see scored interpretation.</p>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Record a lab value</CardTitle>
          <CardDescription>Choose a patient and biomarker, enter the value, and save.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Patient</Label>
              <Select
                value={participantId}
                onValueChange={(v) => { setParticipantId(v); setLastScored(null); }}
              >
                <SelectTrigger data-testid="select-patient">
                  <SelectValue placeholder="Select a patient" />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground">({p.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Biomarker</Label>
              <Select
                value={biomarkerId}
                onValueChange={setBiomarkerId}
              >
                <SelectTrigger data-testid="select-biomarker">
                  <SelectValue placeholder="Select a biomarker" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {biomarkersByCategory.map(({ category, items }) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{CATEGORY_LABELS[category] ?? category}</SelectLabel>
                      {items.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} {b.abbreviation ? `(${b.abbreviation})` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Value{selectedBiomarker ? ` (${selectedBiomarker.unit})` : ''}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 95"
                data-testid="input-value"
              />
            </div>

            <div className="space-y-2">
              <Label>Collection date</Label>
              <Input
                type="date"
                value={collectedAt}
                onChange={(e) => setCollectedAt(e.target.value)}
                data-testid="input-collected-at"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for this value"
              data-testid="input-notes"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={createLabResultMutation.isPending}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {createLabResultMutation.isPending ? 'Saving…' : 'Save lab result'}
            </Button>
          </div>

          {lastScored && (
            <div
              className={cn(
                'rounded-lg border p-4 flex flex-col gap-2',
                severityClasses(lastScored.severity),
              )}
              data-testid="scored-result"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className={cn('border-current', severityClasses(lastScored.severity))}>
                  {lastScored.label}
                </Badge>
                <span className="font-semibold">
                  {lastScored.biomarkerName}: {lastScored.value} {lastScored.unit}
                </span>
              </div>
              <p className="text-sm opacity-90">{lastScored.clinicalSummary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
          <CardDescription>
            {participantId
              ? 'Most recent lab values for the selected patient.'
              : 'Select a patient above to view their lab history.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!participantId ? (
            <p className="text-sm text-muted-foreground">No patient selected.</p>
          ) : loadingLabs ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : labResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lab results on file for this patient yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Biomarker</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labResults.map((row) => (
                  <TableRow key={row.result.id} data-testid={`row-lab-${row.result.id}`}>
                    <TableCell className="font-medium">{row.biomarker.name}</TableCell>
                    <TableCell>
                      {row.result.value} <span className="text-muted-foreground">{row.biomarker.unit}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('border', severityClasses(row.score.severity))}>
                        {row.score.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(row.result.collectedAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete ${row.biomarker.name} result?`)) {
                            deleteLabResultMutation.mutate(row.result.id);
                          }
                        }}
                        disabled={deleteLabResultMutation.isPending}
                        data-testid={`button-delete-${row.result.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
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
