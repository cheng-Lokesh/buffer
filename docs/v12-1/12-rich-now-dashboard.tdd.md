# “现在”页信息丰富化：测试与交付记录

- 来源：用户提供当前页面截图，要求增加有价值的信息与组件。设计约束为保留夜空视觉、桌面一屏、实际与预计分开、不得用零散记录推断完整账本。
- RED：`422be40` 提交测试后运行 `node --test test/v12-1-now-dashboard-facts.test.cjs test/v12-1-now-insight-cards.test.cjs`，0/3 通过。缺少事实计算模块，页面只有原有三张事实卡。
- GREEN：同一命令 3/3 通过；随后扩展了支出构成、空记录和主结论测试，重跑后全部通过。
- 完整页面回归：`npm run test:v12-1:site`，6/6 通过；`node --test test/v12-1-now-dashboard-facts.test.cjs test/v12-1-now-insight-cards.test.cjs test/v12-1-site-single-appearance.test.cjs`，5/5 通过。
- 新事实计算覆盖：`node --experimental-test-coverage --test-coverage-include=src/v12-1-now-dashboard-facts.js --test test/v12-1-now-dashboard-facts.test.cjs`，行 100%，分支 84.62%，函数 90%。核心解析回归 `npm run test:v12-1:coverage`，56/56 通过。
- 视觉检查：在 1440×900 与 1280×850 桌面检查一屏无页面滚动；在 375×812 与 320×700 手机检查无横向溢出。截图保存在本地 `output/playwright/`，不进入 Git。
- 语义边界：近期收支仅汇总已确认且已记录的事件；“每日最低支出”来自已确认条件，不冒充实际日均支出；未来收入、额外支出和余额均来自预测。没有记录时显示“暂无记录”，不显示虚构的实际支出 0。
