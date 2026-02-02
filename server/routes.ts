import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, crypto } from "./auth";
import { analyticsService } from "./analytics";
import passport from "passport";
import multer from "multer";
import OpenAI from "openai";
import { insertUserSchema, insertMetricEntrySchema, insertFoodEntrySchema, insertMessageSchema, insertMacroTargetSchema, insertPromptSchema, insertPromptRuleSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

// OpenAI is optional - only initialize if API key is provided
const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

function suggestMealType(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return "Breakfast";
  if (hour >= 10 && hour < 14) return "Lunch";
  if (hour >= 17 && hour < 21) return "Dinner";
  return "Snack";
}

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
      req.login({ id: user.id, email: user.email, role: user.role, name: user.name, forcePasswordReset: user.forcePasswordReset }, (err) => {
        if (err) return next(err);
        res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name, forcePasswordReset: user.forcePasswordReset } });
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

  // User changes own password (for force reset flow)
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 10) {
        return res.status(400).json({ message: "Password must be at least 10 characters" });
      }
      
      const passwordHash = await crypto.hash(newPassword);
      const user = await storage.updateUser(req.user!.id, { 
        passwordHash,
        forcePasswordReset: false,
      });
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update session user
      req.user!.forcePasswordReset = false;
      
      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      const data = {
        ...req.body,
        userId: req.user!.id,
        timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      };
      
      const result = insertMetricEntrySchema.safeParse(data);
      
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
      // Verify ownership before updating
      const existing = await storage.getMetricEntryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Entry not found" });
      }
      if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const entry = await storage.updateMetricEntry(req.params.id, req.body);
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/metrics/:id", requireAuth, async (req, res) => {
    try {
      // Verify ownership before deleting
      const existing = await storage.getMetricEntryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Entry not found" });
      }
      if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteMetricEntry(req.params.id);
      res.json({ message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Food routes
  app.post("/api/food", requireAuth, async (req, res) => {
    try {
      const data = {
        ...req.body,
        userId: req.user!.id,
        timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      };
      
      const result = insertFoodEntrySchema.safeParse(data);
      
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
      // Verify ownership before updating
      const existing = await storage.getFoodEntryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Entry not found" });
      }
      if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const entry = await storage.updateFoodEntry(req.params.id, req.body);
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/food/:id", requireAuth, async (req, res) => {
    try {
      // Verify ownership before deleting
      const existing = await storage.getFoodEntryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Entry not found" });
      }
      if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteFoodEntry(req.params.id);
      res.json({ message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/food/analyze", requireAuth, async (req, res) => {
    try {
      if (!openai) {
        return res.status(503).json({ message: "AI food analysis is not configured. Add OPENAI_API_KEY to .env to enable this feature." });
      }
      const { rawText, timestamp } = req.body;
      const mealTypeSuggestion = suggestMealType();
      
      const systemPrompt = `You are a nutrition analysis AI. Analyze the food description and provide accurate macro estimates.
Return a JSON object with this exact structure:
{
  "foods_detected": [{"name": "food name", "portion": "portion size", "confidence": 0.85}],
  "macros": {"calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number},
  "qualityScore": number (0-100, based on nutritional quality for metabolic health),
  "notes": "brief coaching note about the meal",
  "suggestedMealType": "Breakfast" | "Lunch" | "Dinner" | "Snack",
  "confidence": {"low": 0.7, "high": 0.9}
}
Be accurate with macro estimates based on typical serving sizes. Quality score should favor high protein, low carb meals.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this meal: ${rawText}\n\nCurrent time suggests: ${mealTypeSuggestion}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const analysis = JSON.parse(content);
      
      res.json({
        ...analysis,
        suggestedMealType: analysis.suggestedMealType || mealTypeSuggestion,
      });
    } catch (error: any) {
      console.error("Food analysis error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/food/analyze-image", requireAuth, upload.single('image'), async (req, res) => {
    try {
      if (!openai) {
        return res.status(503).json({ message: "AI food analysis is not configured. Add OPENAI_API_KEY to .env to enable this feature." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No image provided" });
      }
      
      const additionalText = req.body.text || '';
      const mealTypeSuggestion = suggestMealType();
      
      const base64Image = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;

      const systemPrompt = `You are a nutrition analysis AI with vision capabilities. Analyze the food in the image and provide accurate macro estimates.
Return a JSON object with this exact structure:
{
  "foods_detected": [{"name": "food name", "portion": "estimated portion", "confidence": 0.85}],
  "macros": {"calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number},
  "qualityScore": number (0-100, based on nutritional quality for metabolic health),
  "notes": "brief coaching note about the meal",
  "description": "brief description of what you see",
  "suggestedMealType": "Breakfast" | "Lunch" | "Dinner" | "Snack",
  "confidence": {"low": 0.65, "high": 0.85}
}
Be accurate with macro estimates based on visible portion sizes. Quality score should favor high protein, low carb meals.`;

      const userContent: any[] = [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64Image}` }
        }
      ];
      
      if (additionalText) {
        userContent.push({
          type: "text",
          text: `Additional context: ${additionalText}\nCurrent time suggests: ${mealTypeSuggestion}`
        });
      } else {
        userContent.push({
          type: "text", 
          text: `Current time suggests: ${mealTypeSuggestion}`
        });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const analysis = JSON.parse(content);
      
      res.json({
        ...analysis,
        suggestedMealType: analysis.suggestedMealType || mealTypeSuggestion,
      });
    } catch (error: any) {
      console.error("Image analysis error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin routes - list all participants
  app.get("/api/admin/participants", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "coach") {
        return res.status(403).json({ message: "Admin or coach access required" });
      }
      const participants = await storage.getAllParticipants();
      const sanitized = participants.map(({ passwordHash, ...rest }) => rest);
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get macro targets for a specific user (admin/coach only)
  app.get("/api/admin/participants/:userId/macro-targets", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "coach") {
        return res.status(403).json({ message: "Admin or coach access required" });
      }
      const target = await storage.getMacroTarget(req.params.userId);
      res.json(target || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Set macro targets for a specific user (admin/coach only)
  app.put("/api/admin/participants/:userId/macro-targets", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "coach") {
        return res.status(403).json({ message: "Admin or coach access required" });
      }
      const result = insertMacroTargetSchema.safeParse({
        ...req.body,
        userId: req.params.userId,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }

      const target = await storage.upsertMacroTarget(req.params.userId, result.data);
      res.json(target);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Get all users (admin only)
  app.get("/api/admin/users", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const users = await storage.getAllUsers();
      const sanitized = users.map(({ passwordHash, ...rest }) => rest);
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Update user role (admin only)
  app.patch("/api/admin/users/:id/role", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { role } = req.body;
      if (!["participant", "coach", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const user = await storage.updateUser(req.params.id, { role });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { passwordHash, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Get coaches list
  app.get("/api/admin/coaches", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "coach") {
        return res.status(403).json({ message: "Admin or coach access required" });
      }
      const coaches = await storage.getCoaches();
      const sanitized = coaches.map(({ passwordHash, ...rest }) => rest);
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Assign coach to participant
  app.post("/api/admin/participants/:id/assign-coach", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { coachId } = req.body;
      const user = await storage.assignCoach(req.params.id, coachId);
      if (!user) {
        return res.status(404).json({ message: "Participant not found" });
      }
      const { passwordHash, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Create participant
  app.post("/api/admin/participants", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { name, email, password, phone, dateOfBirth, coachId, forcePasswordReset } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email, and password are required" });
      }
      if (password.length < 10) {
        return res.status(400).json({ message: "Password must be at least 10 characters" });
      }
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "That email is already in use. Try another email or search for the participant." });
      }
      
      const passwordHash = await crypto.hash(password);
      const user = await storage.createUser({
        name,
        email,
        passwordHash,
        phone: phone || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        coachId: coachId || null,
        forcePasswordReset: forcePasswordReset !== false,
        role: "participant",
      });
      
      const { passwordHash: _, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Reset participant password
  app.post("/api/admin/participants/:id/reset-password", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { password, forcePasswordReset } = req.body;
      
      if (!password || password.length < 10) {
        return res.status(400).json({ message: "Password must be at least 10 characters" });
      }
      
      const passwordHash = await crypto.hash(password);
      const user = await storage.updateUser(req.params.id, { 
        passwordHash,
        forcePasswordReset: forcePasswordReset !== false,
      });
      
      if (!user) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      const { passwordHash: _, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Update participant
  app.patch("/api/admin/participants/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { name, email, phone, dateOfBirth, coachId, timezone, unitsPreference, status } = req.body;
      
      const user = await storage.updateUser(req.params.id, {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone !== undefined && { phone }),
        ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
        ...(coachId !== undefined && { coachId }),
        ...(timezone && { timezone }),
        ...(unitsPreference && { unitsPreference }),
        ...(status && { status }),
      });
      
      if (!user) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      const { passwordHash, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Prompts CRUD
  app.get("/api/admin/prompts", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const prompts = await storage.getPrompts();
      res.json(prompts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/prompts", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const result = insertPromptSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }
      const prompt = await storage.createPrompt(result.data);
      res.json(prompt);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/prompts/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id, createdAt, ...updateData } = req.body;
      const prompt = await storage.updatePrompt(req.params.id, updateData);
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      res.json(prompt);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/prompts/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const deleted = await storage.deletePrompt(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      res.json({ message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Prompt Rules CRUD
  app.get("/api/admin/rules", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const rules = await storage.getPromptRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/rules", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const result = insertPromptRuleSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }
      const prompt = await storage.getPrompt(result.data.promptId);
      if (!prompt) {
        return res.status(400).json({ message: "Referenced prompt does not exist" });
      }
      const rule = await storage.createPromptRule(result.data);
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/rules/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id, createdAt, ...updateData } = req.body;
      if (updateData.promptId) {
        const prompt = await storage.getPrompt(updateData.promptId);
        if (!prompt) {
          return res.status(400).json({ message: "Referenced prompt does not exist" });
        }
      }
      const rule = await storage.updatePromptRule(req.params.id, updateData);
      if (!rule) {
        return res.status(404).json({ message: "Rule not found" });
      }
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/rules/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const deleted = await storage.deletePromptRule(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Rule not found" });
      }
      res.json({ message: "Deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Prompt Delivery Logs
  app.get("/api/admin/deliveries", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const deliveries = await storage.getPromptDeliveries(limit);
      res.json(deliveries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Macro Targets routes
  app.get("/api/macro-targets", requireAuth, async (req, res) => {
    try {
      const target = await storage.getMacroTarget(req.user!.id);
      res.json(target || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/macro-targets", requireAuth, async (req, res) => {
    try {
      // Role-based: only coach/admin can update macro targets for others
      const { userId, ...targetData } = req.body;
      const targetUserId = userId || req.user!.id;
      
      if (targetUserId !== req.user!.id && req.user!.role === "participant") {
        return res.status(403).json({ message: "Participants cannot update other users' targets" });
      }

      const target = await storage.upsertMacroTarget(targetUserId, targetData);
      res.json(target);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Macro Progress API
  app.get("/api/macro-progress", requireAuth, async (req, res) => {
    try {
      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();
      
      const entries = await storage.getFoodEntriesByDate(req.user!.id, date);
      const target = await storage.getMacroTarget(req.user!.id);
      
      // Sum macros from all entries
      const consumed = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0
      };

      const byMeal: Record<string, typeof consumed> = {
        Breakfast: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        Lunch: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        Dinner: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        Snack: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      };

      for (const entry of entries) {
        const macros = (entry.userCorrectionsJson as any)?.macros || (entry.aiOutputJson as any)?.macros;
        if (macros) {
          consumed.calories += macros.calories || 0;
          consumed.protein += macros.protein || 0;
          consumed.carbs += macros.carbs || 0;
          consumed.fat += macros.fat || 0;
          consumed.fiber += macros.fiber || 0;

          const meal = entry.mealType || "Snack";
          if (byMeal[meal]) {
            byMeal[meal].calories += macros.calories || 0;
            byMeal[meal].protein += macros.protein || 0;
            byMeal[meal].carbs += macros.carbs || 0;
            byMeal[meal].fat += macros.fat || 0;
            byMeal[meal].fiber += macros.fiber || 0;
          }
        }
      }

      const remaining = {
        calories: (target?.calories || 0) - consumed.calories,
        protein: (target?.proteinG || 0) - consumed.protein,
        carbs: (target?.carbsG || 0) - consumed.carbs,
        fat: (target?.fatG || 0) - consumed.fat,
        fiber: (target?.fiberG || 0) - consumed.fiber
      };

      res.json({
        date: date.toISOString().split('T')[0],
        consumed,
        target: target ? {
          calories: target.calories,
          protein: target.proteinG,
          carbs: target.carbsG,
          fat: target.fatG,
          fiber: target.fiberG
        } : null,
        remaining,
        byMeal,
        entriesCount: entries.length
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin Analytics routes (admin only)
  app.get("/api/admin/analytics/overview", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const range = parseInt(req.query.range as string) || 7;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getOverview(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/flags", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const range = parseInt(req.query.range as string) || 7;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getFlags(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/macros", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const range = parseInt(req.query.range as string) || 7;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getMacros(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/outcomes", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const range = parseInt(req.query.range as string) || 30;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getOutcomes(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/coaches", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const range = parseInt(req.query.range as string) || 7;
      const data = await analyticsService.getCoachWorkload(range);
      res.json(data);
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
