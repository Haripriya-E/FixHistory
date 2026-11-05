import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const json = (message) => ({ success: false, message });

const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest, // automated tests make many requests quickly
};

/** Slows down password guessing on login and registration. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: json('Too many login attempts. Please wait 15 minutes and try again.'),
});

/** Limits guessing of ownership transfer codes (per logged-in user). */
export const transferCodeLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 15,
  keyGenerator: (req) => `user:${req.user._id}`,
  message: json('Too many transfer code attempts. Please wait 15 minutes and try again.'),
});

/** Limits scanning of public passport links. */
export const publicLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 60,
  message: json('Too many requests. Please slow down.'),
});
