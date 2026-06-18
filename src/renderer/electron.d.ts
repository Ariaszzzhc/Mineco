import type { MinecoApi } from "@/preload/index";

declare global {
  interface Window {
    /** Bridge exposed by the preload script (see src/preload/index.ts). */
    mineco: MinecoApi;
  }
}
