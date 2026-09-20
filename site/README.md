# Buffer 静态前端（site/）

这是 Buffer 的静态前端实现：单页 `index.html`，内含「现在 / 未来 / 条件 / 记录」四个空间，
星空全景背景 + 玻璃拟态组件 + 龙藏手写文案。与仓库中 Vite/React 版本共享同一份产品定义
（见根目录 `PRODUCT.md`、`DESIGN.md` 与 `docs/`）。

## 目录

| 文件 | 说明 |
| --- | --- |
| `index.html` | 可直接部署的自包含版本（6 个中文字体已 base64 内联） |
| `index.src.html` | 可读源码版，字体走 `assets/*.woff2`。**改代码改这个** |
| `starfield-background.js` | 背景动效层：18 颗锚星缓慢呼吸 + 随机流星，遵循 `prefers-reduced-motion` |
| `assets/` | 夜空全景图、侧栏视频、字体、头像等运行时资源 |
| `server.py` | 本地静态服务，支持 HTTP Range（视频拖动需要） |

### 构建与校验脚本

| 文件 | 用途 |
| --- | --- |
| `build_index.py` | 由 `index.src.html` 重建 `index.html`（仅做字体内联） |
| `split_fonts.py` | 反向：把 `index.html` 的内联字体拆成 `assets/*.woff2` 生成可读版 |
| `update_fonts_and_build.py` | 文案变化后重新拉取字体子集并重建（有缺字会直接报错） |
| `verify_pages.py` | 逐页渲染 + 差分检测手写文案是否越界 |
| `audit_layout.py` | 排版审计：视口溢出 / 文本裁切 / 纵向裁切 / **兄弟元素重叠** / 字号 / 对比度 / 触控目标 |
| `test_background_layers.py` | 背景层契约测试（全景图尺寸与哈希、星空脚本行为） |

## 本地运行

```bash
python server.py 8899
# 打开 http://127.0.0.1:8899/index.html
```

不要直接双击 `index.html`：侧栏视频依赖 HTTP Range，`file://` 下无法加载。

## 修改流程

1. 改 `index.src.html`
2. `python build_index.py` 重建自包含的 `index.html`
3. `python audit_layout.py` + `python verify_pages.py` 校验（三档视口 × 四页应为零问题）
4. 新增或修改手写文案后，先跑 `python update_fonts_and_build.py`（字体子集是按实际用字生成的，
   换字必须重拉，否则会出现字形回退）

## 数据与状态词

界面严格使用 `已确认 / 预计 / 模拟 / 维护 / 待核对` 等状态词，数值一律等宽数字（`tabular-nums`），
现实与模拟同时以线型、文字与颜色三重区分。缓冲区只反映，不指导。
