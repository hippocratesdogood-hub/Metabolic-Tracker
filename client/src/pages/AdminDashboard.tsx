import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Users, Target, ChevronRight, Save, Shield, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export default function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [editingTargets, setEditingTargets] = useState<MacroTargets | null>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  const isAdmin = currentUser?.role === 'admin';

  const { data: participants, isLoading } = useQuery({
    queryKey: ['participants'],
    queryFn: () => api.getParticipants(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => api.getAllUsers(),
    enabled: isAdmin,
  });

  const { data: coaches } = useQuery({
    queryKey: ['coaches'],
    queryFn: () => api.getCoaches(),
  });

  const { data: participantTargets, isLoading: loadingTargets } = useQuery({
    queryKey: ['participant-targets', selectedParticipant?.id],
    queryFn: () => api.getParticipantMacroTargets(selectedParticipant.id),
    enabled: !!selectedParticipant,
  });

  const updateTargetsMutation = useMutation({
    mutationFn: (data: MacroTargets) => api.updateMacroTargets(data, selectedParticipant?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-targets', selectedParticipant?.id] });
      toast({ title: 'Success', description: 'Macro targets updated successfully' });
      setEditingTargets(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => api.updateUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['coaches'] });
      toast({ title: 'Success', description: 'User role updated successfully' });
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const assignCoachMutation = useMutation({
    mutationFn: ({ participantId, coachId }: { participantId: string; coachId: string }) => 
      api.assignCoach(participantId, coachId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      toast({ title: 'Success', description: 'Coach assigned successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleEditTargets = () => {
    setEditingTargets(participantTargets || {
      calories: 1800,
      proteinG: 120,
      carbsG: 100,
      fatG: 80,
      fiberG: 30,
    });
  };

  const handleSaveTargets = () => {
    if (editingTargets) {
      updateTargetsMutation.mutate(editingTargets);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700 border-red-200';
      case 'coach': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Manage participants, coaches, and nutrition targets</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/participants">
            <Button variant="outline" data-testid="link-participants-admin">
              Manage Participants
            </Button>
          </Link>
          <Link href="/admin/prompts">
            <Button variant="outline" data-testid="link-prompts-admin">
              Manage Prompts
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="participants" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="participants">Participants</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">All Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="participants" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-participants">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Participants ({participants?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading participants...</p>
                ) : participants?.length === 0 ? (
                  <p className="text-muted-foreground">No participants found</p>
                ) : (
                  <div className="space-y-2">
                    {participants?.map((p: any) => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedParticipant(p)}
                        className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-colors ${
                          selectedParticipant?.id === p.id
                            ? 'bg-primary/10 border border-primary/20'
                            : 'bg-muted/50 hover:bg-muted'
                        }`}
                        data-testid={`participant-row-${p.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold">
                            {p.name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="text-sm text-muted-foreground">{p.email}</p>
                            {p.coachId && coaches && (
                              <p className="text-xs text-primary">
                                Coach: {coaches.find((c: any) => c.id === p.coachId)?.name || 'Assigned'}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedParticipant && (
              <Card data-testid="card-participant-details">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    {selectedParticipant.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isAdmin && (
                    <div className="space-y-3">
                      <Label>Assign Coach</Label>
                      <Select
                        value={selectedParticipant.coachId || ''}
                        onValueChange={(coachId) => {
                          assignCoachMutation.mutate({
                            participantId: selectedParticipant.id,
                            coachId,
                          });
                        }}
                      >
                        <SelectTrigger data-testid="select-coach">
                          <SelectValue placeholder="Select a coach" />
                        </SelectTrigger>
                        <SelectContent>
                          {coaches?.map((coach: any) => (
                            <SelectItem key={coach.id} value={coach.id}>
                              {coach.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Macro Targets</h4>
                    {loadingTargets ? (
                      <p className="text-muted-foreground">Loading targets...</p>
                    ) : participantTargets ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground">Calories</p>
                            <p className="text-xl font-bold">{participantTargets.calories || '--'}</p>
                          </div>
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground">Protein</p>
                            <p className="text-xl font-bold">{participantTargets.proteinG || '--'}g</p>
                          </div>
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground">Carbs</p>
                            <p className="text-xl font-bold">{participantTargets.carbsG || '--'}g</p>
                          </div>
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground">Fat</p>
                            <p className="text-xl font-bold">{participantTargets.fatG || '--'}g</p>
                          </div>
                        </div>
                        <Button onClick={handleEditTargets} className="w-full" data-testid="button-edit-targets">
                          Edit Macro Targets
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-muted-foreground">No macro targets set.</p>
                        <Button onClick={handleEditTargets} className="w-full" data-testid="button-set-targets">
                          Set Macro Targets
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users" className="mt-6">
            <Card data-testid="card-all-users">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="w-5 h-5 text-primary" />
                  User Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {allUsers?.map((u: any) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                      data-testid={`user-row-${u.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold">
                          {u.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={getRoleBadgeColor(u.role)}>
                          {u.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingUser(u)}
                          data-testid={`button-edit-user-${u.id}`}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!editingTargets} onOpenChange={(open) => !open && setEditingTargets(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Macro Targets for {selectedParticipant?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="calories">Daily Calories</Label>
                <Input
                  id="calories"
                  type="number"
                  value={editingTargets?.calories || ''}
                  onChange={(e) => setEditingTargets(prev => prev ? { ...prev, calories: parseInt(e.target.value) || 0 } : null)}
                  data-testid="input-calories"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protein">Protein (g)</Label>
                <Input
                  id="protein"
                  type="number"
                  value={editingTargets?.proteinG || ''}
                  onChange={(e) => setEditingTargets(prev => prev ? { ...prev, proteinG: parseInt(e.target.value) || 0 } : null)}
                  data-testid="input-protein"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carbs">Carbs (g)</Label>
                <Input
                  id="carbs"
                  type="number"
                  value={editingTargets?.carbsG || ''}
                  onChange={(e) => setEditingTargets(prev => prev ? { ...prev, carbsG: parseInt(e.target.value) || 0 } : null)}
                  data-testid="input-carbs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fat">Fat (g)</Label>
                <Input
                  id="fat"
                  type="number"
                  value={editingTargets?.fatG || ''}
                  onChange={(e) => setEditingTargets(prev => prev ? { ...prev, fatG: parseInt(e.target.value) || 0 } : null)}
                  data-testid="input-fat"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiber">Fiber (g)</Label>
              <Input
                id="fiber"
                type="number"
                value={editingTargets?.fiberG || ''}
                onChange={(e) => setEditingTargets(prev => prev ? { ...prev, fiberG: parseInt(e.target.value) || 0 } : null)}
                data-testid="input-fiber"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTargets(null)}>Cancel</Button>
            <Button onClick={handleSaveTargets} disabled={updateTargetsMutation.isPending} data-testid="button-save-targets">
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="font-medium">{editingUser?.name}</p>
              <p className="text-sm text-muted-foreground">{editingUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editingUser?.role || ''}
                onValueChange={(role) => setEditingUser((prev: any) => prev ? { ...prev, role } : null)}
              >
                <SelectTrigger data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="participant">Participant</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button
              onClick={() => updateRoleMutation.mutate({ userId: editingUser.id, role: editingUser.role })}
              disabled={updateRoleMutation.isPending}
              data-testid="button-save-role"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
