import { z } from "zod";

// `Intl.supportedValuesOf` lists canonical IANA zones only; "UTC" (the
// sign-up default) is not among them, so it is accepted explicitly.
const supportedTimezones = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);

export function isSupportedTimezone(value: string): boolean {
  return supportedTimezones.has(value);
}

export const timezoneSchema = z
  .string()
  .refine(isSupportedTimezone, { message: "Unsupported IANA time zone" });

export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone: timezoneSchema,
  })
  .partial();

export type Profile = z.infer<typeof profileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
