/**
 * Feedback Collection Service
 *
 * Collects and manages user feedback during the pilot:
 * - Bug reports
 * - Feature requests
 * - General feedback
 * - NPS and satisfaction scores
 */

import { logAuditEvent } from "./auditLogger";

// ============================================================================
// TYPES
// ============================================================================

export interface FeedbackEntry {
  id: string;
  createdAt: Date;
  userId: string;
  userRole: "participant" | "coach" | "admin";
  type: "bug" | "feature_request" | "suggestion" | "praise" | "complaint" | "general";
  content: string;
  rating?: number; // 1-5 stars
  npsScore?: number; // 0-10
  context?: {
    page?: string;
    feature?: string;
    userAgent?: string;
  };
  status: "new" | "reviewed" | "actioned" | "declined";
  response?: string;
  tags: string[];
}

export interface FeedbackSummary {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  avgRating: number;
  avgNps: number;
  npsBreakdown: {
    promoters: number; // 9-10
    passives: number; // 7-8
    detractors: number; // 0-6
    score: number; // NPS score
  };
  recentFeedback: FeedbackEntry[];
  topTags: Array<{ tag: string; count: number }>;
}

// ============================================================================
// FEEDBACK SERVICE
// ============================================================================

class FeedbackService {
  private feedback: Map<string, FeedbackEntry> = new Map();
  private feedbackCounter = 0;

  /**
   * Generate a unique feedback ID
   */
  private generateFeedbackId(): string {
    this.feedbackCounter++;
    return `FB-${Date.now()}-${String(this.feedbackCounter).padStart(4, "0")}`;
  }

  /**
   * Submit feedback
   */
  async submitFeedback(params: {
    userId: string;
    userRole: "participant" | "coach" | "admin";
    type: FeedbackEntry["type"];
    content: string;
    rating?: number;
    npsScore?: number;
    context?: FeedbackEntry["context"];
    tags?: string[];
  }): Promise<FeedbackEntry> {
    const id = this.generateFeedbackId();

    // Auto-generate tags from content
    const autoTags = this.extractTags(params.content, params.type);
    const tags = Array.from(new Set([...(params.tags || []), ...autoTags]));

    const entry: FeedbackEntry = {
      id,
      createdAt: new Date(),
      userId: params.userId,
      userRole: params.userRole,
      type: params.type,
      content: params.content,
      rating: params.rating,
      npsScore: params.npsScore,
      context: params.context,
      status: "new",
      tags,
    };

    this.feedback.set(id, entry);

    // Log for persistence
    await logAuditEvent(
      "DATA_CREATE" as any,
      "SUCCESS",
      "metric_entry" as any,
      {
        user: { id: params.userId, role: params.userRole },
        resourceId: id,
        metadata: {
          feedbackType: params.type,
          rating: params.rating,
          npsScore: params.npsScore,
          tags,
        },
      }
    );

    console.log(`[Feedback] New ${params.type} feedback: ${id}`);

    return entry;
  }

  /**
   * Extract tags from feedback content
   */
  private extractTags(content: string, type: FeedbackEntry["type"]): string[] {
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // Feature tags
    if (lowerContent.includes("login") || lowerContent.includes("sign in")) {
      tags.push("login");
    }
    if (lowerContent.includes("chart") || lowerContent.includes("graph")) {
      tags.push("charts");
    }
    if (lowerContent.includes("food") || lowerContent.includes("meal")) {
      tags.push("food-logging");
    }
    if (lowerContent.includes("glucose") || lowerContent.includes("blood sugar")) {
      tags.push("glucose");
    }
    if (lowerContent.includes("message") || lowerContent.includes("coach")) {
      tags.push("messaging");
    }
    if (lowerContent.includes("mobile") || lowerContent.includes("phone")) {
      tags.push("mobile");
    }
    if (lowerContent.includes("slow") || lowerContent.includes("fast") || lowerContent.includes("speed")) {
      tags.push("performance");
    }
    if (lowerContent.includes("confus") || lowerContent.includes("unclear") || lowerContent.includes("hard to")) {
      tags.push("usability");
    }

    // Sentiment tags
    if (lowerContent.includes("love") || lowerContent.includes("great") || lowerContent.includes("awesome")) {
      tags.push("positive");
    }
    if (lowerContent.includes("hate") || lowerContent.includes("terrible") || lowerContent.includes("awful")) {
      tags.push("negative");
    }

    return tags;
  }

  /**
   * Get feedback by ID
   */
  getFeedback(feedbackId: string): FeedbackEntry | null {
    return this.feedback.get(feedbackId) || null;
  }

