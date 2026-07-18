import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Sparkles, User as UserIcon, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// The six queries the sales page promises. These double as onboarding hand-off
// prompts (Onboarding deep-links here with ?q=...).
const SUGGESTED_QUERIES = [
  "Is my protein high enough this week?",
  "Am I losing muscle?",
  "What should I eat before the gym?",
  "Based on my baseline, what should I focus on this week?",
  "How did my first week look, and what's the one thing I should change next week?",
  "Summarize my first month and tell me what to focus on in month 2.",
];

export default function Partner() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const autoSentRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const conversationHistory = updatedMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result = await api.askOptimizationPartner(conversationHistory);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const assistantMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content:
          error?.message ||
          "I hit a snag just now. Please try that again in a moment.",
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Onboarding / weekly-prompt deep link: /partner?q=<question> auto-asks once.
  useEffect(() => {
    if (autoSentRef.current) return;
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    const q = new URLSearchParams(qs).get('q');
    if (q && q.trim()) {
      autoSentRef.current = true;
      sendMessage(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
      <div className="flex-none mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-heading font-bold">Your Optimization Partner</h1>
        </div>
        <p className="text-muted-foreground">Ask anything about your own data — protein, trends, what to focus on next.</p>
      </div>

      <Card className="flex-1 border-none shadow-md overflow-hidden flex flex-col bg-background/50 backdrop-blur-sm">
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          role="log"
          aria-label="Optimization Partner conversation"
          aria-live="polite"
        >
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-heading font-semibold text-lg mb-1">Ask me anything about your journey</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                I look at your logged data — weight, waist, glucose, ketones, blood pressure, and food — to give you answers built on your real numbers.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTED_QUERIES.map((query) => (
                  <button
                    key={query}
                    onClick={() => sendMessage(query)}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors"
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "flex max-w-[85%] md:max-w-[75%] gap-2",
                      isUser ? "flex-row-reverse" : "flex-row"
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                        isUser ? "bg-primary/20 text-primary" : "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                      )}>
                        {isUser ? <UserIcon className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                      </div>

                      <div className={cn(
                        "rounded-2xl px-4 py-3 shadow-sm",
                        isUser
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-white dark:bg-card text-foreground rounded-tl-sm"
                      )}>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex w-full justify-start">
                  <div className="flex max-w-[85%] md:max-w-[75%] gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="rounded-2xl px-4 py-3 shadow-sm bg-white dark:bg-card text-foreground rounded-tl-sm">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Looking at your data...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-card border-t border-border">
          <form onSubmit={handleSubmit} className="flex gap-2" aria-label="Ask your Optimization Partner">
            <Input
              id="partner-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask about your protein, weight, trends..."
              className="flex-1 bg-background border-input focus-visible:ring-primary"
              aria-label="Question for your Optimization Partner"
              maxLength={2000}
              autoComplete="off"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputText.trim() || isLoading}
              className="bg-primary hover:bg-primary/90"
              aria-label="Send question"
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
          {/* Persistent wellness disclaimer (B2/B3) */}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Your Optimization Partner is a wellness and tracking tool — not medical advice, diagnosis, or treatment.
              For anything about your medication or symptoms, talk to your prescribing provider.
            </span>
          </p>
        </div>
      </Card>
    </div>
  );
}
