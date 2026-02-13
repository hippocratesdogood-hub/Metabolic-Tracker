/**
 * Support Tickets Service
 *
 * Simple support ticket system for the pilot period.
 * Stores tickets in memory with optional persistence to audit logs.
 *
 * Features:
 * - Create support tickets from users
 * - Track ticket status and responses
 * - SLA tracking for response times
 * - Export for external ticketing integration
 */

import { db } from "../storage";
import { auditLogs } from "@shared/schema";
import { logAuditEvent } from "./auditLogger";

// ============================================================================
// TYPES
// ============================================================================

export interface SupportTicket {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  userEmail: string;
  userRole: "participant" | "coach" | "admin";
  category: "bug" | "question" | "feature_request" | "access_issue" | "data_issue" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  subject: string;
  description: string;
  status: "open" | "in_progress" | "waiting_on_user" | "resolved" | "closed";
  assignedTo?: string;
  resolution?: string;
  responses: TicketResponse[];
  metadata: {
    browser?: string;
    device?: string;
    url?: string;
    screenshot?: string;
  };
}

export interface TicketResponse {
  id: string;
  createdAt: Date;
  authorId: string;
  authorRole: string;
  message: string;
  isInternal: boolean;
}

export interface TicketStats {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  avgResponseTime: number;
  avgResolutionTime: number;
  openTickets: number;
  resolvedToday: number;
}

// ============================================================================
// SLA DEFINITIONS
// ============================================================================

const SLA_RESPONSE_TIME: Record<string, number> = {
  urgent: 2 * 60 * 60 * 1000,   // 2 hours
  high: 4 * 60 * 60 * 1000,     // 4 hours
  medium: 24 * 60 * 60 * 1000,  // 24 hours
  low: 72 * 60 * 60 * 1000,     // 72 hours
};

const SLA_RESOLUTION_TIME: Record<string, number> = {
  urgent: 4 * 60 * 60 * 1000,     // 4 hours
  high: 24 * 60 * 60 * 1000,      // 24 hours
  medium: 72 * 60 * 60 * 1000,    // 72 hours
  low: 7 * 24 * 60 * 60 * 1000,   // 7 days
};

// ============================================================================
// SUPPORT TICKET SERVICE
// ============================================================================

class SupportTicketService {
  private tickets: Map<string, SupportTicket> = new Map();
  private ticketCounter = 0;

  /**
   * Generate a unique ticket ID
   */
  private generateTicketId(): string {
    this.ticketCounter++;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `TKT-${date}-${String(this.ticketCounter).padStart(4, "0")}`;
  }

  /**
   * Auto-determine priority based on category and content
   */
  private determinePriority(
    category: SupportTicket["category"],
    description: string
  ): SupportTicket["priority"] {
    // Urgent keywords
    const urgentKeywords = ["can't login", "cannot login", "locked out", "data loss", "lost data", "urgent"];
    const highKeywords = ["not working", "broken", "error", "crash", "can't save"];

    const lowerDesc = description.toLowerCase();

    if (urgentKeywords.some((kw) => lowerDesc.includes(kw))) {
      return "urgent";
    }
    if (highKeywords.some((kw) => lowerDesc.includes(kw))) {
      return "high";
    }
    if (category === "access_issue" || category === "data_issue") {
      return "high";
    }
    if (category === "bug") {
      return "medium";
    }
    return "low";
  }

  /**
   * Create a new support ticket
   */
  async createTicket(params: {
    userId: string;
    userEmail: string;
    userRole: "participant" | "coach" | "admin";
    category: SupportTicket["category"];
    subject: string;
    description: string;
    priority?: SupportTicket["priority"];
    metadata?: SupportTicket["metadata"];
  }): Promise<SupportTicket> {
    const id = this.generateTicketId();
    const now = new Date();

    const ticket: SupportTicket = {
      id,
      createdAt: now,
      updatedAt: now,
      userId: params.userId,
      userEmail: params.userEmail,
      userRole: params.userRole,
      category: params.category,
      priority: params.priority || this.determinePriority(params.category, params.description),
      subject: params.subject,
      description: params.description,
      status: "open",
      responses: [],
      metadata: params.metadata || {},
    };

    this.tickets.set(id, ticket);

    // Log to audit for persistence
    await logAuditEvent(
      "DATA_ACCESS" as any, // action
      "SUCCESS", // result
      "metric_entry" as any, // resourceType (using existing type)
      {
        user: { id: params.userId, role: params.userRole },
        resourceId: id,
        metadata: {
          ticketAction: "created",
          category: params.category,
          priority: ticket.priority,
          subject: params.subject,
        },
      }
    );

    console.log(`[Support] Ticket created: ${id} (${ticket.priority}) - ${params.subject}`);

    return ticket;
  }

  /**
   * Get a ticket by ID
   */
  getTicket(ticketId: string): SupportTicket | null {
    return this.tickets.get(ticketId) || null;
  }

