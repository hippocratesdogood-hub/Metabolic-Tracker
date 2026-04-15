import { useState, useEffect, useMemo } from "react";
import { Bell, AlertCircle, Info, Lightbulb } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type InboxItem = Awaited<ReturnType<typeof api.getPromptInbox>>[number];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function categoryIcon(category: InboxItem["category"]) {
  switch (category) {
    case "intervention":
      return <AlertCircle className="w-4 h-4 text-amber-600" />;
    case "education":
      return <Lightbulb className="w-4 h-4 text-blue-600" />;
    default:
      return <Info className="w-4 h-4 text-muted-foreground" />;
  }
}

export function InboxBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["prompt-inbox"],
    queryFn: () => api.getPromptInbox(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markOpened = useMutation({
    mutationFn: (id: string) => api.markPromptDeliveryOpened(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-inbox"] });
    },
  });

  const unreadIds = useMemo(
    () => items.filter((i) => i.status === "sent").map((i) => i.id),
    [items]
  );
  const unreadCount = unreadIds.length;

  // Auto-mark all visible "sent" items as opened once the popover is opened.
  useEffect(() => {
    if (!open || unreadIds.length === 0) return;
    unreadIds.forEach((id) => markOpened.mutate(id));
    // mutate dependency intentionally omitted — we only want to fire on open transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 max-h-[420px] overflow-hidden flex flex-col"
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {items.length} recent
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Coaching messages will appear here as you log your metrics.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "px-4 py-3 transition-colors",
                    item.status === "sent" && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      {categoryIcon(item.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {item.promptName}
                        </p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {relativeTime(item.firedAt)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 mt-1 leading-snug">
                        {item.renderedMessage}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
