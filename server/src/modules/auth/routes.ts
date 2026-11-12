import { createHash, randomBytes } from 'crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError } from '../../lib/http';
import { DuplicateUserError, type ApiUser, type AuthStore } from './store';

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_S = 7 * 24 * 60 * 60;
const BCRYPT_COST = 10;
const COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth'; // the cookie is only sent to refresh/logout
// Compared against when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_COST);

const RegisterBody = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email().max(254),
  password: z.string().min(8),
});
const LoginBody = z.object({ email: z.string(), password: z.string() });

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const unauthorized = (msg: string) => new HttpError(401, 'UNAUTHORIZED', msg);
const toApiUser = (u: ApiUser) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt.toISOString(),
});

function readRefreshCookie(req: FastifyRequest): string | undefined {
  const m = req.headers.cookie?.match(/(?:^|;\s*)refresh_token=([^;]+)/);
  return m?.[1];
}

function setRefreshCookie(reply: FastifyReply, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header(
    'set-cookie',
    `${COOKIE}=${value}; Max-Age=${maxAge}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict${secure}`
  );
}

export const authRoutes: FastifyPluginAsync<{ auth: AuthStore }> = async (app, { auth }) => {
  const signAccess = (userId: string) => app.jwt.sign({ sub: userId }, { expiresIn: ACCESS_TTL_S });

  app.post('/auth/register', async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    try {
      const user = await auth.createUser({ username: body.username, email: body.email.toLowerCase(), passwordHash });
      return reply.code(201).send(toApiUser(user));
    } catch (err) {
      if (err instanceof DuplicateUserError) throw new HttpError(409, 'CONFLICT', 'Username or email already exists');
      throw err;
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const user = await auth.findByEmail(body.email.toLowerCase());
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Invalid email or password');

    const refreshToken = randomBytes(32).toString('base64url');
    await auth.createSession({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setRefreshCookie(reply, refreshToken, REFRESH_TTL_S);
    return { accessToken: signAccess(user.id), refreshToken, expiresIn: ACCESS_TTL_S };
  });

  // shortcut: no refresh-token rotation (spec returns only accessToken); add rotation + reuse detection on Day 8.
  app.post('/auth/refresh', async (req) => {
    const token = readRefreshCookie(req);
    if (!token) throw unauthorized('Missing refresh token');
    const session = await auth.findSession(sha256(token));
    if (!session || session.expiresAt.getTime() <= Date.now()) throw unauthorized('Refresh token is invalid or expired');
    return { accessToken: signAccess(session.userId) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = readRefreshCookie(req);
    if (token) await auth.deleteSession(sha256(token));
    setRefreshCookie(reply, '', 0);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const user = await auth.findById(req.user.sub);
    if (!user) throw unauthorized('User no longer exists');
    return toApiUser(user);
  });
};
