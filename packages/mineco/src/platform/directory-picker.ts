import type { DirectoryPickerAdapter } from "@mineco/app";
import { open } from "@tauri-apps/plugin-dialog";

/**
 * Tauri directory picker using native OS file dialog.
 */
export class TauriDirectoryPickerAdapter implements DirectoryPickerAdapter {
  isSupported(): boolean {
    return true;
  }

  async pickDirectory(): Promise<string | null> {
    const selected = await open({ directory: true, multiple: false });
    return selected as string | null;
  }
}
