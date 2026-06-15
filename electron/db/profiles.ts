import { randomUUID } from "node:crypto";
import type {
  ProfileInput,
  ProviderProfile,
} from "../../src/lib/agent-protocol";
import { getDb } from "./index";

/** The profile columns that make up a `ProviderProfile` (everything but the
 * bookkeeping `createdAt`). */
const COLUMNS = ["id", "name", "engine", "model", "apiKey", "baseUrl"] as const;

export function listProfiles(): Promise<ProviderProfile[]> {
  return getDb()
    .selectFrom("providerProfiles")
    .select(COLUMNS)
    .orderBy("createdAt")
    .execute();
}

export async function getProfile(id: string): Promise<ProviderProfile | null> {
  const row = await getDb()
    .selectFrom("providerProfiles")
    .select(COLUMNS)
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function createProfile(
  input: ProfileInput,
): Promise<ProviderProfile> {
  const profile: ProviderProfile = { id: randomUUID(), ...input };
  await getDb()
    .insertInto("providerProfiles")
    .values({ ...profile, createdAt: Date.now() })
    .execute();
  return profile;
}

export async function updateProfile(profile: ProviderProfile): Promise<void> {
  await getDb()
    .updateTable("providerProfiles")
    .set({
      name: profile.name,
      engine: profile.engine,
      model: profile.model,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
    })
    .where("id", "=", profile.id)
    .execute();
}

export async function deleteProfile(id: string): Promise<void> {
  await getDb().deleteFrom("providerProfiles").where("id", "=", id).execute();
}
