import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, Target, ChevronRight, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [editingTargets, setEditingTargets] = useState<MacroTargets | null>(null);

  const { data: participants, isLoading } = useQuery({
    queryKey: ['participants'],
    queryFn: () => api.getParticipants(),
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

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage participants and their nutrition targets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-participants">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Participants
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
                {selectedParticipant.name}'s Macro Targets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTargets ? (
                <p className="text-muted-foreground">Loading targets...</p>
              ) : participantTargets ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Calories</p>
                      <p className="text-2xl font-bold">{participantTargets.calories || '--'}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Protein</p>
                      <p className="text-2xl font-bold">{participantTargets.proteinG || '--'}g</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Carbs</p>
                      <p className="text-2xl font-bold">{participantTargets.carbsG || '--'}g</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Fat</p>
                      <p className="text-2xl font-bold">{participantTargets.fatG || '--'}g</p>
                    </div>
                  </div>
                  <Button onClick={handleEditTargets} className="w-full" data-testid="button-edit-targets">
                    Edit Macro Targets
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-muted-foreground">No macro targets set for this participant.</p>
                  <Button onClick={handleEditTargets} className="w-full" data-testid="button-set-targets">
                    Set Macro Targets
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

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
    </div>
  );
}
