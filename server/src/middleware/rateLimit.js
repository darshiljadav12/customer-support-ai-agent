import { rateLimit } from 'express-rate-limit';

const json = (message) => ({ error: { message } });

// General API limiter.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('Too many requests, please try again later.'),
});

// Strict limiter for login/signup to slow down brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('Too many auth attempts, please try again in 15 minutes.'),
});

// AI calls cost money and quota → limit per authenticated user (not per IP).
// Must run after requireAuth.
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user._id}`,
  message: json('You are sending messages too quickly. Please wait a moment.'),
});
