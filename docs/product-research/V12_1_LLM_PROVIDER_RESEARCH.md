# V12.1 LLM Provider Research

研究日期：2026-08-25。目标是中文短文本到严格候选事实的提取，不是聊天、建议或通用 Agent。

## 选择标准

中文口语理解、原生结构化输出、指令遵循、否定和相对日期、多事实与 Scenario 边界、延迟、API 稳定性、服务端接入、隐私、成本。

## 候选比较

| 候选 | 结构化输出 | 价格参考 | 适配判断 |
| --- | --- | --- | --- |
| DeepSeek `deepseek-v4-flash` | Responses API 支持 `json_schema`，也支持 JSON Output | 非高峰输入/输出 `$0.22/$0.66`，高峰 `$0.44/$1.32`，每百万 token | 默认。中文能力、价格和用户已有凭据最匹配，使用非思考模式和严格 Schema。 |
| DeepSeek `deepseek-v4-pro` | 同样支持 Responses API 与 JSON Schema | 非高峰 `$0.66/$1.98`，高峰 `$1.32/$3.96` | 约为 Flash 3 倍价格。本阶段不默认使用，只有真实评估证明 Flash 质量不足才考虑。 |
| Google `gemini-2.5-flash-lite` | 官方列明 Structured outputs | 输入/输出 `$0.10/$0.40`，每百万 token | 成本低、适合简单数据提取，但需要另一套凭据和提供方接入，本阶段保留为可替换候选。 |
| Alibaba Qwen Flash | JSON mode，部分型号支持 JSON Schema | 中国大陆 `qwen-flash` 约 `$0.022/$0.216`，国际价格依区域变化 | 中文和成本有竞争力，但区域、型号别名和账户体系更复杂，本阶段不增加第二套运行依赖。 |
| OpenAI GPT-5.4 nano | Structured Outputs | 标准输入/输出约 `$0.20/$1.25`，每百万 token | 结构化能力成熟，但用户已选择 DeepSeek 且成本不占优，保留 provider-independent 接口即可。 |

## 最终选择

默认部署标识：`deepseek-v4-flash`。

原因：

1. DeepSeek 官方当前将其列为 Flash 低价型号，并原生支持 Responses API。
2. Responses API 可使用 `json_schema`，比“提示模型输出 JSON 字符串后直接相信”更符合 V12.1 合同。
3. 用户已明确提供 DeepSeek API，避免引入第二个账户体系。
4. `deepseek-v4-pro` 成本约为 Flash 的 3 倍，不符合“使用最便宜模型”的明确选择。
5. 真实 50 条 Live Eval 是最终质量闸门。若 Flash 不能把 Unsafe Parse 降到 0，V12.1 不发布，而不是偷偷扩大 regex 或自动改用更贵模型。

## 接入方式

- Browser 只调用 Buffer Server Endpoint。
- Server 从 `DEEPSEEK_API_KEY` 环境变量读取密钥。
- Server 调用 `https://api.deepseek.com/responses`。
- Provider adapter 对产品侧只暴露 `ParserInterpretation`，不暴露 DeepSeek 返回结构。
- 模型不接收 Tool，不调用业务函数，不生成真实 conditionId / occurrenceId。
- 先由本地程序筛选 relevant conditions / due occurrences，再发送最小上下文。

## 隐私结论

DeepSeek 的公开政策说明，服务可能处理用户输入并在中国境内服务器处理和存储数据，开发者需向终端用户披露处理规则。因此 Buffer 不再声称自然语言解析“完全不离开本机”。设置页和解析入口必须明确：只有当前输入及必要相关条件摘要会发送给配置的模型服务，完整历史、备份、全部快照、Scenario 历史和无关条件不会发送。

## 官方资料

- DeepSeek Models & Pricing: https://api-docs.deepseek.com/quick_start/pricing/
- DeepSeek Responses API: https://api-docs.deepseek.com/api/create-response/
- DeepSeek JSON Output: https://api-docs.deepseek.com/guides/json_mode
- DeepSeek Privacy Policy: https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html
- DeepSeek Open Platform Terms: https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html
- Gemini Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Qwen pricing: https://help.aliyun.com/zh/model-studio/model-pricing
- Qwen structured output: https://help.aliyun.com/zh/model-studio/qwen-structured-output
- OpenAI pricing: https://platform.openai.com/pricing