  /**
   * Get all tickets
   */
  getAllTickets(filters?: {
    status?: SupportTicket["status"];
    priority?: SupportTicket["priority"];
    category?: SupportTicket["category"];
    userId?: string;
    assignedTo?: string;
  }): SupportTicket[] {
    let tickets = Array.from(this.tickets.values());

    if (filters) {
      if (filters.status) {
        tickets = tickets.filter((t) => t.status === filters.status);
      }
      if (filters.priority) {
        tickets = tickets.filter((t) => t.priority === filters.priority);
      }
      if (filters.category) {
        tickets = tickets.filter((t) => t.category === filters.category);
      }
      if (filters.userId) {
        tickets = tickets.filter((t) => t.userId === filters.userId);
      }
      if (filters.assignedTo) {
        tickets = tickets.filter((t) => t.assignedTo === filters.assignedTo);
      }
    }

    // Sort by priority then by date
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    tickets.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return tickets;
  }

  /**
   * Update ticket status
   */
  async updateStatus(
    ticketId: string,
    status: SupportTicket["status"],
    resolution?: string,
    updatedBy?: string
  ): Promise<SupportTicket | null> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;

    ticket.status = status;
    ticket.updatedAt = new Date();

    if (resolution) {
      ticket.resolution = resolution;
    }

    await logAuditEvent(
      "DATA_UPDATE" as any,
      "SUCCESS",
      "metric_entry" as any,
      {
        user: { id: updatedBy || "system", role: "admin" },
        resourceId: ticketId,
        metadata: { ticketAction: "status_updated", newStatus: status, resolution },
      }
    );

    return ticket;
  }

  /**
   * Assign ticket to a support agent
   */
  async assignTicket(
    ticketId: string,
    assignedTo: string,
    assignedBy: string
  ): Promise<SupportTicket | null> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;

    ticket.assignedTo = assignedTo;
    ticket.updatedAt = new Date();

    if (ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await logAuditEvent(
      "DATA_UPDATE" as any,
      "SUCCESS",
      "metric_entry" as any,
      {
        user: { id: assignedBy, role: "admin" },
        resourceId: ticketId,
        metadata: { ticketAction: "assigned", assignedTo },
      }
    );

    return ticket;
  }

  /**
   * Add a response to a ticket
   */
  async addResponse(
    ticketId: string,
    authorId: string,
    authorRole: string,
    message: string,
    isInternal: boolean = false
  ): Promise<SupportTicket | null> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;

    const response: TicketResponse = {
      id: `${ticketId}-R${ticket.responses.length + 1}`,
      createdAt: new Date(),
      authorId,
      authorRole,
      message,
      isInternal,
    };

    ticket.responses.push(response);
    ticket.updatedAt = new Date();

    // Update status based on who responded
    if (authorRole === "participant" && ticket.status === "waiting_on_user") {
      ticket.status = "in_progress";
    } else if (authorRole !== "participant" && ticket.status === "open") {
      ticket.status = "in_progress";
    }

    return ticket;
  }

  /**
   * Get ticket statistics
   */
  getStats(): TicketStats {
    const tickets = Array.from(this.tickets.values());

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    let totalResponseTime = 0;
    let responseCount = 0;
    let totalResolutionTime = 0;
    let resolutionCount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let resolvedToday = 0;

    for (const ticket of tickets) {
      // Count by status
      byStatus[ticket.status] = (byStatus[ticket.status] || 0) + 1;
      byCategory[ticket.category] = (byCategory[ticket.category] || 0) + 1;
      byPriority[ticket.priority] = (byPriority[ticket.priority] || 0) + 1;

      // Calculate response time
      if (ticket.responses.length > 0) {
        const firstResponse = ticket.responses[0];
        const responseTime = firstResponse.createdAt.getTime() - ticket.createdAt.getTime();
        totalResponseTime += responseTime;
        responseCount++;
      }

      // Calculate resolution time
      if (ticket.status === "resolved" || ticket.status === "closed") {
        const resolutionTime = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
        totalResolutionTime += resolutionTime;
        resolutionCount++;

        if (ticket.updatedAt >= today) {
          resolvedToday++;
        }
      }
    }

    return {
      total: tickets.length,
      byStatus,
      byCategory,
      byPriority,
      avgResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0,
      avgResolutionTime: resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0,
      openTickets: (byStatus["open"] || 0) + (byStatus["in_progress"] || 0),
      resolvedToday,
    };
  }

  /**
   * Get tickets breaching SLA
   */
  getSlaBreaches(): SupportTicket[] {
    const now = Date.now();
    const openTickets = this.getAllTickets({ status: "open" }).concat(
      this.getAllTickets({ status: "in_progress" })
    );

    return openTickets.filter((ticket) => {
      const age = now - ticket.createdAt.getTime();

      // Check response SLA
      if (ticket.responses.length === 0) {
        if (age > SLA_RESPONSE_TIME[ticket.priority]) {
          return true;
        }
      }

      // Check resolution SLA
      if (age > SLA_RESOLUTION_TIME[ticket.priority]) {
        return true;
      }

      return false;
    });
  }

  /**
   * Export tickets for external system
   */
  exportTickets(): any[] {
    return Array.from(this.tickets.values()).map((ticket) => ({
      id: ticket.id,
      created: ticket.createdAt.toISOString(),
      updated: ticket.updatedAt.toISOString(),
      user_email: ticket.userEmail,
      user_role: ticket.userRole,
      category: ticket.category,
      priority: ticket.priority,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      assigned_to: ticket.assignedTo,
      resolution: ticket.resolution,
      response_count: ticket.responses.length,
    }));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const supportTickets = new SupportTicketService();

export default {
  supportTickets,
};
