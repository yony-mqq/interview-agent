# Skill 工作流程与安装机制

> **面试高频题**："Skill 的工作流程是怎样的？为什么有时要手动 `/skill` 才能命中？`npx skills add` 时发生了什么？"
> **关联考点**：Harness 研发范式、Skill 与 MCP 的区别

---

## 一、Skill 的本质

Skill = 一个包含**流程定义**的 Markdown 文件（`skill.md`）。

**核心内容**：
- 这个 Skill 解决什么问题
- 需要什么输入
- 产出什么输出
- 执行步骤是什么
- 边界条件有哪些

```markdown
# 多端埋点 Skill

## 输入
- 埋点需求文档路径
- 目标平台（rax / react / miniapp）

## 输出
- 埋点代码变更（diff）
- 变更摘要

## 流程
1. 读取并解析埋点需求文档
2. 提取埋点事件列表
3. 扫描 src/ 目录，定位页面和组件
4. 按目标平台语法生成埋点代码
5. 插入代码，输出 diff

## 边界条件
- 不修改 node_modules/
- 已有埋点不重复插入
```

---

## 二、Skill 的工作流程

```
编码工具启动时
      │
      ▼
┌─────────────────┐
│ 1. 扫描 skills  │
│    目录         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. 提取所有     │
│    skill 的     │
│    description  │
│    （只看菜单）  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     未匹配
│ 3. LLM 根据用户 │────────► 走通用回答
│    问题判断该用 │
│    哪个 skill   │
└────────┬────────┘
         │ 匹配到某个 skill
         ▼
┌─────────────────┐
│ 4. 加载该 skill │
│    的完整内容   │
│    （点菜）      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. 注入 System  │
│    Prompt       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. LLM 按 Skill │
│    定义流程执行 │
└─────────────────┘
```

**详细步骤**：

1. **扫描阶段**：编码工具启动时，扫描各自的 skills 目录：

   | 工具 | 全局目录 | 项目级目录 |
   |---|---|---|
   | **Claude Code** | `~/.claude/skills/` | `./.claude/skills/` |
   | **Cursor** | `~/.cursor/skills/` | `./.cursor/skills/` |
   | **OpenAI Codex CLI** | `~/.agents/skills/` | `./.agents/skills/` |
   | **旧 Codex 路径** | `~/.codex/skills/` | `./.codex/skills/` |

   > 注意：Codex CLI 的推荐路径是 `.agents/skills/`（2026），旧路径 `~/.codex/prompts/` 已 deprecated。

2. **提取 description**：工具只读取每个 skill 的**描述信息**（名称 + description），而不是完整内容。这相当于"看菜单"。

3. **LLM 判断**：用户输入问题后，LLM 根据问题和各 skill 的 description，判断是否需要调用某个 skill。

4. **加载完整内容**：LLM 选定 skill 后，工具才读取该 skill 的完整 `skill.md`，注入 System Prompt。这相当于"点菜后上完整菜谱"。

5. **执行阶段**：LLM 按照 skill.md 中定义的流程和约束来执行。

**为什么这样设计？**
- 如果有 20 个 skill，每个 skill.md 几千字，全部注入会撑爆上下文
- 只给 description（菜单），让 LLM 先判断用哪个，再加载完整的，省 token、省上下文空间
- 这和 MCP 的 `tools/list` → `tools/call` 机制逻辑一致：先看有什么工具，再决定用哪个

---

## 三、为什么有时要手动 `/skill`，有时自动命中

### 情况一：必须手动 `/skill`

```
场景：
  - Skill 安装在全局目录（如 ~/.claude/skills/ 或 ~/.cursor/skills/）
  - 或用户问题比较模糊，LLM 无法从 description 判断该用哪个 Skill

表现：
  用户："帮我写个埋点"
  AI："请问你需要什么类型的埋点？"
  用户："/multi-platform-track"
  AI："已加载多端埋点 Skill，请提供埋点需求文档路径..."
```

**原因**：
- 全局 Skill 的 description 虽然在"菜单"里，但 LLM 判断不需要调用时不会加载
- 显式输入 `/skill-name` 相当于强制"我要点这道菜"
- 避免多个 skill description 相似导致 LLM 判断错误

