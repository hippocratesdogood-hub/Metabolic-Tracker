import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UserPen } from 'lucide-react';
import { format } from 'date-fns';

interface CoachEditedBadgeProps {
  /** ID of the user who edited the entry */
  editedBy?: string | null;
  /** Timestamp when the edit was made */
  editedAt?: Date | string | null;
  /** ID of the entry owner */
  ownerId: string;
  /** Show only if edited by someone other than the owner (coach/admin) */
  showOnlyForCoachEdits?: boolean;
}

/**
 * Badge component to indicate when an entry was edited by a coach or admin.
 *
 * Product Decision: "Allow coach edits with full audit logging, add UI indicator
 * showing 'Coach-edited' for entries modified by someone other than the owner."
 *
 * Usage:
 * ```tsx
 * <CoachEditedBadge
 *   editedBy={entry.editedBy}
 *   editedAt={entry.editedAt}
 *   ownerId={entry.userId}
 * />
 * ```
 */
export function CoachEditedBadge({
  editedBy,
  editedAt,
  ownerId,
  showOnlyForCoachEdits = true
}: CoachEditedBadgeProps) {
  // Don't show if not edited
  if (!editedBy || !editedAt) return null;

  // Only show for coach/admin edits (not owner's own edits)
  if (showOnlyForCoachEdits && editedBy === ownerId) return null;

  const editDate = typeof editedAt === 'string' ? new Date(editedAt) : editedAt;
  const formattedDate = format(editDate, 'MMM d, yyyy h:mm a');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="gap-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200"
          >
            <UserPen className="h-3 w-3" />
            Coach-edited
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Edited by coach on {formattedDate}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Utility function to check if an entry was edited by a coach (not the owner)
 */
export function wasEditedByCoach(
  entry: { editedBy?: string | null; userId: string }
): boolean {
  return !!entry.editedBy && entry.editedBy !== entry.userId;
}

/**
 * Utility function to check if an entry has been edited at all
 */
export function wasEdited(
  entry: { editedBy?: string | null; editedAt?: Date | string | null }
): boolean {
  return !!entry.editedBy && !!entry.editedAt;
}

export default CoachEditedBadge;
