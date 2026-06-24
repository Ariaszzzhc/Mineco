# mineco Component Conventions Cheat Sheet

## UI Primitives (bits-ui + custom)

### Core Primitives

- **Card**: Bordered container with card background, border-line, rounded per `--r-card`.
  ```svelte
  <Card class="mt-2">
    {#snippet children()}
      <div>content</div>
    {/snippet}
  </Card>
  ```

- **CardHeader**: Icon + bold title row with optional trailing content (tokens, badges, etc.).
  ```svelte
  <CardHeader icon="settings" title="Config" {trailing} />
  ```

- **Popover** (bits-ui Popover): Positioned dropdown panel with pop animation.
  ```svelte
  <Popover side="bottom" align="start" sideOffset={6}>
    {#snippet trigger()}
      <button>Open</button>
    {/snippet}
    {#snippet children()}
      <div class="p-2">Menu</div>
    {/snippet}
  </Popover>
  ```

- **Switch** (bits-ui Switch): Accent-tinted toggle with optional label.
  ```svelte
  <Switch bind:checked label="Enable" {onCheckedChange}>
    {#snippet children()}
      Optional visible label
    {/snippet}
  </Switch>
  ```

- **Segmented**: Radio-group button control (custom, no bits-ui).
  ```svelte
  <Segmented
    bind:value
    options={[
      { value: "dark", label: "Dark", disabled: false },
      { value: "light", label: "Light" },
    ]}
    size="md"
    {onchange}
  />
  ```

- **Icon**: Lucide icons via name string (e.g., `"bot"`, `"settings"`, `"check"`).
  ```svelte
  <Icon name="sparkle" size={14} stroke={1.8} fill="currentColor" class="text-accent-tx" />
  ```
  Supported names: `bot`, `search`, `read`, `edit`, `file`, `code`, `folder`, `check`, `run`, `send`, `plus`, `sparkle`, `gear`, `plan`, `brain`, `skill`, etc. (see Icon.svelte for full list; unknown names fall back to Sparkles).

## Design Tokens (CSS Custom Properties)

All tokens resolve to live CSS vars (not build-time snapshots), so **theme/accent switches are instant**.

### Surfaces
- `--app`: App background
- `--chrome`, `--chrome-2`: Browser chrome
- `--canvas`: Content area
- `--card`, `--card-2`: Card surfaces (primary, secondary)
- `--raised`: Elevated surface

### Text
- `--ink`: Primary text
- `--ink-2`: Secondary text
- `--ink-3`: Tertiary text (labels, placeholders)

### Accent (user-configurable, set inline on `<html>`)
- `--accent`: Base accent color
- `--accent-tx`: Accent text (high-contrast on dark bg)
- `--accent-dk`: Accent darker (for hovers/disabled)
- `--accent-bg`: Accent subtle background
- `--accent-ln`: Accent hairline (borders, dividers)

### Lines & Borders
- `--line`: Hairline (0.08 opacity)
- `--line-2`: Subtle (0.05 opacity)
- `--line-3`: Strong (0.13 opacity)

### Status Colors
- `--ok`: Success green
- `--del`: Destructive red
- `--amber`, `--amber-bg`: Warning

### Radii
- `--r-panel`: 14px (outer panels)
- `--r-card`: 12px (cards, popovers)
- `--r-field`: 10px (form inputs, switches)

### Tailwind 4 Mapped Colors
All tokens are available as Tailwind utilities:
- `bg-card`, `bg-card-2`, `bg-raised`, `bg-canvas`
- `text-ink`, `text-ink-2`, `text-ink-3`
- `text-accent-tx`, `bg-accent-bg`, `border-accent-ln`, `border-line`, `border-line-2`, `border-line-3`
- `rounded-[var(--r-panel)]`, `rounded-[var(--r-card)]`, `rounded-[var(--r-field)]`

**Theme switching**: Declared in CSS with `@theme inline`, so live CSS var changes drive the switch (class-based theme switching is not used).