### 情况二：自动命中

```
场景：
  - Skill 安装在项目级 ./.claude/skills/ 或 ./.cursor/skills/
  - 用户问题明确，LLM 从 description 判断出需要某个 skill

表现：
  用户："在这个项目里加一下埋点"
  AI："检测到当前是多端项目，已自动加载多端埋点 Skill。
       请提供埋点需求文档路径..."
```

**原因**：
- 项目级 skill 的 description 一直在"菜单"里，LLM 看到关键词就能匹配到
- 不需要用户显式 `/skill-name`，LLM 自己判断"这个问题适合用埋点 Skill 解决"
- 但完整内容仍然是在 LLM 判断后才加载，不是一开始就注入

### 对比总结

| 维度 | 手动 `/skill` | 自动命中 |
|---|---|---|
| **Skill 位置** | 全局 `~/.claude/skills/` 或 `~/.cursor/skills/` | 项目级 `./.claude/skills/` 或 `./.cursor/skills/` |
| **触发方式** | 用户显式输入 `/name` | LLM 从 description 判断匹配 |
| **加载时机** | 触发后才加载完整内容 | LLM 判断后才加载完整内容 |
| **适用场景** | 通用 Skill，不绑定特定项目 | 项目专属 Skill，强上下文关联 |
| **控制粒度** | 用户主动选择 | LLM 自动推荐 |

---

## 四、`npx skills add` 执行时发生了什么

### 命令拆解

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

| 部分 | 含义 |
|---|---|
| `npx skills` | 调用 `skills` 这个 npm 包（CLI 工具） |
| `add` | 安装/添加子命令 |
| `https://github.com/anthropics/skills` | Skill 仓库的 GitHub 地址 |
| `--skill frontend-design` | 指定要安装仓库中的哪个 Skill |

### 执行流程

```
Step 1: npx 解析
  └── 检查本地是否有 skills 包
      ├── 有 → 直接执行
      └── 无 → 临时下载到 npm 缓存，执行后删除

Step 2: skills add 执行
  ├── 2.1 clone / fetch GitHub 仓库
  │       └── https://github.com/anthropics/skills
  │
  ├── 2.2 在仓库中找 frontend-design/skill.md
  │       └── 验证 skill.md 格式是否合法
  │
  ├── 2.3 复制到本地 skills 目录（工具相关）
  │       └── Claude Code: ~/.claude/skills/frontend-design/
  │       └── Cursor: ~/.cursor/skills/frontend-design/
  │           └── skill.md
  │           └── 可能还有示例文件、模板文件
  │
  └── 2.4 更新索引
          └── 有些工具会维护一个 skills.json 索引，记录已安装的技能
```

### 安装后发生了什么

```
Claude Code 的 skill 目录：
~/.claude/
├── skills/
│   └── frontend-design/
│       ├── skill.md              ← 核心流程定义
│       ├── examples/             ← 示例（可选）
│       └── templates/            ← 模板文件（可选）
│
└── settings.json                 ← 可能更新，注册新 skill

Cursor 的 skill 目录（如果支持）：
~/.cursor/
├── skills/
│   └── frontend-design/
│       ├── skill.md
│       └── ...

Codex CLI 的 skill 目录（2026 推荐）：
~/.agents/
├── skills/
│   └── frontend-design/
│       ├── SKILL.md              ← Codex 用大写 SKILL.md
│       └── ...

旧 Codex 路径（仍兼容但已 deprecated）：
~/.codex/
├── prompts/                      ← 旧 Custom Prompts，已弃用
└── skills/                       ← 旧路径，仍可用
```

**关键**：
- `skill.md` 被复制到了**工具特定**的 skills 目录下
- Claude Code 的 skill **Cursor 看不到**，**Codex 也看不到**，因为目录隔离
- 各工具的调用语法也不同：Claude 用 `/skill-name`，Codex 用 `$skill-name`
- 找到后先提取 description 给 LLM 判断，需要时才加载完整内容

---

## 五、Skill 安装 vs MCP 安装的区别

