import type { Appearance } from "../../src/lib/agent-protocol";
import { getDb } from "./index";

/** The singleton app_settings row id. */
const ID = "default";

/** Sensible defaults for a fresh install (dark theme, mac, scale 1, English). */
const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  accent: "#43A95A",
  platform: process.platform === "win32" ? "win" : "mac",
  fontScale: 1,
  lang: "en",
};

export async function getAppearance(): Promise<Appearance> {
  const row = await getDb()
    .selectFrom("appSettings")
    .select("appearanceJson")
    .where("id", "=", ID)
    .executeTakeFirst();
  if (!row) return { ...DEFAULT_APPEARANCE };
  try {
    return {
      ...DEFAULT_APPEARANCE,
      ...(JSON.parse(row.appearanceJson) as object),
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export async function setAppearance(appearance: Appearance): Promise<void> {
  const appearanceJson = JSON.stringify(appearance);
  // Upsert the singleton row.
  await getDb()
    .insertInto("appSettings")
    .values({ id: ID, appearanceJson })
    .onConflict((oc) => oc.column("id").doUpdateSet({ appearanceJson }))
    .execute();
}
