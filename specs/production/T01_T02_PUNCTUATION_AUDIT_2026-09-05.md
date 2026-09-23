# eian-paper-ui-broll — T01/T02 标点行首回查

日期：2026-09-05

## 结论

- **T01：未发现该问题，不修改。**
  - 回查范围：T01 Native 9:16、T01 1:1、T01 16:9；User / Assistant；中文收尾标点与常见 ASCII 收尾标点边界。
  - T01 使用浏览器原生排版（`white-space: pre-wrap`），没有 T02 的自定义固定行切分器。
  - 浏览器级边界压力测试：每个比例/角色 1,479 个断行边界样本，6 个比例/角色组合共 **8,874** 个样本，行首禁用标点命中 **0**。
  - 既有 Stage 4 中文代表性 Preview 中也未观察到收尾标点单独出现在新行行首。
  - 因 T01 是 Locked baseline，本轮没有修改任何 T01 文件。

- **T02：问题确认存在，根因已定位并完成源代码最小修复。**
  - T02 9:16 已有中文逐帧 DOM evidence 中：发现 **706 次“行首为收尾标点”的逐帧行状态**，分布在 198 个帧、3 条 AI 消息（m4 / m6 / m8）。
  - 典型行首包括：`，`、`、`、`。`。
  - T02 1:1 当前中文代表对话按原算法可稳定复现 6 个最终换行违规；中英混排可复现 4 个。
  - 根因：`wrapLines()` 将 CJK 标点作为独立 token；当“当前行 + 标点”超过最大宽度时，旧逻辑会先 `push()` 当前行，再把标点放入下一行，导致标点成为行首。

## T02 修复规则

已在 T02 独立 `model.mjs` 中加入 kinsoku（禁则）式断行保护：

- 禁止 `，。？！：；、）》」】` 等中文收尾标点成为自动换行后的首字符。
- 同时保护常见 ASCII 收尾标点 `, . ! ? ; :`，用于中英混排边界。
- 当收尾标点将因宽度溢出被推到下一行时，不扩大气泡最大宽度；而是把前一个有意义的排版单元（中文字符或 Latin word）与标点一起带到下一行。
- 不改变原文，不删除标点，不修改字号、Streaming 节奏、气泡最大宽度、Outer Card、Fade-out、Thinking、上移/补位时序或最终冻结规则。

## 修复后验证

### T02 规则级测试

新增：`scripts/test-t02-line-break-punctuation.mjs`

结果：

```text
T02 punctuation line-break checks: PASS
```

覆盖：

- 9:16 User / Assistant
- 1:1 User / Assistant
- `，。？！：；、）》」】` 全部确认收尾标点
- 中文边界压力测试
- 中文 + English 中英混排边界
- 修复后每行仍保持在既定 `maxWidth` 内

### 代表性对话按同一 Noto Sans SC 字体度量复算

修复后：

- T02 9:16 中文：0 个行首禁用标点
- T02 9:16 英文：0
- T02 1:1 中文：0
- T02 1:1 中英混排：0
- T02 1:1 英文：0

英文代表对话在本次断行修复前后没有发生换行变化；中文/中英混排只在原本会产生行首标点的位置发生必要的断行重排。

## 文件改动边界

T01：**0 个文件修改**。

T02 源码：

- `src/templates/t02-paper-dialogue/model.mjs`
  - 仅修改文本断行逻辑，加入行首禁用标点保护。
- `scripts/test-t02-line-break-punctuation.mjs`
  - 新增回归测试。

精确 diff：

- `logs/t02-punctuation-line-break.diff`

## 尚需完成的正式验证

当前上传的 Preview Candidate ZIP 按既定快照规则排除了 `node_modules/`；本 Chat 运行环境当前没有完整 Remotion npm 包，因此本轮完成的是：

1. 原 ZIP/SHA 校验；
2. T01 浏览器级回查；
3. T02 已有逐帧 evidence 审计；
4. T02 根因定位；
5. T02 源代码最小修复；
6. 规则级与字体度量级验证。

在把此修复写回正式工作目录后，仍需用正式 Remotion 环境重新输出：

- T02 9:16 中文代表 Preview（回归确认）
- T02 1:1 中文 Preview
- T02 1:1 中英混排 Preview
- 对应逐帧 DOM line-start 检查
- T01 pixel regression（应继续保持 0 mismatch）

在这些正式渲染验证完成前，不应提升 baseline，也不应开始 T02 16:9 / Production Validation。
