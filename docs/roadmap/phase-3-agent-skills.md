# Phase 3 Agent Skills

版本：0.2 详细规划

状态：详细规划

相关文档：

- [开发计划](development-plan.md)
- [Phase 1 可靠性与可审阅性](phase-1-reliability-and-reviewability.md)
- [Phase 2 MCP and Tool Ecosystem](phase-2-mcp-and-tool-ecosystem.md)
- [Phase 4 Provider Abstraction](phase-4-provider-abstraction.md)
- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)
- [开发工作流和规范](../process/development-workflow-and-standards.md)
- [Agent Skills Specification 资料记录](../research/agent-skills-specification.md)
- [Claude Code Book 整体分析](../research/claude-code-book/overall-analysis.md)

语言：中文

## 1. 阶段定位

Phase 3 不重写 Phase 0/1 的 runtime、ToolRuntime、session store 或 TUI，也不重写 Phase 2 的 MCP/tool ecosystem。它在可靠执行、可审阅界面和统一 ToolRegistry 之上，引入可发现、可解释、可禁用、可审计的 Agent Skills。

Phase 3 的目标是让 coding agent 的专业工作流可以通过标准 `SKILL.md` skill 包扩展，而不是继续把所有语言、框架、review 和 git 规则硬编码进核心 prompt。Skill 是 instruction、resource、template、示例和可选 script 的能力包；它不是权限来源，也不是任意代码执行入口。

Phase 3 的主轴：

1. 兼容 Agent Skills 标准的最小 loader：标准 skill 目录加必需 `SKILL.md`。
2. 稳定 SkillRegistry：统一管理 builtin、user、workspace local 和 workspace shared skill 来源。
3. 可解释 activation resolver：支持 explicit、file pattern 和 conservative semantic 触发。
4. 渐进披露 context：metadata 常驻，`SKILL.md` body 触发后进入 context，`references/`、`scripts/`、`assets/` 按需处理。
5. 内置 coding skills 标准化：用同一套 `SKILL.md` 结构交付 repo orientation、TypeScript、git workflow 和 code review 工作流。
6. TUI 可审阅：用户能看到 active skills、触发原因、来源、context 影响和 `allowed-tools` hint 的解释状态。
7. 安全边界保持不变：skills 只能记录标准 `allowed-tools` hints，不能提升 runtime policy、绕过 approval、读取 secrets 或直接执行脚本。

Phase 3 结束后，Electrolyte 的默认 coding agent 应该能通过 skills 扩展行为，并且后续引入 provider abstraction、长任务和插件时不需要重新设计 skill 边界。

## 2. 前置条件

Phase 3 默认 Phase 1、Phase 2 已经交付：

- 最小 TUI shell 可启动，并通过 Runtime SDK 消费 RuntimeEvent。
- TUI 已有 Context view、Diff view、Tests view、Tools view 和 artifact viewer。
- Runtime 支持 InstructionBlock source tracking 或等价 instruction 来源记录。
- ContextManager 支持 token budget、recent-window、summary placeholder、artifact refs 和 plan/checkpoint summary 优先级。
- ToolRegistry / ToolRuntime 已有 tool execution metadata、approval metadata、read-only/write 风险属性和 artifact strategy。
- session store 可以保存 sessions、runs、items、runtime_events、approvals、artifacts 和 Phase 1 扩展字段。
- Plan mode、approval、cancel、resume 和 replay tests 已能覆盖基本 run loop。
- MCP/tool ecosystem 已形成统一 ToolRegistry、ToolSource metadata、permission merge 和 tool visibility。

如果实现时发现这些前置条件缺失，应补齐 Phase 1/2 边界，而不是让 SkillRegistry、TUI skill 面板或 skill script 路径直接调用 provider、shell、filesystem 或 store。

## 3. 用户场景

Phase 3 必须覆盖这些端到端场景：

