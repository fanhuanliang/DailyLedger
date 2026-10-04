import type { Request, Response, NextFunction } from 'express';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { forbidden } from '../lib/errors';

export const SESSION_COOKIE = 'dl_session';
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { /* Ignore malformed cookie values rather than failing the request. */ }
  }
  return result;
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export interface SecurityOptions {
  appOrigin: string;
  mcpToken?: string;
  secureCookies?: boolean;
}

interface BrowserSession { token: string; expiresAt: number }

export class SecurityContext {
  private readonly sessions = new Map<string, BrowserSession>();
  constructor(private readonly options: SecurityOptions) {}

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(id);
  }

  private ensureSession(req: Request, res: Response): BrowserSession {
    this.pruneExpiredSessions();
    const existingId = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const existing = existingId ? this.sessions.get(existingId) : undefined;
    if (existing) return existing;
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldestId = this.sessions.keys().next().value;
      if (oldestId !== undefined) this.sessions.delete(oldestId);
    }
    const id = randomUUID();
    const session = { token: randomBytes(32).toString('hex'), expiresAt: Date.now() + SESSION_LIFETIME_MS };
    this.sessions.set(id, session);
    res.cookie(SESSION_COOKIE, id, {
      httpOnly: true, sameSite: 'lax', secure: this.options.secureCookies ?? false,
      path: '/', maxAge: SESSION_LIFETIME_MS,
    });
    return session;
  }

  csrfTokenHandler = (req: Request, res: Response, next: NextFunction): void => {
    if (req.headers.origin && req.headers.origin !== this.options.appOrigin) {
      next(forbidden('Cross-site requests are not allowed.', 'CROSS_SITE_BLOCKED'));
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ data: { csrfToken: this.ensureSession(req, res).token } });
  };

  private isMcpAuthorized(req: Request): boolean {
    const header = req.headers.authorization;
    const token = this.options.mcpToken;
    return Boolean(token && header?.startsWith('Bearer ') && safeEqual(header.slice(7), token));
  }

  guard = (req: Request, _res: Response, next: NextFunction): void => {
    if (this.isMcpAuthorized(req)) { next(); return; }
    if (req.headers.authorization !== undefined) {
      next(forbidden('Invalid MCP credential.', 'MCP_AUTH_FAILED'));
      return;
    }
    if (req.headers.origin && req.headers.origin !== this.options.appOrigin) {
      next(forbidden('Cross-site requests are not allowed.', 'CROSS_SITE_BLOCKED'));
      return;
    }
    if (WRITE_METHODS.has(req.method)) {
      this.pruneExpiredSessions();
      const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const expected = id ? this.sessions.get(id)?.token : undefined;
      const provided = req.headers['x-csrf-token'];
      if (!expected || typeof provided !== 'string' || !safeEqual(expected, provided)) {
        next(forbidden('Missing or invalid CSRF token.', 'CSRF_REQUIRED'));
        return;
      }
    }
    next();
  };
}
