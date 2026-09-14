# Whale Widget · Codex 适配版

基于 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的第三方 Codex 适配。复用原项目的角色素材、气泡、动画、音效和设置交互，解除 DSH 运行依赖，接入 Codex 订阅额度。

## 功能

- 显示订阅额度使用比例、窗口时长和重置时间。
- 查看账户累计 token 和按服务端日期统计的用量。
- 保留原版点击、拖动、角色与音效设置。
- 每 60 秒自动刷新，也可手动刷新。
- 作为独立桌面挂件运行，或通过 Codex 插件查询和控制。

订阅百分比不能换算成剩余 token；未提供的数据显示为未知。目前不提供 Codex 每轮任务结束通知或每轮消耗统计。

## 独立运行

需要 Windows、Node.js 22.12+，以及已登录订阅账户的官方 Codex 客户端。桌面运行时为 Electron 44.3.0。

下载源码，在项目目录执行：

```powershell
npm ci
node node_modules/electron/install.js
npm start
```

安装依赖后，也可双击 `Start-Whale.cmd`。不需要安装或启动 DSH。

点击角色显示气泡，按住拖动；使用原版菜单调整外观和音效。托盘菜单可显示、隐藏、刷新或退出，隐藏时仍继续采集。

## 安装到 Codex

先完成上述依赖安装，再让 Codex 使用内置 `plugin-creator` 将完整项目注册到个人插件市场：插件名为 `codex-whale-widget`，源目录为 `~/plugins/codex-whale-widget`。保留完整项目及 `node_modules`。

注册后执行：

```powershell
codex plugin add codex-whale-widget@personal
```

新建会话后可以说：“打开鲸鱼，查看我的 Codex 额度。”插件提供 `get_usage`、`show_whale`、`close_whale`、`refresh_whale` 和 `desktop_status`。更新源码后需按 `plugin-creator` 的更新流程重新安装。

## 数据与隐私

使用官方 `codex app-server` 的 `account/rateLimits/read` 和 `account/usage/read`。认证由 Codex 管理，本项目不读取 `auth.json`、不复制登录凭据、不发起模型推理。后台刷新需要网络，但不需要持续运行模型对话。

本地数据保存在 `%LOCALAPPDATA%\CodexWhaleWidget`，额度快照为 `usage.json`。桌面配置使用独立目录，本地服务仅监听 `127.0.0.1` 的动态端口，并校验访问认证、Host 和 Origin。

## 开发

```powershell
npm test
```

## 署名与许可

沿用上游 MIT 许可证，保留 MeteorNOX 署名。上游基线为 [`40cebc2`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/tree/40cebc2937aea674247a0d0e03e16c154f7b9864)。参见 [LICENSE](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md) 和 [原版说明](UPSTREAM-README.md)。

同源项目还有 [GoRmiTz 的 Windows 桌面移植](https://github.com/GoRmiTz/DeepSeek-Balance-Whale-Widget-Desktop)。本项目专注 Codex 订阅适配，不代表上游、该桌面移植项目或 OpenAI 的官方发布。
