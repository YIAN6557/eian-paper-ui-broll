# eian-paper-ui-broll — T02 正式 Remotion 工程实施指令

## 任务性质

这是 **正式工程落地任务**，不是设计任务。

不得重新设计 T02，不得自行优化已锁定视觉，不得修改用户已确认规则。

当前设计 Source of Truth：

**T02 V7 Locked Specification**

当前项目正式工程基线：

**eian-paper-ui-broll-stage4-production-validated-2026-09-05.zip**

Stage 4 状态：

**Production Validated / Completed**

---

# 一、严格保护现有正式基线

以下内容全部视为已完成并锁定：

- T01 Native 9:16 V7
- Stage 2 workflow integration
- Dialogue Parser
- Timeline Schema
- Automatic 3–8 second segmentation
- Multi-Part continuity
- Preview Gate
- Template Lock
- Background System
- Stage 3
- Stage 4 Aspect Ratio Adaptation
- Stage 4 Production Validation
- 9:16 / 1:1 / 16:9 ratio framework
- production validation workflow

禁止：

- 重做 Stage 2
- 重做 Stage 3
- 重做 Stage 4
- 修改 T01
- 为方便开发改变 T01 公共行为
- 删除现有 validation
- 修改正式 Stage 4 baseline
- 在原 ZIP 内直接开发

必须从正式 Stage 4 ZIP 解压出新的工作副本。

---

# 二、当前任务只做 T02 9:16 正式 Remotion Engineering

本轮只完成：

**T02 Native 9:16 正式 Remotion implementation + Preview Gate candidate**

暂时不要开始：

- T02 1:1
- T02 16:9
- T02 Production Validation
- Stage 5 之后的其他模板
- T03

只有用户确认 T02 9:16 Preview 后，才能继续下一阶段。

---

# 三、T02 必须作为独立模板实现

T02 应新增独立模板实现。

必须：

- T01 和 T02 分离
- Template Registry 可识别 T02
- T02 可复用现有 parser / timeline / segmentation / background / preview / lock / continuity 基础设施
- 不通过修改 T01 视觉代码来实现 T02

优先新增：

- T02 component
- T02-specific layout configuration
- T02-specific animation configuration
- T02-specific template registration

公共层只有在确实属于模板无关能力时才能复用或最小扩展。

如果必须修改公共文件：

1. 修改必须最小化；
2. 必须证明 T01 输出不发生变化；
3. 必须记录修改原因。

---

# 四、T02 正式视觉结构

## Main Card

单一白色主卡片。

要求：

- 中等圆角
- 无明显描边
- 暖白 / 米白纸面背景
- 极轻纸张质感
- 不使用 T01 Paper Research Console 外框
- 不设置 Header
- 不显示头像
- 不显示 Username
- 不显示 Window Title
- 不显示 Toolbar

第一条 User message 直接作为视觉起点。

---

# 五、主卡片宽度

不得使用早期 Prototype V2 那种过宽卡片。

视觉目标：

- 左右存在明显留白
- 卡片仍有足够内容存在感
- 不极窄
- 不接近铺满整个 9:16 画幅

T02 Prototype V7 为视觉参考。

不要把 Prototype 中的某个 px 数值直接视为 Locked Rule。

正式 Remotion 中通过 Preview 校准确定最终 card width。

---

# 六、主卡片投影

投影强度参考 T01。

必须：

- 比早期 T02 Prototype V2 明显更弱
- 克制
- 单层或接近单层视觉
- 有适度方向性
- 能形成悬浮感

禁止：

- 浓重黑影
- 大面积强阴影
- 硬纸片式投影

具体 blur / offset / opacity 通过 Preview 校准。

---

# 七、User Question Block

User：

- 深灰色实心圆角块
- 浅色文字
- 视觉权重高
- 整体紧凑
- 不采用 AI block 同样的宽度扩展逻辑

所有 User block 必须共享完全相同的：

- fill color
- opacity behavior
- border radius
- text style

首条 User block 不得使用特殊颜色。

必须避免 Prototype V5 曾出现的：

“第一条用户文本框和后续文本框综合色不同”。

---

# 八、User / AI 横向层级

在 9:16：

- User block 明显偏右
- AI block 更靠左
- 保持明显错位
- 接近左右分栏感

但仍属于同一个主卡片内部的纵向内容流。

---

# 九、AI Response Block

AI block：

- 暖浅灰背景
- 圆角
- 接近纯黑正文
- 左侧布局
- 视觉权重低于 User

---

# 十、AI Block 宽度必须真实跟随文字

这是关键规则。

禁止 AI block 提前撑到一个很宽的目标宽度。

在达到最大宽度前：

**AI block width = 当前已显示文字真实 layout width + horizontal padding**

因此：

- 文字少 → block 窄
- 内容继续生成 → block 自然变宽
- 达最大宽度 → 开始正常换行
- 后续主要通过纵向增长

不能出现：

“文字只有一小段，但右侧空出大量无效灰色区域”。

---

# 十一、字体与字形稳定性

中文：

优先使用：

**Noto Sans CJK SC**

或经验证的同等级 Simplified Chinese 字体。

不得使用错误的 JP glyph set。

必须保证：

- 同一字体
- 同一字号
- 同一字重
- 不进行字符级 scaleX
- 不进行字符级 transform
- 不因 streaming 改变已经出现字符尺寸

必须特别回归检查：

- 复
- 确
- 关
- 判

等曾经出现异常窄字形的汉字。

