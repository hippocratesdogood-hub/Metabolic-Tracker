import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Bell, Zap, Clock, Plus, Edit, Trash2, ArrowLeft, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function PromptsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('prompts');
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: prompts = [], isLoading: loadingPrompts } = useQuery({
    queryKey: ['admin-prompts'],
    queryFn: () => api.getPrompts(),
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ['admin-rules'],
    queryFn: () => api.getRules(),
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ['admin-deliveries'],
    queryFn: () => api.getDeliveries(50),
  });

  const createPromptMutation = useMutation({
    mutationFn: (data: any) => api.createPrompt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      toast({ title: 'Success', description: 'Prompt created successfully' });
      setEditingPrompt(null);
      setIsCreating(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updatePrompt(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      toast({ title: 'Success', description: 'Prompt updated successfully' });
      setEditingPrompt(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deletePromptMutation = useMutation({
    mutationFn: (id: string) => api.deletePrompt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      toast({ title: 'Success', description: 'Prompt deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: (data: any) => api.createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rules'] });
      toast({ title: 'Success', description: 'Rule created successfully' });
      setEditingRule(null);
      setIsCreating(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rules'] });
      toast({ title: 'Success', description: 'Rule updated successfully' });
      setEditingRule(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rules'] });
      toast({ title: 'Success', description: 'Rule deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleNewPrompt = () => {
    setIsCreating(true);
    setEditingPrompt({
      key: '',
      name: '',
      category: 'reminder',
      messageTemplate: '',
      channel: 'in_app',
      active: true,
    });
  };

  const handleNewRule = () => {
    setIsCreating(true);
    setEditingRule({
      key: '',
      promptId: '',
      triggerType: 'schedule',
      scheduleJson: {},
      conditionsJson: {},
      cooldownHours: 24,
      priority: 1,
      active: true,
    });
  };

  const handleSavePrompt = () => {
    if (isCreating) {
      createPromptMutation.mutate(editingPrompt);
    } else {
      updatePromptMutation.mutate({ id: editingPrompt.id, data: editingPrompt });
    }
  };

  const handleSaveRule = () => {
    if (isCreating) {
      createRuleMutation.mutate(editingRule);
    } else {
      updateRuleMutation.mutate({ id: editingRule.id, data: editingRule });
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" />
              Prompt Engine Admin
            </h1>
            <p className="text-muted-foreground">Manage automated interventions and reminders.</p>
          </div>
        </div>
        <Button
          onClick={() => activeTab === 'prompts' ? handleNewPrompt() : handleNewRule()}
          data-testid="button-create-new"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New {activeTab === 'prompts' ? 'Prompt' : 'Rule'}
        </Button>
      </div>

      <Tabs defaultValue="prompts" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[500px]">
          <TabsTrigger value="prompts">Prompts ({prompts.length})</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
          <TabsTrigger value="deliveries">Delivery Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="mt-6">
          {loadingPrompts ? (
            <p className="text-muted-foreground">Loading prompts...</p>
          ) : prompts.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground mb-4">No prompts created yet.</p>
              <Button onClick={handleNewPrompt}>Create Your First Prompt</Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {prompts.map((prompt: any) => (
                <Card key={prompt.id} className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{prompt.name}</h3>
                          <Badge variant={prompt.active ? 'default' : 'secondary'} className="text-[10px] h-5">
                            {prompt.active ? 'Active' : 'Draft'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {prompt.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{prompt.key}</p>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{prompt.messageTemplate}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            <Bell className="w-3 h-3 mr-1" />
                            {prompt.channel}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setIsCreating(false); setEditingPrompt(prompt); }}
                          data-testid={`button-edit-prompt-${prompt.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePromptMutation.mutate(prompt.id)}
                          data-testid={`button-delete-prompt-${prompt.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Active Rules</CardTitle>
              <CardDescription>Logic that triggers prompts based on user data.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRules ? (
                <p className="text-muted-foreground">Loading rules...</p>
              ) : rules.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No rules created yet.</p>
                  <Button onClick={handleNewRule}>Create Your First Rule</Button>
                </div>
              ) : (
                <ScrollArea className="h-[600px] w-full pr-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule Key</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Cooldown</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule: any) => (
                        <TableRow key={rule.id} className="group">
                          <TableCell className="font-mono text-xs">{rule.key}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              rule.triggerType === 'schedule' && "bg-blue-50 text-blue-700 border-blue-200",
                              rule.triggerType === 'event' && "bg-purple-50 text-purple-700 border-purple-200",
                              rule.triggerType === 'missed' && "bg-amber-50 text-amber-700 border-amber-200",
                            )}>
                              {rule.triggerType}
                            </Badge>
                          </TableCell>
                          <TableCell>{rule.cooldownHours}h</TableCell>
                          <TableCell className="font-mono">{rule.priority}</TableCell>
                          <TableCell>
                            <Badge variant={rule.active ? 'default' : 'secondary'}>
                              {rule.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setIsCreating(false); setEditingRule(rule); }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteRuleMutation.mutate(rule.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries" className="mt-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Delivery Logs
              </CardTitle>
              <CardDescription>Recent prompt deliveries and their status.</CardDescription>
            </CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No delivery logs yet.</p>
              ) : (
                <ScrollArea className="h-[600px] w-full pr-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User ID</TableHead>
                        <TableHead>Prompt ID</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm">
                            {d.firedAt ? format(new Date(d.firedAt), 'MMM d, h:mm a') : '--'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{d.userId?.slice(0, 8)}...</TableCell>
                          <TableCell className="font-mono text-xs">{d.promptId?.slice(0, 8)}...</TableCell>
                          <TableCell>
                            <Badge variant={d.status === 'sent' ? 'default' : d.status === 'opened' ? 'outline' : 'destructive'}>
                              {d.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingPrompt} onOpenChange={(open) => { if (!open) { setEditingPrompt(null); setIsCreating(false); }}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Create Prompt' : 'Edit Prompt'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={editingPrompt?.key || ''}
                  onChange={(e) => setEditingPrompt((p: any) => ({ ...p, key: e.target.value }))}
                  placeholder="glucose_reminder"
                  data-testid="input-prompt-key"
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingPrompt?.name || ''}
                  onChange={(e) => setEditingPrompt((p: any) => ({ ...p, name: e.target.value }))}
                  placeholder="Glucose Reminder"
                  data-testid="input-prompt-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editingPrompt?.category || ''}
                  onValueChange={(v) => setEditingPrompt((p: any) => ({ ...p, category: v }))}
                >
                  <SelectTrigger data-testid="select-prompt-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="intervention">Intervention</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={editingPrompt?.channel || ''}
                  onValueChange={(v) => setEditingPrompt((p: any) => ({ ...p, channel: v }))}
                >
                  <SelectTrigger data-testid="select-prompt-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">In-App</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Textarea
                value={editingPrompt?.messageTemplate || ''}
                onChange={(e) => setEditingPrompt((p: any) => ({ ...p, messageTemplate: e.target.value }))}
                placeholder="Hi {{name}}, don't forget to check your glucose today!"
                rows={4}
                data-testid="input-prompt-message"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editingPrompt?.active || false}
                onCheckedChange={(v) => setEditingPrompt((p: any) => ({ ...p, active: v }))}
                data-testid="switch-prompt-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingPrompt(null); setIsCreating(false); }}>Cancel</Button>
            <Button onClick={handleSavePrompt} disabled={createPromptMutation.isPending || updatePromptMutation.isPending}>
              {isCreating ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRule} onOpenChange={(open) => { if (!open) { setEditingRule(null); setIsCreating(false); }}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Create Rule' : 'Edit Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={editingRule?.key || ''}
                  onChange={(e) => setEditingRule((r: any) => ({ ...r, key: e.target.value }))}
                  placeholder="morning_glucose_check"
                  data-testid="input-rule-key"
                />
              </div>
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Select
                  value={editingRule?.promptId || ''}
                  onValueChange={(v) => setEditingRule((r: any) => ({ ...r, promptId: v }))}
                >
                  <SelectTrigger data-testid="select-rule-prompt">
                    <SelectValue placeholder="Select prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    {prompts.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Trigger Type</Label>
                <Select
                  value={editingRule?.triggerType || ''}
                  onValueChange={(v) => setEditingRule((r: any) => ({ ...r, triggerType: v }))}
                >
                  <SelectTrigger data-testid="select-rule-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">Schedule</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cooldown (hours)</Label>
                <Input
                  type="number"
                  value={editingRule?.cooldownHours || 24}
                  onChange={(e) => setEditingRule((r: any) => ({ ...r, cooldownHours: parseInt(e.target.value) || 24 }))}
                  data-testid="input-rule-cooldown"
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={editingRule?.priority || 1}
                  onChange={(e) => setEditingRule((r: any) => ({ ...r, priority: parseInt(e.target.value) || 1 }))}
                  data-testid="input-rule-priority"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editingRule?.active || false}
                onCheckedChange={(v) => setEditingRule((r: any) => ({ ...r, active: v }))}
                data-testid="switch-rule-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingRule(null); setIsCreating(false); }}>Cancel</Button>
            <Button onClick={handleSaveRule} disabled={createRuleMutation.isPending || updateRuleMutation.isPending}>
              {isCreating ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
