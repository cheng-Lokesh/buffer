# Buffer V12 Reality Capture Product Audit

> 审计日期：2026-08-25  
> 正式基线：v0.33.0  
> 基线提交：`9f6d4d8b8ea2badc1b91e80296e4ab9909f1ce94`  
> 工作分支：`codex/v12-reality-capture`

## Verdict

**PASS WITH REQUIRED REALITY CAPTURE REDESIGN**

V11.1 的 Now、Future、Conditions、Records 与现金模型成立。当前缺口不是 Reality 无法修改，而是日常更新入口分散、需要先理解数据分类、已有上下文不能在同一处直接确认，也没有自然语言候选层。

## Current route inventory

真实浏览器尺寸：Desktop 1280 × 850，Mobile 390 × 844。以下计数从 Now 开始，字段数只统计本人需要输入或主动选择的内容，不把自动日期算作字段。

| Task | Current route | Clicks / choices | Fields | Page jumps | Internal understanding | Estimated time |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| A. 余额变成 ¥4,360 | 现实有变化 → 记录变化 → 变化类型选余额确认 → 金额 → 写入 | 4 | 2 | 1 | 需要理解“余额确认”是一种变化类型 | 15–25 秒 |
| B. 今天交 ¥1,500 房租 | 现实有变化 → 记录变化 → 默认支出 → 金额 → 写入 | 3 | 1 | 1 | 无法在当前表单中保留“房租”名称 | 12–20 秒 |
| C. 原预计外包款到账 | 查看待核对 → 时间轨道 marker → 保存核对结果 | 3 | 0 | 1 | 必须理解未来页 marker 才能找到入口 | 10–18 秒 |
| D. 工资到了但只有 ¥8,500 | 查看待核对 → marker → 金额不同 → 实际金额 → 保存 | 4 | 1 | 1 | 已知名称、日期和原金额得到保留 | 15–25 秒 |
| E. 工资延期到 9 月 5 日 | 查看待核对 → marker → 日期不同 → 日期/金额 → 保存 | 4 | 2 | 1 | 日期变化仍暴露不必要金额字段 | 18–30 秒 |
| F. 9 月 15 日起每月工资 ¥12,000 | 条件 → 固定收入新增 → 名称/金额/日期/频率 → 确认 | 3 | 4 | 1 | 需要先选对 Condition 分组和频率 | 30–50 秒 |
| G. 房租以后变成 ¥2,000 | 条件 → 找房租 → 编辑金额 → 确认 | 3 | 1 | 1 | 必须自己找到已有固定支出 | 15–30 秒 |
| H. 只知道现在总余额 ¥3,800 | 同 A | 4 | 2 | 1 | 虽然不要求解释差额，但入口仍被分类隐藏 | 15–25 秒 |

Desktop 与 Mobile 的语义步骤基本相同。Mobile 还需要在底部导航、页面和 Sheet 之间切换，键盘出现后可见上下文更少。

## Concrete runtime findings

- Now 已有“现实有变化”，但当前行为只是导航到 Records。
- Records 再要求点击“记录变化”，默认表单先展示支出、收入、余额确认分类。
- 到期事项只在 Future 的事件轨道中进入 Reconciliation Inspector。
- “如期发生”保留系统已知字段，但仍需从 Now 跨页寻找。
- 新增固定条件会先把一个 `missing` 条目写入当前 Reality，再要求补表单；取消后容易留下未确认条目。
- 当前没有自然语言、候选确认、批量原子提交或语音入口。
- 当前余额确认不会要求解释差额，这一正确语义必须保留并前置。

## AI, server and secret audit

- 前端没有现成 AI provider、AI key 或 Reality Parser。
- 当前 Cloudflare Worker 主要承载历史账号、支付和云状态接口，不是经过审计的窄能力 AI 代理。
- `private-pilot-server.cjs` 是本地预览服务，不提供安全的模型代理。
- 仓库没有可直接复用的 AI 环境变量或 provider 配置。
- V12 因此先实现 provider-independent adapter、严格结构化验证和 deterministic local adapter。不会把 key 写入前端、localStorage、仓库或备份。
- 外部 AI provider 未配置时，余额确认、到期事项、精确修改和本地文本解析必须完整可用。

## Browser voice audit

当前 in-app Chromium 环境中 `SpeechRecognition`、`webkitSpeechRecognition` 和可用的媒体设备接口均不可用。V12 Web 端只能在浏览器真实提供能力时启用语音；不支持或权限拒绝时立即保留文字输入。小程序没有现成安全转写服务，本阶段不得假报语音转写已可用。

## Locked product decisions

- 一次性生活噪音由余额重新确认吸收，不制造推测交易。
- 只有会改变未来的规律或已知事项才结构化为 Condition。
- Candidate 是确认前的临时中间态，不进入长期数据域和备份。
- AI 或确定性 parser 只能生成候选，不能直接修改 Reality。
- 同一句中的余额是最终 anchor，事件只解释历史或改变未来规律，不得重复累计余额。

## Stage 0 gate

**PASS**。真实基线、八个任务、平台能力和安全边界已经审计。允许进入产品合同与 RED 测试。