英文也必须使用稳定的现代无衬线字体体系。

---

# 十二、User 出现动画

User block：

**完整 block + 完整 text 快速同时出现。**

禁止：

- typewriter
- 逐字输入
- 先文字后气泡
- 明显弹跳
- 大幅 scale

整体：

快、利落、克制。

---

# 十三、AI Streaming

AI block 先建立。

正文随后以：

**phrase / short clause**

快速流式生成。

禁止逐字符慢速 typing。

## 最重要规则

新的内容必须从：

**当前已经显示文字的最后位置**

继续追加。

已有文字必须保持稳定。

禁止：

- 新字从中间出现
- 已有文字突然重新缩放
- 已有文字横向跳动
- 整块文字预先存在后局部 fade-in
- 为 block resize 重新压缩文字

视觉应接近真实 AI streaming。

---

# 十四、AI Block 生长

AI block 随 streaming：

1. 初始尺寸建立；
2. 内容增加时自然横向增长；
3. 到 maximum width 后换行；
4. 后续向下增长。

文字与 block growth 必须同步。

---

# 十五、主卡片双向增长

主卡片随着内部内容增加：

- 可以向上增长
- 可以向下增长

但上下两端均有 Safe Boundary。

---

# 十六、Bottom Safe Boundary

当 card bottom 达到底部安全位置：

**禁止继续向下扩展。**

---

# 十七、Top Safe Boundary

当 card top 达到顶部安全位置：

**禁止继续向上扩展。**

这条是后期新增的重要规则。

禁止再次出现：

“卡片底部有边界，但顶部无限向上扩张”。

---

# 十八、达到上下安全边界之后

当 Outer Card 已无法继续增加高度：

**Outer Card stops growing.**

但：

**Inner content continues growing / flowing.**

后续新增内容由：

- AI block growth
- internal content stack
- upward content movement

继续承载。

---

# 十九、顶部内容退出动画

这是当前最重要的动画修正之一。

禁止：

**旧内容先淡出 → 顶部形成大空白 → 下方内容稍后补位**

正式逻辑：

1. 下方内容持续向上移动；
2. 旧内容保持可见；
3. 当下一块内容已经接近顶部并能够补位；
4. 旧内容才开始渐隐；
5. 旧内容缓慢退出；
6. 内容流始终连续。

Fade 必须和 content movement 联动。

目标：

**顶部不能出现明显空白带。**

---

# 二十、辅助信息

正式 T02 只允许：

- Status
- Time / Duration

禁止恢复：

- Sources
- Citation
- `【1】`
- `【2】`
- Task-map

这些属于已废弃 Prototype placeholder。

---

# 二十一、Thinking Duration

时间信息属于 AI，不属于 User。

禁止显示在 User block 上方。

标准位置：

**AI response block 下方，左侧对齐 AI。**

格式：

`Thinking · 2.9s`

例如：

- `Thinking · 2.9s`
- `Thinking · 3.4s`
- `Thinking · 3.0s`

视觉权重必须低于正文。

---

# 二十二、Status Dot

状态圆点颜色已锁定：

**#E63946**

不得自行修改。

Prototype 中曾使用的引用黄色：

**#F4C430**

由于 Citation 已从正式 T02 移除，因此正式 T02 当前不需要引用黄色元素。

---

# 二十三、动画整体语言

整体必须：

- light
- fast
- restrained
- natural

禁止：

- bounce
- dramatic spring
- exaggerated scale
- large fly-in
- 强烈弹性动画

---

# 二十四、双节奏

User：

更快。

AI：

相对更慢。

AI 节奏来自：

- block growth
- phrase streaming
- status timing

而不是夸张 motion。

---

# 二十五、语言支持

T02 正式模板不是 English-only。

必须支持：

- Chinese
- English

V7 使用英文只是当前 Prototype 验证内容。

不得因为 V7 为英文演示而删除中文支持。

---

# 二十六、Preview Gate

完成 T02 9:16 正式 Remotion implementation 后：

只输出 **representative 720p Preview** 给用户确认。

Preview 必须能够体现：

- User right offset
- AI left layout
- correct card width
- T01-level shadow
- AI content-fit width
- Thinking duration placement
- card safe boundary behavior
- top content replacement / fade behavior

如一张静态 Preview 无法验证上述动画行为，可同时输出少量关键帧或一段 Preview MP4。

但此时不得自行宣布 T02 完成。

---

# 二十七、最终冻结规则

继承正式 production rule：

- 24 fps
- 最后 1 秒完全静止
- 最后 24 帧原始 Remotion 输出必须一致
- status dot 不得继续动画
- streaming 不得继续
- layout 不得继续移动

---

# 二十八、本轮交付要求

本轮完成后，请输出：

1. 修改 / 新增文件列表；
2. T02 独立模板实现说明；
3. 是否修改公共代码；
4. 如修改公共代码，说明为什么不会影响 T01；
5. T02 9:16 representative Preview；
6. 必要的 Preview MP4 / keyframes；
7. npm / Remotion 环境检查结果；
8. 当前仍未验证的项目；
9. 明确状态：

**T02 9:16 Preview Candidate — Awaiting User Approval**

不得写：

- Production Validated
- Completed

---

# 二十九、停止条件

完成 Preview Candidate 后立即停止。

不要：

- 自行开始 1:1
- 自行开始 16:9
- 自行开始 Production Validation
- 自行修改 Locked Specification
- 自行开始 T03

等待用户在 ChatGPT 中审核结果。
