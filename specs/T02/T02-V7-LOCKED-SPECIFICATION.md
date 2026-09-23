# eian-paper-ui-broll — T02 V7 Locked Specification

**Template:** T02  
**Current Prototype Baseline:** V7  
**Status:** LOCKED FOR ENGINEERING  

## 1. Development Boundary

T02 只定义新的模板视觉、结构和动画语言。

以下现有系统全部复用，不重新设计：

- Dialogue Parser
- Timeline Schema
- Automatic 3–8 second segmentation
- Multi-Part continuity
- Preview Gate
- Template Lock
- Background System
- Aspect Ratio Adaptation framework
- Production validation workflow
- 24 fps rendering
- H.264 MP4 output
- Final 1-second static frame rule

T01 保持 Locked，不因 T02 开发发生修改。

---

# 2. Main Visual Structure

## 2.1 Single Main Card

T02 使用单一主卡片结构。

全部对话、AI 回答以及辅助状态信息均属于同一个统一主容器。

不采用无主容器的自由纸面布局。

## 2.2 Main Card

主卡片：

- 白色
- 中等圆角
- 无明显描边
- 与背景纸面形成悬浮关系
- 不使用 T01 的 Paper Research Console 外框结构
- 不设置独立 Header

第一条消息直接成为主卡片内部的视觉起点。

不显示：

- Avatar
- Username
- Window title
- Toolbar

## 2.3 Card Width

主卡片不能像早期 V2 那样过宽。

最终视觉应：

- 保留明显左右留白
- 内容仍具有足够视觉存在感
- 不采用极窄卡片
- 不采用几乎占满画面宽度的布局

V7 当前宽度视觉可作为工程校准参考。

具体像素值和比例在正式 Remotion 实现阶段确定，不在本规格中锁死。

## 2.4 Vertical Position

主卡片初始状态整体接近画面垂直居中。

---

# 3. Background

背景采用：

- 暖白 / 米白纸面
- 非冷白
- 非明显复古黄纸
- 纸张纹理极轻
- 纹理只能隐约感知
- 不允许出现明显脏污、粗糙颗粒或强烈纸纹

背景的作用是提供轻微纸感，而不是成为视觉主体。

---

# 4. Main Card Shadow

主卡片保留具有方向性的投影，以形成悬浮感。

但投影强度必须参考 **T01 已确认投影的克制程度**。

要求：

- 不允许像 T02 V2 那样过浓
- 不采用大面积重阴影
- 不采用硬质实体纸片式投影
- 保留适度方向感
- 强度应接近 T01 的视觉量级

具体 blur、offset、opacity 不在当前规格中锁死。

---

# 5. Message Architecture

T02 不使用 T01 的左右传统聊天气泡结构。

采用：

**上下堆叠的信息块结构。**

基本内容层级：

1. User question
2. AI response
3. AI status / duration metadata

---

# 6. User Question Block

用户问题块：

- 深灰色实心块
- 中等圆角
- 浅色文字
- 视觉权重高
- 更像每一轮内容的“问题标题”
- 整体保持紧凑
- 不采用 AI 回答块那种明显横向扩展逻辑

所有用户问题块必须使用**完全相同的填充样式**。

第一条用户问题块与后续用户问题块：

- 不允许出现综合色差
- 不允许因为 opacity、animation state、blend mode 或特殊首条样式产生不同颜色

## Position

9:16 中：

- User block 明显偏右
- AI block 更靠左
- 两者形成接近左右分栏感的明显错位

1:1 / 16:9：

- 不强制复制 9:16 的相同偏移量
- 根据实际可用空间适当收紧
- 保持信息层级关系

---

# 7. AI Response Block

AI 回答使用：

- 偏暖浅灰色圆角内容块
- 高可读性的接近纯黑正文
- 视觉权重低于用户问题块

AI 回答块承担主要正文阅读。

---

# 8. AI Block Width Behavior

AI 回答块宽度不能明显大于当前实际文字内容。

在达到最大宽度前：

**Block width = 当前已显示文字实际排版宽度 + 固定水平 padding**

因此：

- 文本框必须贴着当前内容自然增长
- 不能提前撑到最终目标宽度
- 不允许产生明显无效右侧空白

增长逻辑：