| 对比项 | Skill 安装 | MCP 安装 |
|---|---|---|
| **安装命令** | `npx skills add ...` | 手动配置 `.cursor/mcp.json` |
| **安装内容** | Markdown 文件（skill.md） | 可执行程序或服务 |
| **安装位置** | 工具隔离：`~/.claude/skills/` 或 `~/.cursor/skills/` | 系统任意位置 |
| **运行时** | 加载到 Prompt 中，由 LLM 按流程执行 | 启动子进程或 HTTP 服务 |
| **自动发现** | 编码工具扫描自己的 skills 目录 | 需要配置文件显式声明 |
| **跨工具互通** | ❌ Claude 的 skill Cursor 用不了 | ❌ 配置不互通 |
| **本质** | "教会 AI 一个工作流程" | "给 AI 接一个外部工具" |

---

## 六、项目级 Skill 跨工具共享方案

**问题**：在项目根目录放一套 Skill，Claude Code 能用，Codex 也能用，是不是放到 `.agents/skills` 就行？

**回答：Codex 可以，Claude Code 不行。**

| 工具 | 认 `.agents/skills/` 吗？ | 自己的路径 |
|---|---|---|
| Claude Code | ❌ 不认 | `.claude/skills/` |
| Cursor | ❌ 不认（无原生 Skill） | `.cursor/skills/` |
| OpenAI Codex CLI | ✅ 认（推荐路径） | `.agents/skills/` |

所以 `.agents/skills/` **只有 Codex 能自动识别**，Claude Code 不会扫这个目录。

### 可行的 workaround

#### 方案一：多目录软链接（推荐）

```bash
# 以 .agents/skills/ 作为唯一真实来源
mkdir -p .agents/skills

# 各工具目录软链接到统一来源
ln -s ../.agents/skills .claude/skills
ln -s ../.agents/skills .cursor/skills
```

```
项目根目录
├── .agents/
│   └── skills/              ← 唯一真实来源
│       ├── frontend-design/
│       └── multi-platform-track/
├── .claude/
│   └── skills -> ../.agents/skills   ← 软链接
└── .cursor/
    └── skills -> ../.agents/skills   ← 软链接
```

**优点**：一套 Skill，多处共享；修改一次，全局生效。  
**缺点**：需要团队成员手动创建软链接；Windows 需要管理员权限。

#### 方案二：AGENTS.md 中声明，手动加载

```markdown
<!-- .agents/AGENTS.md -->
## 项目级 Skill

本项目共享 Skill 存放在 `.agents/skills/` 目录下：
- `.agents/skills/frontend-design/` — 前端设计 Skill
- `.agents/skills/multi-platform-track/` — 多端埋点 Skill

使用方式：
- Claude Code：执行 `/load .agents/skills/frontend-design/skill.md`
- Cursor：将内容复制到 `.cursor/skills/`
```

**优点**：不依赖目录结构，文档说明即可。  
**缺点**：每次使用都要手动操作，不方便。

#### 方案三：npm 包 / git 子模块分发

```bash
# 把 Skill 抽成独立仓库
# 各项目在 package.json 中依赖，postinstall 钩子复制到对应目录
"scripts": {
  "postinstall": "cp -r node_modules/our-skills/* .claude/skills/"
}
```

**优点**：版本化管理，团队协作统一。  
**缺点**：需要额外维护一个包；不同工具复制目标不同。

### 阿里内部的实践

从项目中的 `vehicle-workspace-harness-check.md` 可以看到，阿里内部使用了 `.agents/skills/` 目录：

```
.agents/skills/              ← 阿里内部工具 + Codex CLI 都能识别
├── vehicle-harness-creator/
├── codegraph/
└── fliggy-version-check/
```

阿里选择 `.agents/skills/` 的原因：
1. Codex CLI 原生支持这个路径
2. 阿里自研工具也认这个路径
3. 可以通过软链接让 Claude Code 也能用（`.claude/skills → .agents/skills`）

但注意：Claude Code **不会自动扫** `.agents/skills/`，需要软链接或手动配置。

---

## 七、常见追问

### Q: Skill 安装后可以修改吗？

**回答**：
> "可以。Skill 本质就是 Markdown 文件，安装后直接去对应工具的 skills 目录编辑即可。比如 Claude Code 的在 `~/.claude/skills/frontend-design/skill.md`，Cursor 的在 `~/.cursor/skills/frontend-design/skill.md`。修改后立刻生效，不需要重启工具。"

