import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

type Step = 'consent' | 'profile' | 'complete';

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('consent');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [units, setUnits] = useState('US');

  // Pre-populate name from user profile
  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  const handleNext = async () => {
    if (step === 'consent' && agreed) {
      // Record AI consent when user agrees to terms
      try {
        await api.acceptAiConsent();
        await refreshUser();
      } catch {
        // Non-blocking — consent will be prompted again in FoodLog if needed
      }
      setStep('profile');
    } else if (step === 'profile' && name) {
      // Save profile data before showing completion
      setSaving(true);
      setError('');
      try {
        await api.updateUser(user!.id, {
          name,
          unitsPreference: units as 'US' | 'Metric',
        });
        await refreshUser();
        setStep('complete');
      } catch (err: any) {
        setError(err.message || 'Failed to save profile. Please try again.');
      } finally {
        setSaving(false);
      }
    }
    else if (step === 'complete') setLocation('/');
  };

  const handleBack = () => {
    if (step === 'profile') setStep('consent');
    if (step === 'complete') setStep('profile');
  };

  // Redirect to login if not authenticated
  if (!user) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
       {/* Progress Dots */}
       <div className="flex gap-2 mb-8">
        {['consent', 'profile', 'complete'].map((s, i) => (
          <div
            key={s}
            className={cn(
              "w-3 h-3 rounded-full transition-colors duration-300",
              ['consent', 'profile', 'complete'].indexOf(step) >= i
                ? "bg-primary"
                : "bg-muted"
            )}
          />
        ))}
      </div>

      <Card className="w-full max-w-lg border-none shadow-xl bg-card">
        {/* Step 1: Consent */}
        {step === 'consent' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader>
              <CardTitle>First, a few agreements</CardTitle>
              <CardDescription>Please review our privacy and safety policy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground space-y-3 h-56 overflow-y-auto border border-border">
                <p><strong>1. Not Medical Advice:</strong> This application is for health tracking purposes only. It does not replace professional medical advice, diagnosis, or treatment. Always consult your healthcare provider with questions about your health.</p>
                <p><strong>2. Data Privacy & AI Processing:</strong> Your data is encrypted and shared only with your assigned coach. Food descriptions and photos you log may be analyzed by a third-party AI service (OpenAI) to estimate nutritional content. This data is sent securely but is processed externally. No personal identifiers are included in AI requests.</p>
                <p><strong>3. AI-Powered Features:</strong> This app uses AI to analyze your meals and estimate macronutrient content. By agreeing below, you consent to your food log data being processed by OpenAI's API for nutritional analysis. You may decline AI analysis at any time and enter nutritional data manually.</p>
                <p><strong>4. Emergency:</strong> If you are experiencing a medical emergency, call 911 immediately. This app is not designed for emergency situations.</p>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="terms" checked={agreed} onCheckedChange={(c) => setAgreed(c as boolean)} />
                <Label htmlFor="terms" className="font-medium cursor-pointer">I have read and agree to the terms above.</Label>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button onClick={handleNext} disabled={!agreed} className="w-full sm:w-auto">
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </div>
        )}

        {/* Step 2: Profile */}
        {step === 'profile' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader>
              <CardTitle>Tell us about you</CardTitle>
              <CardDescription>Confirm your name and set your preferred units.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Unit Preference</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div
                    onClick={() => setUnits('US')}
                    className={cn(
                      "cursor-pointer border rounded-lg p-4 text-center transition-all hover:border-primary",
                      units === 'US' ? "border-primary bg-primary/5 text-primary" : "border-border"
                    )}
                  >
                    <div className="font-bold">US</div>
                    <div className="text-xs text-muted-foreground mt-1">lbs, in, mg/dL</div>
                  </div>
                  <div
                    onClick={() => setUnits('Metric')}
                    className={cn(
                      "cursor-pointer border rounded-lg p-4 text-center transition-all hover:border-primary",
                      units === 'Metric' ? "border-primary bg-primary/5 text-primary" : "border-border"
                    )}
                  >
                    <div className="font-bold">Metric</div>
                    <div className="text-xs text-muted-foreground mt-1">kg, cm, mmol/L</div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Your coach has been assigned by your program administrator.
              </p>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="ghost" onClick={handleBack} disabled={saving}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button onClick={handleNext} disabled={!name || saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardFooter>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 'complete' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center py-8">
            <CardContent className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-heading font-bold">You're All Set!</h2>
              <p className="text-muted-foreground max-w-xs mx-auto">
                Your profile is ready. Your program starts today. Let's make some magic happen.
              </p>
            </CardContent>
            <CardFooter className="justify-center">
              <Button onClick={handleNext} className="w-full max-w-xs bg-primary hover:bg-primary/90 text-lg py-6">
                Go to Dashboard
              </Button>
            </CardFooter>
          </div>
        )}
      </Card>
    </div>
  );
}
