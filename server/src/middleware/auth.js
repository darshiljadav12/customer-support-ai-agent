import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
import { verifyToken } from '../utils/jwt.js';
import { config } from '../config/index.js';

function extractToken(req) {
  // 1) httpOnly cookie (preferred, used by the web client)
  const fromCookie = req.cookies?.[config.cookie.name];
  if (fromCookie) return fromCookie;

  // 2) Authorization: Bearer <token> (fallback for API clients / Postman)
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

// Protects a route: rejects with 401 unless a valid JWT is supplied,
// then attaches the authenticated user to req.user.
export async function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'User no longer exists');

  req.user = user;
  next();
}
