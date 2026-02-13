import type { Request, Response, NextFunction, RequestHandler } from "express";
import { randomBytes } from "crypto";

// ============================================================================
// PASSWORD VALIDATION
// ============================================================================

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password against security requirements
 * For healthcare apps, we use stricter requirements
 */
export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== "string") {
    return { valid: false, errors: ["Password is required"] };
  }

  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters`);
  }

  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (requirements.requireNumbers && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;':\",./<>?)");
  }

  // Check for common weak patterns
  const commonPatterns = [
    /^(.)\1+$/,                    // All same character
    /^(012|123|234|345|456|567|678|789)+$/,  // Sequential numbers
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i,  // Sequential letters
    /password/i,
    /qwerty/i,
    /admin/i,
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push("Password contains a common weak pattern");
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get human-readable password requirements message
 */
export function getPasswordRequirementsMessage(): string {
  return `Password must be at least 12 characters and contain: uppercase letter, lowercase letter, number, and special character`;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxAttempts: number;     // Max attempts within window
  lockoutDurationMs: number; // How long to lock out after exceeding
  skipSuccessfulRequests?: boolean;
}

const DEFAULT_LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,      // 15 minutes
  maxAttempts: 5,                 // 5 attempts
  lockoutDurationMs: 15 * 60 * 1000, // 15 minute lockout
};

// In-memory store for rate limiting (should use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    // Remove entries older than lockout duration
    if (now - entry.firstAttempt > DEFAULT_LOGIN_RATE_LIMIT.lockoutDurationMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Cleanup every minute

/**
 * Get rate limit key for a request (IP + optional identifier)
 */
function getRateLimitKey(req: Request, identifier?: string): string {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return identifier ? `${ip}:${identifier}` : ip;
}

/**
 * Check if a request is rate limited
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_LOGIN_RATE_LIMIT
): { allowed: boolean; retryAfter?: number; remainingAttempts: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    return { allowed: true, remainingAttempts: config.maxAttempts };
  }

  // Check if currently locked out
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter, remainingAttempts: 0 };
  }

  // Check if window has expired
  if (now - entry.firstAttempt > config.windowMs) {
    rateLimitStore.delete(key);
    return { allowed: true, remainingAttempts: config.maxAttempts };
  }

  // Check attempt count
  if (entry.count >= config.maxAttempts) {
    // Lock the account
    entry.lockedUntil = now + config.lockoutDurationMs;
    rateLimitStore.set(key, entry);
    const retryAfter = Math.ceil(config.lockoutDurationMs / 1000);
    return { allowed: false, retryAfter, remainingAttempts: 0 };
  }

  return { allowed: true, remainingAttempts: config.maxAttempts - entry.count };
}

/**
 * Record a rate limit attempt
 */
export function recordRateLimitAttempt(key: string, config: RateLimitConfig = DEFAULT_LOGIN_RATE_LIMIT): void {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.firstAttempt > config.windowMs) {
    rateLimitStore.set(key, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
    rateLimitStore.set(key, entry);
  }
}

/**
 * Clear rate limit for a key (e.g., after successful login)
 */
export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Middleware factory for rate limiting
 */
export function rateLimit(config: RateLimitConfig = DEFAULT_LOGIN_RATE_LIMIT): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getRateLimitKey(req);
    const result = checkRateLimit(key, config);

    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      res.status(429).json({
        message: "Too many attempts. Please try again later.",
        retryAfter: result.retryAfter,
      });
      return;
    }

    // Add remaining attempts to response headers
    res.set("X-RateLimit-Remaining", String(result.remainingAttempts));

    next();
  };
}

/**
 * Create login-specific rate limiter that tracks by email
 */
export function loginRateLimiter(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const email = req.body?.email;
    const ipKey = getRateLimitKey(req);
    const emailKey = email ? getRateLimitKey(req, email) : null;

    // Check both IP and email-based limits
    const ipResult = checkRateLimit(ipKey);
    const emailResult = emailKey ? checkRateLimit(emailKey) : { allowed: true, remainingAttempts: 999 };

    if (!ipResult.allowed) {
      res.set("Retry-After", String(ipResult.retryAfter));
      res.status(429).json({
        message: "Too many login attempts from this IP. Please try again later.",
        retryAfter: ipResult.retryAfter,
      });
      return;
    }

    if (!emailResult.allowed) {
      res.set("Retry-After", String(emailResult.retryAfter));
      res.status(429).json({
        message: "Too many login attempts for this account. Please try again later.",
        retryAfter: emailResult.retryAfter,
      });
      return;
    }

    // Store keys for later recording
    (req as any)._rateLimitKeys = { ipKey, emailKey };

    next();
  };
}

/**
 * Record failed login attempt
 */
export function recordFailedLogin(req: Request): void {
  const keys = (req as any)._rateLimitKeys;
  if (keys) {
    recordRateLimitAttempt(keys.ipKey);
    if (keys.emailKey) {
      recordRateLimitAttempt(keys.emailKey);
    }
  }
}

/**
 * Clear rate limit after successful login
 */
export function recordSuccessfulLogin(req: Request): void {
  const keys = (req as any)._rateLimitKeys;
  if (keys) {
    clearRateLimit(keys.ipKey);
    if (keys.emailKey) {
      clearRateLimit(keys.emailKey);
    }
  }
}

// ============================================================================
// CSRF PROTECTION
// ============================================================================

const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_NAME = "_csrf";

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * CSRF protection middleware
 * Sets a CSRF token cookie and validates it on state-changing requests
 */
export function csrfProtection(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip CSRF for safe methods
    const safeMethods = ["GET", "HEAD", "OPTIONS"];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    // Get token from cookie and header
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.get(CSRF_HEADER_NAME);

    // If no cookie token exists, set one and reject this request
    if (!cookieToken) {
      const newToken = generateCsrfToken();
      res.cookie(CSRF_COOKIE_NAME, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      res.status(403).json({ message: "CSRF token missing. Please refresh and try again." });
      return;
    }

    // Validate header token matches cookie token
    if (!headerToken || headerToken !== cookieToken) {
      res.status(403).json({ message: "Invalid CSRF token" });
      return;
    }

    next();
  };
}

/**
 * Middleware to set CSRF token on responses (for SPA to read)
 */
export function setCsrfToken(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const token = generateCsrfToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Allow JS to read for header
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }
    next();
  };
}

// ============================================================================
// ACCOUNT LOCKOUT
// ============================================================================

interface AccountLockoutEntry {
  failedAttempts: number;
  lastFailedAttempt: number;
  lockedUntil?: number;
}

const accountLockoutStore = new Map<string, AccountLockoutEntry>();

const LOCKOUT_CONFIG = {
  maxFailedAttempts: 5,
  lockoutDurationMs: 30 * 60 * 1000, // 30 minutes
  attemptWindowMs: 15 * 60 * 1000,   // 15 minutes
};

/**
 * Check if an account is locked
 */
export function isAccountLocked(userId: string): { locked: boolean; lockedUntil?: Date } {
  const entry = accountLockoutStore.get(userId);

  if (!entry) {
    return { locked: false };
  }

  const now = Date.now();

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { locked: true, lockedUntil: new Date(entry.lockedUntil) };
  }

  // Check if attempts window has expired
  if (now - entry.lastFailedAttempt > LOCKOUT_CONFIG.attemptWindowMs) {
    accountLockoutStore.delete(userId);
    return { locked: false };
  }

  return { locked: false };
}

/**
 * Record a failed login attempt for an account
 */
export function recordFailedLoginAttempt(userId: string): { locked: boolean; attemptsRemaining: number } {
  const now = Date.now();
  const entry = accountLockoutStore.get(userId);

  if (!entry || now - entry.lastFailedAttempt > LOCKOUT_CONFIG.attemptWindowMs) {
    accountLockoutStore.set(userId, {
      failedAttempts: 1,
      lastFailedAttempt: now,
    });
    return { locked: false, attemptsRemaining: LOCKOUT_CONFIG.maxFailedAttempts - 1 };
  }

  entry.failedAttempts++;
  entry.lastFailedAttempt = now;

  if (entry.failedAttempts >= LOCKOUT_CONFIG.maxFailedAttempts) {
    entry.lockedUntil = now + LOCKOUT_CONFIG.lockoutDurationMs;
    accountLockoutStore.set(userId, entry);
    return { locked: true, attemptsRemaining: 0 };
  }

  accountLockoutStore.set(userId, entry);
  return { locked: false, attemptsRemaining: LOCKOUT_CONFIG.maxFailedAttempts - entry.failedAttempts };
}

/**
 * Clear failed login attempts after successful login
 */
export function clearFailedLoginAttempts(userId: string): void {
  accountLockoutStore.delete(userId);
}

// ============================================================================
// SECURE TOKEN GENERATION
// ============================================================================

/**
 * Generate a secure random token for password reset, etc.
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Generate a time-limited token with embedded expiry
 */
export function generateTimeLimitedToken(expiryMinutes: number = 30): { token: string; expiry: Date } {
  const token = generateSecureToken(32);
  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
  return { token, expiry };
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Middleware to set security headers
 */
export function securityHeaders(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Prevent clickjacking
    res.set("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    res.set("X-Content-Type-Options", "nosniff");

    // XSS protection
    res.set("X-XSS-Protection", "1; mode=block");

    // Referrer policy
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy (basic - customize for your app)
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
    );

    // HSTS - Enforce HTTPS for 1 year (only in production)
    if (process.env.NODE_ENV === "production") {
      res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  };
}

// ============================================================================
// HTTPS REDIRECT
// ============================================================================

/**
 * Middleware to redirect HTTP to HTTPS in production
 */
export function forceHttps(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only enforce in production
    if (process.env.NODE_ENV !== "production") {
      return next();
    }

    // Check if request is secure (handles proxy scenarios)
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

    if (!isSecure) {
      const httpsUrl = `https://${req.headers.host}${req.url}`;
      res.redirect(301, httpsUrl);
      return;
    }

    next();
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Sanitize error messages for client responses
 * In production, returns generic message; in development, returns full error
 */
