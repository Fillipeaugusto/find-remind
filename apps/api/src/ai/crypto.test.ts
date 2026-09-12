import { describe, expect, it } from "vitest";
import { createKeyCipher } from "./crypto.js";

describe("provider key encryption", () => {
  const cipher = createKeyCipher("test-encryption-secret-for-providers");

  it.each(["sk-test-secret", "chave com acentuação 🔑", ""])("round-trips %j", (value) => {
    const encrypted = cipher.encrypt(value);
    expect(encrypted).toMatch(/^v1:/);
    expect(cipher.decrypt(encrypted)).toBe(value);
  });

  it("uses a fresh IV for each encryption", () => {
    expect(cipher.encrypt("secret")).not.toBe(cipher.encrypt("secret"));
  });

  it.each([1, 2, 3])("rejects a modified payload component %s", (component) => {
    const parts = cipher.encrypt("secret").split(":");
    const bytes = Buffer.from(parts[component]!, "base64");
    bytes[0] = bytes[0]! ^ 1;
    parts[component] = bytes.toString("base64");
    expect(() => cipher.decrypt(parts.join(":"))).toThrow("Unable to decrypt");
  });

  it("rejects a different encryption key", () => {
    expect(() => createKeyCipher("another-encryption-secret").decrypt(cipher.encrypt("secret"))).toThrow("Unable to decrypt");
  });

  it.each(["", "v2:a:b:c", "v1:a:b:c", "v1::::", "v1:!:!:!"])("rejects malformed envelopes %j", (payload) => {
    expect(() => cipher.decrypt(payload)).toThrow("Unable to decrypt");
  });
});
