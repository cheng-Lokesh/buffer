# V12.1 Architecture, Security and Privacy

## Runtime architecture

```text
User text / voice transcript
          |
          v
Conservative local router
   | safe exact balance         | complex language
   v                            v
Local Fast Path          Buffer server endpoint
                                 |
                                 v
                         DeepSeek Responses API
                         strict JSON Schema, no tools
                                 |
                                 v
                    deterministic schema validation
                                 |
                                 v
                    deterministic semantic resolver
                                 |
                                 v
                       transient candidates
                                 |
                         user explicit confirm
                                 |
                                 v
                    deterministic atomic commit
                                 |
                               REALITY
```

This implements: **LLM understands. Code validates. User confirms. Code commits.** There is no path from the provider response directly to persistence.

## Provider and secret boundary

- Default provider: DeepSeek.
- Deployment identifier: `deepseek-v4-flash`.
- Endpoint: `https://api.deepseek.com/responses`.
- Output: native strict `json_schema`; tools are not supplied.
- Secret: server environment variable `DEEPSEEK_API_KEY` only.
- Browser bundle contains only the local `/api/v12-1/reality-parser` route and never the provider key.
- Same-origin validation accepts the exact local request host; arbitrary Origin headers do not self-authorize.

## Information sent

For an LLM request the adapter may send only:

- the current user sentence;
- current date and timezone;
- current balance;
- locally selected relevant active condition summaries;
- locally selected relevant due occurrence summaries.

The selector uses text, amount and semantic relevance before the request. It does not delegate whole-dataset search to the model.

## Information never sent

- complete Records or cash history;
- backups or recovery envelopes;
- identity/profile data;
- all snapshots or Scenario history;
- unrelated conditions and occurrences;
- localStorage contents;
- provider secret;
- any business write tool.

Raw prompts, raw provider responses and transient candidates are not included in backup or long-term product state.

## Privacy disclosure

DeepSeek's public privacy policy says service data may be processed and stored on servers in China. Buffer therefore states in Settings and at the parsing surface that the current sentence and necessary related summaries are sent to the configured model service for parsing. It does not claim that complex language parsing remains completely on-device.

## Failure behavior

Missing key, provider rejection, timeout, invalid schema and network loss all stop before candidate commitment. The original sentence remains in the input. Retry, exact editing, balance confirmation, due-item confirmation and local Fast Path remain available. No provider error can change Reality.

## Prompt-injection boundary

User text is placed in a data field, not concatenated as an instruction. The system prompt limits the model to a Reality Language Parser, the provider receives no tools, the response must satisfy strict Schema, and the local resolver ignores invented IDs. Language-corpus and live-provider tests include attempts to override instructions, request secrets and force direct writes.
