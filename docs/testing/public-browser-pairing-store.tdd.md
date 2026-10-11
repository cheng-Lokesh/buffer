# 一次性网页登录授权：持久化存储候选

2026-10-11。当前需求来自公开服务 PRD，不改变页面视觉或产品定位。

用户路径：网页版发起登录，小程序确认当前账号，只有原浏览器能够取走短期授权；重复确认、过期和错误浏览器均不能取走授权。

## 实际执行证据

- RED：`node --test test/public-browser-pairing-sql.test.js`，1 fail，明确缺失持久化迁移；提交 cf33e9d。
- GREEN：同一测试与 `test/public-sync-sql.test.js` 一起运行，2 pass / 0 fail；迁移实现提交 4ca7a11。
- 扩展后再次运行上述两个文件，2 pass / 0 fail：增加已批准授权过期、过期清理和 1000 条容量上限。

测试在本地 PGlite PostgreSQL 执行真实 SQL，不是 JavaScript 假数据库。验证空配置拒绝、专用服务身份与服务端密钥双校验、匿名与普通账号拒绝、私有表禁止直接访问、碰撞不覆盖、错误浏览器不消费、批准一次、消费一次、过期、清理、容量限制和重装不复活。

SQL 的条件 UPDATE / DELETE RETURNING 提供原子转换；本测试按顺序执行，**未在真实多连接腾讯云环境验证并发竞争**。Node 行覆盖率不能用于声称 SQL 分支覆盖率；测试没有给出 SQL 百分比。

## 明确未完成

这是候选存储层，不是可使用的完整网页登录：限流 HTTP 接口与生产组合、两端授权组件、实际网页账号存储绑定和真机验收仍需完成。

未在腾讯云执行迁移；配置默认为空。没有复制凭据、上传本机旧数据、购买资源、开启扣费或解除线上密码保护。小程序/网页不可直接调用此存储层；后续 HTTP 服务必须先验证新微信 code 与登录用户属于同一账号，再用服务端身份批准。不得接受客户端声明的 owner，也不得向表写明文登录票据。

## 服务端加密与身份核对适配（后续本地进展）

- RPC 适配 RED：3 fail（缺模块），5a8165b；GREEN：3 pass，8b30794。
- 微信授权核对 RED：2 fail（缺模块），682e5cb；GREEN：2 pass，9bf1c8d。
- 扩展并组合运行 `node --test --experimental-test-coverage --test-coverage-include=server/wechat-browser-grant-verifier.js --test-coverage-include=server/rpc-browser-pairing-store.js test/public-browser-grant-verifier.test.js test/public-browser-pairing-repository.test.js test/public-browser-pairing-sql.test.js test/public-browser-account-session.test.js`：14 pass / 0 fail。
- RPC 适配覆盖率：行100%、分支87.27%、函数92.86%；身份核对：行100%、分支100%、函数85.71%。

加密适配使用 AES-256-GCM，账号与环境作为认证附加数据；授权码和浏览器随机凭据只存域隔离 HMAC，响应流设大小上限。专用服务身份仍须经官方网关验签，SQL 再核对服务身份与私钥配置。适配 + 实际本地 PostgreSQL 验证加密入库、错误浏览器拒绝、消费后不能再次取得票据。

微信核对适配先验证原请求账号，再消费新 code，经微信交换得到 OpenID；临时票据向官方自定义登录地址发起请求，随后用官方用户验证器核实规范账号 ID，必须与原登录账号一致才签发另一个票据。禁止昵称匹配、猜测 custom UID 与规范账号 ID 对应、复用已用票据。

以上供应商请求由测试适配模拟，**没有本轮真实微信/腾讯云调用或部署证据**。HTTP 组合必须使用真实 code 交换、真实票据签发和官方 profile 验证器，并接持久化准入/防重放。未完成这些生产组合之前不得对外宣称网页版账号可用。

## HTTP 与生产组合代码（尚未部署）

HTTP RED：3bff0d5，缺处理器2 fail；GREEN：149d4f2，同一测试2 pass。真实 HTTP 主机路由 RED：54a82a6，新路由404；GREEN：26e5087，主机/处理器10 pass。生产配置组合 RED：fd79e4e，配置后仍404；GREEN：5fdd5cf，相关组合23 pass。

新增处理器提供 create / approve / consume 三个严格 POST 路径，只允许指定网页 Origin（小程序 approve 可以没有 Origin），JSON 最大2048字节，禁止 owner 字段，错误不泄露供应商详情。主机跨域预检、Cookie 清理和旧登录兼容已执行实际本地 HTTP 验证。

组合代码使用真实供应商实现、服务端票据签发、加密 RPC 存储与官方 profile 验证。授权准入独立使用 `appId + '_pair'` 的持久化预算配置；新 scope 未配置则拒绝，不能复用普通登录额度作为轮询预算。微信 code 防重放仍共享原 appId scope，防止在普通登录与授权路径各消费一次。预算和代理源地址仍须部署时核实，不能擅自设置自动扣费。

组合端到端测试通过实际本地 HTTP 请求批准并取回票据（供应商响应为夹具），包含两次用户 profile 核对、共享 code 消费、RSA 签名、密文入库适配和单次交付。六个相关测试文件组合执行24 pass / 0 fail；没有腾讯云或真机端到端证据。

`node scripts/build-cloud-login.mjs` 实际 exit 0，生成无凭据代码包。处理器与 runtime 组合覆盖率：行100%、分支94.67%、函数91.67%（15项测试当次结果）。默认配置没有 pair，因此线上路径仍未启用。
