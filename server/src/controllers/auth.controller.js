import { z } from 'zod';
import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../utils/jwt.js';

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'), // bcrypt only uses 72 bytes
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  password: z.string().min(1, 'Password is required'),
});

function sendAuth(res, status, user) {
  const token = signToken(user._id.toString());
  setAuthCookie(res, token);
  // Token is also returned in the body for non-browser clients (Postman, mobile).
  res.status(status).json({ user, token });
}

export async function signup(req, res) {
  const { name, email, password } = req.body;

  if (await User.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const user = await User.create({ name, email, password });
  sendAuth(res, 201, user);
}

export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password → no account enumeration.
  if (!user || !(await user.comparePassword(password))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  sendAuth(res, 200, user);
}

export function logout(_req, res) {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
}

export function me(req, res) {
  res.json({ user: req.user });
}
