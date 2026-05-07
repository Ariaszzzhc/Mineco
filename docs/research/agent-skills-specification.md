# Agent Skills Specification 资料记录

日期：2026-05-07

来源：[Agent Skills Specification](https://agentskills.io/specification)

归属：外部规范资料记录。本文不替代 `docs/roadmap/phase-3-agent-skills.md` 的阶段范围，也不替代 Electrolyte 的 runtime/security policy；它用于记录 P3 Agent Skills 实现需要对齐的外部格式约束。

## 核心结论

- Agent Skill 是一个目录，至少包含 `SKILL.md`。
- `SKILL.md` 必须包含 YAML frontmatter，后面跟 Markdown body。
- 必填 frontmatter 字段是 `name` 和 `description`。
- 可选 frontmatter 字段包括 `license`、`compatibility`、`metadata` 和 experimental `allowed-tools`。
- `scripts/`、`references/`、`assets/` 是可选目录；规范允许额外文件或目录。
- Progressive disclosure 是规范核心：启动时只加载 metadata，skill 激活后加载 `SKILL.md` body，脚本、引用和资产按需加载。
- 文件引用应使用相对 skill root 的路径，避免深层引用链。
- 官方资料提到可使用 `skills-ref validate ./my-skill` 校验 frontmatter 和命名规则。

## 对 Electrolyte P3 的实现影响

- Loader 必须以 `SKILL.md` 为兼容主路径；`skill.json` 不能成为标准兼容前提。
- `name` 校验要严格：1-64 字符、小写字母/数字/hyphen、不能以 hyphen 开头或结尾、不能包含连续 hyphen，并且应匹配父目录名。
- `description` 校验要严格：1-1024 字符，且用于 activation resolver 的匹配依据。
- `compatibility` 可作为环境需求说明，但不能自动扩大权限。
- `metadata` 只能作为扩展 metadata，不能覆盖 runtime policy。
- `allowed-tools` 在规范中是 experimental。Electrolyte 可以记录和展示它，但不能把它解释成自动授权；任何 tool visibility、approval、sandbox 和权限仍由 ToolRegistry、ToolRuntime 和 RuntimePolicy 决定。
- `SKILL.md` body 激活后会整体加载，因此 P3 应保留正文长度诊断，并鼓励大型材料进入 `references/`。
- `scripts/` 只能通过 ToolRuntime 或受控执行器运行，不能因为 skill 激活自动执行。

## 仍需实现时确认

- 是否直接引入 `skills-ref` 作为开发/CI 校验工具，还是先内联最小校验逻辑。
- 是否把 official spec 的 optional 字段全部持久化到 `skills` 表，还是先把 unknown frontmatter 存入 metadata。
- `allowed-tools` 的展示 UI 应放在 `Skills` view、`Tools` view，还是两者都显示。
