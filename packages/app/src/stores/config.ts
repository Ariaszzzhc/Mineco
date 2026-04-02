import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";

type AppConfig = Awaited<ReturnType<typeof api.getConfig>>;
type AppSettings = AppConfig["settings"];

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
  providerModels: Array<{
    id: string;
    name: string;
    models: Array<{ id: string; name: string; contextWindow?: number }>;
  }>;
}

const [state, setState] = createStore<ConfigState>({
  config: null,
  loading: false,
  providerModels: [],
});

async function loadConfig() {
  setState("loading", true);
  try {
    const [config, providerModels] = await Promise.all([
      api.getConfig(),
      api.getProviderModels(),
    ]);
    setState({ config, providerModels });
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
  // Default to first model of active provider from registry
  const providerId = activeProviderId();
  if (!providerId) return null;
  const providerMeta = state.providerModels.find((p) => p.id === providerId);
  if (providerMeta && providerMeta.models.length > 0) {
    return providerMeta.models[0]?.id ?? null;
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
  const providerModels = await api.getProviderModels();
  if (state.config) {
    setState({ config: { ...state.config, providers }, providerModels });
  }
}

async function deleteProvider(id: string) {
  const providers = await api.deleteProvider(id);
  const providerModels = await api.getProviderModels();
  if (state.config) {
    setState({ config: { ...state.config, providers }, providerModels });
  }
}

export const configStore = {
  config: () => state.config,
  loading: () => state.loading,
  providerModels: () => state.providerModels,
  loadConfig,
  activeProviderId,
  activeModel,
  updateSettings,
  addProvider,
  deleteProvider,
};