- 安装或指向 skill 目录：用户把一个标准 Agent Skill 目录加入 Electrolyte，TUI 能列出 name、description、来源和 validation 状态。
- 显式启用 skill：用户在当前 session 中启用 `code-review`，agent 后续回答采用 review finding 优先的工作流，TUI 显示 active skill 和触发来源。
- TypeScript 项目自动触发：用户在含 `package.json`、`tsconfig.json` 或 `.ts/.tsx` 文件的 workspace 中提出实现或修复任务，runtime 触发 `typescript-coding`，但只在触发后加载 body。
- Repo orientation：用户进入新仓库后，agent 使用 `repo-orientation` 收集项目结构、脚本、测试入口和贡献规范，并把结果作为普通 transcript/context 事实，而不是永久记忆。
- Git workflow：用户要求准备 commit 或 PR 前，agent 使用 `git-workflow` 检查 status、diff 和测试结果；push、release、remote side effect 仍按 approval policy 处理。
- Code review：用户要求 review 时，agent 使用 `code-review` skill，以 bug/risk/test gap 为优先输出，并能引用文件位置。
- Context 审阅：用户能看到某个 skill 加入了哪些 instruction、占用多少 token、哪些资源被读取、哪些资源只是可用但未加载。
- Skill 禁用：用户禁用不合适的 skill 后，runtime 在后续 run 不再把该 skill 的 instructions 或 resource hints 放入 context。
- 低信任 workspace skill：工作区共享配置可以推荐 skill，但不能自动启用未信任脚本、扩大权限或读取 workspace 外路径。
- Skill script 受控执行：如果 skill 包含脚本，脚本只能通过 ToolRuntime 或受控执行器请求执行，并显示风险、来源和 approval；不能因为 skill 激活而自动运行。

## 4. 用户能力

Phase 3 用户应能：

- 配置 skill roots：builtin、user global、workspace local、workspace shared。
- 查看 discovered skills：name、description、source、trust、status、validation error、resource/script count。
- 查看 active skills：activation reason、enabled by、source、priority、loaded body、loaded resources、token estimate。
- 显式 enable、disable、pin 或 reload skill，作用域至少支持 current session；workspace/user 持久化可按实现切片逐步提供。
- 在 TUI Context view 中看到 skill 对 instruction stack 和 context budget 的影响。
- 打开 skill source metadata 和 `SKILL.md` 摘要；直接打开本地文件可以是后续 UI 增强，不是本阶段验收必要条件。
- 看到 skill `allowed-tools` 提示中列出的 tools 哪些可用、哪些被 policy 屏蔽、哪些属于后续 Phase。
- 对 skill script 请求执行 approve 或 deny；被拒绝时 agent 收到可恢复的 denied tool result。
- 在 replay 或历史 session 中看到当时的 active skill snapshot，而不是按当前磁盘状态重新解释旧 run。

## 5. 必做范围

### 5.1 Product / Interface

Phase 3 的默认验收 interface 仍是 Phase 1 TUI。REPL 可以显示简化信息，但不能破坏 Phase 0/1 能力。

TUI 必须新增或完善：

- `Skills` view：discovered skills、active skills、invalid skills、builtin skills、skill roots。
- `Context` view：显示 active skill instruction blocks、activation reason、source、priority、token estimate、loaded resources。
- `Tools` view：显示 skill `allowed-tools` 提示与当前 tool visibility 的解释结果。
- Command palette 或等价入口：list skills、enable skill、disable skill、reload skill roots。
- Skill activation event 渲染：例如 `skill.activated`、`skill.loaded`、`skill.resource.loaded`。
- Skill script approval prompt：显示 skill name、script path、command/input preview、risk、cwd、sandbox 状态和来源。

TUI 不得：

- 直接扫描任意 skill 目录。
- 直接读取 skill resources。
- 直接执行 skill scripts。
- 自己决定 skill activation。
- 修改 transcript 或 session skill snapshot。

所有动作都必须通过 Runtime SDK、SkillRegistry、ContextManager 和 ToolRuntime 边界。

