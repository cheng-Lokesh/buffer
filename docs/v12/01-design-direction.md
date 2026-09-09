# Buffer V12 Reality Capture Design Direction

## Direction lock

- **Who and context:** 永久唯一用户本人，主要在手机上进行 5–20 秒的高频现实更新，桌面提供相同语义的相邻侧栏。
- **Aesthetic:** 延续 V11.1 温暖纸面、贴心而克制的六皮肤系统；输入像一张现实校准纸条，不像财务终端或聊天机器人。
- **Signature:** 一个始终可见的余额锚点和“我理解为”候选清单，让确认前后的事实边界非常明显。
- **Constraints:** React 19、Vite、现有全局 CSS、500 KiB 单包门槛、40–44px 触控目标、键盘和屏幕阅读器、local-first、无公网发布。
- **Micro-interaction:** 入口按压缩放至 0.96；候选使用 160ms opacity 与 translateY(8px) 淡入；确认完成后同一动作槽从按钮交叉淡化为“现实已更新”。

## Three-line thesis

- **Visual thesis:** 安静的暖纸现实校准面板，真实数字是主角，皮肤装饰只提供材料感。
- **Content plan:** 待确认上下文 → 当前余额锚点 → 一句话输入 → 精确修改 → 确认后的 Now/Future 结果。
- **Interaction thesis:** Canvas 和四空间不移动；桌面侧栏、手机 Bottom Sheet；候选出现前不写数据，错误或语音失败时原地回到文字或精确修改。

## Reference patterns

- YNAB：已输入事项与导入事项匹配后不再重复审批。Buffer 借鉴“已有事实优先匹配”，不采用完整交易账本。
- Monarch：手机通过单个动作确认待审核事项。Buffer 借鉴“已有上下文一键确认”，不采用多人审核或交易列表。
- Actual Budget：`dryRun`、去重与 batch update 把预览和提交分开。Buffer 借鉴“先验证全部，再原子提交”，不采用账户、分类和导入体系。

## Layout and surface budget

### Desktop

- 现有 app shell 和四空间导航不变。
- Reality Capture 使用右侧 420px 相邻面板，主页面仍可辨认。
- 默认只允许一个面板、一个待确认区域和一个输入动作区域。

### Mobile

- 390×844 使用不超过视口高度的 focused Bottom Sheet。
- Header 只包含标题、关闭和一句边界说明。
- 主动作采用自然宽度，固定确认槽避让 safe area。
- 输入被键盘遮挡时，sheet 自身滚动，页面背景不滚动。

## Typography and material

- 品牌标题保留各皮肤既有 display face，只用于面板标题。
- 金额、日期、状态、输入和按钮使用现有高可读正文栈，数字开启 tabular figures。
- 不新增渐变、玻璃模糊或通用卡片墙。
- 使用现有 radius scale 与皮肤 token，面板通过材质背景和轻阴影与主页面分层。

## Copy guardrails

- 使用“我理解为”“确认这些变化”“现实已更新”等事实文案。
- 不使用“我能帮你”“建议”“做得很好”“智能分析”等人格或评价语言。
- 正常 UI 不显示 Candidate、Parser、Condition、Reconciliation 等内部名称。
- 错误直接说明未完成的事实，并提供重试、文字或精确修改路径。

