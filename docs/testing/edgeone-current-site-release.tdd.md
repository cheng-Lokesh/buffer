# EdgeOne 当前前端发布回归证据（2026-09-28）

来源：本次发布排错；目标是让本人打开腾讯云试用地址时看到 `site/` 当前前端，而不是退役的 Vite 页面，并保持整站私密门禁。

| 保证 | 验证 | 结果 |
| --- | --- | --- |
| 发布包首页与当前 `site/index.html` 完全一致，且包含运行脚本与素材 | `node --test test/v12-1-edgeone-current-site-release.test.js` | RED：旧 `dist/index.html` 哈希不符；GREEN：1/1 |
| 已构建发布包不携带 `package.json`，避免 EdgeOne 再执行缺失源码的构建命令 | 同上 | RED：发布包含 `package.json`；GREEN：1/1 |
| 未配置密码时关闭访问，匿名页面/API/素材进入密码门禁 | `node --test test/v12-1-edgeone-private-gate.test.js`；线上匿名请求 | 本地 4/4；线上 `/`、API、脚本和图片均返回 303 至 `/__pilot-access` |
| 发布前检查、产品核心与安全测试 | `npm run deploy:pilot:verify`、`npm run test:v12-1:core`、`npm run test:v12-1:security`、`npm run test:v12-1:coverage`、`npm audit --audit-level=high` | 8/8、62/62、22/22、56/56；高危与严重漏洞均为 0 |

RED 提交 `b70f3fe`，首次 GREEN 提交 `81f16a8`。腾讯云首次构建失败的日志表明平台因发布包内的 `package.json` 再运行 `npm run build`，而成品包没有 `site/build_index.py`；第二个 RED 提交 `dd7e333`，GREEN 提交 `4d398e4`。再次部署 `dpofl381e7lr` 状态为 `Success`，匿名访问门禁已验证。

已知边界：`test:v12-1:coverage` 的聚合行覆盖率 98.23%、分支覆盖率 74.31%、函数覆盖率 95.95%；分支覆盖率满足仓库当前 70% 门槛，但未达到技能建议的 80%。私密密码后的实际页面仍需本人登录后视觉验收，不能由匿名请求代替。
