# V12.1 真实自然语言语料

本阶段建立 160 条手写中文语料，每条都是独立表达，不通过金额或词序模板批量生成。权威 fixture：`test/fixtures/v12-1-language-corpus.js`。

## 分布

| 类别 | 数量 | 重点 |
| --- | ---: | --- |
| balance | 10 | 只确认最终余额，不要求解释差额 |
| income / expense | 20 | 已发生收支、退款、借还款 |
| multi_fact | 10 | 多事实和 Balance Anchor |
| chinese_amount | 10 | 一千五、八千六、一万二、2万5、1.2万 |
| relative_date | 10 | 昨天、周五、月底、下月底、三天后 |
| negation | 10 | 未到账、没发生、没有取消 |
| scenario | 10 | 如果、假设、模拟，不进入 Reality |
| uncertain | 10 | 可能、大概、差不多，不伪装精确 |
| mixed | 10 | Reality + Scenario 或明确 + 模糊 |
| occurrence / condition | 20 | 本次变化与长期规律严格分离 |
| known_future | 10 | 已签合同、已审批、已通知的未来事实 |
| pronoun | 10 | 那笔、这笔、之前提到的内容 |
| colloquial | 10 | 口语、省略、轻微错字与非标准表达 |
| prompt_injection | 10 | 删除、绕过确认、泄露历史与密钥等攻击 |

总计：160。

## 设计原则

- 语料只用于质量验证，不收集真实用户隐私，也不用于训练或 fine-tuning。
- 同一句可包含明确事实、模糊事实和 Scenario，明确部分允许进入确认，其他部分单独澄清。
- “不知道具体花在哪里，只知道余额”是合法 Reality，不强迫用户补账。
- 任何 Prompt Injection 都只是待解析的数据，不能改变 Parser 权限。
- Live Eval 从这些语义类别选取至少 50 条，并单独记录金额、日期、方向、匹配与 Unsafe 指标。
