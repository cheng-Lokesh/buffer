# V12.1 默认树产品权威清理 TDD 证据

## 根因

当前入口文档虽已指向 V12.1，但 GitHub 默认分支仍同时暴露 V2–V11 旧合同、设计蓝图、首页预览、截图、验收证据、旧脚本和未被当前入口引用的退役实现。这些文件的细节密度高于 README 中的警告，导致新 AI 将历史形态拼接成当前产品。

## RED

- 提交：`3b51ae8 test: expose superseded product evidence in default tree`
- 命令：`node --test test/v12-1-current-tree-authority.test.cjs`
- 结果：`0/2` 通过。
- 失败证据：测试列出默认树中的旧合同、旧首页、旧截图和旧验收材料；同时证明 README 仍在声明这些材料保留于当前树。
- 公开历史 RED 提交：`62b69ac test: expose public historical refs`
- 命令：`node --test test/v12-1-public-history-boundary.test.cjs`
- 结果：`0/2` 通过；当时当前分支有 `406` 个可遍历提交，GitHub 有 `27` 个公开分支，仓库共有 `115` 个公开 Git refs。
- 额外公开信号：Topics 仍包含三个已退役方向的关键词，旧公网部署 PR 仍处于打开状态。

## 恢复点

- 离线归档：`buffer-full-history-before-public-sanitize-2026-09-09.bundle`
- 清理前最后提交：`62b69ac`
- 大小：`97,411,971` bytes。
- SHA-256：`A3B777BEFF93501D5DDDA4EFF7A1F419A514D2D5BEA306DC513324FA17CC0296`。
- 校验：`git bundle verify` 通过，包含完整历史与全部当时引用；恢复说明与 bundle 一同保存在仓库拥有者的离线归档目录中。
- 用途：完整审计或按文件恢复旧材料；不得重新推送到公开 GitHub。

## GREEN 范围

- 从默认树删除 786 个已跟踪历史文件，包括 V2–V11 旧产品文档、旧设计配置、旧首页、旧 PDF、历史截图与测试证据、退役测试/脚本、未被当前入口引用的退役实现。
- 保留 V12 直接产品基线、V12.1 当前合同与验收证据。
- 保留当前备份恢复链真正引用的兼容模块，旧产品数据只能进入 `legacyArchive`，不恢复退役功能。
- 精简 `package.json` 为 V12/V12.1、当前小程序和当前构建命令。
- 将默认树权威检查纳入 `test:v12-1:governance`。

## GREEN 验证

- 默认树权威：`3/3 PASS`
- V12.1 governance：`7/7 PASS`
- V12.1 core：`61/61 PASS`
- V12.1 language：`14/14 PASS`
- V12.1 security：`21/21 PASS`
- 旧数据兼容归档：`4/4 PASS`，行/分支/函数覆盖率 `100% / 100% / 100%`
- V12 core：`26/26 PASS`
- V12 contract：`9/9 PASS`
- V12 小程序 Reality Capture：`5/5 PASS`
- 小程序当前产品：`28/28 PASS`
- V12.1 核心覆盖率：行 `98.40%`，分支 `75.00%`，函数 `98.61%`
- 小程序覆盖率：行 `95.08%`，分支 `82.51%`，函数 `96.63%`
- V12 真实浏览器：`1/1 PASS`
- V12.1 桌面、手机与六套皮肤真实浏览器：`1/1 PASS`
- 生产构建：`PASS`

## GitHub 公开入口清理

- 公开 Git 历史重建为一个无父提交的当前根快照；远端只保留 `main`，发布标签只保留 `v0.35.0`，两者指向同一当前快照。
- 旧远端分支和旧发布标签全部删除；本地常规检出也只追踪 `origin/main` 与 `v0.35.0`。
- 旧公网部署 PR 已关闭；Topics 已移除三个已退役方向的关键词，仅保留当前技术与财务推演相关主题。
- `v0.35.0` Release 已重新绑定 `main`，保持公开且非预发布状态。
- 仓库公开简介已更正为当前“个人现实状态与未来模拟工具”定义，旧网站地址已清空。
- GitHub Pages 已删除：API 删除返回 `204`，后续 Pages API 与原公网地址均返回 `404`。
- 默认分支中抽查的旧变更日志、旧合同、旧首页与旧求职截图路径均返回 `404`。
- 公开历史边界测试：`2/2 PASS`；V12.1 governance：`9/9 PASS`；生产构建：`PASS`。

## 结论

公开仓库现在只能从 V12/V12.1 得出当前产品形态。任何被删除的历史文件都可从仓库拥有者的离线 Git bundle 找回，但不再出现于 GitHub 的分支、标签或可读历史中影响 AI 对当前产品的判断。
