# 微信认证服务候选：TDD 证据

日期2026-10-08。来源：当前公开服务 PRD 与本人要求接通真实账号；不是历史功能复活或全产品上线报告。

用户路径：小程序给出微信临时授权码 → 服务端额度/重放保护 → 官方验证身份 → 私钥签发 CloudBase 凭证。客户端不能直接指定身份、选择管理员或自动合并网页账号。

## 检查点

| 行为 | RED（均实际执行，exit1） | GREEN（同一测试重跑，exit0） |
|---|---|---|
| 微信交换/伪造身份/请求边界/重放/失败脱敏 | 5301b4b，12项失败：实现缺失 | 6d627aa，12/12 |
| RSA签名及凭据约束 | d52a4a0，3项失败：实现缺失 | 7da3c6a，3/3；补充协议字段校验 |
| PG持久化额度与防重放适配 | 9114874，5项失败：实现缺失 | c263272，5/5 |
| 服务组合与正式AppID | b5ecac9，4项失败：配置仍touristappid/实现缺失 | b48310c，4/4 |

签名调试发现官方浏览器SDK初始化创建 BroadcastChannel，三项断言通过但Node进程不能退出，因此没有认定 GREEN。对照SDK 3.10.1 Node createTicket及官方PG文档，用 jsonwebtoken 实现相同协议的离线RS256签发，五分钟 exp/expire，refresh一分钟；正常退出后才提交 GREEN。SDK未作为运行依赖保留。通过密码学公钥校验不是平台接受凭证的证据。

官方协议来源：https://docs.cloudbase.net/api-reference/webv3-pg/authentication

## 本次最终执行

- `npm run test:public-auth`：24/24，0失败/跳过；四个服务文件覆盖率行100%、分支96.21%、函数100%，exit0。
- `npm run test:public-sync`：41/41，exit0。
- `npm run test:miniprogram`：28/28，exit0。
- `npm run build`：exit0，未更改视觉源码。
- `npm audit --omit=dev`：0漏洞，exit0。间接 source-map-js 已按现有兼容范围更新。

## 验收边界

微信API用请求替身验证协议/失败边界，RSA用运行时临时测试密钥，PG用查询替身验证参数化SQL及事务编排。没有声称真实微信、真实数据库、跨实例并发、服务端数据库权限、CloudBase平台验票或微信真机通过。

未取得真实服务器私钥、AppSecret、专用PG连接；SQL尚未执行，认证接口未部署/挂载。公网托管需HTTPS、可信网络地址、来源策略、硬额度、专用数据库角色和凭据存储；共享匿名公钥不能代替服务端凭据。

两端统一身份绑定仍须分别验证控制权；登录后迁移仍须本人确认，不自动上传旧财务数据。现有网站密码门禁继续保留。未开启续费、按量扣费或购买资源。
