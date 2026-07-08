# Skill 执行时 MCP 工具会自动安装吗？

> **面试高频题**："Skill 执行时发现需要某个 MCP 工具，会自动安装吗？"、"MCP 工具是怎么接入的？"
> **关联考点**：Skill 与 MCP 的区别、Harness 研发范式

---

## 一、一句话结论

**不会自动安装。**

MCP 工具需要预先配置或手动安装，Skill 在执行时只会调用已经可用的 MCP 工具。如果工具不存在，Skill 要么报错，要么走降级逻辑。

---

## 二、分场景回答

### 场景一：interview-agent 项目（本项目中）

本项目的 MCP Server 是**内置的**，不需要安装。

```
MCP Server 是项目代码的一部分（server/src/mcp/server.ts）
├── 5 个工具在代码里写死（tools.ts）
├── 随项目启动自动暴露（Express 路由）
└── MCP Client 直接调 localhost:3001，无需外部安装
```

**如果工具不存在会怎样？**

```typescript
// server.ts:50-56
const tool = MCP_TOOLS.find((t) => t.definition.name === name);
if (!tool) {
  res.status(404).json({
    content: [{ type: 'text', text: `Tool not found: ${name}` }],
    isError: true,
  });
  return;
}
```

- Server 返回 404 + `isError: true`
- Client 收到后返回空字符串，主流程继续走（降级）

**面试话术**：
> "我们的 MCP Server 是项目内置的，5 个工具随服务启动自动暴露，不需要额外安装。如果调用了一个不存在的工具，Server 会返回 404，Client 捕获后返回空字符串，不影响主流程。"

---

### 场景二：Claude Code / Cursor 等编码工具

在这些工具中，**MCP 工具不会自动安装**，必须预先配置。

#### MCP 工具的接入方式

| 方式 | 说明 | 示例 |
|---|---|---|
| **stdio** | 启动子进程通信，需要本地有可执行文件 | `node ./dist/mcp/stdio-bridge.js` |
| **HTTP** | 直接 HTTP 请求，需要服务已启动 | `http://localhost:3001/mcp/tools` |

#### Cursor 的配置示例

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "interview-agent": {
      "command": "node",
      "args": ["./server/dist/mcp/stdio-bridge.js"],
      "env": {
        "MCP_HTTP_URL": "http://localhost:3001"
      }
    }
  }
}
```

**关键点**：
- 配置文件里写的 `command` 和 `args` 必须指向一个**已存在的可执行文件**
- 如果文件不存在，Cursor 启动 MCP 时会报错
- **不会自动下载或安装**

#### 为什么不会自动安装？

| 原因 | 说明 |
|---|---|
| **安全** | 自动安装任意代码 = 远程代码执行风险 |
| **版本** | 不同项目需要不同版本的 MCP 工具 |
| **配置** | MCP 工具通常需要环境变量、API Key 等配置 |
| **依赖** | 有些 MCP 工具依赖 Node.js、Python 等运行时 |

**面试话术**：
> "在 Claude Code / Cursor 中，MCP 工具不会自动安装。需要在配置文件（如 `.cursor/mcp.json`）中预先声明，指向一个已存在的可执行文件或服务地址。原因是安全、版本和配置依赖——自动安装任意代码有远程执行风险，而且不同项目需要不同版本。"

---

## 三、Skill 和 MCP 工具的发现机制

### Skill 怎么知道有哪些 MCP 工具可用？

```
Skill 执行前：
  1. 编码工具（Cursor/Claude Code）读取配置文件
  2. 启动配置中声明的所有 MCP Server
  3. 调用 tools/list 获取可用工具列表
  4. 把工具列表注入 System Prompt

Skill 执行时：
  1. LLM 根据问题判断需要调用哪个工具
  2. 编码工具转发 tools/call 请求
  3. MCP Server 执行并返回结果
```

### 如果 Skill 需要的工具不在列表里？

```
场景：Skill 想用 "browser_navigate" 工具，但配置里没有

