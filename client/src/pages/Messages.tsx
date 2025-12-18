import React, { useState, useRef, useEffect } from 'react';
import { useData } from '@/lib/dataAdapter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function Messages() {
  const { messages, addMessage, user } = useData();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    addMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)]">
      <div className="flex-none mb-4">
        <h1 className="text-2xl font-heading font-bold">Coach Chat</h1>
        <p className="text-muted-foreground">Direct line to {user.coachName}.</p>
      </div>

      <Card className="flex-1 border-none shadow-md overflow-hidden flex flex-col bg-background/50 backdrop-blur-sm">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isMe = msg.sender === 'user';
            return (
              <div key={msg.id} className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "flex max-w-[80%] md:max-w-[70%] gap-2",
                  isMe ? "flex-row-reverse" : "flex-row"
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                    isMe ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"
                  )}>
                    {isMe ? <UserIcon className="w-4 h-4" /> : <span className="text-xs font-bold">Dr</span>}
                  </div>
                  
                  <div className={cn(
                    "rounded-2xl px-4 py-2 shadow-sm",
                    isMe 
                      ? "bg-primary text-primary-foreground rounded-tr-sm" 
                      : "bg-white dark:bg-card text-foreground rounded-tl-sm"
                  )}>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className={cn(
                      "text-[10px] mt-1 opacity-70 text-right",
                      isMe ? "text-primary-foreground" : "text-muted-foreground"
                    )}>
                      {format(msg.timestamp, 'h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-card border-t border-border">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..." 
              className="flex-1 bg-background border-input focus-visible:ring-primary"
            />
            <Button type="submit" size="icon" disabled={!inputText.trim()} className="bg-primary hover:bg-primary/90">
              <Send className="w-5 h-5" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
