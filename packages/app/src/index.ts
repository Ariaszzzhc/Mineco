export { default as App } from "./App";
export type { Platform } from "./lib/platform";
export {
  createDesktopPlatform,
  createPlatform,
  createWebPlatform,
  getPlatform,
  PlatformProvider,
  setPlatform,
  usePlatform,
} from "./lib/platform";
