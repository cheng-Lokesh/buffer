# 官网单一外观：测试与交付记录

- 范围：移除当前官网左侧皮肤入口和六套外观切换；固定当前夜空视觉。旧备份的皮肤字段仍可读取，现金事实不受影响。
- RED：提交 `aa3ee32`。`node --test test/v12-1-site-retained-capabilities.test.cjs test/v12-1-site-single-appearance.test.cjs`，1 通过、2 失败，分别指出多套样式及选择入口仍存在。
- GREEN：`npm run test:v12-1:site`，6/6 通过；`node --test test/v12-1-site-single-appearance.test.cjs test/v12-1-now-insight-cards.test.cjs`，2/2 通过。覆盖首次使用、旧本地状态、旧备份恢复，以及四个页面的视觉结构。
- 回归：`npm run test:v12-1:coverage`，56/56 通过；行覆盖率 98.40%，分支覆盖率 75.00%，函数覆盖率 98.61%。
- 视觉范围：不改动夜空素材、四空间布局和现金计算。旧版多皮肤数据/实现仅作为历史兼容保留，不再由当前官网加载或供用户选择。
