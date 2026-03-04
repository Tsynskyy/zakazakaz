import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool } from '../db/pool';
import { AppError } from '../errors';
import type { components } from '../generated/api';

type UserRole = components['schemas']['UserRole'];
type TokenResponse = components['schemas']['TokenResponse'];

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

export async function register(email: string, password: string, role: UserRole): Promise<TokenResponse> {
  const hash = await bcrypt.hash(password, 10);

  let user: { id: string; role: UserRole };

  try {
    const res = await pool.query<{ id: string; role: UserRole }>(
      `INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, role`,
      [email, hash, role]
    );

    user = res.rows[0]!;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw new AppError('VALIDATION_ERROR', 'Email already registered');
    }
    throw err;
  }

  return issueTokens(user.id, user.role);
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await pool.query<{ id: string; password: string; role: UserRole }>(
    'SELECT id, password, role FROM users WHERE email = $1',
    [email]
  );

  const user = res.rows[0];

  if (!user) throw new AppError('TOKEN_INVALID', 'Invalid email or password');

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new AppError('TOKEN_INVALID', 'Invalid email or password');

  return issueTokens(user.id, user.role);
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
  let payload: JwtPayload;

  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token expired');
    }

    throw new AppError('REFRESH_TOKEN_INVALID', 'Invalid refresh token');
  }

  const stored = await pool.query(`SELECT id FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`, [
    refreshToken,
    payload.sub,
  ]);
  if (!stored.rows[0]) {
    throw new AppError('REFRESH_TOKEN_INVALID', 'Refresh token revoked or expired');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);

    const userRes = await client.query<{ role: UserRole }>('SELECT role FROM users WHERE id = $1', [payload.sub]);
    if (!userRes.rows[0]) throw new AppError('REFRESH_TOKEN_INVALID', 'User not found');

    const tokens = await issueTokens(payload.sub, userRes.rows[0].role, client);

    await client.query('COMMIT');

    return tokens;
  } catch (err) {
    await client.query('ROLLBACK');

    throw err;
  } finally {
    client.release();
  }
}

async function issueTokens(userId: string, role: UserRole, client?: PoolClient): Promise<TokenResponse> {
  const accessToken = jwt.sign({ sub: userId, role } satisfies JwtPayload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign({ sub: userId, role } satisfies JwtPayload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseDays(config.jwt.refreshExpiresIn));

  const db = client ?? pool;
  await db.query(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`, [
    userId,
    refreshToken,
    expiresAt,
  ]);

  return { access_token: accessToken, refresh_token: refreshToken };
}

function parseDays(exp: string): number {
  const d = exp.match(/^(\d+)d$/);
  if (d) return parseInt(d[1]!, 10);

  const h = exp.match(/^(\d+)h$/);
  if (h) return Math.ceil(parseInt(h[1]!, 10) / 24);

  const m = exp.match(/^(\d+)m$/);
  if (m) return Math.ceil(parseInt(m[1]!, 10) / 1440);

  return 7;
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError('TOKEN_EXPIRED', 'Access token expired');

    throw new AppError('TOKEN_INVALID', 'Invalid access token');
  }
}
