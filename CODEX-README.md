# DeepSeek Balance Whale Widget — Codex 适配版

本项目是 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的 Codex 适配：复用原项目素材、布局、角色、气泡、拖动及设置交互，解除 DSH 运行依赖，并接入 Codex 订阅额度。鲸鱼形象与原界面不是本适配原创；本项目也不是 OpenAI 官方产品。

上游基线为提交 [`40cebc2937aea674247a0d0e03e16c154f7b9864`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/tree/40cebc2937aea674247a0d0e03e16c154f7b9864)，沿用 MIT 许可证并保留原作者署名。参见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。原版 DSH 使用说明保留在 [UPSTREAM-README.md](UPSTREAM-README.md)，本适配的启动方法以本文为准。

## 运行

需要 Node.js **22.12 或更新版本**、已安装且登录订阅账户的 Codex，以及 Windows 桌面环境。本适配锁定 Electron **44.3.0**。已在 Windows、Node 24.14.1、Codex 0.154.0-alpha.6.2 上验证真实额度读取，用户确认点击和拖动正常；暂不宣称其他系统已经适配。

在本目录执行：

```powershell
npm ci
node node_modules/electron/install.js
npm start
```

第二条命令确保 Electron 运行时已下载，即使安装依赖时跳过了安装脚本也可补齐。完成依赖安装后，也可以双击 `Start-Whale.cmd` 启动。首次安装依赖需要网络。

不需要安装或启动 DSH。独立桌面宿主使用 Electron 加载原鲸鱼浏览器界面，Node HTTP 服务复用原角色、图片、音频和配置路由。保留的 `/dsh-whale/` 路径是兼容原界面的内部路径，并不代表依赖 DSH。

## Codex 集成

插件提供 `get_usage`、`show_whale`、`close_whale`、`refresh_whale` 和 `desktop_status` 五个 MCP 工具，分别用于查询、显示、关闭、请求刷新和检查运行状态。桌面宿主启动后独立刷新，不需要持续向模型发送消息。

已通过 Codex app-server 验证安装后的 MCP 连接及真实 get_usage 调用。新会话才能加载新安装的插件；不表示所有 Codex 版本均兼容。

## 数据与刷新

采集器通过本机官方 `codex app-server` 读取 `account/rateLimits/read` 和 `account/usage/read`。认证由 Codex 自身管理；本适配不读取或复制 `auth.json`，不保存登录密钥、不调用充值或额度重置接口，也不发送模型推理请求。

运行期间默认每 **60 秒**查询一次，可请求立即刷新。这是定时轮询，并非服务端逐 token 实时推送。查询会通过 Codex 访问账户服务，因此不是离线监控。接口不可用或网络失败时，界面保留最近成功数据并标记错误或陈旧状态；没有成功快照时显示未知。

- 订阅额度是账户服务返回的使用百分比、窗口长度和重置时间。`primary` 不固定代表 5 小时，应按实际窗口长度解释。
- 缺失窗口或统计字段表示未知，不等于零。服务端只有周窗口时，不补造一个 5 小时窗口。
- 账户 token 汇总与订阅百分比是不同指标，不能把订阅剩余额度换算成“还可以使用多少 tokens”。
- 每日统计保留服务端 `startDate` 日期；不将最近一个有数据的日期冒充今天。
- 本适配不自动扫描本地会话日志。原 DSH 的每轮任务结束事件尚未接入 Codex，因此没有每轮完成通知或每轮消耗的等价保证，不会用额度变化伪造任务结束事件。原音效与角色设置仍然复用。

## 本机存储

Windows 数据目录为 `%LOCALAPPDATA%\CodexWhaleWidget`，包含额度快照、运行状态以及原挂件的角色、音频、气泡等用户配置。该目录不依赖 `.dsh`，也不与此前的原型目录共用。导出或公开源代码时，不应把个人运行数据放入仓库。

本地服务仅监听 `127.0.0.1`，首次访问使用随机令牌建立 HttpOnly、SameSite=Strict 会话 Cookie，并校验 Host、Origin 和访问认证。它不是面向公网的服务。

## 开发与发布状态

```powershell
npm test
```

测试包含独立 HTTP 路由、安全检查、原素材和自定义角色复用、配置保存以及采集器协议行为。注入数据的测试不能代替真实账户与桌面交互验收。

源码发布不等于已上架 OpenAI 官方插件目录。公开分发时须包含上游许可证和第三方声明；“适配 Codex”仅描述第三方兼容性，不暗示 OpenAI 背书。


## 安装到 Codex

先完成上面的依赖安装。使用 Codex 内置 `plugin-creator` 将完整项目注册到个人插件市场：插件名 `codex-whale-widget`，源目录 `~/plugins/codex-whale-widget`。注册时保留 `.codex-plugin`、`.mcp.json`、`standalone`、`desktop`、`assets`、`skills` 和已安装的 `node_modules`。

然后执行 `codex plugin add codex-whale-widget@personal`，新建会话后可调用。更新源代码后，需要按 plugin-creator 的 cachebuster 流程重新安装；修改源目录不会自动替换已安装缓存。

## 同源项目与运行隔离

已有 [GoRmiTz 的 Windows 桌面移植](https://github.com/GoRmiTz/DeepSeek-Balance-Whale-Widget-Desktop)。本仓库专注 Codex 订阅额度数据与 Codex 插件接入，不声称首次桌面移植，也不代表该项目或上游的官方发布。

本适配使用独立的 `CodexWhaleWidget` 数据目录和 Electron 配置目录，HTTP 端口由系统动态分配；不会占用 DSH 的固定端口或覆盖其配置。