### 5.2 Skill Package 兼容性

Phase 3 的兼容目标以 [Agent Skills Specification 资料记录](../research/agent-skills-specification.md) 指向的官方 specification 为准。路线图只记录实现边界；字段细节如有变化，应先更新 research 记录，再决定是否调整 P3 gate。

Phase 3 只要求兼容标准 Agent Skills 最小结构：

```text
skill-name/
  SKILL.md
  agents/
  references/
  assets/
  scripts/
```

只有 `SKILL.md` 是必需文件。`skill.json`、`agents/openai.yaml` 或其他 metadata 文件只能作为可选扩展读取，不能成为兼容性的前提。规范允许 `scripts/`、`references/`、`assets/` 之外存在额外文件或目录；Electrolyte 可以发现它们，但 P3 只对这三个目录提供明确行为。

`SKILL.md` 要求：

- YAML frontmatter 必须包含 `name` 和 `description`。
- `name` 必须稳定、唯一、可作为用户可见标识；内部 ID 需要结合 source 和 hash 防止冲突。
- `name` 必须符合官方约束：1-64 字符、小写字母/数字/hyphen、不能以 hyphen 开头或结尾、不能包含连续 hyphen，并且应匹配父目录名。
- `description` 用于发现、列表展示和 semantic activation。
- `description` 必须为 1-1024 字符，并应说明 skill 做什么以及何时使用。
- `license`、`compatibility`、`metadata` 是可选 metadata；它们不能扩大 runtime policy。
- `allowed-tools` 是 optional experimental 字段。Electrolyte Phase 3 只记录和展示它，作为非授权提示；它不能声明 required/optional，不能阻止 skill 激活，不能解释成自动授权。tool visibility、approval 和 sandbox 仍由 ToolRegistry、ToolRuntime 和 RuntimePolicy 决定。
- body 是触发后才加载的 Markdown instruction。
- frontmatter parsing 必须使用 YAML parser，不能靠脆弱字符串切分。
- invalid `SKILL.md` 不应让 runtime 启动失败，应作为 invalid skill 显示 validation error。

Skill package loader 必须：

- canonicalize root 和 skill path，防止路径穿越和 symlink 越界。
- 支持 builtin、user global、workspace local、workspace shared 四类来源。
- 对每个 skill 记录 source、trust level、path、manifest hash、`SKILL.md` hash、mtime 或等价 cache invalidation 信息。
- 支持重复 `name` 的 deterministic resolution：用户显式选择具体 source 时精确匹配；自动触发时按 trust 和 configured priority 决定，冲突必须可见。
- 只在 discovery 阶段读取 metadata，不读取大型 references，不执行 scripts。
- 支持接入官方提到的 `skills-ref validate` 或等价校验路径；P3 gate 至少要覆盖同等核心命名和 frontmatter 规则。

### 5.3 Skill Registry 和配置来源

Phase 3 引入 `SkillRegistry` runtime service，负责发现、校验、缓存、激活和生成 active skill snapshot。

建议配置来源：

```text
builtin            内置 skills，随 runtime 发布
user_global        用户配置目录，用户显式安装或添加
workspace_local    本机工作区配置，不提交
workspace_shared   项目共享配置，默认低信任
cli_override       当前启动命令或 session 覆盖
policy             组织或本机强制策略
```

配置规则：

- `policy` 可以 deny skill root、deny script execution、锁定 builtin skill 版本或禁用某类 activation。
- `workspace_shared` 可以推荐 skills 和 file patterns，但不能扩大危险权限、启用 destructive auto-approval、自动执行脚本或读取 workspace 外路径。
- `workspace_local` 和 `user_global` 可以表达用户偏好，但仍受 policy 限制。
- `builtin` skills 不依赖外部文件存在，且必须走同一 loader 逻辑，避免内置路径成为特殊权限后门。
- cli/session 显式启用的 skill 优先于自动 resolver，但仍不能绕过 policy deny。

