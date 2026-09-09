# Buffer V12.1 Product Contract

> Current release: v0.35.0, LLM Reality Parser. This file is the highest current product authority.

## Product purpose

Buffer is a personal reality-state and future-simulation product for periods of unstable income. It reflects the one real user's confirmed cash reality, derives a forecast, and compares explicit scenarios. It does not prescribe what the user should do.

Highest principle: **缓冲区负责反映，不负责指导。** Buffer 永久只有用户本人一位真实用户；验收不依赖招募、多人成果或合成活跃数据。

## Reality Language Principle

用户可以按自己的自然语言描述生活，不需要学习数据结构。成熟语言模型只负责把自然语言解释为候选事实：**Language → Candidate Facts**。

固定权力链：

**LLM understands. Code validates. User confirms. Code commits.**

大模型没有 Reality 写权限。模型无业务 Tool，不生成或选择真实数据库 ID，不执行代码，不修改条件、事项、预测、模拟、快照、文件、浏览器存储或服务器状态。Reality 的最终权威是用户本人明确确认的事实，不是模型的判断或置信度。

## Preserved V12 contract

V12 的四个一级空间、REALITY / FORECAST / EXPECTED OCCURRENCE / SCENARIO 边界、Reality Capture、迁移、备份、六套皮肤与小程序语义全部保留。

Buffer 不追求完整账本。当前可用现金是 Reality 的状态锚点；一次性、未结构化生活变化可以由余额重新确认吸收。时间经过不能把预计事项变成现实，Scenario 不能修改 Reality，未知值不能显示为 0。

## Hybrid parser

只有极简单、单一、无歧义的余额陈述允许走本地 Fast Path，例如“余额 4360”或“现在还有 3800”。Fast Path 的目的只是在安全简单输入上更快、更私密、更稳定，不得为省钱扩张为中文规则库。

复杂、多事实、中文口语金额、自然相对日期、指代、否定、条件变化、事项核对、Reality 与 Scenario 混合输入进入服务端 LLM adapter。本地 deterministic parser 只作为 Fast Path、离线回退和测试 fixture，不得被称为通用 AI。

## Secure server boundary

浏览器只调用 Buffer Server Endpoint。Provider API key 只从服务端环境变量读取，不得进入客户端 bundle、HTML、localStorage、备份、截图、日志或 Git。产品代码依赖 provider-independent `ParserInterpretation`，不依赖供应商原始返回结构。

模型使用严格 Structured Output / JSON Schema。任何不合法枚举、金额、日期、结构、状态或目标都不得生成可确认候选。用户输入始终被视为待解析数据；其中的指令不能改变系统权力边界。

## Context minimization and privacy

自然语言解析只发送：用户当前原句、当前日期、时区、当前余额，以及由本地程序筛选的必要相关条件摘要和到期事项摘要。

默认永不发送：完整历史、备份、身份资料、无关数据、完整快照、Scenario 历史、全部条件、未相关记录、API key。原始 prompt、provider response 与临时候选不进入长期备份。

外部模型服务可能在中国境内处理和存储必要输入。产品设置和解析入口必须诚实说明这一点，不得继续声称复杂自然语言解析完全不离开本机。

## Deterministic Semantic Resolver

模型只输出语义、方向、金额、时间表达、证据文本和 `referenceHint`。模型不得生成 `conditionId` 或 `occurrenceId`。本地 Resolver 使用真实上下文匹配：唯一匹配才引用真实对象；多重匹配只问一个最小澄清问题；无可靠匹配时创建受支持的新候选或要求澄清。

“这次”与“以后”、已发生与已知未来、条件与单次事项必须严格区分。中文精确金额和相对日期可被解析；“大概”“两千多”“可能”等不精确事实不得擅自固化为 Reality。

## Partial success and clarification

一句话同时含明确事实和模糊部分时，明确部分继续进入候选，模糊部分单独澄清。澄清只问完成安全映射所需的最少问题，不建立聊天历史、人格或对话线程。

Reality 与 Scenario 混合时，Reality 部分可成为候选，Scenario 部分只作为非 Reality 解释展示。否定句不得被翻转成正向收入、支出、条件结束或事项发生。

## Confirmation and atomicity

所有解析结果停在“我理解为”的临时候选。每项可以修改或移除；即使模型给出最高置信度，也必须由用户本人确认。解析、预览和澄清都不写 Reality。

确认时，程序重新验证所有候选，在隔离副本中应用并只持久化一次；任一无效项阻止整批写入。

### Balance Anchor Rule

若一句话同时含现金流事实和最终余额，事件可以保留记录或未来含义，但最终余额是唯一当前现金锚点。系统不得把事件金额再次叠加到最终余额。

## Provider failure, offline and voice

Provider 失败、超时或无网络时保留用户原文，并提供重新解析、精确修改和确认余额。余额锚点、到期事项核对、精确修改及本地 Fast Path 必须继续工作。

语音只负责转成文字；文字继续进入同一 Hybrid Parser、候选、校验与本人确认路径。官网按浏览器真实能力支持语音；小程序保留完整文字路径，不虚报语音或外部模型能力。

## Experience boundary

Reality Capture 仍是“输入 → 理解 → 确认 → 完成”，不是 ChatGPT。禁止头像、消息气泡、问候、建议轮播、聊天历史、AI 人格、财务建议、自动判断或自动执行。加载文案保持中性；候选在桌面和手机上必须一眼可核对。

## Migration and backup

v0.34.0 的 schema 9 Reality、conditions、events、resolutions、snapshots、scenario drafts 和旧备份无损可读。用户确认后的 provenance 可继续备份恢复；原始 prompt、provider response、澄清和候选临时状态默认不持久化。

## Permanent exclusions and stop rule

V12.1 不做 OCR、截图或账单识别、银行或支付平台同步、AI Chat、AI Advisor、AI 报告、AI 风险评分、Tool Calling、长期 AI Memory、自动预测、自动执行、Final Hardening、V13 或新的产品模块。

V12.1 完成后停止。只记录唯一真实用户的真实摩擦，不把推测自动升级为新功能。
