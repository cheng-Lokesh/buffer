# 微信原生域名与账号验收复核 — 2026-10-11

本记录只描述本轮实际结果，不是公开发布或真机验收。

## 已验证

- 当前分支 `codex/v12-1-llm-reality-parser`，检查起点 `1dd30fb`；只有原有未跟踪文件，未清理或暂存用户素材。
- 使用项目外既有官方 miniprogram-automator，连接原开发者工具的 `127.0.0.1:9422`。原应用为 `signed_out`、同步版本0、待同步0。没有 mock 微信方法、关闭域名校验或导入本机数据。
- 原生 `wx.request` 顺序探测：既有登录地址空 JSON POST 返回400；环境官方身份 API 的 `user/me` 无凭据 GET 返回401；既有账号同步地址无凭据 GET 返回401。两个 request 域名在本次开发者工具环境均可达，没有域名名单失败；进程退出0。
- CloudBase 实际 SELECT：`buffer_auth_private.login_rpc_config` 对指定小程序的配置为每分钟60、每日100。此前异步更新的结果现已通过只读回查确认，本轮没有再次 UPDATE。最初查询误用了不存在的 schema，随后按当前 SQL 源码纠正；失败查询没有写入副作用。
- 网关实际只读配置：`/api` 总100 QPS、ClientIP 20；`/api/auth/wechat` 总50 QPS、ClientIP 10，均启用。
- 实际 SELECT：私有同步 schema 对匿名/普通认证角色关闭；accounts 和 receipts 表对这两类角色的直接读写权限关闭；匿名没有 `buffer_sync_read(text)` 执行权。四项结果均 true。
- 实际 SELECT：财务 accounts 0、receipts 0。没有写入虚假财务事实。

## 未通过的可见流程

执行 `scripts/check-mini-account-live.mjs --login`，退出1，失败阶段 `visible_login_confirm`。没有把此结果归因于云端接口。

独立读取当前组件，结果 `confirming=true`、`busy=false`、标签“微信登录”；开发者工具模拟器截图仍显示“使用微信登录”弹窗。再次调用官方 `native().confirmModal()` 返回完成，但组件与账号状态保持不变，说明该调用完成不代表应用收到了确认回调。底层工具为何未触发回调尚未确定，未修改产品代码或使用模拟回调代替本人确认。

另外，既有验收脚本仍断言登录后的旧消息“本机数据未上传”，而当前账号组件源码的同步成功消息是“已同步”。本轮尚未到达该断言，不能把它当作本次弹窗失败的原因；后续完整验收需按当前同步状态核对。

已向用户提供一次具体指引：在开发者工具的小程序模拟器弹窗右下角点击“登录”。截至本轮最后观察，应用仍 `signed_out`、同步版本0、待同步0。真实应用登录、同账号网页登录配对、财务确认自动同步、账号间隔离攻击、离线恢复/冲突/删除传播以及手机真机仍未验收。

## 保护边界

本轮未部署代码、修改网站密码保护、购买资源、开启续费/超额扣费、上传本机账单或在真实账号写入夹具。只读权限检查不替代跨账号动态攻击验收。开发者工具域名可达不替代手机真机或微信发布审核。

## 登录验收脚本文案断言修正

- RED：新增 `test/public-mini-account-live-script.test.cjs`，运行
  `node --test test/public-mini-account-live-script.test.cjs`，1项失败；失败
  原因是 live harness 仍将登录后的消息固定断言为“本机数据未上传”，而当前
  组件展示实际同步状态。
- GREEN：仅调整 `scripts/check-mini-account-live.mjs`，删除过时消息断言，改为
  登录后立即验证本机现金状态指纹不变。相同测试命令 1/1 通过。
- RED 与 GREEN 各自独立提交。未改产品运行代码，也未绕过登录确认。真实弹窗
  回调仍需由本人确认后才能重跑登录/退出验收。