export function sanitizeError(error: any, context?: string): { message: string; details?: string } {
  // Log full error for debugging
  if (context) {
    console.error(`Error in ${context}:`, error);
  } else {
    console.error("Error:", error);
  }

  // In production, return generic message
  if (process.env.NODE_ENV === "production") {
    return { message: "An internal error occurred" };
  }

  // In development, return full error details
  return {
    message: error.message || "An error occurred",
    details: error.stack,
  };
}

/**
 * Create a standardized error response
 */
export function errorResponse(res: Response, error: any, context?: string, statusCode: number = 500): void {
  const sanitized = sanitizeError(error, context);
  res.status(statusCode).json(sanitized);
}

// ============================================================================
// LOG SANITIZATION
// ============================================================================

/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "newPassword",
  "token",
  "secret",
  "apiKey",
  "authorization",
  // PHI fields
  "email",
  "phone",
  "dateOfBirth",
  "ssn",
  "socialSecurityNumber",
  // Health data
  "valueJson",
  "rawText",
  "body",
  "notes",
  "aiOutputJson",
  "userCorrectionsJson",
];

/**
 * Recursively sanitize an object for logging
 * @param obj - Object to sanitize
 * @param depth - Current recursion depth (max 10)
 * @returns Sanitized object safe for logging
 */
