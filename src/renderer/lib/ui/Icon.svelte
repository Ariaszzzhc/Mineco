<!--
  Icon — thin wrapper over @lucide/svelte. Keeps the legacy `name`-based API
  (`<Icon name="bot" size={14} />`) so call sites stay unchanged, while every
  glyph is now a real Lucide icon. `name` maps to a Lucide component; unknown
  names fall back to Sparkles.
-->
<script lang="ts">
import ArrowDown from "@lucide/svelte/icons/arrow-down";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Bot from "@lucide/svelte/icons/bot";
import Brain from "@lucide/svelte/icons/brain";
import Check from "@lucide/svelte/icons/check";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Code from "@lucide/svelte/icons/code";
import Copy from "@lucide/svelte/icons/copy";
import Cpu from "@lucide/svelte/icons/cpu";
import Dot from "@lucide/svelte/icons/dot";
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import File from "@lucide/svelte/icons/file";
import FileText from "@lucide/svelte/icons/file-text";
import Folder from "@lucide/svelte/icons/folder";
import Settings from "@lucide/svelte/icons/settings";
import GitBranch from "@lucide/svelte/icons/git-branch";
import Globe from "@lucide/svelte/icons/globe";
import Info from "@lucide/svelte/icons/info";
import Key from "@lucide/svelte/icons/key";
import Laptop from "@lucide/svelte/icons/laptop";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import List from "@lucide/svelte/icons/list";
import ListTodo from "@lucide/svelte/icons/list-todo";
import Mic from "@lucide/svelte/icons/mic";
import Minus from "@lucide/svelte/icons/minus";
import Monitor from "@lucide/svelte/icons/monitor";
import Moon from "@lucide/svelte/icons/moon";
import Palette from "@lucide/svelte/icons/palette";
import PanelLeft from "@lucide/svelte/icons/panel-left";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Pencil from "@lucide/svelte/icons/pencil";
import Play from "@lucide/svelte/icons/play";
import Plug from "@lucide/svelte/icons/plug";
import Plus from "@lucide/svelte/icons/plus";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Search from "@lucide/svelte/icons/search";
import ShieldCheck from "@lucide/svelte/icons/shield-check";
import Sparkles from "@lucide/svelte/icons/sparkles";
import Square from "@lucide/svelte/icons/square";
import Star from "@lucide/svelte/icons/star";
import Sun from "@lucide/svelte/icons/sun";
import Terminal from "@lucide/svelte/icons/terminal";
import Trash2 from "@lucide/svelte/icons/trash-2";
import Type from "@lucide/svelte/icons/type";
import X from "@lucide/svelte/icons/x";
import Zap from "@lucide/svelte/icons/zap";

interface Props {
  name: string;
  size?: number;
  stroke?: number;
  /** Tint color; defaults to currentColor. */
  fill?: string;
  class?: string;
}

let { name, size = 16, stroke = 1.8, fill, class: className }: Props = $props();

// Legacy glyph name -> Lucide component. Several legacy names intentionally
// share a Lucide icon (e.g. read/prompt -> FileText, workspace/ws -> Folder).
const ICONS: Record<string, typeof X> = {
  // UI controls
  close: X,
  minimize: Minus,
  maximize: Square,
  chev: ChevronDown,
  chevR: ChevronRight,
  dot: Dot,
  // Content & files
  search: Search,
  read: FileText,
  edit: Pencil,
  file: File,
  code: Code,
  folder: Folder,
  workspace: Folder,
  ws: Folder,
  git: GitBranch,
  attach: Paperclip,
  // Actions & states
  check: Check,
  run: Play,
  send: ArrowUp,
  plus: Plus,
  think: Lightbulb,
  sparkle: Sparkles,
  replay: RotateCcw,
  refresh: RotateCcw,
  download: ArrowDown,
  term: Terminal,
  list: List,
  arrowDown: ArrowDown,
  // Settings & config
  prompt: FileText,
  plug: Plug,
  key: Key,
  back: ArrowLeft,
  eye: Eye,
  eyeOff: EyeOff,
  copy: Copy,
  info: Info,
  gear: Settings,
  // Appearance & theme
  sun: Sun,
  moon: Moon,
  mac: Monitor,
  type: Type,
  globe: Globe,
  paint: Palette,
  // Agents & systems
  bot: Bot,
  sdkA: Sparkles,
  sdkX: Sparkles,
  brain: Brain,
  skill: Star,
  trash: Trash2,
  plan: ListTodo,
  bolt: Zap,
  shield: ShieldCheck,
  // Hardware & scope
  laptop: Laptop,
  mic: Mic,
  chip: Cpu,
  sidebar: PanelLeft,
  arrowRight: ArrowRight,
};

const Glyph = $derived(ICONS[name] ?? Sparkles);
</script>

<Glyph {size} strokeWidth={stroke} color={fill} class={className} />
