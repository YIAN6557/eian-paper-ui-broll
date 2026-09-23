# Package Maintenance Instructions

- 本文件适用于当前模块化 Skill 包；不要假设它会与外部 Desktop Canonical Source 自动同步。包身份与正式分发源以[项目清单](docs/project/canonical-project-manifest.md)为准。
- 修改前先按[文件职权表](docs/project/canonical-project-manifest.md#文件职权)找到该问题的唯一现行维护文件，并只改授权范围内的内容。
- 保持 T01、T02、T03 已锁定的视觉与动画行为。除非用户明确授权，不重设计模板或扩大模板范围。
- 依赖事实与同意安装流程以 `docs/setup/runtime-dependencies.md` 为准；制作交互以 `docs/architecture/skill-production-contract.md` 为准。
- 不手工编辑生成的 `PACKAGE_MANIFEST.json`；源文件修改后按[贡献流程](CONTRIBUTING.md)重建包清单并校验。
- 不把 `node_modules`、缓存、临时 job、预览、渲染媒体或用户生成背景纳入源包。

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。
