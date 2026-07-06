# OpenSpec 项目说明

本项目使用 [OpenSpec](https://openspec.pro/) 进行规格驱动开发（Spec-Driven Development, SDD）。

## 目录结构

```
openspec/
├── AGENTS.md                      # 本文件：项目级说明
├── specs/                         # 项目级长期规格
│   └── project.md
└── changes/                       # 每次变更一个独立目录
    └── <change-name>/
        ├── proposal.md            # 变更提案：为什么做、目标、范围
        ├── specs/                 # 详细需求规格
        │   ├── index.md
        │   └── ...
        ├── design.md              # 技术设计方案
        └── tasks.md               # 实现任务清单
```

## 工作流

1. **创建变更**：`openspec/changes/<change-name>/`
2. **撰写提案**：`proposal.md` 明确背景、目标和验收标准
3. **细化规格**：在 `specs/` 下拆分功能、数据、接口等维度
4. **技术设计**：`design.md` 描述实现方案、模块划分、状态管理
5. **任务拆解**：`tasks.md` 列出可执行的实现步骤
6. **实现**：按 tasks 逐步实现，代码与规格保持同步
7. **归档**：变更完成后可归档到 `openspec/changes/archive/<timestamp>-<change-name>/`

## 设计文档管理规则

- 设计文档**不放在** `knowledge/` 目录下；`knowledge/` 仅用于 RAG 知识库。
- 所有设计、方案、变更提案统一放在 `openspec/` 目录。
- 每个变更独立成文件夹，便于版本追踪和 AI 上下文管理。
- 长期不变的项目级规格放在 `openspec/specs/`。

## 当前变更

无进行中变更。所有已完成变更已归档到 `openspec/changes/archive/`。

## 最近归档

- `2026-06-17-add-conversation-memory`：为 interview-agent 增加服务端持久化的对话记忆管理功能。
