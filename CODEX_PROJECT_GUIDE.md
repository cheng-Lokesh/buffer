# Buffer Codex 当前工作指南

> **当前产品合同：[`docs/V12_1_PRODUCT_CONTRACT.md`](docs/V12_1_PRODUCT_CONTRACT.md)。当前发布版本：v0.35.0（V12.1 LLM Reality Parser）。**

## 开始工作前

按以下顺序阅读：

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/V12_1_PRODUCT_CONTRACT.md`](docs/V12_1_PRODUCT_CONTRACT.md)
3. [`PRODUCT.md`](PRODUCT.md)
4. [`PROJECT_REQUIREMENTS.md`](PROJECT_REQUIREMENTS.md)
5. 涉及界面时阅读 [`DESIGN.md`](DESIGN.md)

公开仓库是只保留 V12/V12.1 当前产品证据的单一快照。旧版产品材料已从 GitHub 移除，只存于仓库拥有者的离线 Git bundle，不能生成当前需求。

## 当前协作状态

V12.1 LLM Reality Parser 已完成并发布。V12 的四空间与 Reality Capture 均被保留；V12.1 新增的是受严格边界约束的 LLM 辅助自然语言解析层。不得自动开始 OCR、银行同步、AI Chat、Final Hardening、V13 或新的产品功能。除非用户明确提出新的产品决策，否则只处理可复现缺陷、数据完整性、兼容性、无障碍和治理维护。

## Agent 不变量

- 缓冲区负责反映，不负责指导。
- 现在、未来、条件、记录是唯一四个一级空间。
- FORECAST 只能由 REALITY 推导。
- SCENARIO 永远不能修改 REALITY。
- 未知不能静默变成 0。
- 重要预测必须解释到条件、事件和金额。
- 六套皮肤不能改变业务逻辑或可达能力。
- 用户本人是永久唯一真实用户。
- 不要求参与者、多人样本、合成数据或外部研究操作。
- 不发布产品公网。
- 不引入岗位、机会、项目、Todo、AI 教练、投资或预算建议。
- AI 只解析候选事实；只有本人确认后才能进入 Reality。
- 固定权力链：LLM understands. Code validates. User confirms. Code commits.
- 复杂输入只可经服务端解析；Provider key、原始 prompt 和 provider response 不得进入客户端、备份、日志或 Git。
- 一次性生活噪音可以由余额重新确认吸收，不要求完整记账。

## 任务处理

1. 从真实 Git 状态和当前运行时开始，不依赖旧交接结论。
2. 先判断请求是缺陷、维护、观察记录还是新的产品决策。
3. 缺陷先写可复现测试，再做最小修复。
4. 可见界面变化必须同时验证桌面和手机，并逐张检查截图。
5. 版本发布必须验证本地、上游、远端与 tag 指向同一提交。
6. 保留用户未提交文件，不清理或覆盖与当前任务无关的工作树内容。

## 真实使用证据

只有用户本人真实想完成某件事时遇到的摩擦，才构成后续产品输入。竞品功能、模型推测或技术可行性都不能单独授权新功能。

建议记录四项：原本想完成什么、实际发生什么、摩擦在哪里、是否完成。记录行为本身不能增加用户使用负担。

## Historical / Superseded

V2 至 V11 的旧产品定义均已从 GitHub 移除。需要审计或恢复单个历史文件时，只从仓库拥有者的离线 Git bundle 恢复到新目录，不得把其重新推送到公开仓库或当作现行产品定义。