**先自然横向扩展 → 达到最大宽度 → 正常换行 → 后续主要纵向增长**

最大宽度在正式实现阶段根据画幅确定。

---

# 9. Typography

整体字体气质：

- Modern sans-serif
- Clean
- Restrained
- Product UI oriented

不采用明显杂志字体或强编辑字体。

## Chinese Glyph Rule

中文字体必须使用适合 Simplified Chinese 的字形集。

Prototype 中已经确认：

**Noto Sans CJK SC**

可以作为正式实现的重要参考。

禁止错误使用 JP CJK glyph set 导致中文字形异常。

## Character Stability

所有文字必须：

- 同一字体
- 同一字号
- 同一字重
- 稳定字形宽度

严格禁止：

- character-level scaleX
- 单字横向压缩
- 单字横向拉伸
- 动画造成字符尺寸改变
- 异常 font fallback
- 已显示字符重新缩放

类似：

- 复
- 确
- 关
- 判

等汉字不得再次出现明显偏窄问题。

---

# 10. User Message Animation

用户问题块：

**完整 block + 完整 text 同时快速出现。**

不使用：

- character typing
- text-first then bubble
- bubble growth driven by typing

用户问题的动画节奏应：

- 快
- 利落
- 克制

---

# 11. AI Response Streaming

AI 回答块先建立。

随后 AI 文字按：

**phrase / short clause**

进行快速流式揭示。

禁止逐字慢速 typing。

## Streaming Direction

这是正式关键规则：

已经出现的文字保持完全稳定。

下一段新文字必须从：

**当前已显示文字的最后位置**

继续向后追加。

正确：

`existing text → new phrase → next phrase → next phrase`

禁止：

- 新字从文字区域中间出现
- 已有文字重新排版后产生“中间冒字”
- 整段预先存在后局部 fade-in
- 已出现文字位置发生不必要跳动

视觉效果应接近真实 AI Streaming。

---

# 12. AI Block Growth

AI 回答块先以初始尺寸出现。

随着 Streaming：

- 横向根据真实文字尺寸自然增长
- 达到最大宽度后正常换行
- 随新行继续向下增长

文字增长和文本框增长必须保持同步。

---

# 13. Overall Animation Language

T02 动画整体：

- Light
- Fast
- Restrained
- Natural

主要允许：

- 轻微 fade
- 小幅 position movement
- natural size growth

禁止：

- dramatic bounce
- exaggerated scale
- elastic pop
- large fly-in

---

# 14. Dual Rhythm

T02 使用双节奏：

### User
更快、更直接、更利落。

### AI
相对慢一些。

AI 的节奏主要来自：

- block growth
- phrase / clause streaming
- status appearance

而不是通过夸张动画制造节奏。

---

# 15. Main Card Growth System

主卡片随内容增加可以同时：

- 向上扩展
- 向下扩展

但不能无限扩展。

必须存在：

- Top Safe Boundary
- Bottom Safe Boundary

---

# 16. Bottom Safe Boundary

当主卡片向下增长并达到 Bottom Safe Boundary：

**主卡片底部停止继续向下扩展。**

后续内容由内部文本框和内容流继续承载。

---

# 17. Top Safe Boundary

主卡片顶部同样必须存在 Top Safe Boundary。

当主卡片向上扩展并达到该位置：

**主卡片顶部停止继续向上扩展。**

禁止卡片继续无限向上增长。

---

# 18. Behavior After Both Safe Boundaries

当主卡片已经同时受到顶部和底部安全区限制后：

主卡片外部高度不再继续增加。

后续新增内容通过：

- AI text block growth
- internal content growth
- content stack movement

继续承载。

因此：

**Outer Card stops growing.  
Inner content continues flowing.**

Top / Bottom Safe Boundary 的具体像素位置属于正式工程参数，不在当前规格中锁死。

---

# 19. Internal Content Movement

当外部卡片无法继续增长后：

内部内容随新内容产生持续向上移动。

最新内容必须保持在有效阅读区域。

旧内容逐步向顶部退出区域移动。

---

# 20. Top Fade / Exit Rule

旧内容不能提前快速消失。

这是 V7 后新增的正式通用规则。

错误行为：

**old content fades → blank area appears → lower content later moves up**

