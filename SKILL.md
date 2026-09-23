---
name: eian-paper-ui-broll
description: 将用户与 AI 的对话制作成基于已锁定 Paper UI 模板的动效 MP4；适用于需要先选模板、比例、清晰度和背景，再经 Preview 批准后正式输出视频的任务。
---

# eian-paper-ui-broll

把用户与 AI 的对话制作成 Paper UI 动效视频。此文件是简明入口与总约束；完整的用户交互和交付行为见[制作合同](docs/architecture/skill-production-contract.md)。

## 总约束

- 保留原始对话含义与消息边界，不自动改写或合并消息。
- 只使用注册表中当前启用的 V1 模板与比例；不得自行增加模板或绕过注册表。
- 正式渲染前必须取得 Preview 批准和最终参数确认。
- 不绕过 Template Lock、现有 job lifecycle 或 CLI 渲染入口。
- 普通交付遵循制作合同，不交付内部工程文件。

## 依赖门禁

创建 production job 前，必须遵循[运行时依赖](docs/setup/runtime-dependencies.md)完成只读依赖检查。检查未达到 `READY` 时不得创建 job；安装缺失依赖前必须先报告缺失项并取得用户明确同意。用户拒绝、安装复核失败或当前平台无法补齐时，说明缺项并停止。具体命令、依赖清单与平台行为由运行时依赖文档统一维护。

## 执行入口

在包根目录通过 Skill lifecycle CLI 工作：

```sh
sh scripts/maintenance/run-with-runtime.sh scripts/cli/skill-job.mjs
```

制作行为由[制作合同](docs/architecture/skill-production-contract.md)定义；模板能力以[src/templates/registry.mjs](src/templates/registry.mjs)为准；状态和时间线分别见[工作流状态](specs/shared/WORKFLOW_STATE_MACHINE.md)和[时间线说明](specs/shared/TIMELINE_SCHEMA.md)。
