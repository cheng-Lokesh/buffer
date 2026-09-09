# Buffer 历史材料边界

## 当前事实来源

AI、开发者和审查者只能从以下文件判断当前产品形态，顺序如下：

1. `docs/V12_1_PRODUCT_CONTRACT.md`
2. `AGENTS.md`
3. `PRODUCT.md`
4. `PROJECT_REQUIREMENTS.md`
5. `DESIGN.md`
6. `docs/v12-1/`

当前正式版本是 v0.35.0（V12.1 LLM Reality Parser）。

## 默认分支边界

默认分支只保留 V12 直接基线、V12.1 当前产品文档与对应验收证据。以下历史材料已从当前树删除：

- V2–V11 的旧合同、蓝图、研究和设计预览；
- 旧首页审核、旧界面截图、旧验收记录和旧版变更日志；
- 已退役产品形态专用的源码、测试和浏览器脚本。

这些内容不再存在于 GitHub 的公开分支、标签或可读历史中。它们只在仓库拥有者持有的离线 Git bundle 中保留，用于审计、数据迁移和按文件恢复，不能用来描述当前产品、生成需求或恢复旧功能。

## 离线恢复边界

完整历史已保存为 `buffer-full-history-before-public-sanitize-2026-09-09.bundle`，并通过 `git bundle verify`。该文件由仓库拥有者离线保管，不位于本仓库。

需要审计或恢复某个文件时，必须将 bundle 克隆到新目录，只取回指定文件；不得覆盖当前 `main`，也不得将历史分支或标签重新推送到公开 GitHub。
