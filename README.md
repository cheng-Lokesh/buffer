# Buffer（缓冲区）

> **当前已发布产品形态：v0.35.0 — V12.1 LLM Reality Parser。**
>
> 对本仓库进行任何分析、修改或提出建议前，请先阅读 [`AGENTS.md`](AGENTS.md) 与 [`docs/V12_1_PRODUCT_CONTRACT.md`](docs/V12_1_PRODUCT_CONTRACT.md)。若其他文档与该合同冲突，以该合同为准。

> **AI 阅读边界：** 公开仓库只保留 V12/V12.1 当前产品快照。旧版产品材料已从 GitHub 分支、标签与可读历史中移除，只存于仓库拥有者持有的离线 Git bundle；任何 AI 都不得从仓库外的旧上下文定义当前产品。完整边界见 [`docs/HISTORY_BOUNDARY.md`](docs/HISTORY_BOUNDARY.md)。

## 一句话定义

Buffer 是供唯一真实用户在收入不稳定时期使用的**个人现实状态与未来模拟工具**：它如实反映已确认的现金现实，推导未来，并比较用户明确建立的假设；它不指导用户该做什么。

最高原则：**缓冲区负责反映，不负责指导。**

## 当前产品形态

- 仅有四个一级空间：**现在、未来、条件、记录**。
- 仅有一个真实用户：产品不招募参与者、不依赖多用户研究或合成活跃数据。
- 有三个不可混淆的数据域：
  - **REALITY**：用户已确认的现金、收支、事项和真实变化；唯一事实来源。
  - **FORECAST**：只由 REALITY 推导，不可直接编辑。
  - **SCENARIO**：用户主动建立的临时假设；可以比较或保存草稿，但绝不能写入 REALITY。
- 未来到达不是事实：预计事项到期后必须由用户核对，不能因时间经过自动变成 Reality。
- Buffer 不是完整账本。日常更新优先确认当前可用现金锚点，以及会改变未来的持续条件或已知事项；未结构化生活变化可以由余额重新确认吸收。

## V12.1 的 LLM 边界

用户可用自然语言描述现实变化。极简单、单一、无歧义的余额句可在本地快速处理；复杂输入可交给服务端成熟语言模型整理为**候选事实**。

固定权力链：**LLM understands. Code validates. User confirms. Code commits.**

因此，模型没有 Reality 写权限、没有业务工具、不能产生或选择真实 ID，也不能修改真实条件、事项、预测、模拟、快照、文件、浏览器存储或服务器状态。所有候选都必须由用户逐项核对、修改或移除后，才可由代码原子写入。

复杂解析只发送最小必要上下文。Provider key、原始 prompt、provider response 和临时候选不得进入客户端包、HTML、localStorage、备份、截图、日志或 Git。产品必须诚实披露：复杂自然语言解析可能由中国境内的外部模型服务处理。

## 非目标与停止规则

V12.1 已完成。没有用户明确的新产品决策时，**禁止**开始或暗中扩展为：OCR、截图/账单识别、银行或支付同步、AI Chat、AI Advisor、AI 报告、风险评分、Tool Calling、长期 AI Memory、自动预测、自动执行、Final Hardening、V13、新一级空间或新产品模块。

允许的后续工作仅限于：可复现的高优先级缺陷、数据完整性、备份/迁移/恢复、跨设备语义、浏览器/手机/小程序/六套皮肤/无障碍回归，以及记录唯一真实用户的实际使用摩擦。观察不是开发授权。

## 给 AI 的工作顺序

1. 阅读 [`AGENTS.md`](AGENTS.md)、[`docs/V12_1_PRODUCT_CONTRACT.md`](docs/V12_1_PRODUCT_CONTRACT.md)、[`PRODUCT.md`](PRODUCT.md) 和 [`PROJECT_REQUIREMENTS.md`](PROJECT_REQUIREMENTS.md)。涉及界面时再读 [`DESIGN.md`](DESIGN.md)。
2. 只从上一步列出的当前入口判断产品形态；历史材料不能生成现行需求。
3. 先判断请求属于缺陷、维护、观察记录，还是需要用户明确决定的新产品方向。后者不能自行实现。
4. 保留未提交的用户文件；可见改动需同时验证桌面与手机；发布需核对本地、上游、远端和标签的提交一致性。

详细产品定义见 [`PRODUCT.md`](PRODUCT.md)；架构、隐私、安全与验收证据在 [`docs/v12-1/`](docs/v12-1/)；最终验收见 [`docs/v12-1/08-final-acceptance.md`](docs/v12-1/08-final-acceptance.md)。