Runtime SDK 至少需要支持：

- list skill roots。
- list discovered skills。
- enable / disable skill for session。
- reload skill roots。
- get active skill snapshot for session/run。

### 5.4 Activation Resolver

Activation resolver 必须 deterministic、可解释、保守。

Phase 3 支持的 activation modes：

- `explicit`：用户、agent definition、session config 或 command palette 显式启用。
- `file_pattern`：根据 workspace facts、当前文件扩展名、关键配置文件或任务引用路径触发。
- `semantic`：根据当前用户任务和 skill `description` 做保守匹配，必须输出 reason 和 confidence bucket。
- `always`：只允许极小、低风险、内置或用户 pin 的基础 skill，例如 `coding-core`；不允许第三方 workspace shared skill 默认为 always。

Resolver 行为：

- deny / disabled 优先于 enable。
- explicit 优先于 file_pattern，file_pattern 优先于 semantic。
- semantic 匹配必须有解释，例如“任务提到 code review，匹配 `code-review` description”。
- 低 confidence semantic 匹配只能作为 suggested skill，不自动注入 body。
- 每个 run 创建 active skill snapshot；同一 run 中不能因为磁盘文件变化改变已注入 instructions。
- 用户禁用 skill 后，应追加 runtime observation 或 event，后续 provider step 不再看到该 skill instruction。
- resolver 不能调用 provider 来决定权限；如果使用模型或 embedding 辅助建议，只能作为低优先级 suggestion，并需要可 replay 的 fallback。

### 5.5 Progressive Loading 和 Context 集成

Phase 3 的 context 策略遵循渐进披露：

1. Discovery：只读取 `name`、`description`、可选 frontmatter metadata、source、hash、resource/script 列表摘要。
2. Activation：触发后读取 `SKILL.md` body，生成 `InstructionBlock(role="skill")`。
3. Resource hint：列出 `references/`、`assets/`、`scripts/` 中可用资源，但不自动加载大内容。
4. Resource load：只有当 skill body、agent 或用户任务明确需要时，才读取具体 reference 或 asset metadata。
5. Script execution：只有通过 ToolRuntime 或受控执行器，并按 risk/approval 执行。

InstructionBlock 要求：

- `role="skill"`。
- `source` 包含 skill id、source kind、path/hash 或 equivalent source ref。
- `priority` 低于 runtime safety 和 product/system instructions，高于普通 workspace facts。
- `scope` 至少支持 session/run；资源型 instruction 可按 turn 过期。
- token estimate 必须进入 Context view。

Resource loading 要求：

- 文本 references 默认有 size limit；超过 inline limit 写 artifact 或只给 summary/ref。
- binary assets 不 inline 到模型，默认作为 file ref 或 artifact metadata。
- references 不能读取 skill root 外路径，除非通过普通 file tool 并受 workspace policy 检查。
- skill 内部文件引用应使用相对 skill root 的路径，并避免深层引用链；resolver 只保证 P3 定义的一层资源加载路径。
- resource 内容进入模型前必须经过 ContextManager budget 选择。
- loaded resources 需要进入 runtime event 或 session metadata，便于 replay 和审计。

### 5.6 Built-in Coding Skills

Phase 3 必须把内置 coding workflow 作为标准 skill 包交付，而不是特殊 prompt 分支。

必做 builtin skills：

- `coding-core`：通用 coding loop，覆盖 repo inspection、small scoped edits、tests、verification、final answer。
- `repo-orientation`：读取项目结构、依赖管理、脚本、测试入口、lint/typecheck、贡献规范和约束文档。
- `typescript-coding`：TypeScript/JavaScript 项目的文件定位、类型检查、测试、构建、常见 package manager、module format 和 framework-aware edit discipline。
- `git-workflow`：status、diff、patch review、branch/commit/PR 准备；push、release、publish、remote side effects 仍高风险审批。
- `code-review`：review stance，优先输出 bug、regression、security risk、missing tests，并要求紧贴文件/行引用。

