import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const localCredentialKeyVersion = "scrypt-v1";

export function normalizeLocalLogin(value: string) {
  return value.trim().toLowerCase();
}

export async function hashLocalPassword(password: string, salt = randomBytes(16).toString("base64url")) {
  const hash = (await scrypt(password, salt, keyLength)) as Buffer;

  return {
    passwordHash: hash.toString("base64url"),
    passwordSalt: salt,
    keyVersion: localCredentialKeyVersion
  };
}

export async function verifyLocalPassword(input: {
  password: string;
  passwordHash: string;
  passwordSalt: string;
  keyVersion: string;
}) {
  if (input.keyVersion !== localCredentialKeyVersion) {
    return false;
  }

  const expected = Buffer.from(input.passwordHash, "base64url");
  const actual = (await scrypt(input.password, input.passwordSalt, expected.byteLength)) as Buffer;

  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}
