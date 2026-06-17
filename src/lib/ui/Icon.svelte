<script lang="ts">
interface Props {
  name: string;
  size?: number;
  stroke?: number;
  fill?: string;
  class?: string;
}

let { name, size = 16, stroke = 1.8, fill, class: className }: Props = $props();

const icons: Record<string, string> = {
  // Basic UI controls
  close: "M1.4 1.4l4.2 4.2M5.6 1.4l-4.2 4.2",
  minimize: "M1.2 3.5h4.6",
  maximize: "M1.5 1.5h2.1v2.1zM5.5 5.5H3.4V3.4z",
  chev: "M6 9l6 6 6-6",
  chevR: "M9 6l6 6-6 6",
  dot: "",

  // Content & file actions
  search:
    "M11 11c-3.866 0-7-3.134-7-7s3.134-7 7-7 7 3.134 7 7-3.134 7-7 7zM21 21l-4-4",
  read: "M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h6",
  edit: "M4 20h16M14 5l5 5L8 21l-5 1 1-5z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  folder:
    "M3 7.2a1.6 1.6 0 0 1 1.6-1.6h3.1l1.9 2.1h8.8A1.6 1.6 0 0 1 20 9.3v8A1.6 1.6 0 0 1 18.4 19H4.6A1.6 1.6 0 0 1 3 17.3z",
  workspace:
    "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7v7.8A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z",
  git: "M6 6a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zM6 18a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zM18 9a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zM6 8.4v7.2M8.4 7.4A6 6 0 0 1 15.6 9",
  attach:
    "M21 11l-8.5 8.5a4 4 0 0 1-6-6L14 5a3 3 0 0 1 4 4l-8 8a1.5 1.5 0 0 1-2-2l7.5-7.5",

  // Actions & states
  check: "M5 13l4 4L19 7",
  run: "M7 5v14l11-7z",
  send: "M5 12h14M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  think: "M12 3a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11zM9 21h6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  replay: "M4 12a8 8 0 0 0 2.3 5.6M6 3v4h4",
  term: "M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM7 9l3 3-3 3M13 15h4",
  list: "M8 6h12M8 12h12M8 18h12",

  // Settings & configuration
  prompt: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4",
  plug: "M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4",
  key: "M8 14a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM11.5 10.5L20 2M16 6l3 3M13.5 8.5l3 3",
  back: "M19 12H5M11 18l-6-6 6-6",
  eye: "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM12 12a2.8 2.8 0 1 1 0-5.6A2.8 2.8 0 0 1 12 12z",
  eyeOff:
    "M4 4l16 16M9.9 5.8A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3 3.7M6.2 6.9A16 16 0 0 0 2 12s3.5 6.5 10 6.5c1.5 0 2.9-.3 4.1-.9",
  copy: "M9 9h11v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15V5a1 1 0 0 1 1-1h10",
  info: "M12 12r9M12 7.5v.5",

  // Appearance & theme
  sun: "M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8",
  moon: "M20 13.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 13.5z",
  mac: "M3 5h18a1.8 1.8 0 0 1 1.8 1.8v11a1.8 1.8 0 0 1-1.8 1.8H3a1.8 1.8 0 0 1-1.8-1.8V6.8A1.8 1.8 0 0 1 3 5zM2 19.5h20M6 8a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z",
  type: "M5 7V5h14v2M12 5v14M9 19h6",
  globe:
    "M3 12h18M12 3c2.5 2.4 4 5.7 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.7-4-9s1.5-6.6 4-9z",
  paint:
    "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8 9.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zM12 7.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zM16 9.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zM9.5 16.5h3a3 3 0 0 0 3-3",

  // Agents & systems
  bot: "M5 8.5h14a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-4.5a3 3 0 0 1 3-3zM12 8.5V4.5M9 4.5h6M9.5 13.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zM14.5 13.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z",
  sdkA: "M12 3.5v17M4.6 7.75l14.8 8.5M19.4 7.75l-14.8 8.5",
  sdkX: "M12 3.6v3.4M12 17v3.4M3.6 12h3.4M17 12h3.4M12 12a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8z",
  brain:
    "M8.5 4.5A3 3 0 0 0 5 7.4 3 3 0 0 0 4 13a3 3 0 0 0 1.5 4.7A3 3 0 0 0 11 19V5.5a2.5 2.5 0 0 0-2.5-1zM15.5 4.5A3 3 0 0 1 19 7.4 3 3 0 0 1 20 13a3 3 0 0 1-1.5 4.7A3 3 0 0 1 13 19V5.5a2.5 2.5 0 0 1 2.5-1z",
  skill:
    "M12 3l2.4 5 5.6.6-4.2 3.7 1.3 5.5L12 20l-5.1 2.8 1.3-5.5L4 13.6l5.6-.6z",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6",

  // Hardware & scope
  laptop:
    "M3 5h18a1.8 1.8 0 0 1 1.8 1.8v11a1.8 1.8 0 0 1-1.8 1.8H3a1.8 1.8 0 0 1-1.8-1.8V6.8A1.8 1.8 0 0 1 3 5zM2 19.5h20",
  mic: "M9 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3",
  chip: "M7 7h10a2.2 2.2 0 0 1 2.2 2.2v5.6A2.2 2.2 0 0 1 17 17H7a2.2 2.2 0 0 1-2.2-2.2V9.2A2.2 2.2 0 0 1 7 7zM10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3",

  // Utility & special
  sidebar: "M8 6h12M8 12h12M8 18h12",
  ws: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7v7.8A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
  plan: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  bolt: "M13 2L4.5 13.5h6L9.5 22 19 10h-6.5z",
  shield:
    "M12 3l7 2.6v5.2c0 4.8-3 8.3-7 10.2-4-1.9-7-5.4-7-10.2V5.6zM9 12l2 2 4-4.5",
  gear: "M12 2.5a3.2 3.2 0 0 0-1 6.2v1.6a3.2 3.2 0 0 0 2 2.9v1.6a3.2 3.2 0 0 0 0 6.4 3.2 3.2 0 0 0 1-6.2v-1.6a3.2 3.2 0 0 0-2-2.9V8.7A3.2 3.2 0 0 0 12 2.5z",
};

