# 账号同步与网页登录配对 SQL 冲突保护

日期：2026-10-11

## 用户与运维路径

安装账号数据同步和网页登录配对数据库时，若目标环境已存在同名私有 schema、表、索引或 RPC，部署必须停下并保留原对象；不得静默复用结构不明的表或以 `CREATE OR REPLACE` 替换已有函数。成功安装后重复执行也应明确报冲突，而不是改写现有版本。

## TDD 证据

- RED：提交 `2d381dd`。执行 `node --test test/public-sync-sql.test.js test/public-browser-pairing-sql.test.js`，4 项均失败；数据库迁移在重复安装和预置 schema/RPC 时未拒绝冲突。
- GREEN：提交 `0baa44f`。相同命令 4/4 通过；PGlite/PostgreSQL 测试确认冲突时对象未被替换，原有删除墓碑与已消费配对记录仍保留。
- 综合存储/同步：`npm run test:public-storage` 25/25，服务端行/分支/函数覆盖率 100%/94.88%/96.97%。
- 配对路径：`node --test test/public-browser-pairing-sql.test.js test/public-browser-pairing-repository.test.js test/public-browser-pairing-http.test.js test/public-browser-pairing-client.test.js test/public-mini-browser-pairing.test.cjs` 14/14。

## 范围与未完成项

本证据证明本地迁移 SQL 的冲突保护、账号隔离 RPC、CAS/回执/墓碑及浏览器配对夹具路径，不证明 SQL 已安装到腾讯云。当前公开函数探测显示 `/api/auth/wechat` 路由存在，而 `/api/account/sync` 与浏览器配对路由仍返回 404；云端 SQL、服务端配置和路由尚待部署。未上传账单、未购买资源、未启用扣费，EdgeOne 网站密码保护仍保留。
