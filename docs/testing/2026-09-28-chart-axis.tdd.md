# 图表金额与日期轴回归证据

来源：用户要求图表金额尺度随数据变化，并直接看出日期与剩余金额。本次仅调整当前 `site/` 的“现在”和“未来”图表，未改变 Reality、Forecast 或 Scenario 的计算结果。

| 保证 | 测试 | 结果 |
| --- | --- | --- |
| 高余额窄幅变化不再强制从 0 起；保留金额、模拟金额共用线性尺度 | `test/v12-1-chart-axis.test.js` | PASS |
| 无变化、负值、空值和大金额刻度仍有限且可读 | `test/v12-1-chart-axis.test.js` | PASS |
| 两张图的时间轴显示日历日期和对应金额，点击与键盘选择继续更新详情 | `test/v12-1-chart-interaction-browser.test.cjs` | PASS |
| 320px 宽度下日期锚点不重叠且页面无横向溢出 | `test/v12-1-chart-interaction-browser.test.cjs` | PASS |
| 编辑、试算、记录与账单路径保持连通 | `test/v12-1-current-flow-browser.test.cjs` | PASS |

RED：`node --test test/v12-1-chart-axis.test.js test/v12-1-chart-interaction-browser.test.cjs`，0/2 通过。轴模块尚不存在，现有图表只显示相对天数。

GREEN：`node --test test/v12-1-chart-axis.test.js test/v12-1-chart-interaction-browser.test.cjs`，5/5 通过；`node --test test/v12-1-chart-interaction-browser.test.cjs test/v12-1-current-flow-browser.test.cjs`，2/2 通过。

覆盖率：`node --experimental-test-coverage --test-coverage-include=src/v12-1-chart-axis.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test test/v12-1-chart-axis.test.js`，行 100%，分支 93.75%，函数 100%。

视觉核对：本地页面在 1280px、390px 和 320px 宽度检查了轴标签与曲线的关系；用户本人对视觉效果的接受仍需在实际网站确认。旧版 `test/v12-1-browser-acceptance.test.cjs` 使用非当前 `site/` 的 DOM 类名，不能作为本图表的通过证据。
