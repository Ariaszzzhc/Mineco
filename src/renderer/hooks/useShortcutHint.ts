import { SHORTCUTS } from './shortcuts';
import type { ShortcutDefinition } from './shortcuts';

const isMac = window.mineco.platform === 'darwin';

/**
 * Format a shortcut definition into a platform-specific display string.
 * E.g. "⌘N" on macOS, "Ctrl+N" on Windows/Linux.
 */
export function formatShortcut(def: ShortcutDefinition): string {
  const parts: string[] = [];

  if (def.mod) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (def.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }

  // Normalize key display
  let keyDisplay = def.key;
  if (keyDisplay === 'ArrowDown') keyDisplay = '↓';
  else if (keyDisplay === 'ArrowUp') keyDisplay = '↑';
  else if (keyDisplay === 'Escape') keyDisplay = 'Esc';
  else if (keyDisplay.length === 1) keyDisplay = keyDisplay.toUpperCase();

  parts.push(keyDisplay);

  return isMac ? parts.join('') : parts.join('+');
}

/**
 * Build a tooltip string: "Label (⌘N)" or "Label (Ctrl+N)".
 */
export function shortcutTitle(label: string, shortcutId: string): string {
  const def = SHORTCUTS.find((s) => s.id === shortcutId);
  if (!def) return label;
  return `${label} (${formatShortcut(def)})`;
}
