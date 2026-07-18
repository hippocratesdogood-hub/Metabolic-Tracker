import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, ArrowLeft, Sparkles, Loader2, Scale, Ruler, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Step = 'consent' | 'baseline' | 'firstMeal' | 'complete';
const STEPS: Step[] = ['consent', 'baseline', 'firstMeal', 'complete'];

const FIRST_QUESTION = 'Based on my baseline, what should I focus on this week?';

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('consent');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [agreed, setAgreed] = useState(false);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [meal, setMeal] = useState('');

  const units = (user?.unitsPreference ?? 'US');
  const weightUnit = units === 'Metric' ? 'kg' : 'lbs';
  const waistUnit = units === 'Metric' ? 'cm' : 'in';

  useEffect(() => {
    // Guard: onboarding is only reachable authenticated (ProtectedRoute redirect).
    if (user === null) setLocation('/login');
  }, [user, setLocation]);

  const goConsent = async () => {
    try {
      await api.acceptAiConsent();
      await refreshUser();
    } catch {
      // Non-blocking — AI consent is re-prompted in Food Log if needed.
    }
    setStep('baseline');
  };

  const goBaseline = async () => {
    setError('');
    if (!weight) {
      setError('Please enter your current weight to set your baseline.');
      return;
    }
    setSaving(true);
    try {
      await api.createMetricEntry({
        type: 'WEIGHT',
        valueJson: { value: Number(weight) },
        rawUnit: weightUnit,
      });
      if (waist) {
        await api.createMetricEntry({
          type: 'WAIST',
          valueJson: { value: Number(waist) },
          rawUnit: waistUnit,
        });
      }
      setStep('firstMeal');
    } catch (err: any) {
      setError(err.message || 'Could not save your baseline. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const goFirstMeal = async (skip: boolean) => {
    setError('');
    setSaving(true);
    try {
      if (!skip && meal.trim()) {
        await api.createFoodEntry({
          inputType: 'text',
          mealType: 'Breakfast',
          rawText: meal.trim(),
        });
      }
      setStep('complete');
    } catch (err: any) {
      setError(err.message || 'Could not save your meal. You can add it later.');
      setStep('complete');
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await api.completeOnboarding();
      await refreshUser();
    } catch {
      // Best-effort — even if this fails the partner still opens.
    } finally {
      setSaving(false);
      setLocation(`/partner?q=${encodeURIComponent(FIRST_QUESTION)}`);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* Progress Dots */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              'w-3 h-3 rounded-full transition-colors duration-300',
              STEPS.indexOf(step) >= i ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>

      <Card className="w-full max-w-lg border-none shadow-xl bg-card">
        {/* Step 1: Consent */}
        {step === 'consent' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader>
              <CardTitle>Welcome — first, a few agreements</CardTitle>
              <CardDescription>Please review before we set up your baseline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground space-y-3 h-56 overflow-y-auto border border-border">
                <p><strong>1. A wellness &amp; tracking tool — not medical advice:</strong> Metabolic-Tracker and your Optimization Partner help you track and optimize your habits. They do not provide medical advice, diagnosis, or treatment, and do not replace your prescribing provider. Always consult your provider about your medication and any medical questions.</p>
                <p><strong>2. Data Privacy &amp; AI Processing:</strong> Your data is encrypted. Food descriptions and photos you log may be sent to third-party nutrition analysis services (including automated and AI-assisted tools) to estimate nutritional content. No personal identifiers are included in these requests.</p>
                <p><strong>3. Your Optimization Partner:</strong> An AI wellness guide that answers questions grounded in your own logged data. It will never advise on medication dosing or timing — those belong with your prescribing provider.</p>
                <p><strong>4. Emergency:</strong> If you are experiencing a medical emergency, call 911 immediately. This app is not designed for emergency situations.</p>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="terms" checked={agreed} onCheckedChange={(c) => setAgreed(c as boolean)} />
                <Label htmlFor="terms" className="font-medium cursor-pointer">I have read and agree to the terms above.</Label>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={goConsent} disabled={!agreed} className="w-full sm:w-auto">
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </div>
        )}

        {/* Step 2: Baseline */}
        {step === 'baseline' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader>
              <CardTitle>Set your baseline</CardTitle>
              <CardDescription>These first numbers are what your Partner measures your progress against.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="weight" className="flex items-center gap-1.5"><Scale className="w-4 h-4" /> Current weight ({weightUnit})</Label>
                <Input id="weight" type="number" inputMode="decimal" placeholder={units === 'Metric' ? 'e.g. 96' : 'e.g. 212'} value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="waist" className="flex items-center gap-1.5"><Ruler className="w-4 h-4" /> Waist ({waistUnit}) <span className="text-xs text-muted-foreground">— optional</span></Label>
                <Input id="waist" type="number" inputMode="decimal" placeholder={units === 'Metric' ? 'e.g. 102' : 'e.g. 40'} value={waist} onChange={(e) => setWaist(e.target.value)} />
              </div>
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Glucose, ketones &amp; blood pressure</p>
                Add these from your dashboard when your home devices arrive — your Partner will fold them in automatically.
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('consent')} disabled={saving}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button onClick={goBaseline} disabled={!weight || saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <>Next <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>
            </CardFooter>
          </div>
        )}

        {/* Step 3: First meal */}
        {step === 'firstMeal' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Utensils className="w-5 h-5" /> Log your first meal</CardTitle>
              <CardDescription>Just describe something you ate recently — this teaches your Partner about your protein.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                id="meal"
                placeholder="e.g. 3 eggs, spinach, and a coffee"
                value={meal}
                onChange={(e) => setMeal(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">You can log meals in detail later from the Food tab — this is just to get started.</p>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="ghost" onClick={() => goFirstMeal(true)} disabled={saving}>
                Skip for now
              </Button>
              <Button onClick={() => goFirstMeal(false)} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <>Next <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>
            </CardFooter>
          </div>
        )}

        {/* Step 4: Complete -> open Partner */}
        {step === 'complete' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center py-8">
            <CardContent className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
                <Sparkles className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-heading font-bold">Your baseline is set!</h2>
              <p className="text-muted-foreground max-w-xs mx-auto">
                Meet your Optimization Partner. It'll look at what you just logged and tell you what to focus on this week.
              </p>
            </CardContent>
            <CardFooter className="justify-center">
              <Button onClick={finish} disabled={saving} className="w-full max-w-xs bg-primary hover:bg-primary/90 text-lg py-6">
                {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Opening...</> : <>Meet your Partner <ArrowRight className="w-5 h-5 ml-2" /></>}
              </Button>
            </CardFooter>
          </div>
        )}
      </Card>

      {/* Persistent wellness disclaimer (B3) */}
      <p className="mt-6 max-w-lg text-center text-[11px] leading-snug text-muted-foreground">
        Metabolic-Tracker is a wellness and tracking tool — not medical advice, diagnosis, or treatment.
        For anything about your medication or symptoms, consult your prescribing provider.
      </p>
    </div>
  );
}
