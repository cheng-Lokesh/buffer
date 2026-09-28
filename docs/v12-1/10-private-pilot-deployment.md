# V12.1 私有试用部署

状态：腾讯 EdgeOne Makers 中国站部署代码已就绪；只有在整站密码保护和无痕访问验收通过后，才能标记为“私有试用可用”。

## 选择与费用边界

- 使用腾讯 EdgeOne Makers 中国站免费版，不使用 Cloudflare。
- 免费版商业化价格尚未发布；当前超出免费配额需主动提交工单申请扩容，不会自动切换到付费版。
- 不开通 EdgeOne 套餐、付费增值服务或自动续费；若控制台出现付费确认，立即停止。
- 整个站点开启托管层密码保护。匿名访问不得读取静态页面，也不得调用 `/api/reality/parse`。
- Reality 仍只保存在当前浏览器的本机存储中。换电脑或浏览器前，先从“本机数据”导出备份，再在新设备恢复。
- 小程序不在本次网页部署中；正式小程序仍需要本人 AppID。

## 发布前自动检查

在项目目录运行：

```powershell
npm ci
npm run deploy:pilot:verify
npm audit --audit-level=high
```

预期结果：发布契约测试通过、Vite 构建成功、安全审计没有 high 或 critical 漏洞。

## 首次登录与发布

1. 运行 `npx edgeone login --site china`。
2. 浏览器打开腾讯云中国站后，由本人完成登录和授权，再回到 PowerShell。
3. 运行 `npm run deploy:pilot`。该命令会再次检查并构建，只把生产静态产物、根门禁中间件和解析函数复制到一次性临时包后部署到项目 `buffer-v12-1-private-pilot`；不会上传整个开发目录或本地 `.env`。
4. 保存命令给出的访问地址，但在密码保护验证前不要分享。

## 只在控制台保存 DeepSeek 密钥

不要把密钥写进命令、聊天、文件或截图。

1. 打开腾讯 EdgeOne Makers 中国站控制台。
2. 进入项目 `buffer-v12-1-private-pilot` → **项目设置** → **环境管理**。
3. 分别编辑生产环境与预览环境，添加 `DEEPSEEK_API_KEY`。
4. 添加 `ALLOWED_ORIGIN=same-origin` 与 `PROVIDER_TIMEOUT_MS=12000`。
5. 保存后重新部署一次，使变量进入新部署版本。

## 配置整站密码保护

1. 在“项目设置”→“环境管理”的生产与预览环境中，各新增 `PILOT_ACCESS_PASSWORD`。
2. 设置一个只由本人保存的独立强密码；不要使用腾讯云、DeepSeek 或其他站点的登录密码。
3. 保存后重新部署。未配置该变量时，EdgeOne 根中间件会对所有路径返回 `503 private_pilot_not_configured`，不会放出任何页面。
4. 配置后，中间件只公开密码页；通过后才写入 HttpOnly、Secure、SameSite=Strict 的短期会话 Cookie，静态页面和 `/api/reality/parse` 都在同一门禁后。

## 本人验收

1. 在无痕窗口打开访问地址，必须先出现密码页，不能直接看到 Buffer。
2. 不输入密码时，直接打开 `/api/reality/parse`，不得进入解析函数的正常响应路径。
3. 输入密码后进入 Buffer，打开“现实有变化”，用不含隐私的测试句验证候选能生成，但不点击最终确认。
4. 检查浏览器 Console 没有红色错误。
5. 在手机浏览器重复密码进入步骤。
6. 从“本机数据”导出一次备份，确认文件可下载。

全部通过后，才能把该地址标记为“私有试用可用”。

## 更新与回退

更新前运行 `npm run deploy:pilot:verify`，通过后再运行 `npm run deploy:pilot`。如果线上异常，停止继续写入数据，先导出本机备份，再从 Makers 部署记录恢复上一版本。

参考：

- [EdgeOne Makers 价格与套餐](https://pages.edgeone.ai/zh/document/pricing-and-plans)
- [EdgeOne CLI](https://pages.edgeone.ai/zh/document/edgeone-cli)
- [Edge Functions](https://pages.edgeone.ai/document/edge-functions)
- [密码保护网页](https://pages.edgeone.ai/zh/use-cases/password-protect-web-page)