每个 builtin skill 必须：

- 使用标准 `SKILL.md`。
- 有清晰 `name` 和 `description`。
- 有 activation rules。
- 有最小 tests 或 golden snapshots。
- 不声明扩大权限。
- 不假设特定 provider。

Phase 3 可以预留但不正式验收：

- `frontend-verification`：需要 browser verification，主验收放到 Phase 5。
- provider-specific `agents/openai.yaml`：可读取 metadata，但不作为行为源真相。

### 5.7 Tool / Capability Hints

Phase 3 不定义 Electrolyte 私有 required/optional tool requirement schema。Skills 只能通过标准 `SKILL.md` 的 experimental `allowed-tools` 字段提供 tool hints；runtime policy 和 ToolRuntime 仍是唯一权限边界。

Tool hints 行为：

- `allowed-tools` 不可用时，SkillRegistry 显示 unavailable/blocked hint，并把可恢复说明提供给 TUI；不阻止 skill 激活。
- `allowed-tools` 只能影响解释和 UI 展示，不能改变 tool visibility、risk、approval、filesystem、network、shell、secrets 或 sandbox policy。
- skill 不能自动启用 MCP server；MCP/tool ecosystem 已在 Phase 2 接入，skill 只能声明或请求使用已有 MCP tools，不能自动启用 MCP server。
- skill scripts 可以作为 `SkillScriptSource` 映射到 runtime-controlled execution path，但默认不直接 model-visible，除非用户或 policy 明确允许。

Skill script 最小行为：

- discovery 阶段只列出脚本 metadata、path、hash 和 maybe description。
- 执行前必须 canonicalize path 并验证仍在 skill root。
- 执行走 ToolRuntime 或受控 executor，继承 sandbox、cwd、timeout、output limit、artifact strategy 和 approval policy。
- 脚本输出按普通 tool result 进入 transcript，长输出 artifact 化。
- 被拒绝或被 policy 阻止时，追加 denied/error tool result，不能静默失败。

### 5.8 Security / Policy

Phase 3 必须保持这些安全规则：

- Skill 不能提升权限；`allowed-tools` / `skill_tool_hints` 只能提供解释状态，不能改变 tool visibility、approval 或 activation。
- Runtime safety、policy、approval 和 workspace boundary 优先级高于 skill instruction。
- Workspace shared skill 默认低信任，不能自动执行代码或扩大可见工具。
- Skill loader 不读取 secrets，不解析 `.env`，不把 secret-like 文件放入 context。
- Skill path、resource path、script path 都必须 canonicalize。
- Symlink 必须按 resolved path 检查边界。
- Remote registry、remote install、网络下载和 package update 不属于 Phase 3。
- Third-party skill body 是 prompt/instruction 输入，不能被当作可信代码或可信策略。
- Skill instruction 不能覆盖模型安全、ToolRuntime policy、approval decision 或 sandbox 状态。
- 所有 active skill、loaded resource 和 script execution 都要有 source tracking。

### 5.9 Runtime Events 和 Observability

Phase 3 允许增加 RuntimeEvent，但必须保持 Phase 0/1 consumer 能渲染未知事件摘要，并继续使用 dot event name。

建议事件：

- `skill.discovery.started`
- `skill.discovery.completed`
- `skill.validation.failed`
- `skill.activated`
- `skill.deactivated`
- `skill.body.loaded`
- `skill.resource.loaded`
- `skill.resource.skipped`
- `skill.tool_hint.blocked`
- `skill.script.requested`
- `skill.script.denied`
- `skill.script.completed`

事件至少应包含：

- session/run id 或 registry operation id。
- skill id、name、source kind。
- activation reason 或 validation error。
- resource/script relative path 和 hash。
- policy decision 或 blocked reason。

## 6. 数据模型变化

Phase 3 的 schema change 必须通过 migration 完成，并保持 Phase 0/1 session 可读。

建议新增或扩展：

