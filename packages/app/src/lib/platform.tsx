import { createContext, useContext, type JSX } from "solid-js";

export interface Platform {
  readonly name: "web" | "desktop";
  readonly apiBaseUrl: string;
}

// --- Module-level singleton (for non-reactive use in utilities/stores) ---

let _platform: Platform;

export function getPlatform(): Platform {
  return _platform;
}

export function setPlatform(platform: Platform): void {
  _platform = platform;
}

// --- SolidJS context (for reactive use in components) ---

const PlatformContext = createContext<Platform>();

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return platform;
}

export function PlatformProvider(props: {
  value: Platform;
  children: JSX.Element;
}): JSX.Element {
  setPlatform(props.value);
  return (
    <PlatformContext.Provider value={props.value}>
      {props.children}
    </PlatformContext.Provider>
  );
}

// --- Factory functions ---

export function createWebPlatform(): Platform {
  return { name: "web", apiBaseUrl: "" };
}
