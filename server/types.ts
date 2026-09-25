export type UserRole = 'owner_admin' | 'dispatcher' | 'field_crew';
export type AuthIdentity = { user_id: string; organization_id: string; role: UserRole; session_id?: string; device_id?: string };
export type VerifiedJwtClaims = { sub: string; organization_id: string; session_id: string; device_id: string };
export type Env = {
  DB: D1Database;
  JWT_SECRET?: string;
  JWT_JWKS_URL?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  JWT_MAX_LIFETIME_SECONDS?: number;
  JWT_ASYMMETRIC_VERIFIER?: (token: string) => Promise<VerifiedJwtClaims>;
};
export type AppEnv = Env;
