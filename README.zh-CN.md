# eian-paper-ui-broll

[English](README.md)

> 一个将用户与 AI 的对话制作成 Paper UI 动效视频的 Codex Skill，使用包内模板。

## 演示视频

以下竖屏成片分辨率为 1080 × 1920，时长约 8 秒。

### T01 — Reference research console

https://github.com/user-attachments/assets/4cfc1656-0078-4984-bf53-7f178eeb02cd

### T02 — Paper dialogue

https://github.com/user-attachments/assets/e869905a-5ab4-46ac-80b9-b81f386991d1

### T03 — Keyflow

https://github.com/user-attachments/assets/2af88163-67d0-45bd-8e78-8c44f9fd2e20

## 功能简介

Skill 保留对话含义和消息边界，并使用包内当前启用的 V1 注册模板进行渲染。它不会改写或合并消息。可用模板和支持的画面比例以模板注册表为准。

## 工作流程

```text
用户与 AI 的对话
  → 选择模板和该模板支持的画面比例
  → 选择清晰度和背景
  → 生成并查看 Preview
  → 批准 Preview 并确认最终设置
  → 正式渲染
  → 获取 MP4 文件及 manifest.json
```

时长不超过 20 秒（含 20 秒）的任务输出一个视频。更长的任务会拆成有序 Parts，并附带 manifest；Parts 不会自动合并。

## 安装

将完整的 Skill 包目录安装到：

- `$CODEX_HOME/skills/eian-paper-ui-broll`
- 如果未设置 `CODEX_HOME`，则使用 `~/.codex/skills/eian-paper-ui-broll`

请保留完整目录结构，包括根目录下的 `SKILL.md`。安装后新建 Codex 任务或重新加载会话，让 Codex 发现此 Skill。

## 快速开始

在新的 Codex 任务中，说明要使用本 Skill，并提供需要渲染的对话。例如：

```text
请使用 eian-paper-ui-broll 将下面这段对话制作成 Paper UI 视频：
[粘贴对话]
```

按提示选择模板、该模板支持的画面比例、清晰度和背景。查看并明确批准 Preview，然后确认最终设置，再进行正式渲染。

## 首次使用依赖

创建 production job 前，Skill 会检查本机运行环境。如果依赖已就绪，就直接继续，不会安装任何内容。如果有缺失项，会先报告并征求你的明确同意，再尝试安装。

目前仅 macOS 支持经同意后自动安装依赖。Linux 和 Windows 下，门禁会报告缺失项；请按对应平台的常规方式安装后重新检查。依赖清单、门禁行为和平台说明见[运行时依赖](docs/setup/runtime-dependencies.md)。

## 适用范围

本 Skill 使用包内注册表允许的模板和画面比例，将用户与 AI 的对话制作成 Paper UI 动效视频。完整交互和交付行为见[制作合同](docs/architecture/skill-production-contract.md)。

## 许可


商业授权联系邮箱：[ohhhhhmya@gmail.com](mailto:ohhhhhmya@gmail.com)。

本包采用自定义的 [Eian 个人非商业使用许可 1.0](LICENSE)，商业使用另行书面授权。个人用户可为非商业个人用途安装、运行并私下修改自己的副本。商业用途包括账号变现、广告、赞助、客户或雇主项目，以及公司、机构或团体使用；均须事先取得书面授权并另行约定许可费用。

这是源码可见许可，不是 OSI 认可的开源许可证。Noto Sans SC 字体仍依照其独立的 [SIL Open Font License](public/fonts/t02/OFL.txt) 授权；其他第三方依赖仍适用各自许可证。当前许可状态见[许可证状态](LICENSE-STATUS.md)。

## 项目地图

| 文件或目录 | 职责 |
| --- | --- |
| [SKILL.md](SKILL.md) | Skill 调用入口和简要总约束。 |
| [制作合同](docs/architecture/skill-production-contract.md) | 面向用户的完整工作流程、审批、渲染、重试和交付行为。 |
| [运行时依赖](docs/setup/runtime-dependencies.md) | 所需依赖、首次使用门禁、同意安装流程和平台行为。 |
| [模板注册表](src/templates/registry.mjs) | 当前启用的模板和支持的画面比例。 |
| `scripts/cli/` 和 `scripts/lib/` | Skill job 生命周期与制作命令。 |
| `src/`、`assets/` 和 `public/` | 合成源码、随包背景和字体资源。 |
| [共享工作流规格](specs/shared/WORKFLOW_STATE_MACHINE.md) 与[时间线结构](specs/shared/TIMELINE_SCHEMA.md) | 工作流状态和时间线数据模型。 |
| [项目清单](docs/project/canonical-project-manifest.md) 与[项目状态](docs/project/project-status.md) | 文件职权表和当前项目状态。 |
| [AGENTS.md](AGENTS.md) 与 [CONTRIBUTING.md](CONTRIBUTING.md) | 包维护和贡献说明。 |
| [许可证](LICENSE) 与[许可证状态](LICENSE-STATUS.md) | 许可条款与当前发布/授权状态。 |

## 常见问题

### Skill 会修改对话内容吗？

不会。它保留所提供对话的含义和消息边界。输入解析只会执行现有解析器支持的轻量格式整理。

### 可以跳过 Preview 吗？

不可以。必须先批准生成的 Preview，再确认最终模板、画面比例、清晰度、背景、输出模式和 Part 数量，之后才能正式渲染。

### 缺失依赖会自动安装吗？

只有门禁报告缺失项并且你明确同意后，才会尝试安装。如果依赖检查已就绪，则不会安装任何内容。目前自动补齐仅支持 macOS；其他平台需要手动安装。

### 会交付哪些文件？

任务会交付一个 MP4，或按顺序排列的多个 Part MP4，并附带 `manifest.json`。内部时间线、日志、Preview 文件和帧序列不属于常规交付物。

### 个人账号的视频可以变现吗？

免费个人许可不允许变现。变现内容属于商业使用，须事先取得书面授权并另行约定许可费用。详情见 [LICENSE](LICENSE)。

## 维护

修改前请阅读 [AGENTS.md](AGENTS.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)，然后修改拥有对应行为的文件。README 仅作项目导览；具体规则由链接指向的权威文件维护。
