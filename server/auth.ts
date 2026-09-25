import { findActiveIdentity } from './database';
import type { AuthIdentity, Env } from './types';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 503,
    readonly code: 'authentication_failed' | 'authentication_unavailable' = 'authentication_failed',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Production authentication deliberately fails closed until an approved
 * asymmetric JWT/JWKS verifier is added. The current dependency set has no JOSE
 * implementation, so shared-secret HS256 verification is not retained as a
 * production fallback.
 */
export async function authenticateBearer(
  authorization: string | null,
  environment: Env,
): Promise<AuthIdentity> {
  if (!authorization?.startsWith('Bearer ') || authorization.length === 7) {
    throw new AuthError('A bearer token is required.', 401);
  }
  if (!environment.JWT_ASYMMETRIC_VERIFIER) {
    throw new AuthError('Authentication is unavailable.', 503, 'authentication_unavailable');
  }
  const claims = await environment.JWT_ASYMMETRIC_VERIFIER(authorization.slice(7));
  const { sub, organization_id: organizationId, session_id: sessionId, device_id: deviceId } = claims;
  if (![sub, organizationId, sessionId, deviceId].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new AuthError('Invalid bearer token claims.', 401);
  }
  const identity = await findActiveIdentity(environment.DB, sub, organizationId);
  if (!identity) throw new AuthError('The authenticated user is not active.', 403);
  return { ...identity, session_id: sessionId, device_id: deviceId };
}