## Styling Conventions

### Class Patterns
1. **Tailwind-first**: Use Tailwind utilities + token colors.
2. **Spacing**: Use Tailwind scale (gap-1, gap-2, gap-2.5, px-2, py-1.5, etc.).
3. **Borders & Radii**: Prefer `border border-line` and `rounded-[var(--r-card)]` over hardcoded values.
4. **Transitions**: Use `transition-colors` or `transition-opacity` with `ease` timing; keep animations under 0.2s.
5. **Animations**: Include Tailwind-compatible keyframes from `app.css` (`@keyframes p-rise`, `pop`, `spin`, `sheen`, `blink`).

### Component-Scoped Styles
Use `<style>` blocks for dynamic animations tied to component state (e.g., ToolGroup.svelte's `.mc-spin` and `.mc-tool-live`). Wrap scoped styles in `@media (prefers-reduced-motion: reduce)` to respect accessibility settings.

### Scrollbars
Add `.mc-scroll` class to scrollable containers:
```html
<div class="mc-scroll overflow-y-auto">content</div>
```

### Drag Regions
- `.mc-drag`: Enable drag (e.g., custom titlebar)
- `.mc-no-drag`: Disable drag (interactive controls like buttons, inputs)

## i18n Key Pattern

**Namespace.key** pattern (dot-separated, kebab-case subsections):

```typescript
// Usage in .svelte:
{i18n.t("nav.home")}
{i18n.t("settings.agents")}
{i18n.t("empty.noAgents")}

// Structure in i18n.svelte.ts:
"app.name": "mineco",
"nav.home": "Home",
"workspace.name": "Name",
"agent.promptMode.append": "Append",
"runMode.default": "Default",
```

**Supported languages**: `en` (English), `zh` (Chinese). Add new keys to both dicts; missing keys fall back to the key itself (safe but visible).

**Language switching**: `i18n.lang = "zh"` syncs with the theme store; all UI updates instantly.

## Svelte 5 Runes & Gotchas

### Core Runes
- `$state`: Reactive variable (returns a Proxy). Use `$bindable()` for two-way binding.
- `$derived`: Computed value (reactive, no setter).
- `$effect`: Side-effect (runs when dependencies change); good for IPC or external syncing.
- `$effect.pre`: Runs before render.
- `snippet`: Reusable template block (passed as child prop or via `{@render ...()}`).

### $state Array Mutations
After pushing into a `$state` array, **mutate the proxy you read back out**, not the original:
```typescript
const items = $state([{ id: 1 }]);
items.push({ id: 2 });  // push works
items[2] = { id: 3 };   // mutate the proxy index, not a local copy
```

### Self-Assignment Pattern
`x = x` does NOT force refresh in runes mode. Use `$effect` or explicit triggers if you need to force re-render:
```typescript
// DON'T do this to refresh:
// x = x;

// DO trigger via effect if needed:
$effect(() => {
  // ...trigger logic
});
```

### Snippet & Forwarding
```svelte
{#snippet children()}
  <div>content</div>
{/snippet}

<!-- Render in child: -->
{@render children()}
```

Snippets are the Svelte 5 way to pass JSX-like content; they're more efficient than slots.

## IPC & Serialization Gotchas

### $state Proxy Serialization Failure

**Critical Issue**: Electron IPC uses V8's structured clone algorithm, which **rejects Proxy objects**. If you pass a `$state` object (or a nested field like `obj.connection`) directly to `ipcRenderer.invoke()`, the call silently fails with `Error: An object could not be cloned`.

**Symptom**: You edit a setting in the UI, it displays correctly, but when you close and reopen the view it's reverted. No error in console (if the catch is silent). Checking `mtime` on the config file shows it wasn't written.

**Example Bug**:
```typescript
// BROKEN — editAgent.connection is a $state Proxy
const input = { ...editAgent, connection: editAgent.connection };
await mineco.agents.update(input);  // IPC FAILS SILENTLY
```

**How to Fix**: Rebuild as plain objects before IPC:
```typescript
// CORRECT — plain object reconstruction
const input = {
  id: editAgent.id,
  name: editAgent.name,
  connection: {
    baseUrl: editAgent.connection?.baseUrl ?? "",
    apiKey: editAgent.connection?.apiKey ?? "",
  },
  // ... other fields as literals
};
await mineco.agents.update(input);  // IPC SUCCESS
```

For arrays, use `.map()` to rebuild each item:
```typescript
const input = {
  items: editAgent.items.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.value,
  })),
};
```

### Debugging IPC Issues
1. Check if parameters come from `$state` objects.
2. Wrap IPC calls with proper error handling (don't swallow errors):
   ```typescript
   try {
     await mineco.agents.update(input);
   } catch (e) {
     console.error("Failed to update agent:", e);
     // Handle error
   }
   ```
3. Watch for silent failures in `catch` blocks that don't log.

### Server-Side env Replacement
SDK `options.env` replaces the process.env **wholesale**, not merged. Always spread the current env:
```typescript
const subprocess = spawn(binary, args, {
  env: {
    ...process.env,  // Preserve PATH, API keys, etc.
    CUSTOM_VAR: "value",
  },
});
```

## Common Patterns

### Modal/Overlay with Popover
```svelte
<Popover bind:open side="top" align="center">
  {#snippet trigger()}
    <button>Open settings</button>
  {/snippet}
  {#snippet children()}
    <div class="p-3 flex flex-col gap-2">
      <label>
        <Switch bind:checked label="Enable feature" />
      </label>
      <button onclick={() => (open = false)}>Done</button>
    </div>
  {/snippet}
</Popover>
```

### Settings Card Group
```svelte
<Card class="flex flex-col gap-2">
  <CardHeader icon="settings" title="Preferences" />
  <div class="px-4 py-3 flex flex-col gap-2">
    <label>
      <Switch bind:checked label="Auto-save" />
    </label>
    <label>
      <Switch bind:checked label="Notifications" />
    </label>
  </div>
</Card>
```

### Tool Invocation Display
See `ToolGroup.svelte` for the pattern:
- Running state: spinner + "Working…" header with sheen animation.
- Done state: checkmark + "Worked" + step count.
- Icons map tool names dynamically (`search`, `read`, `edit`, `run`, `bot`, `globe`).
- Scoped `.mc-spin` and `.mc-tool-live` animations with reduced-motion support.

## Accessibility & Polish

1. **Reduced Motion**: All keyframe animations include `@media (prefers-reduced-motion: reduce)` fallbacks (remove animation, use static color).
2. **Focus Rings**: Use `focus-visible:ring-2 focus-visible:ring-accent-ln` on interactive elements.
3. **Disabled States**: Use `disabled:opacity-40` or `disabled:cursor-not-allowed`.
4. **ARIA Labels**: Add `aria-label` or `aria-checked` to buttons/toggles for screen readers.
5. **Keyboard Navigation**: Segmented and Switch components are already keyboard-accessible via bits-ui; don't bypass with `onclick` alone.

## File Organization

- **UI primitives**: `src/renderer/lib/ui/` (Card.svelte, CardHeader.svelte, Popover.svelte, Switch.svelte, Segmented.svelte, Icon.svelte)
- **Domain components**: `src/renderer/lib/components/` (e.g., `chat/ToolGroup.svelte`)
- **Stores**: `src/renderer/lib/stores/` (i18n.svelte.ts, theme.svelte.ts, etc.)
- **Styles**: `src/renderer/app.css` (design tokens, Tailwind @theme, shared keyframes)

Use `@/` alias (configured in `vite.config.ts` + `tsconfig.*.json`) for imports:
```typescript
import Card from "@/renderer/lib/ui/Card.svelte";
import Icon from "@/renderer/lib/ui/Icon.svelte";
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
```