禁止这种动画。

正确行为：

**lower content moves upward first → old content remains visible → replacement content approaches → old content begins slow fade → old content exits**

因此：

- 下方内容必须先补位
- 顶部旧内容保持可见更久
- 只有下一块内容已经接近并可以填补视觉空间后，旧内容才开始渐隐
- Fade 应比早期 Prototype 更慢
- 不允许顶部形成明显空白带

目标：

**保持连续的 content flow。**

这条规则适用于：

- Chinese
- English
- 所有未来 T02 ratio adaptations

---

# 21. Auxiliary Information

正式 T02 不使用 Prototype 中曾出现的：

- Sources
- `【1】`
- `【2】`
- Citation markers
- Task-map

这些全部属于早期 Prototype placeholder，不进入正式模板。

正式辅助信息层只保留：

1. Status
2. Time / Duration

---

# 22. Thinking Duration

原先位于右侧 User block 附近的：

- `2.9s`
- `3.4s`
- 等时间信息

位置错误，正式版本不得继续使用。

时间 / 时长信息必须属于 **AI response**。

标准位置：

**对应 AI 回答块下方。**

标准格式：

`Thinking · 2.9s`

例如：

- Thinking · 2.9s
- Thinking · 3.4s
- Thinking · 3.0s

该信息：

- 左侧对齐 AI response
- 视觉权重低于 AI 正文
- 不得显示在用户问题块上方

---

# 23. Status Accent Dot

与状态相关的圆形闪光 / 状态小点：

**Color: #E63946**

该色值已经明确确认。

未经明确要求不得修改。

---

# 24. Language

T02 模板本身不锁定为 English-only。

V7 Prototype 使用英文只是当前视觉验证内容。

底层继续继承现有 Dialogue Parser 的中英文能力。

因此正式 T02 应支持：

- Chinese
- English

并保持两种语言下的稳定字形、排版与 Streaming 行为。

---

# 25. Aspect Ratio Behavior

T02 后续需要正式支持：

- 9:16
- 1:1
- 16:9

通过现有 Stage 4 Aspect Ratio Adaptation framework 实现。

T02-specific rules：

### 9:16
保持明显的 User-right / AI-left 错位。

### 1:1
可根据宽度收紧横向偏移。

### 16:9
可进一步重新平衡 card width 与 message offset。

不得为了比例适配改变 T02 的视觉层级关系。

---

# 26. Final Freeze

继承现有正式 production rule：

- 24 fps
- 最后一秒完全静止
- 即最后 24 帧必须保持不变
- 所有状态动画、文本动画、闪光点动画必须停止

---

# 27. Current Visual Baseline

当前最成熟 T02 Motion Prototype：

**T02 Prototype V7**

V7 可作为正式 Remotion 工程实现的视觉 / 动态参考基线。

但：

**V7 Prototype ≠ Production Validated Template**

在正式 Remotion Production Validation 完成前，不得标记 T02 为 Production Validated / Completed。

---

# 28. Superseded Prototype Rules

以下早期 Prototype 设计已经被后续用户确认覆盖，不再有效：

- 过浓的 T02 阴影
- V2 过宽的主卡片
- AI 回答框提前占用大宽度
- 单字独立缩放 / 异常宽度
- JP CJK glyph rendering
- Sources
- Citation markers
- Task-map
- 时间显示在 User block 附近
- 旧内容独立快速淡出
- 主卡片顶部无限向上扩展

正式工程不得重新引入这些旧行为。

---

# 29. Engineering Lock

本规格是当前 T02 正式工程基线。

正式 Remotion 实现必须以：

**T02 V7 Locked Specification**

为设计 source of truth。

未经用户明确要求：

- 不修改 T01
- 不重做 Stage 2–4
- 不重新解释已经锁定的 T02 规则
- 不擅自添加 Prototype placeholder UI
- 不因工程方便改变视觉行为

仍未锁死的内容主要是实际工程数值，例如：

- exact card width
- exact safe boundary positions
- exact padding
- exact radius
- exact shadow blur / offset / opacity
- exact animation frame counts
- exact maximum AI block width

这些参数必须通过正式 Remotion implementation + Preview calibration 确定，但不得改变本规格定义的视觉和行为原则。
