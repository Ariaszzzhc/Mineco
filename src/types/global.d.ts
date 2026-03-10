import type { MinecoAPI } from '../preload';

declare global {
  interface Window {
    mineco: MinecoAPI;
  }
}

export {};
