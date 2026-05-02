import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { FlaskConical, ArrowLeft, Trash2, Save, Upload, Loader2, AlertTriangle } from 'lucide-react';
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

type ConfidenceLevel = 'high' | 'medium' | 'low';

function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

function confidenceClasses(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':   return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900';
    case 'medium': return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-900';
    case 'low':    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900';
  }
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

type ExtractedRow = {
  biomarkerId: string;
  biomarkerSlug: string;
  biomarkerName: string;
  value: number;
  unit: string;
  confidence: number;
  rawText: string;
};

type ReviewRow = ExtractedRow & {
  include: boolean;
  editedValue: string;
  notes: string;
};

type SavedScoreCard = {
  biomarkerName: string;
  value: number;
  unit: string;
  label: string;
  severity: FlagSeverity;
  clinicalSummary: string;
};

type PdfState =
  | { kind: 'idle' }
  | { kind: 'extracting' }
  | {
      kind: 'review';
      labSource: string;
      collectedAt: string;
      mixedDates: boolean;
      rows: ReviewRow[];
      unmatched: Array<{ rawName: string; rawValue: string }>;
    }
  | { kind: 'saving' }
  | {
      kind: 'success';
      saved: SavedScoreCard[];
      failed: Array<{ biomarkerId: string; error: string }>;
    };

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

  const [pdfState, setPdfState] = useState<PdfState>({ kind: 'idle' });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: config } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
    staleTime: 5 * 60 * 1000,
  });
  const pdfExtractionEnabled = config?.pdfExtractionEnabled ?? false;

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

  const resetPdfFlow = () => {
    setPdfState({ kind: 'idle' });
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExtract = async () => {
    if (!participantId) {
      toast({
        title: 'Select a patient',
        description: 'Choose a patient before uploading a PDF.',
        variant: 'destructive',
      });
      return;
    }
    if (!pdfFile) {
      toast({ title: 'No PDF selected', description: 'Choose a lab PDF first.', variant: 'destructive' });
      return;
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
      toast({
        title: 'File too large',
        description: 'PDFs must be under 10 MB.',
        variant: 'destructive',
      });
      return;
    }

    setPdfState({ kind: 'extracting' });
    try {
      const data = await api.extractLabPdf(pdfFile, participantId);
      const rows: ReviewRow[] = data.extracted.map((row) => ({
        ...row,
        // Default include behavior: high & medium confidence checked, low unchecked
        include: confidenceLevel(row.confidence) !== 'low',
        editedValue: String(row.value),
        notes: '',
      }));
      const collectedFallback = data.collectedAt ?? todayIso();
      setPdfState({
        kind: 'review',
        labSource: data.labSource,
        collectedAt: collectedFallback,
        mixedDates: data.mixedDates,
        rows,
        unmatched: data.unmatched,
      });
    } catch (err: any) {
      toast({
        title: 'Extraction failed',
        description: err?.message ?? 'PDF extraction failed. Try again or enter values manually.',
        variant: 'destructive',
      });
      setPdfState({ kind: 'idle' });
    }
  };

  const updateReviewRow = (index: number, patch: Partial<ReviewRow>) => {
    setPdfState((prev) => {
      if (prev.kind !== 'review') return prev;
      const next = prev.rows.slice();
      next[index] = { ...next[index], ...patch };
      return { ...prev, rows: next };
    });
  };

  const handleConfirm = async () => {
    if (pdfState.kind !== 'review') return;

    if (pdfState.mixedDates) {
      toast({
        title: 'Mixed collection dates detected',
        description:
          'This PDF contains values drawn on multiple dates. Pick a single date for this submission and re-upload separately for the others.',
        variant: 'destructive',
      });
    }

    const checked = pdfState.rows.filter((r) => r.include);
    if (checked.length === 0) {
      toast({
        title: 'Nothing to save',
        description: 'Check at least one biomarker to confirm.',
        variant: 'destructive',
      });
      return;
    }

    const payloadResults: Array<{ biomarkerId: string; value: number; notes?: string }> = [];
    for (const row of checked) {
      const num = Number(row.editedValue);
      if (!Number.isFinite(num)) {
        toast({
          title: 'Invalid value',
          description: `${row.biomarkerName} has a non-numeric value.`,
          variant: 'destructive',
        });
        return;
      }
      payloadResults.push({
        biomarkerId: row.biomarkerId,
        value: num,
        notes: row.notes || undefined,
      });
    }

    const collectedAtIso = new Date(`${pdfState.collectedAt}T00:00:00`).toISOString();

    const reviewSnapshot = pdfState; // capture before transition
    setPdfState({ kind: 'saving' });
    try {
      const data = await api.confirmLabPdfResults({
        userId: participantId,
        collectedAt: collectedAtIso,
        results: payloadResults,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-lab-results', participantId] });

      const savedCards: SavedScoreCard[] = data.saved.map((s) => ({
        biomarkerName: s.biomarker.name,
        value: s.result.value,
        unit: s.biomarker.unit,
        label: s.score.label,
        severity: s.score.severity,
        clinicalSummary: s.score.clinicalSummary,
      }));

      setPdfState({
        kind: 'success',
        saved: savedCards,
        failed: data.failed,
      });

      if (data.failed.length > 0) {
        toast({
          title: 'Some values failed to save',
          description: `${data.saved.length} saved, ${data.failed.length} failed.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Saved',
          description: `${data.saved.length} lab values recorded.`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Failed to save lab results.',
        variant: 'destructive',
      });
      // Restore review state so staff can retry without losing edits
      setPdfState(reviewSnapshot);
    }
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
          <CardDescription>
            Pick a patient, then enter values manually or upload a lab PDF for AI-assisted extraction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Patient</Label>
            <Select
              value={participantId}
              onValueChange={(v) => {
                setParticipantId(v);
                setLastScored(null);
                resetPdfFlow();
              }}
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

          <Tabs defaultValue="manual" className="w-full">
            {pdfExtractionEnabled && (
              <TabsList className="grid grid-cols-2 w-full md:w-auto">
                <TabsTrigger value="manual" data-testid="tab-manual">Manual entry</TabsTrigger>
                <TabsTrigger value="pdf" data-testid="tab-pdf">Upload PDF</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="manual" className="space-y-4 pt-4">
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
            </TabsContent>

            {pdfExtractionEnabled && (
            <TabsContent value="pdf" className="space-y-4 pt-4" data-testid="tab-pdf-content">
              {pdfState.kind === 'idle' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Lab PDF</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                      data-testid="input-pdf"
                    />
                    <p className="text-xs text-muted-foreground">
                      Labcorp, Quest, or Vibrant report. Max 10 MB. The file is processed in memory and discarded after extraction — only the values you confirm get saved.
                    </p>
                    {!participantId && (
                      <p className="text-xs text-orange-700 dark:text-orange-400">
                        Select a patient above before extracting.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleExtract}
                      disabled={!participantId || !pdfFile}
                      data-testid="button-extract"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Extract values
                    </Button>
                  </div>
                </div>
              )}

              {pdfState.kind === 'extracting' && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Analyzing lab PDF…</p>
                  <p className="text-xs">This usually takes 10–30 seconds.</p>
                </div>
              )}

              {pdfState.kind === 'review' && (
                <div className="space-y-4" data-testid="pdf-review">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-1">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lab source</Label>
                      <p className="text-sm font-medium" data-testid="pdf-lab-source">{pdfState.labSource}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Collection date</Label>
                      <Input
                        type="date"
                        value={pdfState.collectedAt}
                        onChange={(e) =>
                          setPdfState((prev) =>
                            prev.kind === 'review' ? { ...prev, collectedAt: e.target.value } : prev
                          )
                        }
                        data-testid="input-pdf-collected-at"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Extracted</Label>
                      <p className="text-sm font-medium">
                        {pdfState.rows.filter((r) => r.include).length} of {pdfState.rows.length} selected
                      </p>
                    </div>
                  </div>

                  {pdfState.mixedDates && (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900 p-3 flex gap-2 items-start">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-700 dark:text-yellow-300 shrink-0" />
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        Mixed collection dates detected on this PDF. Pick a single date for this submission and re-upload separately for biomarkers drawn on other dates.
                      </p>
                    </div>
                  )}

                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Save</TableHead>
                          <TableHead>Biomarker</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pdfState.rows.map((row, idx) => {
                          const level = confidenceLevel(row.confidence);
                          return (
                            <TableRow key={`${row.biomarkerId}-${idx}`} data-testid={`pdf-row-${row.biomarkerSlug}`}>
                              <TableCell>
                                <Checkbox
                                  checked={row.include}
                                  onCheckedChange={(checked) =>
                                    updateReviewRow(idx, { include: Boolean(checked) })
                                  }
                                  data-testid={`pdf-include-${row.biomarkerSlug}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{row.biomarkerName}</div>
                                {row.rawText && (
                                  <div className="text-xs text-muted-foreground truncate max-w-[240px]" title={row.rawText}>
                                    {row.rawText}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  value={row.editedValue}
                                  onChange={(e) => updateReviewRow(idx, { editedValue: e.target.value })}
                                  className="w-28"
                                  data-testid={`pdf-value-${row.biomarkerSlug}`}
                                />
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{row.unit}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn('border', confidenceClasses(level))}
                                  data-testid={`pdf-confidence-${row.biomarkerSlug}`}
                                >
                                  {level === 'high' && 'High'}
                                  {level === 'medium' && 'Medium'}
                                  {level === 'low' && 'Low — verify'}
                                  <span className="ml-1 opacity-70">{Math.round(row.confidence * 100)}%</span>
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={row.notes}
                                  onChange={(e) => updateReviewRow(idx, { notes: e.target.value })}
                                  placeholder="Optional"
                                  className="w-40"
                                  data-testid={`pdf-notes-${row.biomarkerSlug}`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {pdfState.unmatched.length > 0 && (
                    <div className="rounded-lg border p-3 space-y-2 bg-muted/30" data-testid="pdf-unmatched">
                      <p className="text-sm font-medium">
                        Unmatched biomarkers ({pdfState.unmatched.length})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        These appeared on the PDF but don't map to any biomarker in our reference list. They won't be saved. Add them manually if needed.
                      </p>
                      <ul className="text-xs space-y-1">
                        {pdfState.unmatched.map((u, i) => (
                          <li key={i} className="text-muted-foreground">
                            <span className="font-medium text-foreground">{u.rawName}</span>: {u.rawValue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetPdfFlow} data-testid="button-discard">
                      Discard
                    </Button>
                    <Button
                      onClick={handleConfirm}
                      data-testid="button-confirm"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Confirm and save {pdfState.rows.filter((r) => r.include).length} value{pdfState.rows.filter((r) => r.include).length === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
              )}

              {pdfState.kind === 'saving' && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Saving lab values…</p>
                </div>
              )}

              {pdfState.kind === 'success' && (
                <div className="space-y-3" data-testid="pdf-success">
                  <p className="text-sm font-medium">
                    Saved {pdfState.saved.length} value{pdfState.saved.length === 1 ? '' : 's'}.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pdfState.saved.map((s, i) => (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border p-3 flex flex-col gap-1',
                          severityClasses(s.severity),
                        )}
                        data-testid={`pdf-saved-${i}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn('border-current', severityClasses(s.severity))}>
                            {s.label}
                          </Badge>
                          <span className="font-semibold text-sm">
                            {s.biomarkerName}: {s.value} {s.unit}
                          </span>
                        </div>
                        <p className="text-xs opacity-90">{s.clinicalSummary}</p>
                      </div>
                    ))}
                  </div>

                  {pdfState.failed.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 space-y-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        Failed to save {pdfState.failed.length}:
                      </p>
                      <ul className="text-xs space-y-1 text-red-700 dark:text-red-300">
                        {pdfState.failed.map((f, i) => (
                          <li key={i}>
                            <span className="font-mono">{f.biomarkerId.slice(0, 8)}…</span> — {f.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button variant="outline" onClick={resetPdfFlow} data-testid="button-save-another">
                      Upload another PDF
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            )}
          </Tabs>
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