- `skill_sources`：source id、kind、root path、trust level、config source、enabled、priority、created_at、updated_at。
- `skills`：skill id、source id、name、description、version、standard、path、skill_md_path、manifest hash、skill_md hash、status、validation errors、mtime。
- `skill_resources`：skill id、kind、relative path、mime、size、sha256、load policy、status。
- `skill_scripts`：skill id、relative path、sha256、declared description、default risk、status。
- `skill_tool_hints`：skill id、tool name/pattern from `allowed-tools`、availability、blocked reason、source hash。
- `session_skills`：session id、skill id、activation status、enabled by、activation mode、activation reason、priority、activated_at、disabled_at。
- `run_skill_snapshots`：run id、skill id、source hash、body hash、loaded resource refs、instruction block refs、token estimate。
- `instruction_blocks` 或等价结构：source、role、priority、scope、content hash、model-visible summary。
- `runtime_events`：支持 P3 skill events，保持 append-only。
- `artifacts`：支持 `skill_reference`、`skill_resource`、`skill_script_output` artifact kind，并遵守架构文档中的 `ArtifactKind` union。

约束：

- session/run 的 active skill snapshot 必须可 replay，不能只依赖当前磁盘 skill 文件。
- metadata cache 可以重建，但 historical run snapshot 不能丢。
- UI state 不进入 session store。
- skill body 和 references 的完整文本是否存入 store 可以按 artifact 策略决定，但至少要保存 source hash、summary 和加载事件。
- path 字段保存展示路径时，执行前仍必须重新 canonicalize。
- migration 要有 tests，不能依赖手工修库。

## 7. 实现切片

Phase 3 按可验收的纵向切片推进。

### P3.1 Skill loader 和 validation

- 实现标准 `SKILL.md` discovery。
- 使用 YAML parser 读取 frontmatter。
- 校验 `name`、`description`、body、resource/script path。
- 建立 builtin/user/workspace root abstraction。
- 记录 invalid skills 和 validation errors。

验收：一个标准 skill 目录能被发现；缺少 `name` 或越界 symlink 的 skill 被标为 invalid，但 runtime 不崩溃。

### P3.2 SkillRegistry 和配置来源

- 实现 `SkillRegistry` service。
- 支持 list roots、list discovered skills、reload roots。
- 实现 source trust model 和 deterministic duplicate resolution。
- 增加 skill metadata cache 和 migration。

验收：TUI 能列出 builtin、user、workspace skills；重复 name 能显示冲突来源和最终选择。

### P3.3 Activation resolver

- 实现 explicit enable/disable。
- 实现 file pattern activation。
- 实现 conservative semantic suggestion / activation。
- 生成 `skill.activated` / `skill.deactivated` events。
- 为每个 run 固化 active skill snapshot。

验收：用户显式启用 `code-review` 后 active skills 显示正确；TypeScript workspace 中触发 `typescript-coding`；低置信 semantic match 只建议不注入。

### P3.4 Instruction 和 Context 集成

- 触发后读取 `SKILL.md` body。
- 生成 `InstructionBlock(role="skill")` 并记录 source/priority/scope。
- Context view 显示 skill instruction token estimate。
- Resource hints 进入 context diagnostics，具体 references 按需读取。
- 大 reference 写 artifact 或只保留 summary/ref。

验收：未触发 skill 的 body 不进入 context；触发后 Context view 能显示来源、token estimate 和已加载 resources。

### P3.5 Product Skills view

- 增加 TUI `Skills` view 或等价 pane。
- 支持 enable、disable、reload。
- 显示 validation errors、activation reason、allowed-tools hints、script warnings。
- REPL 显示简化 active skills summary。

验收：用户能在 TUI 中查看并切换 skill 状态；TUI 操作都对应 Runtime SDK 调用。

### P3.6 Built-in coding skills

