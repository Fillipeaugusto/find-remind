import type { App } from "../../app.js";
import { createMeRepository, type UserRow } from "./me.repository.js";
import type { Profile, UpdateProfileInput } from "./me.schemas.js";

function toProfile(row: UserRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createMeService(app: App) {
  const repository = createMeRepository(app.db);

  return {
    async getProfile(userId: string): Promise<Profile> {
      const row = await repository.findById(userId);
      if (!row) throw app.httpErrors.notFound("User not found");
      return toProfile(row);
    },

    async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
      const patch = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
      const row =
        Object.keys(patch).length === 0
          ? await repository.findById(userId)
          : await repository.update(userId, patch);
      if (!row) throw app.httpErrors.notFound("User not found");
      return toProfile(row);
    },
  };
}

export type MeService = ReturnType<typeof createMeService>;
