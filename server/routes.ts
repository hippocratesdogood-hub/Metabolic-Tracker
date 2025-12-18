import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, crypto } from "./auth";
import passport from "passport";
import { insertUserSchema, insertMetricEntrySchema, insertFoodEntrySchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // Middleware to check authentication
  function requireAuth(req: any, res: any, next: any) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  }

  // Auth routes
  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }

      const { email, passwordHash, ...rest } = result.data;

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await crypto.hash(passwordHash);

      // Create user
      const user = await storage.createUser({
        ...rest,
        email,
        passwordHash: hashedPassword,
      });

      // Auto login
      req.login({ id: user.id, email: user.email, role: user.role, name: user.name }, (err) => {
        if (err) return next(err);
        res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.user) {
      res.json({ user: req.user });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // User routes
  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.id !== req.params.id && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Metrics routes
  app.post("/api/metrics", requireAuth, async (req, res) => {
    try {
      const result = insertMetricEntrySchema.safeParse({
        ...req.body,
        userId: req.user!.id,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }

      const entry = await storage.createMetricEntry(result.data);
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/metrics", requireAuth, async (req, res) => {
    try {
      const { type, from, to } = req.query;
      const entries = await storage.getMetricEntries(
        req.user!.id,
        type as string,
        from ? new Date(from as string) : undefined,
        to ? new Date(to as string) : undefined
      );
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/metrics/:id", requireAuth, async (req, res) => {
    try {
      const entry = await storage.updateMetricEntry(req.params.id, req.body);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/metrics/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteMetricEntry(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Entry not found" });
      }
      res.json({ message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Food routes
  app.post("/api/food", requireAuth, async (req, res) => {
    try {
      const result = insertFoodEntrySchema.safeParse({
        ...req.body,
        userId: req.user!.id,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }

      const entry = await storage.createFoodEntry(result.data);
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/food", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query;
      const entries = await storage.getFoodEntries(
        req.user!.id,
        from ? new Date(from as string) : undefined,
        to ? new Date(to as string) : undefined
      );
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/food/:id", requireAuth, async (req, res) => {
    try {
      const entry = await storage.updateFoodEntry(req.params.id, req.body);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Messaging routes
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const conversations = await storage.getConversationsForUser(req.user!.id);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const { coachId } = req.body;
      if (!coachId) {
        return res.status(400).json({ message: "coachId required" });
      }
      
      const conversation = await storage.getOrCreateConversation(req.user!.id, coachId);
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      // Verify user has access to this conversation
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.participantId !== req.user!.id && conversation.coachId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const result = insertMessageSchema.safeParse({
        ...req.body,
        senderId: req.user!.id,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }

      // Verify user has access to this conversation
      const conversation = await storage.getConversation(result.data.conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.participantId !== req.user!.id && conversation.coachId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const message = await storage.createMessage(result.data);
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
