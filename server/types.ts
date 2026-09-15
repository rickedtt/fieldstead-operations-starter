export type UserRole = 'owner_admin' | 'dispatcher' | 'field_crew';
export type AuthIdentity = { user_id: string; organization_id: string; role: UserRole };
export type Env = { DB: D1Database; JWT_SECRET: string };
export type AppEnv = Env;
