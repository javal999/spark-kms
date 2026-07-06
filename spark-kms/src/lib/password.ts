import { hash, verify } from "@node-rs/argon2";

/**
 * argon2id password hashing (requirements section 9). @node-rs/argon2 ships
 * prebuilt native bindings, so no compile step on install or on Vercel.
 */
const OPTS = {
  // OWASP argon2id defaults; comfortable for ≤50 admins + occasional viewer login.
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTS);
  } catch {
    return false;
  }
}