- 用标准 skill 目录实现 `coding-core`。
- 实现 `repo-orientation`。
- 实现 `typescript-coding`。
- 实现 `git-workflow`。
- 实现 `code-review`。
- 为每个 builtin skill 增加 golden snapshot 或 loader tests。

验收：内置 skills 走同一 loader；TypeScript 修复任务使用 `typescript-coding`；review 任务使用 `code-review` 输出 review-first 结构。

### P3.7 Skill resources 和 scripts 受控路径

- 实现 references/assets metadata discovery。
- 实现按需 reference load、size limit 和 artifact strategy。
- 实现 script metadata discovery。
- 实现 script execution request 通过 ToolRuntime 或受控 executor。
- 补 approval、denied result、long output artifact。

验收：skill reference 只有被请求时才加载；script 不会自动运行；执行脚本前显示 approval，拒绝后 agent 收到 denied result。

### P3.8 Phase gate

- 补齐 unit、integration、replay tests。
- 完成 manual acceptance。
- 同步路线图、审计和已知限制。
- 确认 skills 保持 provider-neutral 边界，为 Phase 4 Provider Abstraction 留出稳定接口。

验收：Phase 3 gate checklist 全部通过。

## 8. 测试计划

自动测试使用 Vitest。Phase 3 必须增加以下测试层：

Unit tests：

- `SKILL.md` frontmatter parsing：valid、missing name、missing description、malformed YAML。
- official name constraints：length、lowercase、hyphen placement、consecutive hyphen、parent directory match。
- optional frontmatter fields：license、compatibility、metadata、allowed-tools。
- skill path canonicalization：normal path、symlink、path traversal、workspace root outside。
- duplicate skill name resolution。
- source trust model：builtin、user_global、workspace_local、workspace_shared、policy deny。
- activation resolver：explicit、disabled、file_pattern、semantic high/low confidence、always restrictions。
- active skill snapshot immutability within run。
- InstructionBlock priority/source/scope。
- Context budget selection with active skill instructions and large references。
- resource load size limit、artifact threshold、binary asset file ref。
- `allowed-tools` hint / `skill_tool_hints` mapping：available、missing、policy blocked 仅作为解释状态，不改变 tool visibility、approval 或 skill activation。
- script execution policy：approval required、denied、timeout、long output artifact。

Integration tests：

- SDK create session -> discover skill -> enable skill -> run -> active skill appears in context。
- TypeScript workspace fixture triggers `typescript-coding` and loads body only after activation。
- Review task triggers or explicitly enables `code-review` and produces review-first answer。
- Workspace shared skill cannot expand permission or auto-run script。
- Disabling skill removes its instruction from later provider input。
- Skill reference loads on demand and records `skill.resource.loaded` event。
- Script approval denial writes denied tool result and feedback reaches model。
- Resume historical session preserves prior run skill snapshot even if disk skill changes。
- Reload roots updates discovered skills without mutating completed run snapshots。

Replay tests：

- exact replay renders skill discovery, activation, body loaded, resource loaded and script denied events。
- deterministic replay with MockProvider covers explicit skill activation and file pattern activation。
- replay covers invalid skill、duplicate skill name、unavailable allowed-tools hint and policy-blocked script。

Manual acceptance：

1. 启动 `electrolyte tui`。
2. 打开 `Skills` view，确认 builtin skills 可见。
3. 添加一个临时标准 skill 目录，确认 `name`、`description` 和 source 正确显示。
4. 显式启用该 skill，发送任务，确认 active skills 和 Context view 显示该 skill body。
5. 在 TypeScript fixture 项目中发送修复任务，确认 `typescript-coding` 触发。
6. 发送“review this change”，确认 `code-review` 生效并按 finding 优先输出。
7. 打开 Context view，确认未触发 skills 的 body 未加载。
8. 读取一个 skill reference，确认大内容进入 artifact 或 summary/ref。
9. 尝试执行 skill script，确认 approval prompt 出现；deny 后 agent 收到 denied result。
10. 禁用 skill，确认后续 run 不再注入该 skill instruction。
11. 重启并 resume session，确认历史 run 的 active skill snapshot 可审阅。

