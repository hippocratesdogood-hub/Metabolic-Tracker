import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, isBackfilledEntry } from "./storage";
import { setupAuth, crypto } from "./auth";
import { analyticsService } from "./analytics";
import passport from "passport";
import multer from "multer";
import OpenAI from "openai";
import { insertUserSchema, insertMetricEntrySchema, insertFoodEntrySchema, insertMessageSchema, insertMacroTargetSchema, insertPromptSchema, insertPromptRuleSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import {
  requireAuth,
  requireAdmin,
  requireCoachOrAdmin,
} from "./middleware/authorization";
import {
  validatePassword,
  getPasswordRequirementsMessage,
  loginRateLimiter,
  recordFailedLogin,
  recordSuccessfulLogin,
  validateFileSignature,
  errorResponse,
} from "./middleware/security";
import {
  auditLoginSuccess,
  auditLoginFailure,
  auditLogout,
  auditRecordCreate,
  auditRecordUpdate,
  auditRecordDelete,
  auditPhiAccess,
  auditPhiExport,
  auditRoleChange,
  auditCoachAssignment,
  auditUserCreated,
  auditPasswordChange,
  auditAccessDenied,
  logAuditEvent,
} from "./services/auditLogger";
import {
  auditPhiRead,
  auditCreate,
  auditUpdate,
  auditDelete,
} from "./middleware/auditMiddleware";

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

  // Auth routes
  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromZodError(result.error).message });
      }

      const { email, passwordHash, ...rest } = result.data;

      // Validate password strength
      const passwordValidation = validatePassword(passwordHash);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: passwordValidation.errors[0],
          errors: passwordValidation.errors,
          requirements: getPasswordRequirementsMessage(),
        });
      }

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
      req.login({ id: user.id, email: user.email, role: user.role, name: user.name, forcePasswordReset: user.forcePasswordReset, aiConsentGiven: user.aiConsentGiven ?? false, unitsPreference: user.unitsPreference ?? "US" }, async (err) => {
        if (err) return next(err);

        // Audit: User self-registration
        await auditLoginSuccess({ id: user.id, role: user.role }, req);

        res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name, forcePasswordReset: user.forcePasswordReset, aiConsentGiven: user.aiConsentGiven ?? false, unitsPreference: user.unitsPreference ?? "US" } });
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", loginRateLimiter(), (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "An error occurred during login" });
      }

      if (!user) {
        // Record failed login attempt for rate limiting
        recordFailedLogin(req);

        // Audit: Failed login attempt
        await auditLoginFailure(req, req.body?.email || "unknown", info?.message || "Invalid credentials");

        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.login(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Login failed" });
        }

        // Record successful login (clears rate limit)
        recordSuccessfulLogin(req);

        // Audit: Successful login
        await auditLoginSuccess({ id: user.id, role: user.role }, req);

        res.json({ user: req.user });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", async (req, res) => {
    // Capture user info before logout
    const user = req.user as { id: string; role: string } | undefined;

    req.logout(async (err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });

      // Audit: Logout
      if (user) {
        await auditLogout({ id: user.id, role: user.role }, req);
      }

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

      // Validate password strength
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: passwordValidation.errors[0],
          errors: passwordValidation.errors,
          requirements: getPasswordRequirementsMessage(),
        });
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

      // Audit: Password change (self)
      await auditPasswordChange({ id: req.user!.id, role: req.user!.role }, req, true);

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

  // AI consent endpoint
  app.patch("/api/user/ai-consent", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.user!.id, { aiConsentGiven: true });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Metrics routes (PHI data - audit all access)
  app.post("/api/metrics", requireAuth, auditCreate("METRIC_ENTRY"), async (req, res) => {
    try {
      const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

      // Server-side timestamp validation
      if (isNaN(timestamp.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp format" });
      }
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
      if (timestamp > oneMinuteFromNow) {
        return res.status(400).json({ message: "Timestamp cannot be in the future" });
      }
      if (timestamp < thirtyDaysAgo) {
        return res.status(400).json({ message: "Timestamp cannot be more than 30 days in the past" });
      }

      const data = {
        ...req.body,
        userId: req.user!.id,
        timestamp,
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

  app.get("/api/metrics", requireAuth, auditPhiRead("METRIC_ENTRY"), async (req, res) => {
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

  app.put("/api/metrics/:id", requireAuth, auditUpdate("METRIC_ENTRY", { trackFields: ["valueJson", "notes"] }), async (req, res) => {
    try {
      // Verify ownership before updating
      const existing = await storage.getMetricEntryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Entry not found" });
      }

      // Check authorization - owner, coach of owner, or admin can edit
      const isOwner = existing.userId === req.user!.id;
      const isAdmin = req.user!.role === "admin";
      const isCoach = req.user!.role === "coach";

      if (!isOwner && !isAdmin && !isCoach) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Track if this is a backfilled entry being edited (for audit purposes)
      const wasBackfilled = isBackfilledEntry(existing);

      // Pass the editor's ID to track who made the edit
      const entry = await storage.updateMetricEntry(req.params.id, req.body, req.user!.id);

      // Include backfill status in response for client awareness
      res.json({
        ...entry,
        _meta: {
          wasBackfilled,
          editedByRole: req.user!.role,
          editedByOwner: isOwner,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/metrics/:id", requireAuth, auditDelete("METRIC_ENTRY"), async (req, res) => {
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

  // Food routes (PHI data - audit all access)
  app.post("/api/food", requireAuth, auditCreate("FOOD_ENTRY"), async (req, res) => {
    try {
      const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

      // Server-side timestamp validation
      if (isNaN(timestamp.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp format" });
      }
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
      if (timestamp > oneMinuteFromNow) {
        return res.status(400).json({ message: "Timestamp cannot be in the future" });
      }
      if (timestamp < thirtyDaysAgo) {
        return res.status(400).json({ message: "Timestamp cannot be more than 30 days in the past" });
      }

      const data = {
        ...req.body,
        userId: req.user!.id,
        timestamp,
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

  app.get("/api/food", requireAuth, auditPhiRead("FOOD_ENTRY"), async (req, res) => {
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

  app.put("/api/food/:id", requireAuth, auditUpdate("FOOD_ENTRY"), async (req, res) => {
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

  app.delete("/api/food/:id", requireAuth, auditDelete("FOOD_ENTRY"), async (req, res) => {
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

  app.put("/api/food/:id/favorite", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getFoodEntryById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Entry not found" });
      }
      if (existing.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const entry = await storage.toggleFoodEntryFavorite(req.params.id);
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/food/favorites", requireAuth, async (req, res) => {
    try {
      const entries = await storage.getFavoriteFoodEntries(req.user!.id);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/food/streak", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allFood = await storage.getFoodEntries(userId);

      const foodDays = new Set<string>();
      allFood.forEach(entry => {
        const day = new Date(entry.timestamp).toISOString().split('T')[0];
        foodDays.add(day);
      });

      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (foodDays.has(dateStr)) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const weekDays = [];
      let daysLoggedThisWeek = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const logged = foodDays.has(dateStr);
        if (logged) daysLoggedThisWeek++;
        weekDays.push({ date: dateStr, dayLabel: dayLabels[d.getDay()], logged });
      }

      let message: string;
      if (streak === 0) {
        message = "Log your first meal to start your streak!";
      } else if (streak === 1) {
        message = "Day 1 — great start! Come back tomorrow.";
      } else if (streak < 7) {
        message = `${streak}-day streak! Keep the momentum going.`;
      } else if (streak < 30) {
        message = `${streak} days strong! You're building a real habit.`;
      } else {
        message = `${streak}-day streak — incredible consistency!`;
      }

      res.json({ streak, weekDays, daysLoggedThisWeek, totalDaysInWeek: 7, message });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/food/analyze", requireAuth, async (req, res) => {
    try {
      // Check AI consent
      const consentUser = await storage.getUser(req.user!.id);
      if (!consentUser?.aiConsentGiven) {
        return res.status(403).json({ message: "AI consent required. Please accept the AI disclosure before using this feature." });
      }

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
      // Check AI consent
      const consentUser = await storage.getUser(req.user!.id);
      if (!consentUser?.aiConsentGiven) {
        return res.status(403).json({ message: "AI consent required. Please accept the AI disclosure before using this feature." });
      }

      if (!openai) {
        return res.status(503).json({ message: "AI food analysis is not configured. Add OPENAI_API_KEY to .env to enable this feature." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No image provided" });
      }

      // Validate file content matches declared MIME type (magic bytes check)
      if (!validateFileSignature(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
          message: "Invalid file: content does not match declared image type",
        });
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

  // Admin/Coach routes - list participants (PHI access)
  app.get("/api/admin/participants", requireAuth, requireCoachOrAdmin, auditPhiRead("USER"), async (req, res) => {
    try {
      const participants = await storage.getAllParticipants();
      const sanitized = participants.map(({ passwordHash, ...rest }) => rest);

      // Coaches only see their assigned participants
      if (req.user!.role === "coach") {
        const coachParticipants = sanitized.filter(
          (p: any) => p.coachId === req.user!.id
        );
        return res.json(coachParticipants);
      }

      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get macro targets for a specific user (admin/coach only)
  app.get("/api/admin/participants/:userId/macro-targets", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const target = await storage.getMacroTarget(req.params.userId);
      res.json(target || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Set macro targets for a specific user (admin/coach only)
  app.put("/api/admin/participants/:userId/macro-targets", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
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
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const sanitized = users.map(({ passwordHash, ...rest }) => rest);
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Update user role (admin only)
  app.patch("/api/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!["participant", "coach", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Get current user to capture old role
      const existingUser = await storage.getUser(req.params.id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const oldRole = existingUser.role;

      const user = await storage.updateUser(req.params.id, { role });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Audit: Role change
      await auditRoleChange(
        { id: req.user!.id, role: req.user!.role },
        req,
        req.params.id,
        oldRole,
        role
      );

      const { passwordHash, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Get coaches list
  app.get("/api/admin/coaches", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const coaches = await storage.getCoaches();
      const sanitized = coaches.map(({ passwordHash, ...rest }) => rest);
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Assign coach to participant
  app.post("/api/admin/participants/:id/assign-coach", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { coachId } = req.body;

      // Get current user to capture previous coach
      const existingUser = await storage.getUser(req.params.id);
      const previousCoachId = existingUser?.coachId || null;

      const user = await storage.assignCoach(req.params.id, coachId);
      if (!user) {
        return res.status(404).json({ message: "Participant not found" });
      }

      // Audit: Coach assignment
      await auditCoachAssignment(
        { id: req.user!.id, role: req.user!.role },
        req,
        req.params.id,
        coachId,
        previousCoachId
      );

      const { passwordHash, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Create participant
  app.post("/api/admin/participants", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, email, password, phone, dateOfBirth, coachId, forcePasswordReset } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email, and password are required" });
      }

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: passwordValidation.errors[0],
          errors: passwordValidation.errors,
          requirements: getPasswordRequirementsMessage(),
        });
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

      // Audit: User created by admin
      await auditUserCreated(
        { id: req.user!.id, role: req.user!.role },
        req,
        user.id,
        "participant"
      );

      const { passwordHash: _, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Reset participant password
  app.post("/api/admin/participants/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { password, forcePasswordReset } = req.body;

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: passwordValidation.errors[0],
          errors: passwordValidation.errors,
          requirements: getPasswordRequirementsMessage(),
        });
      }

      const passwordHash = await crypto.hash(password);
      const user = await storage.updateUser(req.params.id, {
        passwordHash,
        forcePasswordReset: forcePasswordReset !== false,
      });

      if (!user) {
        return res.status(404).json({ message: "Participant not found" });
      }

      // Audit: Admin password reset (not self)
      await auditPasswordChange(
        { id: req.user!.id, role: req.user!.role },
        req,
        false // selfChange = false (admin resetting another user's password)
      );

      const { passwordHash: _, ...sanitized } = user;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin - Update participant
  app.patch("/api/admin/participants/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
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
  app.get("/api/admin/prompts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const prompts = await storage.getPrompts();
      res.json(prompts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/prompts", requireAuth, requireAdmin, async (req, res) => {
    try {
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

  app.put("/api/admin/prompts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
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

  app.delete("/api/admin/prompts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
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
  app.get("/api/admin/rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const rules = await storage.getPromptRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/rules", requireAuth, requireAdmin, async (req, res) => {
    try {
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

  app.put("/api/admin/rules/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
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

  app.delete("/api/admin/rules/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
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
  app.get("/api/admin/deliveries", requireAuth, requireAdmin, async (req, res) => {
    try {
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
  app.get("/api/admin/analytics/overview", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 7;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getOverview(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/flags", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 7;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getFlags(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/macros", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 7;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getMacros(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/outcomes", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 30;
      const coachId = req.query.coachId as string | undefined;
      const compare = req.query.compare === "true";
      const data = await analyticsService.getOutcomes(range, coachId, compare);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/coaches", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 7;
      const data = await analyticsService.getCoachWorkload(range);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/trends", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 30;
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getTrends(range, coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/demographics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const coachId = req.query.coachId as string | undefined;
      const data = await analyticsService.getDemographics(coachId);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // AI Report Assistant
  // ============================================================================

  const AI_ASSISTANT_SYSTEM_PROMPT = `You are a clinical data assistant for a metabolic health tracking program called Metabolic OS. You help administrators and coaches understand participant health data.

AVAILABLE DATA TYPES:
- Participants: name, email, status, program start date, assigned coach
- Metric entries: Blood Pressure (BP), Waist circumference (WAIST), Fasting Glucose (GLUCOSE), Ketones (KETONES), Weight (WEIGHT)
  - BP valueJson: { systolic, diastolic } (mmHg)
  - Weight valueJson: { value } (lbs)
  - Glucose valueJson: { value } or { fasting } (mg/dL)
  - Ketones valueJson: { value } (mmol/L)
  - Waist valueJson: { value } (inches)
- Food entries: meal type, raw text description, AI-analyzed macros (calories, protein, carbs, fat), quality score
- Program analytics: overview stats, health flags, macro adherence, outcome trends

GUIDELINES:
1. When asked about a specific participant, ALWAYS use search_participants first to find their ID, then query their data.
2. For date ranges, use ISO 8601 format (YYYY-MM-DD). "Last week" means the last 7 days. "Last month" means the last 30 days. Today is ${new Date().toISOString().split('T')[0]}.
3. Present data clearly with relevant context. Include units (lbs, mg/dL, mmol/L, mmHg).
4. Flag concerning patterns (high glucose >110 mg/dL, elevated BP >140/90, missed logging >3 days).
5. When summarizing trends, mention both the direction and magnitude of change.
6. Never fabricate data. If data is insufficient, say so.
7. Keep responses concise but thorough. Use bullet points for multiple data points.
8. When querying metrics, use specific date ranges to keep results focused.`;

  const aiAssistantTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "search_participants",
        description: "Search for participants by name or email. Use this to find a participant's ID before querying their data.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Name or email to search for (case-insensitive partial match)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_participant_metrics",
        description: "Get health metric entries for a specific participant. Types: BP, WEIGHT, GLUCOSE, KETONES, WAIST.",
        parameters: {
          type: "object",
          properties: {
            participantId: { type: "string", description: "The participant's user ID (get from search_participants first)" },
            metricType: { type: "string", enum: ["BP", "WEIGHT", "GLUCOSE", "KETONES", "WAIST"], description: "Filter by metric type. Omit for all." },
            fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
            toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          },
          required: ["participantId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_participant_food",
        description: "Get food log entries for a participant. Returns meal descriptions, macros (calories, protein, carbs, fat), and quality scores.",
        parameters: {
          type: "object",
          properties: {
            participantId: { type: "string", description: "The participant's user ID" },
            fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
            toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          },
          required: ["participantId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_analytics_overview",
        description: "Get program-wide overview: total/active/inactive participants, adherence rates, logging streaks.",
        parameters: {
          type: "object",
          properties: {
            range: { type: "number", description: "Days to look back (default: 7)" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_health_flags",
        description: "Get flagged participants with health concerns: high glucose, elevated BP, missed logging, low ketones.",
        parameters: {
          type: "object",
          properties: {
            range: { type: "number", description: "Days to look back (default: 7)" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_macro_adherence",
        description: "Get nutrition compliance data: participants meeting protein targets, over carb limits, etc.",
        parameters: {
          type: "object",
          properties: {
            range: { type: "number", description: "Days to look back (default: 7)" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_outcome_metrics",
        description: "Get aggregate outcome trends: average weight change, waist change, fasting glucose change across all participants.",
        parameters: {
          type: "object",
          properties: {
            range: { type: "number", description: "Days to look back (default: 30)" },
          },
        },
      },
    },
  ];

  async function executeAIToolCall(name: string, args: any): Promise<any> {
    switch (name) {
      case "search_participants": {
        const participants = await storage.getAllParticipants();
        const query = (args.query || "").toLowerCase();
        const matches = participants
          .filter((p: any) => p.name?.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query))
          .map(({ passwordHash, ...rest }: any) => rest)
          .slice(0, 20);
        return { participants: matches, total: matches.length };
      }
      case "get_participant_metrics": {
        const entries = await storage.getMetricEntries(
          args.participantId,
          args.metricType || undefined,
          args.fromDate ? new Date(args.fromDate) : undefined,
          args.toDate ? new Date(args.toDate) : undefined,
        );
        return { entries: entries.slice(0, 100), total: entries.length, truncated: entries.length > 100 };
      }
      case "get_participant_food": {
        const entries = await storage.getFoodEntries(
          args.participantId,
          args.fromDate ? new Date(args.fromDate) : undefined,
          args.toDate ? new Date(args.toDate) : undefined,
        );
        return { entries: entries.slice(0, 100), total: entries.length, truncated: entries.length > 100 };
      }
      case "get_analytics_overview":
        return analyticsService.getOverview(args.range || 7);
      case "get_health_flags":
        return analyticsService.getFlags(args.range || 7);
      case "get_macro_adherence":
        return analyticsService.getMacros(args.range || 7);
      case "get_outcome_metrics":
        return analyticsService.getOutcomes(args.range || 30);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  const aiAssistantSchema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).min(1),
  });

  app.post("/api/admin/ai-assistant", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      if (!openai) {
        return res.status(503).json({ message: "AI assistant is not configured. Add OPENAI_API_KEY to .env." });
      }

      const parsed = aiAssistantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromZodError(parsed.error).message });
      }

      const { messages: clientMessages } = parsed.data;

      await logAuditEvent("PHI_VIEW", "SUCCESS", "REPORT", {
        user: { id: req.user!.id, role: req.user!.role },
        req,
        metadata: { feature: "ai-assistant", queryPreview: clientMessages[clientMessages.length - 1]?.content.substring(0, 100) },
      });

      const openaiMessages: any[] = [
        { role: "system", content: AI_ASSISTANT_SYSTEM_PROMPT },
        ...clientMessages,
      ];

      const MAX_ITERATIONS = 5;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: openaiMessages,
          tools: aiAssistantTools,
          tool_choice: "auto",
          max_tokens: 2000,
        });

        const assistantMessage = response.choices[0].message;

        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          return res.json({ response: assistantMessage.content || "I wasn't able to generate a response." });
        }

        openaiMessages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          let result: any;
          try {
            result = await executeAIToolCall(toolCall.function.name, args);
          } catch (err: any) {
            result = { error: err.message };
          }
          openaiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
        }
      }

      res.json({ response: "I needed too many data lookups to answer that. Could you try a more specific question?" });
    } catch (error: any) {
      console.error("AI assistant error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // User Consistency Metrics
  // ============================================================================

  /**
   * Get consistency metrics for the current user.
   *
   * Product Decision: Daily loggers see traditional streak, weekly loggers see
   * consistency percentage (% of weeks with at least one log).
   *
   * Returns:
   * - streak: Consecutive days with logs
   * - consistencyPercent: % of weeks with at least one log
   * - pattern: Detected logging pattern (daily/weekly/sporadic)
   * - recommendedMetric: Which metric to show ("streak" or "consistency")
   */
  app.get("/api/metrics/consistency", requireAuth, async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      const data = await analyticsService.getUserConsistencyMetrics(req.user!.id, weeks);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get consistency metrics for a specific user (coach/admin access).
   * Coaches can only view their assigned participants.
   */
  app.get("/api/users/:userId/consistency", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      // Verify access: admin can view all, coach can only view assigned participants
      if (req.user!.role === "coach") {
        const targetUser = await storage.getUser(userId);
        if (!targetUser || targetUser.coachId !== req.user!.id) {
          return res.status(403).json({ message: "Forbidden: Not your assigned participant" });
        }
      }

      const weeks = parseInt(req.query.weeks as string) || 12;
      const data = await analyticsService.getUserConsistencyMetrics(userId, weeks);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // Admin - Audit Logs (admin only, read-only)
  // ============================================================================

  // Get audit logs with filtering and pagination
  app.get("/api/admin/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const {
        userId,
        targetUserId,
        action,
        actions,
        resourceType,
        resourceTypes,
        result,
        from,
        to,
        ipAddress,
        limit,
        offset,
      } = req.query;

      const filters: any = {};

      if (userId) filters.userId = userId as string;
      if (targetUserId) filters.targetUserId = targetUserId as string;

      // Handle single or multiple actions
      if (actions) {
        filters.actions = (actions as string).split(",");
      } else if (action) {
        filters.actions = [action as string];
      }

      // Handle single or multiple resource types
      if (resourceTypes) {
        filters.resourceTypes = (resourceTypes as string).split(",");
      } else if (resourceType) {
        filters.resourceTypes = [resourceType as string];
      }

      if (result) filters.result = result as string;
      if (from) filters.from = new Date(from as string);
      if (to) filters.to = new Date(to as string);
      if (ipAddress) filters.ipAddress = ipAddress as string;
      if (limit) filters.limit = parseInt(limit as string) || 100;
      if (offset) filters.offset = parseInt(offset as string) || 0;

      // Default limit if not specified
      if (!filters.limit) filters.limit = 100;

      const { logs, total } = await storage.getAuditLogs(filters);

      res.json({
        logs,
        total,
        limit: filters.limit,
        offset: filters.offset || 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get a single audit log entry by ID
  app.get("/api/admin/audit-logs/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const log = await storage.getAuditLogById(req.params.id);
      if (!log) {
        return res.status(404).json({ message: "Audit log entry not found" });
      }
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get audit log statistics/summary
  app.get("/api/admin/audit-logs/stats/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const stats = await storage.getAuditLogStats(days);
      res.json({ days, ...stats });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get audit logs for a specific user (useful for investigating user activity)
  app.get("/api/admin/audit-logs/user/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const { logs, total } = await storage.getAuditLogs({
        userId: req.params.userId,
        limit,
        offset,
      });

      res.json({ logs, total, limit, offset });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get security-related audit logs (failed logins, access denials, etc.)
  app.get("/api/admin/audit-logs/security", requireAuth, requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const since = new Date();
      since.setDate(since.getDate() - days);

      const { logs, total } = await storage.getAuditLogs({
        actions: [
          "LOGIN_FAILURE",
          "ACCESS_DENIED",
          "AUTH_FAILURE",
          "RATE_LIMIT_EXCEEDED",
        ],
        from: since,
        limit,
        offset,
      });

      res.json({ logs, total, limit, offset, days });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Messaging routes (contains PHI)
  app.get("/api/conversations", requireAuth, auditPhiRead("CONVERSATION"), async (req, res) => {
    try {
      const conversations = await storage.getConversationsForUser(req.user!.id);
      // Attach unread count for each conversation
      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          const msgs = await storage.getMessages(conv.id);
          const unreadCount = msgs.filter(
            (m) => m.senderId !== req.user!.id && !m.readAt
          ).length;
          return { ...conv, unreadCount };
        })
      );
      res.json(enriched);
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

  app.get("/api/conversations/:id/messages", requireAuth, auditPhiRead("MESSAGE"), async (req, res) => {
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

  app.post("/api/messages", requireAuth, auditCreate("MESSAGE"), async (req, res) => {
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

  app.patch("/api/messages/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markMessageRead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // User Dashboard Stats API (streak, trends, progress)
  // ============================================================================

  app.get("/api/dashboard-stats", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all metrics and food entries for calculations
      const allMetrics = await storage.getMetricEntries(userId);
      const allFood = await storage.getFoodEntries(userId);

      // Calculate streak - consecutive days with any log
      const allLogs = [...allMetrics, ...allFood].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const dailyLogs = new Set<string>();
      allLogs.forEach(log => {
        const day = new Date(log.timestamp).toISOString().split('T')[0];
        dailyLogs.add(day);
      });

      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (dailyLogs.has(dateStr)) {
          streak++;
        } else if (i > 0) {
          // Allow skipping today if no logs yet
          break;
        }
      }

      // Calculate trends for each metric type
      const calculateTrend = (type: string, getValue: (entry: any) => number | null) => {
        const entries = allMetrics
          .filter(m => m.type === type)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (entries.length < 2) {
          return { trend: 'neutral' as const, value: null, change: null };
        }

        // Compare last 7 days average to previous 7 days
        const recentEntries = entries.filter(e => new Date(e.timestamp) >= sevenDaysAgo);
        const olderEntries = entries.filter(e => {
          const d = new Date(e.timestamp);
          return d < sevenDaysAgo && d >= new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
        });

        if (recentEntries.length === 0 || olderEntries.length === 0) {
          // Fallback: compare first and last entry
          const firstVal = getValue(entries[0]);
          const lastVal = getValue(entries[entries.length - 1]);
          if (firstVal === null || lastVal === null) {
            return { trend: 'neutral' as const, value: null, change: null };
          }
          const change = lastVal - firstVal;
          return {
            trend: change < -0.1 ? 'down' as const : change > 0.1 ? 'up' as const : 'neutral' as const,
            value: Math.abs(change).toFixed(1),
            change
          };
        }

        const recentAvg = recentEntries.reduce((sum, e) => sum + (getValue(e) || 0), 0) / recentEntries.length;
        const olderAvg = olderEntries.reduce((sum, e) => sum + (getValue(e) || 0), 0) / olderEntries.length;
        const change = recentAvg - olderAvg;

        return {
          trend: change < -0.1 ? 'down' as const : change > 0.1 ? 'up' as const : 'neutral' as const,
          value: Math.abs(change).toFixed(1),
          change
        };
      };

      const weightTrend = calculateTrend('WEIGHT', (e) => e.valueJson?.value ?? e.valueJson?.weight ?? null);
      const glucoseTrend = calculateTrend('GLUCOSE', (e) => e.valueJson?.value ?? e.valueJson?.fasting ?? null);
      const ketonesTrend = calculateTrend('KETONES', (e) => e.valueJson?.value ?? null);
      const waistTrend = calculateTrend('WAIST', (e) => e.valueJson?.value ?? null);

      // For weight and waist, "down" is good (green), for ketones "up" is good
      // Glucose: stable or down is good
      const formatWeightTrend = (t: typeof weightTrend) => ({
        direction: t.trend,
        value: t.value ? `${t.value} lbs` : null,
        isPositive: t.trend === 'down' // Weight loss is positive
      });

      const formatGlucoseTrend = (t: typeof glucoseTrend) => ({
        direction: t.trend,
        value: t.value ? `${t.value} mg/dL` : null,
        isPositive: t.trend === 'down' || t.trend === 'neutral'
      });

      const formatKetonesTrend = (t: typeof ketonesTrend) => ({
        direction: t.trend,
        value: t.value ? `${t.value} mmol/L` : null,
        isPositive: t.trend === 'up' // Higher ketones generally positive
      });

      const formatWaistTrend = (t: typeof waistTrend) => ({
        direction: t.trend,
        value: t.value ? `${t.value} in` : null,
        isPositive: t.trend === 'down' // Smaller waist is positive
      });

      // Get first log date for "days in program"
      const firstLogDate = allLogs.length > 0
        ? new Date(Math.min(...allLogs.map(l => new Date(l.timestamp).getTime())))
        : null;

      const daysInProgram = firstLogDate
        ? Math.floor((now.getTime() - firstLogDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      res.json({
        streak,
        daysInProgram,
        firstLogDate: firstLogDate?.toISOString() ?? null,
        totalLogs: allLogs.length,
        trends: {
          weight: formatWeightTrend(weightTrend),
          glucose: formatGlucoseTrend(glucoseTrend),
          ketones: formatKetonesTrend(ketonesTrend),
          waist: formatWaistTrend(waistTrend),
          bp: { direction: 'neutral', value: null, isPositive: true } // BP trend calculation more complex
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // Weekly Report API (real data calculations)
  // ============================================================================

  app.get("/api/reports/weekly", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const now = new Date();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // Get this week's data
      const thisWeekMetrics = await storage.getMetricEntries(userId, undefined, weekStart, now);
      const thisWeekFood = await storage.getFoodEntries(userId, weekStart, now);
      const macroTarget = await storage.getMacroTarget(userId);

      // Get previous week's data for comparison
      const prevWeekMetrics = await storage.getMetricEntries(userId, undefined, prevWeekStart, weekStart);

      // Calculate streak
      const allMetrics = await storage.getMetricEntries(userId);
      const allFood = await storage.getFoodEntries(userId);
      const allLogs = [...allMetrics, ...allFood];

      const dailyLogs = new Set<string>();
      allLogs.forEach(log => {
        const day = new Date(log.timestamp).toISOString().split('T')[0];
        dailyLogs.add(day);
      });

      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (dailyLogs.has(dateStr)) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      // Calculate adherence (days with logs / 7)
      const thisWeekDays = new Set<string>();
      [...thisWeekMetrics, ...thisWeekFood].forEach(log => {
        const day = new Date(log.timestamp).toISOString().split('T')[0];
        thisWeekDays.add(day);
      });
      const adherence = Math.round((thisWeekDays.size / 7) * 100);

      // Calculate metric averages
      const calcAvg = (entries: any[], getValue: (e: any) => number | null) => {
        const values = entries.map(getValue).filter((v): v is number => v !== null);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
      };

      const glucoseEntries = thisWeekMetrics.filter(m => m.type === 'GLUCOSE');
      const ketonesEntries = thisWeekMetrics.filter(m => m.type === 'KETONES');
      const weightEntries = thisWeekMetrics.filter(m => m.type === 'WEIGHT');

      const avgGlucose = calcAvg(glucoseEntries, e => e.valueJson?.value ?? e.valueJson?.fasting ?? null);
      const avgKetones = calcAvg(ketonesEntries, e => e.valueJson?.value ?? null);

      // Weight change (latest - earliest this week, or vs last week)
      const sortedWeights = weightEntries.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let weightChange = null;
      if (sortedWeights.length >= 2) {
        const first = sortedWeights[0].valueJson?.value ?? sortedWeights[0].valueJson?.weight;
        const last = sortedWeights[sortedWeights.length - 1].valueJson?.value ?? sortedWeights[sortedWeights.length - 1].valueJson?.weight;
        if (first && last) {
          weightChange = Math.round((last - first) * 10) / 10;
        }
      } else if (sortedWeights.length === 1) {
        // Compare to last week
        const prevWeights = prevWeekMetrics.filter(m => m.type === 'WEIGHT');
        if (prevWeights.length > 0) {
          const prevAvg = calcAvg(prevWeights, e => e.valueJson?.value ?? e.valueJson?.weight ?? null);
          const currentVal = sortedWeights[0].valueJson?.value ?? sortedWeights[0].valueJson?.weight;
          if (prevAvg && currentVal) {
            weightChange = Math.round((currentVal - prevAvg) * 10) / 10;
          }
        }
      }

      // Generate highlights based on actual data
      const highlights: { type: 'positive' | 'negative'; text: string }[] = [];

      // Protein tracking
      if (macroTarget?.proteinG && thisWeekFood.length > 0) {
        let daysMetProtein = 0;
        const foodByDay = new Map<string, number>();
        thisWeekFood.forEach(entry => {
          const day = new Date(entry.timestamp).toISOString().split('T')[0];
          const protein = (entry.userCorrectionsJson as any)?.macros?.protein ||
                         (entry.aiOutputJson as any)?.macros?.protein || 0;
          foodByDay.set(day, (foodByDay.get(day) || 0) + protein);
        });
        foodByDay.forEach((protein) => {
          if (Math.abs(protein - macroTarget.proteinG!) / macroTarget.proteinG! <= 0.15) {
            daysMetProtein++;
          }
        });
        if (daysMetProtein >= 5) {
          highlights.push({ type: 'positive', text: `You hit your protein goal ${daysMetProtein}/7 days!` });
        } else if (daysMetProtein <= 2 && foodByDay.size >= 5) {
          highlights.push({ type: 'negative', text: `Only met protein target ${daysMetProtein} days this week.` });
        }
      }

      // Glucose highlights
      if (avgGlucose !== null) {
        if (avgGlucose < 100) {
          highlights.push({ type: 'positive', text: `Fasting glucose averaged ${Math.round(avgGlucose)} mg/dL - excellent!` });
        } else if (avgGlucose >= 110) {
          highlights.push({ type: 'negative', text: `Fasting glucose averaged ${Math.round(avgGlucose)} mg/dL - watch carb intake.` });
        }
      }

      // Weight highlights
      if (weightChange !== null) {
        if (weightChange < -0.5) {
          highlights.push({ type: 'positive', text: `Down ${Math.abs(weightChange)} lbs this week!` });
        } else if (weightChange > 1) {
          highlights.push({ type: 'negative', text: `Weight up ${weightChange} lbs - stay consistent.` });
        }
      }

      // Ketones highlights
      if (avgKetones !== null) {
        if (avgKetones >= 0.5) {
          highlights.push({ type: 'positive', text: `Good ketone levels averaging ${avgKetones.toFixed(1)} mmol/L.` });
        } else if (ketonesEntries.length < 3) {
          highlights.push({ type: 'negative', text: `Only ${ketonesEntries.length} ketone readings this week.` });
        }
      }

      // Adherence highlight
      if (adherence >= 85) {
        highlights.push({ type: 'positive', text: `Great consistency - logged ${thisWeekDays.size}/7 days!` });
      } else if (adherence < 50) {
        highlights.push({ type: 'negative', text: `Logged only ${thisWeekDays.size} days this week. Try for daily logs!` });
      }

      // Ensure at least some highlights
      if (highlights.length === 0) {
        if (thisWeekDays.size > 0) {
          highlights.push({ type: 'positive', text: `Logged data on ${thisWeekDays.size} days this week.` });
        } else {
          highlights.push({ type: 'negative', text: 'No logs recorded this week. Start tracking today!' });
        }
      }

      // Generate next focus based on data
      let nextFocus = 'Keep up the good work with daily logging!';
      if (avgGlucose && avgGlucose >= 110) {
        nextFocus = 'Focus on reducing carbs and adding a 10-minute walk after meals to help stabilize glucose.';
      } else if (avgKetones !== null && avgKetones < 0.5) {
        nextFocus = 'Try extending your overnight fast to 14+ hours to boost ketone production.';
      } else if (adherence < 70) {
        nextFocus = 'Set daily reminders to log your meals and metrics for better tracking.';
      } else if (macroTarget?.proteinG && highlights.some(h => h.text.includes('protein') && h.type === 'negative')) {
        nextFocus = `Aim for ${Math.round(macroTarget.proteinG / 3)}g protein at each meal to hit your ${macroTarget.proteinG}g daily target.`;
      }

      // Compare to previous week
      const prevAvgGlucose = calcAvg(
        prevWeekMetrics.filter(m => m.type === 'GLUCOSE'),
        e => e.valueJson?.value ?? e.valueJson?.fasting ?? null
      );
      const prevAvgKetones = calcAvg(
        prevWeekMetrics.filter(m => m.type === 'KETONES'),
        e => e.valueJson?.value ?? null
      );

      res.json({
        period: {
          start: weekStart.toISOString(),
          end: now.toISOString(),
          label: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        },
        streak,
        adherence,
        daysLogged: thisWeekDays.size,
        highlights: highlights.slice(0, 5), // Max 5 highlights
        averages: {
          glucose: avgGlucose ? Math.round(avgGlucose) : null,
          glucoseVsPrev: avgGlucose && prevAvgGlucose ? Math.round(avgGlucose - prevAvgGlucose) : null,
          ketones: avgKetones ? Math.round(avgKetones * 10) / 10 : null,
          ketonesVsPrev: avgKetones && prevAvgKetones ? Math.round((avgKetones - prevAvgKetones) * 10) / 10 : null,
          weightChange
        },
        nextFocus,
        metricsCount: {
          glucose: glucoseEntries.length,
          ketones: ketonesEntries.length,
          weight: weightEntries.length,
          meals: thisWeekFood.length
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // Admin - Error Monitoring Dashboard (admin only)
  // ============================================================================

  /**
   * Get error metrics for the monitoring dashboard.
   * Returns error rates, severity breakdowns, and trend data.
   */
  app.get("/api/admin/errors/metrics", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Import dynamically to avoid circular dependencies
      const { errorMetricsService } = await import("./services/errorMetrics");
      const metrics = errorMetricsService.getDashboardMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get alert metrics for rule evaluation.
   * Used by the alerting system to check conditions.
   */
  app.get("/api/admin/errors/alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { errorMetricsService } = await import("./services/errorMetrics");
      const metrics = errorMetricsService.getAlertMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Update error baseline (call periodically for accurate trend detection).
   */
  app.post("/api/admin/errors/baseline", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { errorMetricsService } = await import("./services/errorMetrics");
      errorMetricsService.updateBaseline();
      res.json({ message: "Baseline updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Test alert configuration by sending a test alert.
   */
  app.post("/api/admin/errors/test-alert", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { alertingService, ErrorSeverity } = await import("./services/alerting");
      const { severity = "medium", channel } = req.body;

      await alertingService.sendAlert({
        severity: severity as any,
        title: "Test Alert",
        description: "This is a test alert to verify your alerting configuration.",
        category: "test",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date(),
        dashboardUrl: process.env.SENTRY_DASHBOARD_URL,
      });

      res.json({ message: "Test alert sent successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // BACKUP & DISASTER RECOVERY ENDPOINTS
  // ============================================================================

  /**
   * Get backup system health status
   */
  app.get("/api/admin/backup/health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { backupService } = await import("./services/backup");
      const health = await backupService.getBackupHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * List all available backups
   */
  app.get("/api/admin/backup/list", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { backupService } = await import("./services/backup");
      const backups = backupService.listBackups();
      res.json({ backups });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Create a new backup (manual)
   */
  app.post("/api/admin/backup/create", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { backupService } = await import("./services/backup");
      const { type = "manual" } = req.body;
      const result = await backupService.createBackup(type);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get current database row counts (for backup verification)
   */
  app.get("/api/admin/backup/row-counts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { backupService } = await import("./services/backup");
      const counts = await backupService.getRowCounts();
      res.json({ counts });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Export user data (GDPR compliance - admin only)
   */
  app.get("/api/admin/user/:userId/export", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userDataExportService } = await import("./services/backup");
      const { userId } = req.params;
      const exportData = await userDataExportService.exportUserData(userId, "json");

      // Log this PHI export action
      await logAuditEvent({
        userId: (req.user as any).id,
        userRole: (req.user as any).role,
        action: "PHI_EXPORT",
        result: "SUCCESS",
        resourceType: "USER",
        resourceId: userId,
        targetUserId: userId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestPath: req.path,
        requestMethod: req.method,
        metadata: { exportFormat: "json" },
      });

      res.json(exportData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Export own user data (GDPR data portability - any authenticated user)
   */
  app.get("/api/user/export", requireAuth, async (req, res) => {
    try {
      const { userDataExportService } = await import("./services/backup");
      const userId = (req.user as any).id;
      const exportData = await userDataExportService.exportUserData(userId, "json");

      // Log this action
      await logAuditEvent({
        userId,
        userRole: (req.user as any).role,
        action: "PHI_EXPORT",
        result: "SUCCESS",
        resourceType: "USER",
        resourceId: userId,
        targetUserId: userId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestPath: req.path,
        requestMethod: req.method,
        metadata: { exportFormat: "json", selfExport: true },
      });

      res.json(exportData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // PERFORMANCE MONITORING ENDPOINTS
  // ============================================================================

  /**
   * Get performance summary (last hour)
   */
  app.get("/api/admin/performance/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { performanceMonitor } = await import("./services/performanceMonitor");
      const summary = performanceMonitor.getSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get real-time performance metrics
   */
  app.get("/api/admin/performance/realtime", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { performanceMonitor } = await import("./services/performanceMonitor");
      const metrics = performanceMonitor.getRealTimeMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get performance budgets configuration
   */
  app.get("/api/admin/performance/budgets", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { PERFORMANCE_BUDGETS, PILOT_SCALE } = await import("./config/performance");
      res.json({ budgets: PERFORMANCE_BUDGETS, pilotScale: PILOT_SCALE });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // HEALTH CHECK ENDPOINTS
  // ============================================================================

  /**
   * Liveness check - is the application process running?
   * Used by load balancers and orchestrators to detect crashed processes.
   * No authentication required - must be accessible for health probes.
   */
  app.get("/health/live", async (req, res) => {
    try {
      const { checkLiveness } = await import("./services/healthCheck");
      const status = await checkLiveness();
      res.status(status.status === "healthy" ? 200 : 503).json(status);
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * Readiness check - can the application handle requests?
   * Used by load balancers to route traffic only to ready instances.
   * No authentication required - must be accessible for health probes.
   */
  app.get("/health/ready", async (req, res) => {
    try {
      const { checkReadiness } = await import("./services/healthCheck");
      const status = await checkReadiness();
      res.status(status.status === "healthy" ? 200 : 503).json(status);
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * Database health check - detailed database connectivity status.
   * No authentication required - must be accessible for monitoring.
   */
  app.get("/health/db", async (req, res) => {
    try {
      const { checkDatabase } = await import("./services/healthCheck");
      const status = await checkDatabase();
      res.status(status.status === "healthy" ? 200 : 503).json(status);
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * External services health check - third-party service status.
   * No authentication required - must be accessible for monitoring.
   */
  app.get("/health/external", async (req, res) => {
    try {
      const { checkExternalServices } = await import("./services/healthCheck");
      const status = await checkExternalServices();
      res.status(status.status === "healthy" ? 200 : 503).json(status);
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  /**
   * Full health status - combined health check for dashboards.
   * Requires admin authentication for detailed system information.
   */
  app.get("/api/admin/health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { getFullHealthStatus } = await import("./services/healthCheck");
      const status = await getFullHealthStatus();
      res.status(status.overall === "healthy" ? 200 : 503).json(status);
    } catch (error: any) {
      res.status(503).json({
        overall: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  // ============================================================================
  // APPLICATION METRICS ENDPOINTS
  // ============================================================================

  /**
   * Get application metrics - detailed system and request metrics.
   * Requires admin authentication.
   */
  app.get("/api/admin/metrics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { applicationMetrics } = await import("./services/applicationMetrics");
      const metrics = applicationMetrics.getMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get metrics in Prometheus format for external monitoring systems.
   * No authentication - must be accessible by Prometheus scraper.
   * Note: Consider restricting by IP or using a separate port in production.
   */
  app.get("/metrics", async (req, res) => {
    try {
      const { applicationMetrics } = await import("./services/applicationMetrics");
      const metrics = applicationMetrics.getPrometheusMetrics();
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.send(metrics);
    } catch (error: any) {
      res.status(500).send(`# Error collecting metrics: ${error.message}`);
    }
  });

  // ============================================================================
  // BUSINESS METRICS ENDPOINTS
  // ============================================================================

  /**
   * Get full business metrics snapshot
   * Requires admin authentication.
   */
  app.get("/api/admin/business-metrics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { businessMetrics } = await import("./services/businessMetrics");
      const metrics = await businessMetrics.getMetricsSnapshot();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get business metrics dashboard summary (quick KPIs)
   * Requires admin or coach authentication.
   */
  app.get("/api/admin/business-metrics/summary", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { businessMetrics } = await import("./services/businessMetrics");
      const summary = await businessMetrics.getDashboardSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get pilot success metrics
   * Requires admin authentication.
   */
  app.get("/api/admin/business-metrics/pilot", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { businessMetrics } = await import("./services/businessMetrics");
      const pilot = await businessMetrics.getPilotSuccess();
      res.json(pilot);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get user engagement metrics
   * Requires admin or coach authentication.
   */
  app.get("/api/admin/business-metrics/engagement", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { businessMetrics } = await import("./services/businessMetrics");
      const engagement = await businessMetrics.getUserEngagement();
      res.json(engagement);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get coach metrics
   * Requires admin authentication.
   */
  app.get("/api/admin/business-metrics/coaches", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { businessMetrics } = await import("./services/businessMetrics");
      const coaches = await businessMetrics.getCoachMetrics();
      res.json(coaches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SYNTHETIC MONITORING ENDPOINTS
  // ============================================================================

  /**
   * Run all synthetic tests and get results
   * Requires admin authentication.
   */
  app.post("/api/admin/synthetic/run", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syntheticMonitoring } = await import("./services/syntheticMonitoring");
      const results = await syntheticMonitoring.runAllTests();
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get synthetic monitoring summary (last run results)
   * Requires admin authentication.
   */
  app.get("/api/admin/synthetic/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syntheticMonitoring } = await import("./services/syntheticMonitoring");
      const summary = syntheticMonitoring.getSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get list of available synthetic tests
   * Requires admin authentication.
   */
  app.get("/api/admin/synthetic/tests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syntheticMonitoring } = await import("./services/syntheticMonitoring");
      const tests = syntheticMonitoring.getAvailableTests();
      res.json(tests);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Run a specific synthetic test
   * Requires admin authentication.
   */
  app.post("/api/admin/synthetic/run/:testName", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syntheticMonitoring } = await import("./services/syntheticMonitoring");
      const result = await syntheticMonitoring.runTest(req.params.testName);
      if (!result) {
        return res.status(404).json({ message: `Test '${req.params.testName}' not found` });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Start periodic synthetic monitoring
   * Requires admin authentication.
   */
  app.post("/api/admin/synthetic/start", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syntheticMonitoring } = await import("./services/syntheticMonitoring");
      const intervalMinutes = req.body.intervalMinutes || 5;
      syntheticMonitoring.startPeriodicMonitoring(intervalMinutes);
      res.json({ message: `Started periodic monitoring every ${intervalMinutes} minutes` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Stop periodic synthetic monitoring
   * Requires admin authentication.
   */
  app.post("/api/admin/synthetic/stop", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { syntheticMonitoring } = await import("./services/syntheticMonitoring");
      syntheticMonitoring.stopPeriodicMonitoring();
      res.json({ message: "Stopped periodic monitoring" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // ALERTING ENDPOINTS
  // ============================================================================

  /**
   * Get alerting rules and configuration
   * Requires admin authentication.
   */
  app.get("/api/admin/alerting/rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { ALERT_RULES, DEFAULT_ALERT_CONFIG } = await import("./services/alerting");
      res.json({
        rules: ALERT_RULES,
        config: DEFAULT_ALERT_CONFIG,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Send a test alert
   * Requires admin authentication.
   */
  app.post("/api/admin/alerting/test", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { alertingService, ErrorSeverity } = await import("./services/alerting");
      const { severity = "medium", title = "Test Alert", description = "This is a test alert" } = req.body;

      const severityMap: Record<string, any> = {
        critical: ErrorSeverity.CRITICAL,
        high: ErrorSeverity.HIGH,
        medium: ErrorSeverity.MEDIUM,
        low: ErrorSeverity.LOW,
      };

      await alertingService.sendAlert({
        severity: severityMap[severity.toLowerCase()] || ErrorSeverity.MEDIUM,
        title,
        description,
        category: "test_alert",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date(),
      });

      res.json({ message: "Test alert sent successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Evaluate alert rules against current metrics
   * Requires admin authentication.
   */
  app.post("/api/admin/alerting/evaluate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { alertingService } = await import("./services/alerting");
      const { performanceMonitor } = await import("./services/performanceMonitor");
      const { applicationMetrics } = await import("./services/applicationMetrics");

      // Gather metrics from various sources
      const realtime = performanceMonitor.getRealTimeMetrics();
      const appMetrics = applicationMetrics.getMetrics();

      const alertMetrics = {
        errorCountLast5Min: appMetrics.errors.total,
        errorCountLast1Hour: appMetrics.errors.total,
        errorRatePerMinute: realtime.errorRate * realtime.requestsPerMinute,
        baselineErrorRatePerMinute: 0.5, // Baseline - would come from historical data
        criticalErrorCount: appMetrics.errors.byType["critical"] || 0,
        highErrorCount: appMetrics.errors.byType["high"] || 0,
        newErrorTypes: [],
        affectedUsers: 0, // Would need user tracking
      };

      await alertingService.evaluateRules(alertMetrics);
      res.json({ message: "Alert rules evaluated", metrics: alertMetrics });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get comprehensive monitoring dashboard data
   * Combines health, metrics, alerts, and synthetic tests.
   * Requires admin authentication.
   */
  app.get("/api/admin/monitoring/dashboard", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [
        { getFullHealthStatus },
        { applicationMetrics },
        { businessMetrics },
        { syntheticMonitoring },
        { performanceMonitor },
      ] = await Promise.all([
        import("./services/healthCheck"),
        import("./services/applicationMetrics"),
        import("./services/businessMetrics"),
        import("./services/syntheticMonitoring"),
        import("./services/performanceMonitor"),
      ]);

      const [health, appMetrics, pilotSummary, syntheticSummary, perfSummary] = await Promise.all([
        getFullHealthStatus(),
        applicationMetrics.getMetrics(),
        businessMetrics.getDashboardSummary(),
        syntheticMonitoring.getSummary(),
        performanceMonitor.getSummary(),
      ]);

      res.json({
        timestamp: new Date().toISOString(),
        health: {
          overall: health.overall,
          components: {
            liveness: health.components.liveness.status,
            readiness: health.components.readiness.status,
            database: health.components.database.status,
            external: health.components.external.status,
          },
        },
        application: {
          health: appMetrics.health,
          requestsPerMinute: appMetrics.requests.total > 0
            ? Math.round(appMetrics.requests.total / (appMetrics.system.uptime / 60))
            : 0,
          errorRate: appMetrics.errors.rate,
          memoryPercent: appMetrics.system.memory.percentUsed,
          uptime: appMetrics.system.uptime,
        },
        pilot: pilotSummary,
        synthetic: {
          overall: syntheticSummary.overall,
          passed: syntheticSummary.passedCount,
          failed: syntheticSummary.failedCount,
          lastRun: syntheticSummary.lastRun,
        },
        performance: {
          overall: perfSummary.overallHealth,
          budgetViolations: perfSummary.budgetViolations.length,
          slowQueries: perfSummary.slowQueries.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SUPPORT TICKET ENDPOINTS
  // ============================================================================

  /**
   * Create a support ticket (any authenticated user)
   */
  app.post("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const user = req.user as any;

      const { category, subject, description, metadata } = req.body;

      if (!category || !subject || !description) {
        return res.status(400).json({ message: "Category, subject, and description are required" });
      }

      const ticket = await supportTickets.createTicket({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        category,
        subject,
        description,
        metadata,
      });

      res.status(201).json(ticket);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get user's own tickets
   */
  app.get("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const user = req.user as any;

      const tickets = supportTickets.getAllTickets({ userId: user.id });
      res.json(tickets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Add response to own ticket
   */
  app.post("/api/support/tickets/:ticketId/responses", requireAuth, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const user = req.user as any;
      const { ticketId } = req.params;
      const { message } = req.body;

      const ticket = supportTickets.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      if (ticket.userId !== user.id && user.role === "participant") {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updated = await supportTickets.addResponse(
        ticketId,
        user.id,
        user.role,
        message,
        false
      );

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Get all tickets
   */
  app.get("/api/admin/support/tickets", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");

      const { status, priority, category } = req.query;
      const tickets = supportTickets.getAllTickets({
        status: status as any,
        priority: priority as any,
        category: category as any,
      });

      res.json(tickets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Get ticket statistics
   */
  app.get("/api/admin/support/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const stats = supportTickets.getStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Get SLA breaches
   */
  app.get("/api/admin/support/sla-breaches", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const breaches = supportTickets.getSlaBreaches();
      res.json(breaches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Update ticket status
   */
  app.patch("/api/admin/support/tickets/:ticketId", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const user = req.user as any;
      const { ticketId } = req.params;
      const { status, resolution, assignedTo } = req.body;

      let ticket = supportTickets.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      if (assignedTo) {
        ticket = await supportTickets.assignTicket(ticketId, assignedTo, user.id);
      }

      if (status) {
        ticket = await supportTickets.updateStatus(ticketId, status, resolution, user.id);
      }

      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Add internal note to ticket
   */
  app.post("/api/admin/support/tickets/:ticketId/notes", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { supportTickets } = await import("./services/supportTickets");
      const user = req.user as any;
      const { ticketId } = req.params;
      const { message } = req.body;

      const ticket = await supportTickets.addResponse(
        ticketId,
        user.id,
        user.role,
        message,
        true // internal note
      );

      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // FEEDBACK ENDPOINTS
  // ============================================================================

  /**
   * Submit feedback (any authenticated user)
   */
  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");
      const user = req.user as any;

      const { type, content, rating, npsScore, context, tags } = req.body;

      if (!type || !content) {
        return res.status(400).json({ message: "Type and content are required" });
      }

      const feedback = await feedbackService.submitFeedback({
        userId: user.id,
        userRole: user.role,
        type,
        content,
        rating,
        npsScore,
        context,
        tags,
      });

      res.status(201).json(feedback);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get user's own feedback
   */
  app.get("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");
      const user = req.user as any;

      const feedback = feedbackService.getAllFeedback({ userId: user.id });
      res.json(feedback);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Get all feedback
   */
  app.get("/api/admin/feedback", requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");

      const { type, status, tag, since } = req.query;
      const feedback = feedbackService.getAllFeedback({
        type: type as any,
        status: status as any,
        tag: tag as string,
        since: since ? new Date(since as string) : undefined,
      });

      res.json(feedback);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Get feedback summary
   */
  app.get("/api/admin/feedback/summary", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");

      const { since } = req.query;
      const summary = feedbackService.getSummary(
        since ? new Date(since as string) : undefined
      );

      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Get feature requests summary
   */
  app.get("/api/admin/feedback/feature-requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");
      const requests = feedbackService.getFeatureRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Update feedback status
   */
  app.patch("/api/admin/feedback/:feedbackId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");
      const user = req.user as any;
      const { feedbackId } = req.params;
      const { status, response, tags } = req.body;

      let feedback = feedbackService.getFeedback(feedbackId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      if (status) {
        feedback = await feedbackService.updateFeedbackStatus(
          feedbackId,
          status,
          response,
          user.id
        );
      }

      if (tags) {
        feedback = feedbackService.addTags(feedbackId, tags);
      }

      res.json(feedback);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Admin: Export feedback for analysis
   */
  app.get("/api/admin/feedback/export", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { feedbackService } = await import("./services/feedback");
      const data = feedbackService.exportFeedback();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
