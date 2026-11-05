import { User } from '../models/index.js';
import { clearAuthCookie, setAuthCookie } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/response.js';

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  isDemo: user.isDemo,
  createdAt: user.createdAt,
});

/** POST /api/auth/register */
export async function register(req, res) {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists.');
  const user = await User.create({ name, email, password });
  setAuthCookie(res, user._id);
  sendSuccess(res, { user: publicUser(user) }, { status: 201, message: 'Account created.' });
}

/** POST /api/auth/login */
export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password, so accounts cannot be discovered.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }
  setAuthCookie(res, user._id);
  sendSuccess(res, { user: publicUser(user) }, { message: 'Logged in.' });
}

/** POST /api/auth/logout */
export function logout(_req, res) {
  clearAuthCookie(res);
  sendSuccess(res, null, { message: 'Logged out.' });
}

/** GET /api/auth/me */
export function me(req, res) {
  sendSuccess(res, { user: publicUser(req.user) });
}

/**
 * GET /api/auth/session
 * Like /me, but answers 200 with { user: null } for visitors who are not logged in.
 * The React app calls this on page load so anonymous visits do not log 401 errors.
 */
export function session(req, res) {
  sendSuccess(res, { user: req.user ? publicUser(req.user) : null });
}

/** PUT /api/auth/profile */
export async function updateProfile(req, res) {
  req.user.name = req.body.name;
  await req.user.save();
  sendSuccess(res, { user: publicUser(req.user) }, { message: 'Profile updated.' });
}

/** PUT /api/auth/password */
export async function changePassword(req, res) {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw ApiError.validation([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  user.password = req.body.newPassword;
  await user.save();
  setAuthCookie(res, user._id);
  sendSuccess(res, null, { message: 'Password changed.' });
}
