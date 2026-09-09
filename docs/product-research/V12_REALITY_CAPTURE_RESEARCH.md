# Buffer V12 Reality Capture Research

> 研究日期：2026-08-25。只研究低摩擦确认、匹配、去重、预览与手机交互，不复制竞品完整财务功能。

## YNAB

官方说明显示，手工记录与导入记录匹配后会自动批准，并保留已输入的日期、收款方和备注，同时使用银行金额作为权威金额。[Approving and Matching Transactions](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i?mobile-help=true)

**Buffer 采用：** 已有 Expected Occurrence 优先匹配；系统已经知道的名称、日期、原金额不要求重新输入。

**不采用：** 银行导入、账户 register、逐笔完整记录和银行金额权威。Buffer 的权威仍是用户本人确认。

## Monarch

Monarch 在手机上允许通过滑动或单一“Mark as reviewed”动作处理待审核事项，并把需要审核的上下文集中呈现。[Reviewing Transactions](https://help.monarch.com/hc/en-us/articles/5528707082516-Reviewing-Transactions)

**Buffer 采用：** 到期事项进入 Capture 顶部，按已知事实一键“如期发生”；金额或日期变化才展开一个必要字段。

**不采用：** 多人审核、自动同步交易、完整交易列表和分类状态。

## Lunch Money

Lunch Money 可以从已有交易建立 recurring item，并自动填入大部分已知信息；suggested recurring items 不会立即写入正式 recurring 列表。[Creating Recurring Items](https://support.lunchmoney.app/finances/recurring-items/creating-recurring-items)

**Buffer 采用：** 从自然语言或已有事项生成候选，先展示识别结果，用户确认后才建立长期规律。

**不采用：** 商户、账户、预算、完整 recurring 管理和自动银行匹配。

## Actual Budget

Actual 的 import API 提供 `dryRun` 预览、重复匹配和批量更新语义，并明确区分直接添加与经过 reconciliation 的导入。[Actual Budget API Reference](https://actualbudget.org/docs/api/reference/)

**Buffer 采用：** validate all → preview → atomic commit；同一 due occurrence 不能再生成独立重复事件。

**不采用：** 原始交易导入、账户、分类、payee、拆分交易和银行同步。

## Web Speech API

`SpeechRecognition` 并非所有广泛使用浏览器都稳定提供，具体实现还可能使用服务端识别，因此不能把它当作可靠的本地能力。[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

**Buffer 采用：** 运行时能力检测、明确权限/失败状态、文字输入永远可用、转写结果仍需候选确认。

**不采用：** 宣称全部本地转写、语音助手人格或把语音结果直接写入 Reality。

## Product synthesis

1. 先匹配系统已有上下文，再询问最少必要差异。
2. 余额是现实锚点，不要求解释所有中间交易。
3. 解析只生成候选，预览和提交分开。
4. 同一句的多项变化必须去重并原子提交。
5. 语音只是文字输入的入口，不是新的产品主体。
6. 外部 provider 缺失时，非 AI 路径和本地确定性解析仍完整可用。