const solidIcons = new Set([
  "run",
  "sparkle",
  "list",
  "bot",
  "paint",
  "brain",
  "skill",
  "bolt",
  "shield",
]);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={fill}
  stroke={solidIcons.has(name) ? 'none' : (fill ? 'none' : 'currentColor')}
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
>
  {#if name === 'list'}
    <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'bot'}
    <rect x="5" y="8.5" width="14" height="10.5" rx="3" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    <path d="M12 8.5V4.5M9 4.5h6" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="9.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
  {:else if name === 'paint'}
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="8" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
    <path d="M9.5 16.5h3a3 3 0 0 0 3-3" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'brain'}
    <path d="M8.5 4.5A3 3 0 0 0 5 7.4 3 3 0 0 0 4 13a3 3 0 0 0 1.5 4.7A3 3 0 0 0 11 19V5.5a2.5 2.5 0 0 0-2.5-1z" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    <path d="M15.5 4.5A3 3 0 0 1 19 7.4 3 3 0 0 1 20 13a3 3 0 0 1-1.5 4.7A3 3 0 0 1 13 19V5.5a2.5 2.5 0 0 1 2.5-1z" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'skill'}
    <path d="M12 3l2.4 5 5.6.6-4.2 3.7 1.3 5.5L12 20l-5.1 2.8 1.3-5.5L4 13.6l5.6-.6z" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'run'}
    <path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />
  {:else if name === 'sparkle'}
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none" />
  {:else if name === 'bolt'}
    <path d="M13 2L4.5 13.5h6L9.5 22 19 10h-6.5z" fill="currentColor" stroke="none" />
  {:else if name === 'shield'}
    <path d="M12 3l7 2.6v5.2c0 4.8-3 8.3-7 10.2-4-1.9-7-5.4-7-10.2V5.6z" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    <path d="M9 12l2 2 4-4.5" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
  {:else if icons[name]}
    <path d={icons[name]} />
  {/if}
</svg>

<style>
  svg {
    display: inline-block;
    overflow: visible;
  }
</style>