export function sanitizeForLogging(obj: any, depth: number = 0): any {
  if (depth > 10) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Truncate long strings
    return obj.length > 200 ? obj.substring(0, 200) + "...[truncated]" : obj;
  }

  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    // Only show first 3 items of arrays
    const sanitized = obj.slice(0, 3).map((item) => sanitizeForLogging(item, depth + 1));
    if (obj.length > 3) {
      sanitized.push(`...[${obj.length - 3} more items]`);
    }
    return sanitized;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if this is a sensitive field
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    }
  }

  return sanitized;
}

// ============================================================================
// FILE UPLOAD VALIDATION
// ============================================================================

/**
 * Magic bytes signatures for common image formats
 */
const IMAGE_SIGNATURES: Record<string, Buffer[]> = {
  "image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
  "image/png": [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  "image/gif": [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
  "image/webp": [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header (need to also check for WEBP at offset 8)
  "image/bmp": [Buffer.from([0x42, 0x4d])],
};

/**
 * Validate file content matches its declared MIME type
 * @param buffer - File buffer
 * @param declaredMimeType - MIME type from multipart header
 * @returns true if file content matches expected format
 */
export function validateFileSignature(buffer: Buffer, declaredMimeType: string): boolean {
  const signatures = IMAGE_SIGNATURES[declaredMimeType];

  if (!signatures) {
    // Unknown image type - allow if MIME starts with image/
    return declaredMimeType.startsWith("image/");
  }

  // Check if file starts with any of the valid signatures
  for (const signature of signatures) {
    if (buffer.length >= signature.length) {
      const fileHeader = buffer.slice(0, signature.length);
      if (fileHeader.equals(signature)) {
        // Special handling for WebP - need to verify WEBP marker at offset 8
        if (declaredMimeType === "image/webp" && buffer.length >= 12) {
          const webpMarker = buffer.slice(8, 12).toString("ascii");
          return webpMarker === "WEBP";
        }
        return true;
      }
    }
  }

  return false;
}

/**
 * Get actual file type from magic bytes
 * @param buffer - File buffer
 * @returns Detected MIME type or null if unknown
 */
export function detectFileType(buffer: Buffer): string | null {
  for (const [mimeType, signatures] of Object.entries(IMAGE_SIGNATURES)) {
    for (const signature of signatures) {
      if (buffer.length >= signature.length) {
        const fileHeader = buffer.slice(0, signature.length);
        if (fileHeader.equals(signature)) {
          // Special handling for WebP
          if (mimeType === "image/webp" && buffer.length >= 12) {
            const webpMarker = buffer.slice(8, 12).toString("ascii");
            if (webpMarker !== "WEBP") continue;
          }
          return mimeType;
        }
      }
    }
  }
  return null;
}
