import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type FeelState =
  | 'energized'
  | 'neutral'
  | 'sluggish'
  | 'gut_symptoms'
  | 'brain_fog';

interface FeelStatePickerProps {
  value: FeelState | null;
  onChange: (next: FeelState | null) => Promise<void>;
  disabled?: boolean;
}

const OPTIONS: { value: FeelState; emoji: string; label: string }[] = [
  { value: 'energized', emoji: '⚡', label: 'Energized' },
  { value: 'neutral', emoji: '😐', label: 'Neutral' },
  { value: 'sluggish', emoji: '🥱', label: 'Sluggish' },
  { value: 'gut_symptoms', emoji: '🌀', label: 'Gut symptoms' },
  { value: 'brain_fog', emoji: '🌫️', label: 'Brain fog' },
];

/**
 * Optimistic feel-state toggle row. Selected pill is highlighted; tapping the
 * selected pill clears the tag (null). Optimistic update with revert-on-error.
 */
export default function FeelStatePicker({ value, onChange, disabled }: FeelStatePickerProps) {
  const [optimistic, setOptimistic] = useState<FeelState | null>(value);
  const [pending, setPending] = useState(false);
  // Keep optimistic in sync when the parent value changes (e.g. after refetch)
  // — but only when not pending, to avoid clobbering an in-flight toggle.
  if (!pending && optimistic !== value) {
    setOptimistic(value);
  }

  const handleClick = async (next: FeelState | null) => {
    if (disabled || pending) return;
    const prev = optimistic;
    setOptimistic(next);
    setPending(true);
    try {
      await onChange(next);
    } catch (err: any) {
      setOptimistic(prev);
      toast.error(err?.message || 'Could not save how you felt');
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="How did you feel after this meal?"
      className="flex flex-wrap gap-1.5"
    >
      {OPTIONS.map((opt) => {
        const selected = optimistic === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            disabled={disabled || pending}
            onClick={() => handleClick(selected ? null : opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 min-h-[32px] text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              selected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 hover:bg-muted text-foreground border-transparent',
              (disabled || pending) && 'opacity-60 cursor-not-allowed',
            )}
            data-testid={`pill-feel-${opt.value}`}
          >
            <span aria-hidden className="text-sm leading-none">{opt.emoji}</span>
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
