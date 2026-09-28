# 当前前端入口修复 TDD 证据

## 来源与用户旅程

本次没有外部计划文件。验收目标直接来自用户要求：在当前项目中切换模型后，任何常规打开方式都必须进入已确认的 `site/` 前端，不得回到根目录旧 Vite/React 页面。

## RED

- 命令：`node --test test/v12-1-current-frontend-entry.test.cjs`
- 结果：`0 passed, 2 failed`
- 失败证据：`package.json` 的默认命令仍启动 Vite；根 `index.html` 仍加载 `/src/main.jsx`。
- RED 提交：`3efdbaa`、`3a52936`

## GREEN

- 当前前端完整落入活跃分支的 `site/`。
- `dev`、`start`、`preview` 统一运行 `server/site-server.mjs`；`build` 统一运行 `site/build_index.py`。
- 根 `index.html` 确定性进入 `site/index.html`。
- `AGENTS.md` 明确禁止其他模型把根 Vite、历史截图、其他分支或其他工作区当成当前前端。
- GREEN 提交：`070e3c4`

## 验证结果

| 保证 | 命令或证据 | 类型 | 结果 |
| --- | --- | --- | --- |
| 所有默认 npm 入口只服务当前 `site/` | `node --test test/v12-1-current-frontend-entry.test.cjs` | 契约 | PASS 2/2 |
| 当前页面可从源码完成构建 | `npm run build` | 集成 | PASS，19 modules transformed |
| 星空、流星、素材和减弱动效契约保持 | `python site/test_background_layers.py` | 契约 | PASS 17/17 |
| `4200` 真实页面是当前夜空四空间前端 | Codex in-app browser 重新加载及全新标签 | 浏览器 | PASS |
| 全新浏览器加载没有错误或警告 | 浏览器控制台 | 浏览器 | PASS，0 条 |
| HTTP 页面不含旧 React 入口 | `Invoke-WebRequest http://127.0.0.1:4200/` | 运行时 | PASS，`HasLegacyReactEntry=False` |

## 边界与已知事项

- 本次没有改变视觉设计，只恢复已经确认的最新 `site/` 内容并统一入口。
- 用户原有未跟踪文件未加入提交。
- 未运行与旧 Vite 页面绑定的历史浏览器测试；它们不是当前前端入口的验收来源。
- 本次提交尚未推送到 GitHub；远端克隆在推送前不会得到此修复。
