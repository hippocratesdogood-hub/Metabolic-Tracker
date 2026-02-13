import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Plus, Search, Eye, Pencil, KeyRound, Copy, Check, UserX, Calendar, Target, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Password strength utilities
function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
  level: 'weak' | 'fair' | 'good' | 'strong';
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 12) score++;
  else feedback.push('At least 12 characters');

  if (/[A-Z]/.test(password)) score++;
  else feedback.push('One uppercase letter');

  if (/[a-z]/.test(password)) score++;
  else feedback.push('One lowercase letter');

  if (/[0-9]/.test(password)) score++;
  else feedback.push('One number');

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push('One special character (!@#$%^&*)');

  const level = score <= 2 ? 'weak' : score <= 3 ? 'fair' : score <= 4 ? 'good' : 'strong';
  return { score, feedback, level };
}

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const { score, feedback, level } = checkPasswordStrength(password);

  const colors = {
    weak: 'bg-red-500',
    fair: 'bg-orange-500',
    good: 'bg-yellow-500',
    strong: 'bg-green-500',
  };

  const labels = {
    weak: 'Weak',
    fair: 'Fair',
    good: 'Good',
    strong: 'Strong',
  };

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded',
              i <= score ? colors[level] : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          level === 'weak' && 'text-red-600',
          level === 'fair' && 'text-orange-600',
          level === 'good' && 'text-yellow-600',
          level === 'strong' && 'text-green-600',
        )}>
          {labels[level]}
        </span>
      </div>
      {feedback.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {feedback.map((f, i) => (
            <li key={i} className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function Participants() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [createdParticipant, setCreatedParticipant] = useState<any>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ['participants'],
    queryFn: () => api.getParticipants(),
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ['coaches'],
    queryFn: () => api.getCoaches(),
  });

  const filteredParticipants = participants.filter((p: any) => {
    const searchLower = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(searchLower) ||
      p.email?.toLowerCase().includes(searchLower) ||
      p.phone?.toLowerCase().includes(searchLower)
    );
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createParticipant(data),
    onSuccess: (user, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setCreatedParticipant(user);
      setTempPassword(variables.password);
      setShowAddModal(false);
      setShowSuccessModal(true);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateParticipant(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      toast.success('Participant updated successfully');
      setShowEditModal(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password, forceReset }: { id: string; password: string; forceReset: boolean }) =>
      api.resetParticipantPassword(id, password, forceReset),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      toast.success('Temporary password updated. Participant will reset it at next login.');
      setShowResetModal(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const macroTargetsMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: any }) =>
      api.setParticipantMacroTargets(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-targets'] });
      toast.success('Macro targets saved successfully');
      setShowMacroModal(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCoachName = (coachId: string) => {
    const coach = coaches.find((c: any) => c.id === coachId);
    return coach?.name || '—';
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Admin access required
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2" data-testid="text-page-title">
            <Users className="w-6 h-6 text-primary" />
            Participants
          </h1>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2" data-testid="button-add-participant">
          <Plus className="w-4 h-4" />
          Add Participant
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredParticipants.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            {search ? (
              <>
                <p className="text-lg font-medium mb-2">No matches found</p>
                <p className="text-muted-foreground">Try a different name, email, or phone number.</p>
              </>
            ) : (
              <>
                <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">No participants yet</p>
                <p className="text-muted-foreground mb-4">Add your first participant to start tracking metrics and sending prompts.</p>
                <Button onClick={() => setShowAddModal(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Participant
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredParticipants.map((p: any) => (
                <TableRow key={p.id} data-testid={`row-participant-${p.id}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.dateOfBirth ? format(new Date(p.dateOfBirth), 'MM/dd/yyyy') : '—'}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>{p.phone || '—'}</TableCell>
                  <TableCell>{getCoachName(p.coachId)}</TableCell>
                  <TableCell>{format(new Date(p.createdAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                      {p.status || 'active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <TooltipProvider delayDuration={300}>
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedParticipant(p); setShowViewModal(true); }}
                              data-testid={`button-view-${p.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View profile</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedParticipant(p); setShowEditModal(true); }}
                              data-testid={`button-edit-${p.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit profile</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedParticipant(p); setShowResetModal(true); }}
                              data-testid={`button-reset-${p.id}`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reset password</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedParticipant(p); setShowMacroModal(true); }}
                              data-testid={`button-macros-${p.id}`}
                            >
                              <Target className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Set macro targets</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddParticipantModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        coaches={coaches}
        onSubmit={(data: any) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />

      <ViewParticipantModal
        open={showViewModal}
        onClose={() => setShowViewModal(false)}
        participant={selectedParticipant}
        coaches={coaches}
        onEdit={() => { setShowViewModal(false); setShowEditModal(true); }}
        onResetPassword={() => { setShowViewModal(false); setShowResetModal(true); }}
      />

      <EditParticipantModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        participant={selectedParticipant}
        coaches={coaches}
        onSubmit={(data: any) => updateMutation.mutate({ id: selectedParticipant.id, data })}
        isLoading={updateMutation.isPending}
      />

      <ResetPasswordModal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        participant={selectedParticipant}
        onSubmit={(password: string, forceReset: boolean) => resetPasswordMutation.mutate({ id: selectedParticipant.id, password, forceReset })}
        isLoading={resetPasswordMutation.isPending}
      />

      <SuccessModal
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        participant={createdParticipant}
        tempPassword={tempPassword}
        copied={copied}
        showPassword={showPassword}
        onToggleShow={() => setShowPassword(!showPassword)}
        onCopy={handleCopy}
      />

      <MacroTargetsModal
        open={showMacroModal}
        onClose={() => setShowMacroModal(false)}
        participant={selectedParticipant}
        onSubmit={(data: any) => macroTargetsMutation.mutate({ userId: selectedParticipant?.id, data })}
        isLoading={macroTargetsMutation.isPending}
      />
    </div>
  );
}

function AddParticipantModal({ open, onClose, coaches, onSubmit, isLoading }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [coachId, setCoachId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forceReset, setForceReset] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { level } = checkPasswordStrength(password);
    if (level === 'weak' || level === 'fair') {
      setError('Password is too weak. Please choose a stronger password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    onSubmit({
      name,
      email,
      phone: phone || undefined,
      dateOfBirth: dateOfBirth || undefined,
      coachId: coachId || undefined,
      password,
      forcePasswordReset: forceReset,
    });
  };

  const handleClose = () => {
    setName(''); setEmail(''); setPhone(''); setDateOfBirth('');
    setCoachId(''); setPassword(''); setConfirmPassword('');
    setForceReset(true); setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
          <DialogDescription>
            Create a new participant account and set a temporary password. They'll be required to set a new password at first login.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required data-testid="input-name" />
            <p className="text-xs text-muted-foreground">First and last name.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">Date of birth *</Label>
            <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required data-testid="input-dob" />
            <p className="text-xs text-muted-foreground">Used for identity confirmation and reporting.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-email" />
            <p className="text-xs text-muted-foreground">This will be their login username.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-phone" />
            <p className="text-xs text-muted-foreground">Used for account recovery and optional reminders.</p>
          </div>
          <div className="space-y-2">
            <Label>Assign coach</Label>
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger data-testid="select-coach">
                <SelectValue placeholder="Select a coach (optional)" />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">You can assign a coach now or later.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              Temporary password <span className="text-red-500">*</span>
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
              aria-describedby="password-strength"
              data-testid="input-password"
            />
            <div id="password-strength">
              <PasswordStrengthMeter password={password} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">
              Confirm temporary password <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={confirmPassword !== '' && password !== confirmPassword}
              className={cn(
                confirmPassword !== '' && password !== confirmPassword && "border-red-500"
              )}
              data-testid="input-confirm"
            />
            {confirmPassword !== '' && (
              <p className={cn(
                "text-xs flex items-center gap-1",
                password === confirmPassword ? "text-green-600" : "text-red-500"
              )}>
                {password === confirmPassword ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Passwords match
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    Passwords do not match
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="forceReset" checked={forceReset} onCheckedChange={(c) => setForceReset(!!c)} data-testid="checkbox-force-reset" />
            <Label htmlFor="forceReset" className="text-sm font-normal">Force password reset at first login</Label>
          </div>
          <p className="text-xs text-muted-foreground">Recommended for security.</p>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1" role="alert">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading} data-testid="button-create">
              {isLoading ? 'Creating...' : 'Create Participant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewParticipantModal({ open, onClose, participant, coaches, onEdit, onResetPassword }: any) {
  if (!participant) return null;

  const coach = coaches.find((c: any) => c.id === participant.coachId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{participant.name}</DialogTitle>
          <DialogDescription>
            Participant • Created {format(new Date(participant.createdAt), 'MMM d, yyyy')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">DOB</p>
              <p className="font-medium">{participant.dateOfBirth ? format(new Date(participant.dateOfBirth), 'MM/dd/yyyy') : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{participant.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Phone</p>
              <p className="font-medium">{participant.phone || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Coach</p>
              <p className="font-medium">{coach?.name || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Timezone</p>
              <p className="font-medium">{participant.timezone}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Units</p>
              <p className="font-medium">{participant.unitsPreference}</p>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onResetPassword} className="gap-2">
            <KeyRound className="w-4 h-4" />
            Reset Password
          </Button>
          <Button onClick={onEdit} className="gap-2">
            <Pencil className="w-4 h-4" />
            Edit Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditParticipantModal({ open, onClose, participant, coaches, onSubmit, isLoading }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [coachId, setCoachId] = useState('');
  const [timezone, setTimezone] = useState('');
  const [unitsPreference, setUnitsPreference] = useState('');

  React.useEffect(() => {
    if (participant) {
      setName(participant.name || '');
      setEmail(participant.email || '');
      setPhone(participant.phone || '');
      setDateOfBirth(participant.dateOfBirth ? format(new Date(participant.dateOfBirth), 'yyyy-MM-dd') : '');
      setCoachId(participant.coachId || 'none');
      setTimezone(participant.timezone || '');
      setUnitsPreference(participant.unitsPreference || '');
    }
  }, [participant]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      email,
      phone: phone || null,
      dateOfBirth: dateOfBirth || null,
      coachId: coachId === 'none' ? null : coachId,
      timezone,
      unitsPreference,
    });
  };

  if (!participant) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Participant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-name" />
          </div>
          <div className="space-y-2">
            <Label>Date of birth</Label>
            <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} data-testid="input-edit-dob" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-edit-email" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-edit-phone" />
          </div>
          <div className="space-y-2">
            <Label>Coach</Label>
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger>
                <SelectValue placeholder="Select coach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {coaches.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} data-testid="input-edit-timezone" />
          </div>
          <div className="space-y-2">
            <Label>Units preference</Label>
            <Select value={unitsPreference} onValueChange={setUnitsPreference}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">US</SelectItem>
                <SelectItem value="Metric">Metric</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordModal({ open, onClose, participant, onSubmit, isLoading }: any) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forceReset, setForceReset] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { level } = checkPasswordStrength(password);
    if (level === 'weak' || level === 'fair') {
      setError('Password is too weak. Please choose a stronger password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    onSubmit(password, forceReset);
  };

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setForceReset(true);
    setError('');
    onClose();
  };

  if (!participant) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Temporary Password</DialogTitle>
          <DialogDescription>
            Set a new temporary password for this participant. They will be required to reset it on next login.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-temp-password">
              New temporary password <span className="text-red-500">*</span>
            </Label>
            <Input
              id="new-temp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
              data-testid="input-new-password"
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-temp-password">
              Confirm temporary password <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirm-temp-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-required="true"
              aria-invalid={confirmPassword !== '' && password !== confirmPassword}
              className={cn(
                confirmPassword !== '' && password !== confirmPassword && "border-red-500"
              )}
              data-testid="input-confirm-new-password"
            />
            {confirmPassword !== '' && (
              <p className={cn(
                "text-xs flex items-center gap-1",
                password === confirmPassword ? "text-green-600" : "text-red-500"
              )}>
                {password === confirmPassword ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Passwords match
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    Passwords do not match
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="forceResetNew" checked={forceReset} onCheckedChange={(c) => setForceReset(!!c)} />
            <Label htmlFor="forceResetNew" className="text-sm font-normal">Force password reset at next login</Label>
          </div>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1" role="alert">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SuccessModal({ open, onClose, participant, tempPassword, copied, showPassword, onToggleShow, onCopy }: any) {
  if (!participant) return null;

  const loginDetails = `Email: ${participant.email}\nTemporary Password: ${tempPassword}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <Check className="w-5 h-5" />
            Participant Created
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p>
            <strong>{participant.name}</strong> can now log in with:
          </p>
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email:</span>
              <span className="font-mono font-medium">{participant.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Temporary password:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">
                  {showPassword ? tempPassword : '••••••••••••'}
                </span>
                <Button variant="ghost" size="sm" onClick={onToggleShow}>
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            They will be required to set a new password on first login.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Treat this password like sensitive information. Send it securely.
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onCopy(loginDetails)} className="gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy login details'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MacroTargetsModal({ open, onClose, participant, onSubmit, isLoading }: any) {
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');

  const { data: existingTargets, isLoading: loadingTargets } = useQuery({
    queryKey: ['participant-targets', participant?.id],
    queryFn: () => api.getParticipantMacroTargets(participant.id),
    enabled: open && !!participant?.id,
  });

  React.useEffect(() => {
    if (existingTargets) {
      setCalories(existingTargets.calories?.toString() || '');
      setProtein(existingTargets.proteinG?.toString() || '');
      setCarbs(existingTargets.carbsG?.toString() || '');
      setFat(existingTargets.fatG?.toString() || '');
      setFiber(existingTargets.fiberG?.toString() || '');
    } else if (open) {
      setCalories(''); setProtein(''); setCarbs(''); setFat(''); setFiber('');
    }
  }, [existingTargets, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      calories: calories ? parseInt(calories) : undefined,
      proteinG: protein ? parseInt(protein) : undefined,
      carbsG: carbs ? parseInt(carbs) : undefined,
      fatG: fat ? parseInt(fat) : undefined,
      fiberG: fiber ? parseInt(fiber) : undefined,
    });
  };

  const handleClose = () => {
    setCalories(''); setProtein(''); setCarbs(''); setFat(''); setFiber('');
    onClose();
  };

  if (!participant) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Macro Targets for {participant.name}
          </DialogTitle>
          <DialogDescription>
            Set daily macronutrient targets for this participant. These targets will be used to track their nutrition adherence.
          </DialogDescription>
        </DialogHeader>
        {loadingTargets ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="calories">Calories</Label>
                <Input
                  id="calories"
                  type="number"
                  placeholder="e.g. 1800"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  data-testid="input-calories"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protein">Protein (g)</Label>
                <Input
                  id="protein"
                  type="number"
                  placeholder="e.g. 120"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  data-testid="input-protein"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carbs">Carbs (g)</Label>
                <Input
                  id="carbs"
                  type="number"
                  placeholder="e.g. 100"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  data-testid="input-carbs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fat">Fat (g)</Label>
                <Input
                  id="fat"
                  type="number"
                  placeholder="e.g. 80"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  data-testid="input-fat"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiber">Fiber (g)</Label>
              <Input
                id="fiber"
                type="number"
                placeholder="e.g. 30"
                value={fiber}
                onChange={(e) => setFiber(e.target.value)}
                className="w-1/2"
                data-testid="input-fiber"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave fields empty to skip those targets.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading} data-testid="button-save-macros">
                {isLoading ? 'Saving...' : 'Save Targets'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
