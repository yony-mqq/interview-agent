# MCP 的两种连接方式：Remote vs Stdio

在 ModelScope 等平台配置 MCP Server 时，通常可以看到 **Remote** 和 **Stdio** 两种选项。这不是"安装"方式的区别，而是**传输协议/通信方式**的区别。

---

## 1. Stdio（标准输入输出）

这是 MCP 最原始的通信方式，也是本地开发最常见的模式：

```
AI 客户端 ←→ 子进程 stdin/stdout ←→ MCP Server
```

### 原理

- 客户端通过 `npx -y @amap/amap-maps-mcp-server` 启动一个子进程
- 客户端通过该进程的 **stdin 发送 JSON-RPC 请求**
- MCP Server 通过 **stdout 返回 JSON-RPC 响应**
- 进程之间完全隔离，通过操作系统管道通信

### 特点

| 优点 | 缺点 |
|------|------|
| 零网络暴露，安全性高 | 只能在本地运行 |
| 启动即连，无需端口/URL | 每个客户端都要独立启动一个进程 |
| 进程生命周期由客户端管理 | 不适合多客户端共享 |
| 天然支持本地文件系统访问 | 跨机器/跨网络不可用 |

### 典型场景

Cursor、Claude Desktop、本地 CLI 工具调用本地 MCP Server。

---

## 2. Remote（SSE - Server-Sent Events）

这是基于 HTTP 的远程通信方式：

```
AI 客户端 ←→ HTTP + SSE ←→ 远程 MCP Server
```

### 原理

- MCP Server 作为一个常驻的 HTTP 服务运行（通常部署在云端）
- 客户端通过 HTTP POST 发送请求
- 服务端通过 **SSE（Server-Sent Events）** 流式返回结果
- 本质上是 JSON-RPC over HTTP/SSE

### 特点

| 优点 | 缺点 |
|------|------|
| 多客户端共享一个服务端实例 | 需要网络可达，有延迟 |
| 服务端可集中管理、监控、鉴权 | 有暴露公网的安全风险 |
| 适合 SaaS 化的工具服务 | 需要额外的部署和运维 |
| 跨机器/跨网络可用 | 本地文件系统访问受限 |

### 典型场景

ModelScope 托管的 MCP Server、企业内部的共享工具服务。

---

## 核心区别总结

| 维度 | Stdio | Remote (SSE) |
|------|-------|--------------|
| **通信载体** | 操作系统管道（stdin/stdout） | HTTP + SSE |
| **运行位置** | 本地子进程 | 远程/云端服务 |
| **进程管理** | 客户端启动和销毁 | 服务端自行常驻 |
| **资源共享** | 每个客户端独立进程 | 多客户端共享 |
| **安全性** | 完全隔离，无网络暴露 | 需考虑鉴权、HTTPS |
| **配置方式** | `command` + `args`（如 npx） | `url` 地址 |

---

## 所有 MCP 都这样吗？

**是的，MCP 协议标准只定义了这两种传输层：**

- `stdio` — 本地子进程通信
- `sse` / `http` — 远程网络通信

不过具体实现上：
- 有些 MCP Server **只支持 stdio**（如本地文件系统工具）
- 有些 MCP Server **只支持 SSE**（如 ModelScope 上托管的服务）
- 有些则 **两者都支持**（开发者可自行选择）

---

## 安装到本地工具时的配置示例

### Stdio 模式

```json
{
  "mcpServers": {
    "amap-maps": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": { "AMAP_MAPS_API_KEY": "xxx" }
    }
  }
}
```

### Remote 模式

```json
{
  "mcpServers": {
    "amap-maps": {
      "url": "https://mcp-server.example.com/sse",
      "headers": { "Authorization": "Bearer xxx" }
    }
  }
}
```

---

## 一句话总结

> **Stdio = 本地启动一个进程，用管道说话；Remote = 连接一个已运行的远程服务，用 HTTP/SSE 说话。**
>
> 前者像 `fork()` 一个子程序，后者像调用一个 Web API。

如果你主要在本地使用（如 Cursor），**Stdio 更直接、更安全**；如果是团队协作或希望免维护，**Remote 更方便**。

---

## 附录：什么是 JSON-RPC？

文档中多次提到 MCP 通过 **JSON-RPC** 进行通信，这里做一个补充说明。

### 定义

**JSON-RPC** 是一种轻量级的**远程过程调用（RPC）协议**，它使用 **JSON** 作为数据格式，通过简单的请求-响应机制让客户端调用远程服务器上的方法。

它不是一种传输协议（不像 HTTP 那样定义如何传输），而是一种**消息格式规范**——可以跑在 HTTP、WebSocket、stdio 管道等各种传输层之上。

### 核心特点

| 特点 | 说明 |
|------|------|
| **轻量** | 基于纯 JSON，无额外元数据、无 Schema 约束，极容易解析 |
| **无状态** | 每个请求独立，服务器不保存客户端上下文 |
| **双向通知** | 支持 `Request/Response` 模式，也支持单向 `Notification`（不需要回复） |
| **批量调用** | 支持一次性发送多个请求（JSON-RPC 2.0） |
| **传输无关** | 可运行在 HTTP、TCP、WebSocket、stdio 等任意通道上 |

### 消息格式示例

#### 请求（客户端 → 服务端）

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "amap_maps_geocode",
    "arguments": { "address": "北京市朝阳区" }
  },
  "id": 1
}
```

#### 响应（服务端 → 客户端）

```json
{
  "jsonrpc": "2.0",
  "result": {
    "location": "116.481488,39.990464",
    "formatted_address": "北京市朝阳区"
  },
  "id": 1
}
```

#### 错误响应

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found"
  },
  "id": 1
}
```

### 三个关键字段

- **`method`**：要调用的远程方法名（如 `tools/call`、`tools/list`）
- **`params`**：传给方法的参数（可以是对象或数组）
- **`id`**：请求标识符，用于将响应与请求对应起来；若为 `null` 或不传，则为单向通知

### JSON-RPC vs REST vs GraphQL

| 维度 | JSON-RPC | REST | GraphQL |
|------|----------|------|---------|
| **核心思想** | 调用远程函数/方法 | 操作资源（URL + HTTP Method） | 客户端声明所需字段 |
| **URL 设计** | 通常只有一个端点 | 多个资源 URL（/users, /orders） | 通常只有一个端点 |
| **灵活性** | 由服务端暴露的方法决定 | 由服务端接口定义决定 | 客户端可自由组合查询字段 |
| **适用场景** | 工具调用、命令执行、RPC 场景 | 资源型 CRUD API | 前端数据聚合、减少请求次数 |
| **典型代表** | MCP、Bitcoin、Ethereum | 绝大多数 Web API | GitHub API v4、Facebook |

### 为什么 MCP 选择 JSON-RPC？

1. **简单无负担**：不需要设计复杂的 URL 路由和 HTTP Method 语义，一个方法名就能表达意图（如 `tools/list`、`tools/call`）
2. **传输层无关**：既能跑在 stdio 管道上，也能跑在 HTTP/SSE 上，完美适配 MCP 的双模式架构
3. **自然映射到"工具调用"**：AI 调用外部工具的本质就是"远程执行一个函数"，RPC 语义比 REST 的资源操作更贴合
4. **成熟稳定**：JSON-RPC 2.0 是工业标准，各语言都有成熟库支持

### 一句话总结

> **JSON-RPC 就是"用 JSON 格式写的远程函数调用指令"——你告诉远端"执行某某方法，参数是这些"，远端执行后把结果用同样的 JSON 格式返回给你。**