### Q: 一个项目可以用多个 Skill 吗？

**回答**：
> "可以。项目级的 `.claude/skills/` 或 `.cursor/skills/` 可以放多个 Skill。执行时可以串行调用——比如先用'/analyze' Skill 分析代码，再用'/refactor' Skill 重构。但注意不同工具的 skill 不互通，Claude 的项目级 skill Cursor 看不到。"

### Q: 为什么 Claude 装的 Skill Codex 用不了？

**回答**：
> "因为各工具的 skills 目录和文件名都不一样：
> - Claude Code 扫描 `~/.claude/skills/` 或 `./.claude/skills/`，文件叫 `skill.md`
> - Codex CLI 扫描 `~/.agents/skills/` 或 `./.agents/skills/`，文件叫 `SKILL.md`
> - 调用语法也不同：Claude 用 `/skill-name`，Codex 用 `$skill-name`
>
> 所以即使把 skill 文件复制过去，也可能因为文件名大小写或调用语法不匹配而无法使用。"

### Q: Codex CLI 的 skill 路径是什么？

**回答**：
> "Codex CLI 2026 的推荐路径是 `.agents/skills/`（项目级）和 `~/.agents/skills/`（全局级），文件名用大写 `SKILL.md`。旧路径 `~/.codex/prompts/` 已 deprecated，`~/.codex/skills/` 仍兼容但不是推荐路径。"

### Q: Skill 和 MCP 的 tools/list 有什么相似之处？

**回答**：
> "两者都用了'先看菜单，再点菜'的机制：
> - MCP：Client 调用 `tools/list` 获取工具名称和 description，LLM 判断后调用 `tools/call`
> - Skill：工具扫描 skills 目录，提取所有 skill 的 description 给 LLM，LLM 判断后加载完整的 skill.md
>
> 核心思想一样：先用最小信息（description）做选择，再加载完整内容执行，避免上下文浪费。"

---

## 八、面试话术（完整版）

> **"Skill 的工作流程是怎样的？为什么有时要手动 `/skill` 才能命中？"**
>
> Skill 本质上是一个包含流程定义的 Markdown 文件（skill.md）。编码工具启动时会扫描自己的 skills 目录（Claude Code 扫 `~/.claude/skills/`，Cursor 扫自己的路径），但不是直接加载所有 skill 内容——而是先提取每个 skill 的 description，形成一个"菜单"给用户问题。
>
> 用户输入问题后，LLM 根据问题和各 skill 的 description 判断是否需要调用某个 skill。这类似于 MCP 的 `tools/list` → `tools/call`：先看有什么，再决定用哪个。LLM 选定后，工具才加载该 skill 的完整 `skill.md` 注入 System Prompt。这样设计是因为如果有 20 个 skill，每个几千字，全部注入会撑爆上下文。
>
> **手动 `/skill` 的场景**：全局安装的 skill 虽然在"菜单"里，但 LLM 判断不需要时不会自动加载。显式输入 `/skill-name` 相当于强制"我要点这道菜"。
>
> **自动命中的场景**：项目级 skill 的 description 一直在菜单里，LLM 看到用户问题里的关键词（如"埋点"），就能匹配到对应的 skill，然后自动加载完整内容执行。
>
> **`npx skills add` 的流程**：调用 skills CLI 从 GitHub 下载 skill.md，复制到工具特定的目录。Claude Code 到 `~/.claude/skills/`，Cursor 到 `~/.cursor/skills/`，Codex CLI 到 `~/.agents/skills/`（2026 推荐路径）。各工具的 skill 目录是隔离的，Claude 装的 skill Codex 看不到。
>
> **跨工具共享方案**：如果想在项目级放一套 Skill 让多个工具共享，没有"一个目录通吃所有工具"的方案。Codex 认 `.agents/skills/`，但 Claude Code 不认。实际做法是用软链接——以 `.agents/skills/` 作为唯一真实来源（因为 Codex 原生支持），然后 `.claude/skills` 软链接到它。阿里内部就是这么做的。
>
> Skill 和 MCP 都用了"先看菜单再点菜"的机制，区别是 Skill 教 AI 工作流程，MCP 给 AI 接外部工具。
