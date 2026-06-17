/**
 * In-app navigation. The prototype was multiple HTML pages linked with
 * <a href="*.html">; in the single Electron BrowserWindow those become view
 * switches driven by this store. App.svelte renders nav.view -> Home/Chat/Settings.
 *
 * Svelte 5 runes module store: the exported object is a thin facade over
 * `$state` fields so consumers can read `nav.view` reactively and call the
 * imperative helpers.
 */

export type NavView = "home" | "chat" | "settings";

let view = $state<NavView>("home");
let activeSessionId = $state<string | null>(null);
/**
 * A prompt typed on Home that should seed the first turn once the session
 * opens. The Chat view consumes it on mount, then calls `consumePendingPrompt()`
 * (or reads `pendingPrompt` and clears it) so it doesn't re-fire.
 */
let pendingPrompt = $state<string | null>(null);

export const nav = {
  get view() {
    return view;
  },
  get activeSessionId() {
    return activeSessionId;
  },
  get pendingPrompt() {
    return pendingPrompt;
  },
  set pendingPrompt(v: string | null) {
    pendingPrompt = v;
  },

  /** Go to the Home / new-session screen. */
  goHome() {
    view = "home";
    activeSessionId = null;
  },

  /**
   * Open a session in the Chat view. Pass `prompt` to seed the first turn
   * (Home does this when the user submits the composer before a session exists).
   */
  openSession(id: string, prompt: string | null = null) {
    activeSessionId = id;
    pendingPrompt = prompt;
    view = "chat";
  },

  /** Open the Settings screen. */
  openSettings() {
    view = "settings";
  },

  /** Back: from settings/chat return to home (the only stable landing). */
  back() {
    if (view === "settings" && activeSessionId) {
      view = "chat";
    } else {
      view = "home";
      activeSessionId = null;
    }
  },

  /** Read + clear the seed prompt. Returns null if there was none. */
  consumePendingPrompt(): string | null {
    const p = pendingPrompt;
    pendingPrompt = null;
    return p;
  },
};
