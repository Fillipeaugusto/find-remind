import { expect } from "vitest";
import type { App } from "../src/app.js";

export interface TestCredentials {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}

export interface TestSession {
  cookie: string;
  user: { id: string; name: string; email: string; timezone: string };
}

export const defaultCredentials: TestCredentials = {
  name: "Ana",
  email: "ana@example.com",
  password: "correct-horse-battery",
};

export function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const cookie = res.cookies.find((c) => c.name.endsWith("session_token"));
  expect(cookie).toBeDefined();
  return `${cookie!.name}=${cookie!.value}`;
}

// Signs up a user (Better Auth signs in on sign-up) and returns the cookie
// ready to be sent as the `cookie` header in subsequent requests.
export async function signUpAndLogin(
  app: App,
  credentials: Partial<TestCredentials> = {},
): Promise<TestSession> {
  const payload = { ...defaultCredentials, ...credentials };
  const res = await app.inject({ method: "POST", url: "/api/auth/sign-up/email", payload });
  expect(res.statusCode).toBe(200);
  return { cookie: sessionCookie(res), user: res.json().user };
}
