import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";
import type { SkillManifest } from "../lib/types";

interface SkillState {
  skills: SkillManifest[];
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<SkillState>({
  skills: [],
  loading: false,
  error: null,
});

async function loadSkills(workspacePath: string) {
  setState("loading", true);
  setState("error", null);
  try {
    const skills = await api.listSkills(workspacePath);
    setState("skills", skills);
  } catch (err) {
    setState(
      "error",
      err instanceof Error ? err.message : "Failed to load skills",
    );
    setState("skills", []);
  } finally {
    setState("loading", false);
  }
}

function clearSkills() {
  setState("skills", []);
  setState("error", null);
}

export const skillStore = {
  skills: () => state.skills,
  loading: () => state.loading,
  error: () => state.error,
  loadSkills,
  clearSkills,
};