结果：
  - LLM 不会输出调用该工具的 JSON（因为 Prompt 里没有这个工具的定义）
  - Skill 可能卡住、报错、或走降级逻辑
  - 不会自动去安装这个工具
```

---

## 四、项目中已有的降级处理

虽然不会自动安装，但代码里对"工具不可用"有完整降级：

### Client 层（client.ts）

```typescript
export async function runMCPForQuery(query: string): Promise<string> {
  const selection = selectMcpTool(query);
  if (!selection) return '';  // 不需要工具 → 直接返回空

  const result = await callMCPTool(selection.name, selection.args);
  if (result.isError) {
    console.warn(`[MCP Client] Tool ${selection.name} returned error`);
    return '';  // 工具调用失败 → 返回空，不影响主流程
  }

  return result.content.map((c) => c.text).join('\n');
}
```

### Chat 层（chat.ts）

```typescript
let mcpContext = '';
try {
  mcpContext = await runMCPForQuery(safeMessage);
} catch (error) {
  console.warn('[Chat] MCP call failed, proceeding without MCP context:', error);
}
```

**降级链路**：
1. MCP Server 没启动 → Client `fetch` 失败 → `callMCPTool` 返回 `isError: true`
2. `runMCPForQuery` 检测到 `isError` → 返回空字符串
3. `chat.ts` 的 `mcpContext` 为空 → 跳过 MCP 结果注入
4. LLM 基于 RAG + 通用知识回答，主流程不受影响

---

## 五、常见追问

### Q: 如果我想让 Skill 用一个新的 MCP 工具，流程是什么？

**回答**：
> "三步：
> 1. **安装工具** — 按官方文档安装 MCP 工具（npm install / pip install / 下载二进制）
> 2. **配置接入** — 在 `.cursor/mcp.json` 或 Claude Code settings 中添加配置
> 3. **重启工具** — 编码工具重新加载 MCP Server，Skill 才能看到新工具
>
> 不会自动完成，每一步都需要人工操作。"

### Q: MCP 工具市场和自动安装有什么区别？

**回答**：
> "有些工具（如 Cursor）支持 MCP Marketplace，可以一键安装。但'一键安装'不是'自动安装'：
> - 一键安装：用户手动点击'安装'按钮，工具自动下载配置
> - 自动安装：Skill 执行时自动发现并安装，无需人工干预
>
> 目前主流编码工具都不支持自动安装，都需要用户手动确认或配置。"

### Q: 你们项目中的 MCP 工具是怎么分发的？

**回答**：
> "我们的 MCP Server 是项目代码的一部分，不是外部工具。团队同学 clone 仓库、npm install、npm run dev 后，MCP Server 随主服务一起启动，5 个工具自动可用。
>
> 如果要给外部工具（如 Cursor）用，需要额外启动 stdio 桥接器，并在 `.cursor/mcp.json` 中配置。这个配置是手动的，不会自动完成。"

---

## 六、面试话术（完整版）

> **"Skill 执行时发现需要某个 MCP 工具，会自动安装吗？"**
>
> 不会自动安装。MCP 工具需要预先配置或手动安装，Skill 只会调用已经可用的工具。
>
> 在我们的 interview-agent 项目中，MCP Server 是内置的，5 个工具随服务启动自动暴露，不需要额外安装。如果调用了不存在的工具，Server 返回 404，Client 捕获后返回空字符串，主流程不受影响。
>
> 在 Claude Code / Cursor 等编码工具中，MCP 工具需要在配置文件（如 `.cursor/mcp.json`）中预先声明，指向一个已存在的可执行文件。不会自动下载安装，原因是安全、版本和配置依赖——自动安装任意代码有远程执行风险。
>
> 不过我们对'工具不可用'做了完整降级：MCP Server 没启动或工具不存在时，Client 返回 `isError: true`，`runMCPForQuery` 返回空字符串，chat.ts 跳过 MCP 结果注入，LLM 基于 RAG + 通用知识继续回答，主流程不受影响。
