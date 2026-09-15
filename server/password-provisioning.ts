/**
 * Password provisioning boundary (not a runtime fallback).
 *
 * Deployments that issue sync JWTs must provide a reviewed Argon2id
 * implementation outside this sync route. Stored hashes must use the PHC form:
 * `$argon2id$v=19$m=<memory>,t=<iterations>,p=<parallelism>$<salt>$<digest>`.
 * Parameter selection, rate limiting, recovery, rotation, and secret/key
 * management belong to the deployment's identity system. No SHA-256 PIN or
 * browser-local credential is equivalent to this server authentication.
 */
export interface Argon2idPasswordProvisioner {
  hash(password: string): Promise<string>;
  verify(encodedPhcHash: string, password: string): Promise<boolean>;
}

export function isArgon2idPhcHash(value: string): boolean {
  return /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/.test(value);
}
