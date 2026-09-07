import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const localCredentialKeyVersion = "scrypt-v1";
export const localPasswordMinLength = 12;

export function normalizeLocalLogin(value: string) {
  return value.trim().toLowerCase();
}

export function assertLocalPasswordPolicy(password: string) {
  if (password.length < localPasswordMinLength) {
    throw new Error(`Пароль должен быть не короче ${localPasswordMinLength} символов.`);
  }

  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    throw new Error("Пароль должен содержать хотя бы одну букву и одну цифру.");
  }
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
