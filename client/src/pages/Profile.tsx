import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => api.getUser(user!.id),
    enabled: !!user?.id,
  });

  // Form state — initialized from the fetched record once it loads.
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [unitsPreference, setUnitsPreference] = useState<'US' | 'Metric'>('US');

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setPhone(profile.phone || '');
      setTimezone(profile.timezone || 'America/Los_Angeles');
      setUnitsPreference((profile.unitsPreference as 'US' | 'Metric') || 'US');
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateUser(user!.id, {
        name,
        phone: phone || null,
        timezone,
        unitsPreference,
      }),
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['user', user?.id] });
      toast.success('Profile updated');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update profile');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">My Profile</h1>
        <p className="text-muted-foreground text-sm">Update your contact details and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your email is used to sign in and can only be changed by your administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-profile-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile?.email || ''} disabled readOnly data-testid="input-profile-email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                data-testid="input-profile-phone"
              />
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <TimezoneSelect value={timezone} onChange={setTimezone} data-testid="select-profile-timezone" />
              <p className="text-xs text-muted-foreground">Controls when your scheduled reminders arrive.</p>
            </div>

            <div className="space-y-2">
              <Label>Unit preference</Label>
              <div className="grid grid-cols-2 gap-4">
                <div
                  onClick={() => setUnitsPreference('US')}
                  className={cn(
                    'cursor-pointer border rounded-lg p-4 text-center transition-all hover:border-primary',
                    unitsPreference === 'US' ? 'border-primary bg-primary/5 text-primary' : 'border-border'
                  )}
                  data-testid="units-us"
                >
                  <div className="font-bold">US</div>
                  <div className="text-xs text-muted-foreground mt-1">lbs, in, mg/dL</div>
                </div>
                <div
                  onClick={() => setUnitsPreference('Metric')}
                  className={cn(
                    'cursor-pointer border rounded-lg p-4 text-center transition-all hover:border-primary',
                    unitsPreference === 'Metric' ? 'border-primary bg-primary/5 text-primary' : 'border-border'
                  )}
                  data-testid="units-metric"
                >
                  <div className="font-bold">Metric</div>
                  <div className="text-xs text-muted-foreground mt-1">kg, cm, mmol/L</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-profile">
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
