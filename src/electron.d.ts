import type { MinecoApi } from "../electron/preload";

declare global {
  interface Window {
    /** Bridge exposed by the preload script (see electron/preload.ts). */
    mineco: MinecoApi;
  }
}
