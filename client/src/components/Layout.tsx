import React from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, TrendingUp, Utensils, MessageSquare, FileText, User, Shield, Calculator, Sparkles, BarChart3 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  // Fullscreen pages (no layout)
  if (location === '/login' || location === '/onboarding') {
    return <div className="min-h-screen bg-background text-foreground font-sans">{children}</div>;
  }

  const isAdminOrCoach = user?.role === 'admin' || user?.role === 'coach';
  const isParticipant = user?.role === 'participant';

  const navItems = [
    ...(isParticipant ? [
      { href: '/', label: 'Today', icon: LayoutDashboard },
      { href: '/trends', label: 'Trends', icon: TrendingUp },
      { href: '/food', label: 'Food', icon: Utensils },
      { href: '/metabolic-age', label: 'Met Age', icon: Calculator },
      { href: '/messages', label: 'Coach', icon: MessageSquare },
      { href: '/reports', label: 'Reports', icon: FileText },
    ] : []),
    ...(isAdminOrCoach ? [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/participants', label: 'Participants', icon: User },
      { href: '/admin/prompts', label: 'Prompts', icon: Shield },
      { href: '/admin/ai-reports', label: 'AI Reports', icon: Sparkles },
      { href: '/messages', label: 'Messages', icon: MessageSquare },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-foreground">
      {/* Mobile Header */}
      <header className="md:hidden h-14 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-1.5">
          <span className="font-heading font-bold text-lg">Metabolic</span>
          <span className="inline-flex items-center justify-center bg-[#F07D1A] text-white font-heading font-bold text-xs px-1.5 py-0.5 rounded-md leading-none">OS</span>
        </div>
        <Link href="/login">
          <Button variant="ghost" size="icon" className="rounded-full">
            <User className="w-5 h-5 text-muted-foreground" />
          </Button>
        </Link>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
        <div className="p-6 flex items-center gap-2">
          <h1 className="font-heading font-bold text-xl leading-none">Metabolic</h1>
          <span className="inline-flex items-center justify-center bg-[#F07D1A] text-white font-heading font-bold text-sm px-2 py-0.5 rounded-md leading-none">OS</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group cursor-pointer",
                  isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}>
                  <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div 
            onClick={logout}
            className="flex items-center gap-3 px-2 py-2 cursor-pointer hover:bg-sidebar-accent rounded-lg transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold text-xs">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">Log out</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 relative">
        <div className="max-w-4xl mx-auto p-4 md:p-8 animate-in fade-in duration-500">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border h-16 flex items-center justify-around z-50 pb-safe">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 pt-1 cursor-pointer",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
