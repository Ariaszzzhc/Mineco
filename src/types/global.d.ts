import type { ManongAPI } from '../preload';

declare global {
  interface Window {
    manong: ManongAPI;
  }
}

export {};
