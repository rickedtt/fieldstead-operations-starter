import { findActiveIdentity } from './database';
import type { AuthIdentity, Env } from './types';

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
    this.name = 'AuthError';
  }
}

function decode(value: string): Uint8Array {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new AuthError('Invalid bearer token.', 401);
  }
}

function jsonPart(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decode(value)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('Invalid bearer token.', 401);
  }
}

export async function authenticateBearer(
  authorization: string | null,
  environment: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<AuthIdentity> {
  if (!authorization?.startsWith('Bearer ') || authorization.length === 7) {
    throw new AuthError('A bearer token is required.', 401);
  }
  if (!environment.JWT_SECRET) throw new AuthError('Authentication is unavailable.', 401);
  const parts = authorization.slice(7).split('.');
  if (parts.length !== 3) throw new AuthError('Invalid bearer token.', 401);
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = jsonPart(encodedHeader);
  if (header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT')) {
    throw new AuthError('Unsupported bearer token algorithm.', 401);
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(environment.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC', key, decode(encodedSignature).buffer as ArrayBuffer,
    new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
  );
  if (!valid) throw new AuthError('Invalid bearer token signature.', 401);
  const claims = jsonPart(encodedClaims);
  const { sub, organization_id: organizationId, iat, exp } = claims;
  if (
    typeof sub !== 'string' || !sub || typeof organizationId !== 'string' || !organizationId ||
    typeof iat !== 'number' || !Number.isInteger(iat) ||
    typeof exp !== 'number' || !Number.isInteger(exp) || exp <= iat
  ) throw new AuthError('Invalid bearer token claims.', 401);
  if (exp <= now) throw new AuthError('Bearer token has expired.', 401);
  if (iat > now) throw new AuthError('Bearer token was issued in the future.', 401);

  const identity = await findActiveIdentity(environment.DB, sub, organizationId);
  if (!identity) throw new AuthError('The authenticated user is not active.', 403);
  return identity;
}
