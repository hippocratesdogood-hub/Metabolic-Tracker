import React, { useState } from 'react';
import { useData, Prompt, PromptRule } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Zap, Clock, AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PromptsAdmin() {
  const { prompts, rules } = useData();
  const [activeTab, setActiveTab] = useState('prompts');

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Prompt Engine Admin
          </h1>
          <p className="text-muted-foreground">Manage automated interventions and reminders.</p>
        </div>
        <Button>
          Create New {activeTab === 'prompts' ? 'Prompt' : 'Rule'}
        </Button>
      </div>

      <Tabs defaultValue="prompts" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="prompts">Prompts ({prompts.length})</TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="mt-6">
          <div className="grid gap-4">
            {prompts.map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Active Rules</CardTitle>
              <CardDescription>Logic that triggers prompts based on user data.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] w-full pr-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => {
                      const relatedPrompt = prompts.find(p => p.key === rule.promptKey);
                      return (
                        <TableRow key={rule.id} className="group cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {rule.active ? (
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-gray-300" />
                              )}
                              <span className="font-mono text-xs">{rule.key}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              rule.trigger_type === 'schedule' && "bg-blue-50 text-blue-700 border-blue-200",
                              rule.trigger_type === 'event' && "bg-purple-50 text-purple-700 border-purple-200",
                              rule.trigger_type === 'missed' && "bg-amber-50 text-amber-700 border-amber-200",
                            )}>
                              {rule.trigger_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded block truncate" title={JSON.stringify(rule.conditions_json, null, 2)}>
                              {JSON.stringify(rule.conditions_json)}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Bell className="w-3 h-3" />
                              {relatedPrompt?.name || rule.promptKey}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {rule.priority}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{prompt.name}</h3>
              <Badge variant={prompt.active ? 'default' : 'secondary'} className="text-[10px] h-5">
                {prompt.active ? 'Active' : 'Draft'}
              </Badge>
              <Badge variant="outline" className={cn(
                "text-[10px] h-5",
                prompt.category === 'intervention' && "border-red-200 text-red-700 bg-red-50",
                prompt.category === 'reminder' && "border-blue-200 text-blue-700 bg-blue-50",
                prompt.category === 'education' && "border-green-200 text-green-700 bg-green-50"
              )}>
                {prompt.category}
              </Badge>
            </div>
            <p className="text-xs font-mono text-muted-foreground">{prompt.key}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="mt-4 bg-muted/30 p-4 rounded-lg border border-border/50">
          <p className="text-sm whitespace-pre-wrap font-medium text-foreground/80">
            {prompt.message_template}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <Bell className="w-3 h-3" /> {prompt.channel}
            </span>
            <span className="flex items-center gap-1">
              <div className="flex gap-1">
                {prompt.variables.map(v => (
                  <code key={v} className="bg-muted px-1 rounded text-primary">{`{{${v}}}`}</code>
                ))}
              </div>
            </span>
          </div>
          <div className="font-mono text-[10px] opacity-50">ID: {prompt.id.split('-')[0]}...</div>
        </div>
      </CardContent>
    </Card>
  );
}