  /**
   * Get all feedback with optional filters
   */
  getAllFeedback(filters?: {
    type?: FeedbackEntry["type"];
    status?: FeedbackEntry["status"];
    userId?: string;
    userRole?: string;
    tag?: string;
    since?: Date;
  }): FeedbackEntry[] {
    let entries = Array.from(this.feedback.values());

    if (filters) {
      if (filters.type) {
        entries = entries.filter((e) => e.type === filters.type);
      }
      if (filters.status) {
        entries = entries.filter((e) => e.status === filters.status);
      }
      if (filters.userId) {
        entries = entries.filter((e) => e.userId === filters.userId);
      }
      if (filters.userRole) {
        entries = entries.filter((e) => e.userRole === filters.userRole);
      }
      if (filters.tag) {
        const tagFilter = filters.tag;
        entries = entries.filter((e) => e.tags.includes(tagFilter));
      }
      if (filters.since) {
        const sinceFilter = filters.since;
        entries = entries.filter((e) => e.createdAt >= sinceFilter);
      }
    }

    // Sort by date, newest first
    entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return entries;
  }

  /**
   * Update feedback status
   */
  async updateFeedbackStatus(
    feedbackId: string,
    status: FeedbackEntry["status"],
    response?: string,
    updatedBy?: string
  ): Promise<FeedbackEntry | null> {
    const entry = this.feedback.get(feedbackId);
    if (!entry) return null;

    entry.status = status;
    if (response) {
      entry.response = response;
    }

    await logAuditEvent(
      "DATA_UPDATE" as any,
      "SUCCESS",
      "metric_entry" as any,
      {
        user: { id: updatedBy || "system", role: "admin" },
        resourceId: feedbackId,
        metadata: { feedbackAction: "status_updated", newStatus: status },
      }
    );

    return entry;
  }

  /**
   * Add tags to feedback
   */
  addTags(feedbackId: string, tags: string[]): FeedbackEntry | null {
    const entry = this.feedback.get(feedbackId);
    if (!entry) return null;

    entry.tags = Array.from(new Set([...entry.tags, ...tags]));
    return entry;
  }

  /**
   * Get feedback summary and statistics
   */
  getSummary(since?: Date): FeedbackSummary {
    let entries = Array.from(this.feedback.values());

    if (since) {
      entries = entries.filter((e) => e.createdAt >= since);
    }

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    let totalRating = 0;
    let ratingCount = 0;
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let npsCount = 0;

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;

      for (const tag of entry.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      if (entry.rating !== undefined) {
        totalRating += entry.rating;
        ratingCount++;
      }

      if (entry.npsScore !== undefined) {
        npsCount++;
        if (entry.npsScore >= 9) {
          promoters++;
        } else if (entry.npsScore >= 7) {
          passives++;
        } else {
          detractors++;
        }
      }
    }

    // Calculate NPS score
    const npsScore = npsCount > 0
      ? Math.round(((promoters - detractors) / npsCount) * 100)
      : 0;

    // Sort tags by count
    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: entries.length,
      byType,
      byStatus,
      avgRating: ratingCount > 0 ? Math.round((totalRating / ratingCount) * 10) / 10 : 0,
      avgNps: npsCount > 0 ? Math.round((entries.reduce((sum, e) => sum + (e.npsScore || 0), 0) / npsCount) * 10) / 10 : 0,
      npsBreakdown: {
        promoters,
        passives,
        detractors,
        score: npsScore,
      },
      recentFeedback: entries.slice(0, 10),
      topTags,
    };
  }

  /**
   * Get feature request summary for product planning
   */
  getFeatureRequests(): Array<{
    description: string;
    count: number;
    userRoles: string[];
    firstRequested: Date;
  }> {
    const requests = this.getAllFeedback({ type: "feature_request" });

    // Group similar requests (simple keyword matching)
    const grouped: Map<string, FeedbackEntry[]> = new Map();

    for (const request of requests) {
      // Simple grouping by first 50 chars
      const key = request.content.toLowerCase().substring(0, 50);
      const existing = grouped.get(key) || [];
      existing.push(request);
      grouped.set(key, existing);
    }

    return Array.from(grouped.entries()).map(([_, items]) => ({
      description: items[0].content,
      count: items.length,
      userRoles: Array.from(new Set(items.map((i) => i.userRole))),
      firstRequested: items.reduce(
        (earliest, i) => (i.createdAt < earliest ? i.createdAt : earliest),
        items[0].createdAt
      ),
    })).sort((a, b) => b.count - a.count);
  }

  /**
   * Export feedback for analysis
   */
  exportFeedback(): any[] {
    return Array.from(this.feedback.values()).map((entry) => ({
      id: entry.id,
      created: entry.createdAt.toISOString(),
      user_role: entry.userRole,
      type: entry.type,
      content: entry.content,
      rating: entry.rating,
      nps_score: entry.npsScore,
      status: entry.status,
      tags: entry.tags.join(","),
      page: entry.context?.page,
    }));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const feedbackService = new FeedbackService();

export default {
  feedbackService,
};
