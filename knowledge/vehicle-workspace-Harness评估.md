# vehicle-workspace Harness 成熟度评估

> 评估对象：`/Users/ruji.mqq/Desktop/code/vehicle-workspace`
> 评估时间：2026-06-15
> 评估方式：本地文件扫描（CLAUDE.md、.claude/、openspec/、knowledge/、子仓库配置等）

---

## 一、仓库概况

- **路径**：`/Users/ruji.mqq/Desktop/code/vehicle-workspace`
- **性质**：多仓库工作区（Monorepo workspace）
- **默认分支**：main
- **最近提交**：2026-06-12
- **包含仓库**：`trip/*`、`home-code/*`、`mono/*`、`rxpi/*`、`fliggyshopmod/*`、`tripnode/*`

---

## 二、成熟度等级：SDD

| 等级 | 状态 | 判定依据 |
|---|---|---|
| 🥉 初级 | ✅ 达标 | 根目录存在 `AGENTS.md`（636 行，内容完整），`CLAUDE.md` 已创建 |
| 🥈 SDD | ✅ 达标 | 存在 `openspec/` 目录，含 `specs/` 与 `changes/`；`AGENTS.md` 规范了多仓研发流程 |
| 🥇 TDD | ❌ 未达标 | 仅部分子仓库有测试，工作区层面无统一 CI |
| 🏆 高级 | ❌ 未达标 | 已有 `knowledge/` 资产与 Tribal Wiki 关联，但 TDD 未满足 |

**升级到 TDD 的关键动作**：
1. 为每个子仓库补充 `test` 脚本与测试目录
2. 在工作区或关键仓库引入 CI 配置（`.gitlab-ci.yml` 或 GitHub Actions）
3. 在 `AGENTS.md` / `CLAUDE.md` 中明确测试先行流程与测试命令规范

---

## 三、Harness 组件覆盖

| 组件 | 状态 | 说明 |
|---|---|---|
| CLAUDE.md | ⚠️ 已配置但过简 | 根目录仅 `@AGENTS.md` 一行引用；部分子仓库（如 `mono/vehicle-components`）的 `CLAUDE.md` 更完整 |
| .claude/ 目录 | ✅ 已配置 | 存在 `settings.local.json`、rules、commands、skills |
| settings.json | ⚠️ 部分配置 | 仅 `settings.local.json`，缺少项目级 `settings.json` |
| Permissions | ✅ 已配置 | `settings.local.json` 中配置了 Bash、WebFetch 等权限白名单 |
| Hooks | ⚠️ 部分配置 | 无传统 hooks 文件，但 `.claude/rules/` 与 `.claude/commands/` 起到流程约束作用 |
| MCP 服务器 | ✅ 已配置 | `.mcp.json` 配置了 `aone-km` MCP；`settings.local.json` 中禁用了该服务器 |
| Skills | ✅ 已配置 | `.claude/skills/` 与 `.agents/skills/` 下共有 10+ 个 skill |
| .cursorrules | ❌ 缺失 | 未配置 Cursor 规则文件 |
| AGENTS.md | ✅ 已配置 | 内容完整，覆盖工作区边界、发布规范、本地调试、技能分工、知识库调用 |
| GEMINI.md | ❌ 缺失 | 未配置 Gemini 规则文件（可选） |

**组件覆盖评分：5.5 / 7**

扣分项：
- `CLAUDE.md` 内容过简（-1）
- 缺少项目级 `settings.json`（-0.5）
- Hooks 以 rules/commands 替代，未形成标准 hook 机制（-0.5）

---

## 四、SDD 覆盖

| 检查项 | 状态 | 说明 |
|---|---|---|
| Spec 文档目录 | ✅ 已配置 | `openspec/specs/` 下含车型卡、配置文本列表、标签下沉等 spec |
| Plan 文档目录 | ✅ 已配置 | `openspec/changes/` 下含多个变更提案、设计文档、任务清单 |
| SDD 流程说明 | ✅ 已配置 | `AGENTS.md` 中明确了多仓研发流程与 OpenSpec 使用方式 |

---

## 五、TDD 覆盖

| 检查项 | 状态 | 说明 |
|---|---|---|
| 测试目录 | ⚠️ 部分配置 | `tripnode/vehiclenode/test` 等少量仓库有测试目录 |
| 测试配置 | ⚠️ 部分配置 | `tripnode/vehiclenode/jest.config.js`、`trip/rx-trip-ai/jest.config.js`、`trip/rx-vehicle-list/vitest.config.ts` |
| test script | ⚠️ 部分配置 | `tripnode/vehiclenode`、`trip/rx-trip-ai`、`mono/vehicle` 等配置了 `test` 脚本 |
| CI 配置 | ❌ 缺失 | 工作区浅层未找到 `.github/workflows/` 或 `.gitlab-ci.yml` |
| CLAUDE.md 测试说明 | ⚠️ 部分配置 | `mono/vehicle-components/CLAUDE.md` 提到类型检查，但未明确单元测试命令 |

---

## 六、知识蒸馏（Advanced）

| 检查项 | 状态 | 说明 |
|---|---|---|
| Tribal Wiki 关联 | ✅ 已关联 | `AGENTS.md` 中明确关联「飞猪-综合交通前端项目知识库」并给出调用规则 |
| kbase / CodeWiki | 🔲 待接入 | 需通过 `a1 kbase` CLI 进一步查询 |
| 知识文档目录 | ✅ 已配置 | `knowledge/` 目录下沉淀了大量埋点、数据验证、ODPS 任务报告等知识资产 |

---

## 七、改进建议

1. **补全根目录 `CLAUDE.md`**
   - 不要只引用 `AGENTS.md`，应包含工作区概述、常用命令、测试规范、安全边界等。

2. **新增项目级 `.claude/settings.json`**
   - 将 `settings.local.json` 中非敏感配置（rules、commands、skills 路径、MCP 配置）迁移到项目级配置。
   - local 文件仅保留本地敏感权限。

3. **统一测试规范**
   - 为每个子仓库补充 `test` 脚本，优先覆盖核心共享包（`mono/vehicle`、`mono/vehicle-components`）与关键业务页面。

4. **引入 CI 配置**
   - 在关键仓库或工作区根目录增加 `.gitlab-ci.yml` 或 GitHub Actions，实现提交/PR 时自动跑测试与类型检查。

5. **标准化 Hooks 机制**
   - 将 `.claude/rules/` 中高频约束（如发布纪律、多仓发布顺序）转化为可自动触发的 hooks，降低人工执行风险。

---

## 八、面试表达建议

如果被问到「你们团队的 Harness 做到什么程度了」，可以这样说：

> 我们 vehicle-workspace 目前处于 **SDD 级别**。已经落地了完整的工作区级 `AGENTS.md`、OpenSpec 设计文档体系、10 多个自研 Skills，以及与 Tribal Wiki 的知识库关联。短板在于测试覆盖不均衡、缺少统一 CI，所以下一步重点是补齐 TDD，把测试和 CI 规范拉齐，向 TDD 级别演进。
