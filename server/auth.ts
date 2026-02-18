import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage, pool } from "./storage";
import type { User } from "@shared/schema";
import {
  isAccountLocked,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from "./middleware/security";

const scryptAsync = promisify(scrypt);

/**
 * Secure password hashing using scrypt
 * - 64-byte key length (512 bits)
 * - 16-byte random salt per password
 * - Timing-safe comparison to prevent timing attacks
 */
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    try {
      const [hashedPassword, salt] = storedPassword.split(".");
      if (!hashedPassword || !salt) {
        return false;
      }
      const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
      const suppliedPasswordBuf = (await scryptAsync(
        suppliedPassword,
        salt,
        64
      )) as Buffer;
      return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
    } catch {
      // Don't leak error details - just return false
      return false;
    }
  },
};

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
      name: string;
      coachId?: string | null;
      forcePasswordReset: boolean;
      aiConsentGiven: boolean;
      unitsPreference: string;
    }
  }
}

// Session configuration constants for healthcare app
const SESSION_CONFIG = {
  // Session timeout: 30 minutes for healthcare apps (balance security vs usability)
  maxAge: 30 * 60 * 1000, // 30 minutes

  // Rolling session: extends on activity
  rolling: true,

  // Cleanup interval: check for expired sessions every hour
  checkPeriod: 60 * 60 * 1000,
};

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const PgStore = connectPgSimple(session);

  // Require SESSION_SECRET in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  // Use PostgreSQL session store in production, memory store in development
  const isProduction = process.env.NODE_ENV === "production";

  const sessionStore = isProduction
    ? new PgStore({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
        pruneSessionInterval: 60, // Prune expired sessions every 60 seconds
      })
    : new MemoryStore({
        checkPeriod: SESSION_CONFIG.checkPeriod,
      });

  if (isProduction) {
    console.log("Using PostgreSQL session store for production");
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret || process.env.REPL_ID || randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    rolling: SESSION_CONFIG.rolling,
    name: "metabolic.sid", // Custom session cookie name (don't use default)
    cookie: {
      httpOnly: true,       // Prevent XSS access to cookie
      secure: isProduction, // HTTPS only in production
      sameSite: "lax",      // CSRF protection
      maxAge: SESSION_CONFIG.maxAge,
      path: "/",
    },
    store: sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    // Ensure secure cookies in production
    if (sessionSettings.cookie) {
      sessionSettings.cookie.secure = true;
    }
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passReqToCallback: true },
      async (req, email, password, done) => {
        try {
          // Normalize email
          const normalizedEmail = email.toLowerCase().trim();

          const user = await storage.getUserByEmail(normalizedEmail);

          // Use same error message for both cases to prevent user enumeration
          const genericError = { message: "Invalid email or password" };

          if (!user || !user.passwordHash) {
            // Perform a dummy comparison to prevent timing attacks
            await crypto.compare(password, "dummy.dummy");
            return done(null, false, genericError);
          }

          // Check if account is locked
          const lockStatus = isAccountLocked(user.id);
          if (lockStatus.locked) {
            return done(null, false, {
              message: `Account is temporarily locked. Try again after ${lockStatus.lockedUntil?.toLocaleTimeString()}`,
            });
          }

          const isValid = await crypto.compare(password, user.passwordHash);
          if (!isValid) {
            // Record failed attempt
            const lockoutResult = recordFailedLoginAttempt(user.id);
            if (lockoutResult.locked) {
              return done(null, false, {
                message: "Too many failed attempts. Account has been temporarily locked.",
              });
            }
            return done(null, false, genericError);
          }

          // Clear failed attempts on successful login
          clearFailedLoginAttempts(user.id);

          // Check if account is active
          if (user.status === "inactive") {
            return done(null, false, { message: "Account is inactive. Please contact support." });
          }

          return done(null, {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            forcePasswordReset: user.forcePasswordReset,
            aiConsentGiven: user.aiConsentGiven ?? false,
            unitsPreference: user.unitsPreference ?? "US",
          });
        } catch (err) {
          // Don't expose internal errors
          console.error("Login error:", err);
          return done(null, false, { message: "An error occurred during login" });
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }

      // Check if account has been deactivated since login
      if (user.status === "inactive") {
        return done(null, false);
      }

      done(null, {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        coachId: user.coachId,
        forcePasswordReset: user.forcePasswordReset,
        aiConsentGiven: user.aiConsentGiven ?? false,
        unitsPreference: user.unitsPreference ?? "US",
      });
    } catch (err) {
      console.error("Deserialize error:", err);
      done(null, false);
    }
  });
}

export { crypto };