## 9. 验收标准

Phase 3 合格必须满足：

- 标准 `SKILL.md` skill 能被发现、校验、列出和重新加载。
- Invalid skill 不会导致 runtime 启动失败，并能在 TUI 显示 validation error。
- 用户能显式启用和禁用 skill。
- TUI 能显示 discovered skills、active skills、activation reason、source、trust、allowed-tools hints 和 context impact。
- `SKILL.md` body 只在 skill 触发后进入 context。
- 未触发 skill 的 references/scripts/assets 不进入模型上下文。
- TypeScript 项目中能触发 `typescript-coding` workflow。
- code review 任务能触发或显式使用 `code-review` workflow。
- Builtin skills 使用标准 `SKILL.md` 目录结构，并走同一 loader。
- Active skill instructions 有 source tracking、priority 和 token estimate。
- skill `allowed-tools` hints 只能用于 UI 解释，不能扩大权限、改变 visibility 或阻止 skill 激活。
- skill scripts 不能自动执行；执行必须通过 ToolRuntime 或受控执行器，并受 approval、sandbox 和 output artifact 规则约束。
- workspace shared skill 不能扩大危险权限、读取 secrets 或自动启用未信任代码执行。
- session/run 保存 active skill snapshot，replay 和 resume 不依赖当前磁盘 skill 内容。
- replay tests 不调用真实 provider 也能验证 discovery、activation、context loading 和 script denial。

## 10. 非目标

Phase 3 不做：

- 重新实现 MCP tool ecosystem；Phase 3 只复用 Phase 2 的 ToolRegistry、ToolSource、permission merge 和 visibility 边界。
- 远程 skill registry。
- 插件包和插件市场。
- provider abstraction、model picker、usage ledger 或 provider-specific skill routing；这些属于 Phase 4。
- 自动安装远程 skill、下载依赖或更新第三方 skill。
- 自动执行未授权 skill script。
- 把 skill script 作为默认 model-visible arbitrary tool。
- 完整 semantic search、embedding index 或长期 memory。
- browser verification 和 frontend screenshot workflow，正式验收放到 Phase 5。
- subagent、fork mode、agent team 或独立 verifier。
- 企业策略管理或组织级 skill distribution。

## 11. 已知限制

- Phase 3 的 semantic activation 必须保守；低置信匹配只做 suggestion，不强行注入 instructions。
- `references/` 第一版优先支持 Markdown/text；二进制 asset 默认只作为 file ref 或 artifact metadata。
- Script execution 第一版只要求受控执行路径、approval、sandbox 和 audit，不要求跨平台脚本兼容层。
- Skill version dependency、semver resolution、remote update 和 registry sync 留到插件/扩展阶段。
- `agents/openai.yaml` 等 provider-specific 文件可以读取为 metadata，但不作为 Phase 3 行为源真相。
- Builtin skills 第一版以 workflow guidance 为主，不要求覆盖所有语言、框架或 review 风格。
- Workspace shared skills 默认低信任；这会让某些项目推荐 skill 需要用户显式启用，属于有意的安全取舍。

## 12. 退出条件

Phase 3 结束前必须完成 phase gate：

- 当前产品界面可启动。
- `Skills` view 和 `Context` view 能完成手工验收。
- 自动测试、integration tests 和 replay tests 通过。
- session store 可查看 active skill snapshot 和相关 runtime events。
- invalid skill、disabled skill、policy-blocked skill、script denied 和 resume 后 skill snapshot 都有明确行为。
- P3 文档、总路线图状态和文档审计同步。
- 已知限制记录清楚。

Phase 3 结束后，Electrolyte 的 coding agent 行为可以通过标准 Agent Skills 扩展，而不需要修改核心 prompt 或 runtime；skills、tools、MCP 和插件仍保持清晰边界，并为 Phase 4 Provider Abstraction 保留 provider-neutral 扩展点。

