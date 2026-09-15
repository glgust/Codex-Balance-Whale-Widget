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

托盘中可选“随 Codex 启动（需启用插件）”，默认关闭。开启后，在 Codex 加载本插件的 MCP 服务时自动打开鲸鱼，无需模型对话；插件禁用时不会触发。此选项不消除启用插件本身的上下文开销。

## 使用入口

| 入口 | 使用方式 |
| --- | --- |
| 桌面快捷方式 | 运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\Create-DesktopShortcut.ps1` 创建带鲸鱼图标的“Codex 小鲸鱼”，之后双击启动。 |
| 项目目录 | 双击 `Start-Whale.cmd`，或运行 `npm start`。 |
| Windows 托盘 | 显示、隐藏、刷新、退出，以及勾选“随 Codex 启动”。 |
| Codex 插件 | 在插件选择器中选择 **Codex Whale Widget**，发送“打开鲸鱼”或“查看额度”。 |

桌面启动和托盘操作不发起模型对话；在 Codex 中发送请求仍会产生正常的对话消耗。桌面入口不要求启用插件。

> 通过对话让 Codex 调用插件启动鲸鱼，会消耗一定订阅额度，建议交给消耗较低的模型执行。双击桌面快捷方式或使用“随 Codex 启动”选项无需模型对话。

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
