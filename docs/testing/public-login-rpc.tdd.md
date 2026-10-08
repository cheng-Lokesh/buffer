# 共享 PostgreSQL 登录保护 RPC：TDD 证据

2026-10-08。用户要求自动继续当前认证接入；不升级收费、不自动扣费、不赋予登录服务财务数据访问权。仅开发候选，没有云端安装或公网发布。

## 行为与检查

- 未知网络来源拒绝，来源仅取服务器可信上下文，不信任 forwarded headers。
- 仅固定限流/去重 RPC；IP HMAC、授权码 SHA256 摘要，不发送原始值。
- 拒绝管理员凭证、错身份/环境、过期会话和错误响应；所有错误脱敏，无内存回退。
- 数据库配置为空时拒绝全部调用；匿名拒绝、其他用户拒绝、私有表不可直接读写。
- 真实 SQL 事务控制每日/每分钟上限，唯一约束拒绝重复授权码，重装不重置计数。
- 运行时可明确选择 RPC 或直连 PG，不能同时配置；微信验证和签名规则保持不变。

## RED → GREEN

1. `node --test test/public-rpc-login-guard.test.js test/public-rpc-login-sql.test.js`：7项全部执行并因模块/迁移缺失失败，exit1。RED 提交 b6df711。
2. `node --test test/public-login-runtime.test.js`：已有5项通过，新增2项因不支持RPC和未拒绝双存储路径失败，exit1。RED 提交 4d6c848。
3. 实现最小适配、SQL和组合后，原目标合并14/14通过，exit0，新模块与组合行/分支/函数各100%。GREEN 提交 c8e8e2b。
4. `npm run test:public-auth`：36/36，exit0；总行100%、分支97.18%、函数100%。
5. `npm run build`：exit0，无视觉源码变更。

## 环境与边界

测试仅用明确标注的临时夹具。PGlite 0.5.8 提供嵌入式 PostgreSQL，实际执行迁移和 SET LOCAL ROLE；本地 auth 辅助函数模拟平台 JWT 上下文。不是腾讯云网关签名验收、平台认证映射验收、并发压力或跨端 E2E。HTTP 与微信接口测试使用替身，无真实登录请求、无用户数据传输。

腾讯云独立只读查询：创建 schema、创建 public 函数、调用 auth.uid 的权限为 true；创建角色权限为 false。候选尚未安装，配置尚未指定真实服务身份。普通 authenticated 的 RPC 执行授权仅在函数内部固定身份检查后生效，不能代替财务表 RLS；专用服务身份需在未来财务入口明确排除，并完成实际权限审计。

官方依据：[函数与 RPC](https://docs.cloudbase.net/database/postgresql/functions)、[PG 身份与权限](https://docs.cloudbase.net/authentication-v2/auth/auth-pg)。不使用绕过RLS的 service_role API Key。
