/**
 * Tiny i18n for the UI shell only (labels, buttons, section titles). The engine
 * reply language is NOT controlled here. `lang` is derived from the theme store
 * so changing language in Settings updates everything; `t(key)` falls back to
 * the key when a string is missing.
 */
import { theme } from "./theme.svelte";

type Dict = Record<string, string>;

const en: Dict = {
  // shell / nav
  "app.name": "mineco",
  "nav.home": "Home",
  "nav.newSession": "New session",
  "nav.settings": "Settings",
  "nav.back": "Back",
  "nav.recent": "Recent",
  "nav.sessions": "Sessions",
  // workspace
  workspace: "Workspace",
  "workspace.shared": "Shared scratch",
  "workspace.add": "Add workspace",
  "workspace.name": "Name",
  "workspace.path": "Path",
  "workspace.choose": "Choose folder…",
  "workspace.none": "No workspace",
  // composer / run
  agent: "Agent",
  model: "Model",
  runMode: "Run mode",
  "runMode.default": "Default",
  "runMode.plan": "Plan",
  "runMode.auto": "Auto",
  "runMode.acceptEdits": "Accept edits",
  send: "Send",
  stop: "Stop",
  "composer.placeholder": "Describe a task…",
  thinking: "Thinking",
  // greeting / empty states
  "home.greeting": "What should we build?",
  "home.starters": "Starters",
  "empty.noAgents": "No agents yet — add one to get started.",
  "empty.noAgentsCta": "Add an agent",
  "empty.noWorkspaces": "No workspaces yet.",
  "empty.noSessions": "No sessions yet.",
  // settings sections
  "settings.title": "Settings",
  "settings.agents": "Agents",
  "settings.mcp": "MCP servers",
  "settings.skills": "Skills",
  "settings.memory": "Memory",
  "settings.appearance": "Appearance",
  // appearance
  appearance: "Appearance",
  theme: "Theme",
  "theme.dark": "Dark",
  "theme.light": "Light",
  accent: "Accent",
  windowControls: "Window controls",
  "platform.mac": "macOS",
  "platform.win": "Windows",
  fontSize: "Font size",
  language: "Language",
  "lang.en": "English",
  "lang.zh": "中文",
  // agent editor
  "agent.new": "New agent",
  "agent.name": "Name",
  "agent.engine": "Engine",
  "agent.baseUrl": "Base URL",
  "agent.apiKey": "API key",
  "agent.systemPrompt": "System prompt",
  "agent.promptMode": "Prompt mode",
  "agent.promptMode.append": "Append",
  "agent.promptMode.replace": "Replace",
  "agent.effort": "Reasoning effort",
  // generic actions
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  edit: "Edit",
  add: "Add",
  remove: "Remove",
  enabled: "Enabled",
  scope: "Scope",
  "scope.global": "Global",
  "scope.project": "Project",
  "scope.local": "Local",
};

const zh: Dict = {
  "app.name": "mineco",
  "nav.home": "首页",
  "nav.newSession": "新会话",
  "nav.settings": "设置",
  "nav.back": "返回",
  "nav.recent": "最近",
  "nav.sessions": "会话",
  workspace: "工作区",
  "workspace.shared": "共享暂存区",
  "workspace.add": "添加工作区",
  "workspace.name": "名称",
  "workspace.path": "路径",
  "workspace.choose": "选择文件夹…",
  "workspace.none": "无工作区",
  agent: "智能体",
  model: "模型",
  runMode: "运行模式",
  "runMode.default": "默认",
  "runMode.plan": "计划",
  "runMode.auto": "自动",
  "runMode.acceptEdits": "接受修改",
  send: "发送",
  stop: "停止",
  "composer.placeholder": "描述一个任务…",
  thinking: "思考中",
  "home.greeting": "我们来构建什么？",
  "home.starters": "快速开始",
  "empty.noAgents": "还没有智能体 — 添加一个开始使用。",
  "empty.noAgentsCta": "添加智能体",
  "empty.noWorkspaces": "还没有工作区。",
  "empty.noSessions": "还没有会话。",
  "settings.title": "设置",
  "settings.agents": "智能体",
  "settings.mcp": "MCP 服务器",
  "settings.skills": "技能",
  "settings.memory": "记忆",
  "settings.appearance": "外观",
  appearance: "外观",
  theme: "主题",
  "theme.dark": "深色",
  "theme.light": "浅色",
  accent: "强调色",
  windowControls: "窗口控件",
  "platform.mac": "macOS",
  "platform.win": "Windows",
  fontSize: "字号",
  language: "语言",
  "lang.en": "English",
  "lang.zh": "中文",
  "agent.new": "新建智能体",
  "agent.name": "名称",
  "agent.engine": "引擎",
  "agent.baseUrl": "Base URL",
  "agent.apiKey": "API 密钥",
  "agent.systemPrompt": "系统提示词",
  "agent.promptMode": "提示词模式",
  "agent.promptMode.append": "追加",
  "agent.promptMode.replace": "替换",
  "agent.effort": "推理强度",
  save: "保存",
  cancel: "取消",
  delete: "删除",
  edit: "编辑",
  add: "添加",
  remove: "移除",
  enabled: "启用",
  scope: "范围",
  "scope.global": "全局",
  "scope.project": "项目",
  "scope.local": "本地",
};

const dicts: Record<"en" | "zh", Dict> = { en, zh };

export const i18n = {
  /** Current language, mirrored from the theme/appearance store. */
  get lang(): "en" | "zh" {
    return theme.lang;
  },
  set lang(v: "en" | "zh") {
    theme.set({ lang: v });
  },
  /** Translate a key; falls back to the key itself when missing. */
  t(key: string): string {
    return dicts[theme.lang]?.[key] ?? en[key] ?? key;
  },
};
