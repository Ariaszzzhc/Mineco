export { createApp } from "./create-app";
export { default as App } from "./App";
export {
  NoOpNotificationAdapter,
  type NotificationAdapter,
  type NotificationClickHandler,
  type NotificationPermission,
  type NotifyOptions,
  type Platform,
  type PlatformCapabilities,
} from "./lib/platform-types";
export {
  usePlatform,
  getPlatform,
  PlatformProvider,
  setPlatform,
} from "./lib/platform";
