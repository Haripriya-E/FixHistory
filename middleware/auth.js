import jwt from 'jsonwebtoken';
import { env, durationToMs } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { AUTH_COOKIE } from '../utils/constants.js';

/** Cookie settings: HTTP-only so JavaScript in the browser can never read the token. */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: durationToMs(env.jwtExpiresIn),
  };
}

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function setAuthCookie(res, userId) {
  res.cookie(AUTH_COOKIE, signToken(userId), authCookieOptions());
}

export function clearAuthCookie(res) {
  const { maxAge, ...options } = authCookieOptions();
  res.clearCookie(AUTH_COOKIE, options);
}

async function resolveUser(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
  return User.findById(payload.sub);
}

/**
 * Requires a valid login. The user is always taken from the verified token,
 * never from an id sent by the client.
 */
export async function protect(req, _res, next) {
  const hasToken = Boolean(req.cookies?.[AUTH_COOKIE]);
  const user = await resolveUser(req);
  if (!user) {
    throw ApiError.unauthorized(
      hasToken ? 'Your session has expired. Please log in again.' : 'Please log in to continue.',
    );
  }
  req.user = user;
  next();
}

/** Attaches the user when logged in, but allows anonymous access (used by the public passport). */
export async function optionalAuth(req, _res, next) {
  req.user = (await resolveUser(req)) || null;
  next();
}
