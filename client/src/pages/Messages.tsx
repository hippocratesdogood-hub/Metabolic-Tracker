import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, User as UserIcon, ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Conversation, Message } from '@shared/schema';

// ── Reusable chat view ──────────────────────────────────────────────

function ChatView({
  conversationId,
  currentUserId,
  headerLabel,
  onBack,
}: {
  conversationId: string;
  currentUserId: string;
  headerLabel: string;
  onBack?: () => void;
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.getMessages(conversationId),
    refetchInterval: 5000,
    enabled: !!conversationId,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.createMessage(conversationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sendMutation.isPending) return;
    sendMutation.mutate(inputText.trim());
    setInputText('');
  };

  return (
    <Card className="flex-1 border-none shadow-md overflow-hidden flex flex-col bg-background/50 backdrop-blur-sm">
      {/* Chat header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <UserIcon className="w-4 h-4" />
        </div>
        <span className="font-medium text-sm truncate">{headerLabel}</span>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-label="Message history"
        aria-live="polite"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg: Message) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}>
                <div className={cn('flex max-w-[80%] md:max-w-[70%] gap-2', isMe ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1',
                      isMe ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'
                    )}
                  >
                    <UserIcon className="w-4 h-4" />
                  </div>

                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2 shadow-sm',
                      isMe
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-white dark:bg-card text-foreground rounded-tl-sm'
                    )}
                  >
                    <p className="text-sm leading-relaxed">{msg.body}</p>
                    <p
                      className={cn(
                        'text-[10px] mt-1 opacity-70 text-right',
                        isMe ? 'text-primary-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {format(new Date(msg.createdAt), 'h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-card border-t border-border">
        <form onSubmit={handleSend} className="flex gap-2" aria-label="Send message">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-background border-input focus-visible:ring-primary"
            aria-label="Message input"
            maxLength={2000}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputText.trim() || sendMutation.isPending}
            className="bg-primary hover:bg-primary/90"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
        {inputText.length > 1800 && (
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {inputText.length}/2000 characters
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Participant view (single conversation with assigned coach) ──────

function ParticipantMessages() {
  const { user } = useAuth();

  // Get or create conversation with assigned coach
  const {
    data: conversation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['conversation', 'my-coach'],
    queryFn: async () => {
      if (!user?.coachId) throw new Error('no-coach');
      return api.createConversation(user.coachId);
    },
    enabled: !!user?.coachId,
    retry: false,
  });

  if (!user?.coachId) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
        <div className="flex-none mb-4">
          <h1 className="text-2xl font-heading font-bold">Messages</h1>
        </div>
        <Card className="flex-1 flex items-center justify-center border-none shadow-md bg-background/50">
          <div className="text-center text-muted-foreground px-6">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No coach assigned yet</p>
            <p className="text-sm mt-1">Your program administrator will assign you a coach.</p>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
        <div className="flex-none mb-4">
          <h1 className="text-2xl font-heading font-bold">Coach Chat</h1>
        </div>
        <Card className="flex-1 flex items-center justify-center border-none shadow-md bg-background/50">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </Card>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
        <div className="flex-none mb-4">
          <h1 className="text-2xl font-heading font-bold">Messages</h1>
        </div>
        <Card className="flex-1 flex items-center justify-center border-none shadow-md bg-background/50">
          <p className="text-muted-foreground">Unable to load conversation. Please try again later.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
      <div className="flex-none mb-4">
        <h1 className="text-2xl font-heading font-bold">Coach Chat</h1>
        <p className="text-muted-foreground">Direct line to your coach.</p>
      </div>
      <ChatView
        conversationId={conversation.id}
        currentUserId={user.id}
        headerLabel="Your Coach"
      />
    </div>
  );
}

// ── Coach / Admin view (conversation list + chat) ───────────────────

function CoachMessages() {
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.getConversations(),
    refetchInterval: 10000,
  });

  // Fetch participants to resolve names
  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => api.getParticipants(),
  });

  const participantMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of participants) {
      map[p.id] = p.name || p.email;
    }
    return map;
  }, [participants]);

  const selectedConversation = conversations.find((c: Conversation) => c.id === selectedConversationId);

  // Auto-select first conversation on desktop
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  if (convsLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
        <div className="flex-none mb-4">
          <h1 className="text-2xl font-heading font-bold">Messages</h1>
        </div>
        <Card className="flex-1 flex items-center justify-center border-none shadow-md bg-background/50">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </Card>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
        <div className="flex-none mb-4">
          <h1 className="text-2xl font-heading font-bold">Messages</h1>
        </div>
        <Card className="flex-1 flex items-center justify-center border-none shadow-md bg-background/50">
          <div className="text-center text-muted-foreground px-6">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No conversations yet</p>
            <p className="text-sm mt-1">Conversations will appear here when participants message you.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
      <div className="flex-none mb-4">
        <h1 className="text-2xl font-heading font-bold">Messages</h1>
        <p className="text-muted-foreground">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Conversation list sidebar */}
        <div
          className={cn(
            'w-full md:w-64 shrink-0 overflow-y-auto rounded-lg border border-border bg-card',
            selectedConversationId ? 'hidden md:block' : 'block'
          )}
        >
          {conversations.map((conv: Conversation) => {
            const name = participantMap[conv.participantId] || 'Participant';
            const isSelected = conv.id === selectedConversationId;
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConversationId(conv.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(conv.createdAt), 'MMM d')}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Chat area */}
        <div className={cn('flex-1 flex flex-col min-h-0', !selectedConversationId ? 'hidden md:flex' : 'flex')}>
          {selectedConversation && user ? (
            <ChatView
              conversationId={selectedConversation.id}
              currentUserId={user.id}
              headerLabel={participantMap[selectedConversation.participantId] || 'Participant'}
              onBack={() => setSelectedConversationId(null)}
            />
          ) : (
            <Card className="flex-1 flex items-center justify-center border-none shadow-md bg-background/50">
              <p className="text-muted-foreground text-sm">Select a conversation</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Default export: route by role ───────────────────────────────────

export default function Messages() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === 'participant') {
    return <ParticipantMessages />;
  }

  return <CoachMessages />;
}
