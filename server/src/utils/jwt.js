import jwt from 'jsonwebtoken';
import ms from 'ms';
import { config } from '../config/index.js';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  // Pin the algorithm so a forged "alg: none" token can never be accepted.
  return jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
}

export function setAuthCookie(res, token) {
  res.cookie(config.cookie.name, token, {
    httpOnly: true, // not readable from JS → protects against XSS token theft
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    maxAge: ms(config.jwt.expiresIn),
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/',
  });
}
