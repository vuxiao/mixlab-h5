# MixLab H5 审查报告修复对照（v1.0 · 34 项 + 工程风险）

验收方式：`npm run build && npx vite preview --host 127.0.0.1 --port 4173 &`，然后
`npm run audit`（逐项回归，40 个检查）+ `npm run verify`（原全流程 E2E）。
回归报告与截图输出到 `.audit/`（已加入 .gitignore）。

## P0

| # | 问题 | 修复 | 主要文件 |
|---|---|---|---|
| P0-1 | 手机端酒架滑不动 | 瓶卡改 `touch-action: pan-y`，去掉 pointerdown 的 preventDefault；按下只记录起点，移动 >8px 取消，180ms 后判定长按才 `setPointerCapture` 并倾倒；长按期间非被动 touchmove 阻止滚动 | `components/BottleRack.tsx` |
| P0-2 | 长按时切分类酒一直流 | 切分类先 `endGesture('cancel')`；window 级 pointerup/pointercancel/blur/visibilitychange 兜底；满杯即停；卸载时清理定时器并复位倾倒态 | `components/BottleRack.tsx` |
| P0-3 | 脏 localStorage 白屏 | 读取时逐字段 schema 校验/迁移，过滤坏条目并回写清洗结果；新增 `ErrorBoundary`，提供「重新加载 / 清空本地数据并重试」 | `storage/cabinetStorage.ts`、`components/ErrorBoundary.tsx`、`main.tsx` |
| P0-4 | 收藏写入失败仍提示已收藏 | 存储 API 返回 `{ ok, list }`（写后回读确认）；失败时报错 toast，不置已收藏态 | `storage/cabinetStorage.ts`、`App.tsx`、`components/Toast.tsx` |
| P0-5 | 320 宽顶栏溢出 | 新增 `xs`(360px) 断点；<360 隐藏模式文字、<400 隐藏副标题与「收藏/图鉴」文字改图标；标题可截断 | `App.tsx`、`index.css` |
| P0-6 | 分享闭环双失效 | 移动端优先 `navigator.share({ files })`；微信内直接引导长按；其余走 Blob URL 下载 / 新窗口兜底，均有 toast 反馈；海报 `<img>` 恢复 `-webkit-touch-callout: default` | `utils/share.ts`、`components/PosterDialog.tsx`、`index.css` |
| P0-7 | 海报配方漏原料 | 全部原料逐行列出，行高按数量自适应（>10 种才合并「其余 N 种」）；百分比用最大余数法 | `engine/posterGenerator.ts`、`utils/percent.ts` |
| P0-8 | 品鉴卡配方只列 5 行 | 全部列出并附百分比 | `components/ResultSheet.tsx` |

## P1

| # | 修复 |
|---|---|
| 1 | 首屏 CTA 固定吸底，内容区独立滚动；矮屏 `short:` 变体压缩 hero |
| 2 | 同一次长按合并为一条倾倒记录，撤销整次撤回 |
| 3 | 出酒后按「作品指纹」锁定，显示已出酒面板（可重开品鉴卡 / 调制下一杯）；改配方、杯、冰、装饰后才解锁 |
| 4 | 摇一摇先真实探测 devicemotion 数据，1.2s 收不到即提示「未检测到运动传感器」 |
| 5 | 触屏横屏显示「请竖屏体验」；桌面矮窗口主吧台最小高度 540px，可整体滚动 |
| 6 | 装饰满 2 种时其余项置灰 + 提示，不再静默替换 |
| 7 | 顶栏拆成「收藏 N」+「图鉴 x/12」 |
| 8 | 删除收藏二次确认 |
| 9 | sessionStorage 记住已入场，同会话刷新不再强制首屏 |
| 10 | 客人人设文案直接显示（截断） |
| 11 | 酒瓶 / 摇匀按钮支持 Enter、Space；进度条 `role=progressbar` + aria-live；全局 `:focus-visible` |
| 12 | 所有弹窗 `role=dialog` + `aria-modal`、Esc 逐层关闭、Tab 焦点锁定、关闭后还原焦点、点遮罩关闭 |
| 13 | viewport 去掉 `maximum-scale` / `user-scalable=no`，按钮 `touch-action: manipulation` |
| 14 | 补 og:* / twitter:* / itemprop，新增 `public/og-cover.jpg`（1200×630，`npm run og-cover` 生成） |
| 15 | 气泡 rAF 仅在有气泡/倾倒/摇晃且页面可见时运行；首屏遮挡时暂停；支持 reduced-motion |
| 16 | 海报分段绘制并逐帧让出主线程，`toBlob` 异步编码（最长阻塞 516–681ms → ~180ms） |
| 17 | 自托管 Playfair Display / JetBrains Mono 拉丁子集，页面与海报共用字体栈，绘制前等待字体就绪 |
| 18 | `.github/workflows/deploy.yml`：push main 自动 build 并发布到 gh-pages |

## P2

1. 海报雷达网格加深、从 0 起算、轴标签带数值（应用内雷达同步）
2. 酒杯按舞台高宽自适应缩放并贴近操作舱（容器查询，旧浏览器保持原尺寸）
3. 百分比合计严格 100%
4. 编号改为 `ML-001-XXXX`（设备自增 + 随机后缀）
5. 「倒掉」二次确认
6. 图鉴文案改为「已解锁配方」
7. 满杯液面 92% → 97%
8. 音效开关持久化

## 工程风险

- 100dvh：`100vh` + `@supports (height: 100dvh)` 降级（避免被构建器优化掉）
- 微信/iOS 音频：visibilitychange / pageshow / pointerdown 时 resume AudioContext
- ErrorBoundary：已补
- StrictMode 双响：倒酒音效移出 setState updater，改用 ref 同步计算
- 代码分割：海报弹窗与海报引擎（qrcode + canvas）懒加载

## 仍需真机确认

- iOS 微信 / 安卓微信内长按保存与分享（报告 P0-6 要求真机验证，自动化只能模拟 UA 与 Share API）
- iOS Safari 的系统分享面板与「存储图像」
