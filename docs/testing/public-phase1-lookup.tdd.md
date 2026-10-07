# 公开服务阶段一：共享查询规则

日期：2026-10-08。依据当前公开服务 PRD，开发候选，不代表双端公开上线完成。

## 用户路径

- 图表旁选择“查某天余额”，通过月份/日期原生选择器定位到任意预测日，结果持续可见。
- 选择“查余额日期”，输入金额，定位第一次达到该金额或更低的日期；无结果不改变选中日期。
- 查询只读，未知金额不当作零；两端采用上海日期与同一整数分规则。

## RED / GREEN

- RED `8dfb48b`：`node --test test/public-forecast-lookup.test.js test/public-mini-lookup.test.cjs`，退出 1，0/6，通过失败证明共享模块与小程序查询路径缺失。
- GREEN 同一命令：退出 0，6/6。
- 共享源码 `src/forecast-lookup.js`，微信文件由 `scripts/build-mini-shared.mjs` 机械生成；`--check` 检查漂移。

## 验证

| 保证 | 类型 | 实际结果 |
|---|---|---|
| 整数分、非法金额、未知值、最早匹配、闰日跨年 | 单元 | 新增测试 6/6 中覆盖 |
| 小程序月日选择、金额查询、持久结果、不改预测/现实 | 页面处理器集成 + 模板检查 | 同上；不是微信真机验证 |
| 同一源码输出、上海跨日 | 跨端单元 | 同上 |
| 网页图表鼠标/键盘/月日/余额、窄屏 | Playwright | `node --test test/v8-platform-parity.test.cjs test/v12-1-chart-interaction-browser.test.cjs` 3/3 |
| 原小程序功能回归 | 单元/契约 | `npm run test:miniprogram` 28/28 |
| 构建 | 静态交付 | `npm run build` 退出 0 |
| 小程序发布前检查 | 静态检查 | 35/36，0 failures，1 warning：touristappid |

覆盖率：`node --experimental-test-coverage --test-coverage-include=src/forecast-lookup.js --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test test/public-forecast-lookup.test.js test/public-mini-lookup.test.cjs`，退出 0，行 100%、分支 96.30%、函数 100%。范围仅共享查询模块，不是全产品覆盖率。

## 仍未完成

统一真实账号、数据库、自动同步、复杂解析与其他双端差距尚未交付。现有六皮肤与夜空网站基线没有整体重做。真实微信 AppID、工具编译、真机排版/操作验收未完成，不把 Node 页面处理器测试当作真机 PASS。线上继续密码保护，旧本机数据没有上传。
