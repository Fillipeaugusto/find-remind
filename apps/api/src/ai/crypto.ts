import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export function createKeyCipher(secret: string) {
  const key = Buffer.from(hkdfSync("sha256", secret, "findremind", "ai-provider-keys:v1", 32));
  const aad = Buffer.from("v1");

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
    },

    decrypt(payload: string): string {
      try {
        const [version, ...parts] = payload.split(":");
        if (version !== "v1" || parts.length !== 3) throw new Error();
        const buffers = parts.map((part) => {
          const value = Buffer.from(part, "base64");
          if (value.toString("base64") !== part) throw new Error();
          return value;
        });
        const [iv, tag, encrypted] = buffers;
        if (iv?.length !== 12 || tag?.length !== 16 || encrypted === undefined) throw new Error();
        const cipher = createDecipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(aad);
        cipher.setAuthTag(tag);
        return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8");
      } catch {
        throw new Error("Unable to decrypt provider API key");
      }
    },
  };
}
