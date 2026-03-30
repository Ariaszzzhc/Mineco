import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";
import type { AppConfig, AppSettings, ProviderConfig } from "../lib/types";

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
}

const [state, setState] = createStore<ConfigState>({
  config: null,
  loading: false,
});

async function loadConfig() {
  setState("loading", true);
  try {
    const config = await api.getConfig();
    setState("config", config);
  } finally {
    setState("loading", false);
  }
}

function activeProviderId(): string | null {
  const config = state.config;
  if (!config || config.providers.length === 0) return null;
  const defaultId = config.settings.defaultProvider;
  if (defaultId) return defaultId;
  // Default to first provider
  const first = config.providers[0]!;
  return first.type === "zhipu" ? "zhipu" : first.id;
}

function activeModel(): string | null {
  const config = state.config;
  if (!config) return null;
  if (config.settings.defaultModel) return config.settings.defaultModel;
  // Default to first model of active provider
  const providerId = activeProviderId();
  if (!providerId) return null;
  const provider = config.providers.find((p) =>
    p.type === "zhipu" ? providerId === "zhipu" : p.id === providerId,
  );
  if (provider?.type === "openai-compatible" && provider.models.length > 0) {
    return provider.models[0]!.id;
  }
  return null;
}

async function updateSettings(settings: Partial<AppSettings>) {
  const result = await api.updateSettings(settings);
  if (state.config) {
    setState("config", "settings", result);
  }
}

async function addProvider(provider: unknown) {
  const providers = await api.addProvider(provider);
  if (state.config) {
    setState("config", "providers", providers);
  }
}

async function deleteProvider(id: string) {
  const providers = await api.deleteProvider(id);
  if (state.config) {
    setState("config", "providers", providers);
  }
}

export const configStore = {
  config: () => state.config,
  loading: () => state.loading,
  loadConfig,
  activeProviderId,
  activeModel,
  updateSettings,
  addProvider,
  deleteProvider,
};
