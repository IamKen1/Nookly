import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export const SESSION_DURATION = {
  short: { expiresIn: '1d', cookieMaxAge: undefined }, // browser-session cookie, cleared on close
  remembered: { expiresIn: '30d', cookieMaxAge: 60 * 60 * 24 * 30 },
} as const

export interface SessionPayload {
  userId: string
  tenantId: string
  storeId: string | null
  role: string
  tenantSlug: string
}

export const hashPassword = (password: string) => bcrypt.hash(password, 10)

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)

export const signSession = (
  payload: SessionPayload,
  expiresIn: jwt.SignOptions['expiresIn'] = SESSION_DURATION.short.expiresIn
) => jwt.sign(payload, JWT_SECRET, { expiresIn })

export const verifySession = (token: string): SessionPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload
  } catch {
    return null
  }
}

export const SESSION_COOKIE_NAME = 'nookly_session'

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
