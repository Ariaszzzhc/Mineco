import { useEffect, useRef, useCallback } from 'react';
import { SHORTCUTS } from './shortcuts';
import type { ShortcutContext } from './shortcuts';
import type { ActiveView } from '../components/NavigationBar';

const isMac = window.mineco.platform === 'darwin';

interface UseKeyboardShortcutsOptions {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  isStreaming: boolean;
  sessions: { id: string }[];
  currentSessionId: string | null;
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions) {
  // Use refs so the keydown handler always sees fresh values without re-registering
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const lastEscapeRef = useRef(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const ctx: ShortcutContext = {
      activeView: optsRef.current.activeView,
      setActiveView: optsRef.current.setActiveView,
      sidebarVisible: optsRef.current.sidebarVisible,
      setSidebarVisible: optsRef.current.setSidebarVisible,
      isStreaming: optsRef.current.isStreaming,
      sessions: optsRef.current.sessions,
      currentSessionId: optsRef.current.currentSessionId,
    };

    const modKey = isMac ? e.metaKey : e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInputFocused =
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'INPUT' ||
      target.isContentEditable;

    // Special handling for Escape double-press to stop generation
    if (e.key === 'Escape' && ctx.isStreaming) {
      const now = Date.now();
      if (now - lastEscapeRef.current < 500) {
        // Double-press — stop generation
        e.preventDefault();
        window.mineco.agent.stop();
        import('../stores/app').then(({ useAppStore }) => {
          useAppStore.getState().stopStreaming();
        });
        lastEscapeRef.current = 0;
        return;
      }
      // First press — show hint
      lastEscapeRef.current = now;
      window.dispatchEvent(new CustomEvent('mineco:show-esc-hint'));
      return;
    }

    for (const shortcut of SHORTCUTS) {
      if (shortcut.id === 'stopGeneration') continue; // handled above

      // Check key match
      if (e.key.toLowerCase() !== shortcut.key.toLowerCase() && e.key !== shortcut.key) continue;

      // Check modifier requirements
      if (shortcut.mod && !modKey) continue;
      if (!shortcut.mod && modKey) continue;
      if (shortcut.shift && !e.shiftKey) continue;
      if (!shortcut.shift && e.shiftKey && shortcut.mod) continue;

      // Skip if input is focused and shortcut doesn't allow it
      if (isInputFocused && !shortcut.allowInInput) continue;

      // Check guard condition
      if (shortcut.when && !shortcut.when(ctx)) continue;

      e.preventDefault();
      shortcut.action(ctx);
      return;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
