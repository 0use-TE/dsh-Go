# 服务管理 · Local Services

[English](README.en.md)

为 DSH Ha / dsh-Go 提供 Web 服务面板和统一命令入口。只管理主动登记的服务，不扫描进程或端口。无需 systemd、额外 npm 依赖或修改 Flutter。前端直接使用宿主的 React，无需打包。

## 功能

- 登记并启动、停止、重启、查看 PID 与退出原因、移除停止的服务。
- stdout / stderr 合并日志；日志页使用独立滚动条，标题和导航保持可见，每两秒更新，CLI 支持持续查看。
- 可选本机 HTTP / HTTPS 就绪检测，区分“进程运行”和“网页可访问”。访问地址可复制。
- 每个服务独立设置“随引擎／插件加载启动”，默认关闭，配置持久保存。
- 复制 AI 提示词，让 AI 使用同一套命令登记与管理服务。
- 面板出现在对话详情的「插件」中；DSH Ha 可用已有的独立显示开关移到单独页签。仅注册一个「服务管理」Web 页签，不再注册重复的原生面板。
- 默认显示扁平服务列表，每项右侧一个启停开关，名称下方用主题色闪电图标＋「自启」或灰色播放图标＋「手动」区分自启状态。点击图标或文字直接切换自启，无需进入详情，也不会启动或停止服务。不再重复显示“运行中”。顶部右侧是刷新、全部启动、全部停止、设置四个小图标。
- 点击名称或列表项的空白区域进入该服务的独立详情页，在「概览」查看配置、修改自启、重启和移除服务，在「日志」查看输出；返回箭头回到列表。自启按钮和启停开关独立操作，不会打开详情。列表不再展开内容。
- 设置齿轮覆盖当前内容，设置页只有「显示提示词」「复制提示词」；再次点齿轮或返回箭头回到之前的列表或详情。
- 界面使用 DSH 的语言服务，支持中文和英文并随宿主设置即时切换。正文和服务名为 16px，辅助信息为 14px，工具栏按钮为 40px，图标周围留 10px 内边距；列表内容左右留白，悬停底色与分隔线之间留缝。
- 图标和列表使用宿主的柔和悬停、按压底色；键盘聚焦有独立提示。详情导航采用胶囊选中效果，支持减少动态效果设置。
- 配置了 Web 地址的服务在列表显示简短的主机与端口，例如 `127.0.0.1:3000`。这是登记的访问地址，不是扫描得出的监听地址；没有配置地址的服务不显示该项。

## 安装

以下命令必须在 **DSH 引擎实际运行的 Ubuntu / Linux 环境**执行。独立的 Termux SSH 会话不等于 App 内 Ubuntu；需要先进入对应环境。当前支持 Linux，包括 Android PRoot；不支持 Windows、iOS 或鸿蒙本机 Node。

把这个目录复制到以下位置，并保持目录存在：

```sh
P="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-services"
# 先把本插件完整源码放到 "$P"，再执行：
node "$P/bin/dsh-svc.mjs" --help
dsh plugin --profile web add "$P"
```

安装或从原生版升级后重启一次引擎，重新打开插件页签。后续前端更新沿用 DSH 的客户端模块热重载；未启用文件监听时需重新加载视图，后端或入口声明变化需重载插件或重启引擎。命令不要求全局安装 `dsh-svc`，下文使用完整入口路径。

## 让 AI 管理服务

打开「服务管理」，点击插件内容区右上角齿轮，再点击「复制提示词」，把提示词加入客户端自定义提示词。点按「显示提示词／收起提示词」可在当前设置页展开或收起内容。按钮会生成带当前插件绝对路径的命令。也可参考 [提示词模板](AGENT-PROMPT.md)。插件不会自动修改客户端提示词。

例如，让 AI 在项目目录创建服务后执行：

```sh
node "$P/bin/dsh-svc.mjs" start demo \
  --cwd /root/workspace/demo \
  --url http://127.0.0.1:8080 \
  --autostart -- node server.js
```

`start ... -- 程序 参数` 一步保存配置并启动。最后的 `--` 后是原样传给程序的参数，不经 shell。程序必须在前台运行：可以用 `node server.js`、`python3 -m http.server 8080`、`npm run dev -- --host 127.0.0.1`；不要附加 `&`、`nohup` 或后台化参数。程序自身使用 shell 的行为仍由该程序决定。

已有服务可直接按名字操作：

```sh
node "$P/bin/dsh-svc.mjs" list
node "$P/bin/dsh-svc.mjs" stop demo
node "$P/bin/dsh-svc.mjs" start demo
node "$P/bin/dsh-svc.mjs" restart demo
node "$P/bin/dsh-svc.mjs" logs demo --follow
node "$P/bin/dsh-svc.mjs" autostart demo off
node "$P/bin/dsh-svc.mjs" stop demo
node "$P/bin/dsh-svc.mjs" remove demo
```

只保存不启动用 `register NAME --cwd DIR [--url URL] [--autostart] -- PROGRAM ARGS`。修改配置须先停止，再执行 `register` 或完整的 `start` 命令。重复启动同一服务不会重复创建进程；运行中修改命令会报错。除了日志和帮助外，CLI 输出 JSON；失败退出码为 1，并带 `code` 与 `message`。超时或断线后用 `list` 核对实际状态。

## 自启和生命周期

这里的 Ubuntu 是 PRoot 用户态，App 启动引擎时没有启动 systemd。`systemctl enable` 不会接入本插件。使用服务自身的前台命令和插件的自启开关即可。

- 隐藏面板、切换对话、关闭终端：服务继续运行。
- 关闭自启：只改变下次加载行为，不停止当前进程。
- 手动停止：当前进程停止，自启选项不变。
- 正常卸载／关闭插件或停止引擎：插件停止自己管理的服务。
- 下次引擎启动并加载插件：恢复已开启自启的服务。登记或恢复失败会显示错误，不会伪装成运行中。
- 服务自行退出后保留退出状态；这一版不做崩溃重启、不读取 systemd `.service` 文件、不接管现有进程。

**这不是 Android 开机自启。** 引擎未运行时插件不能提供服务。Android 杀死整个 App / PRoot 后也不能保证后台常驻。进程组收尾已在 Linux 本地与 Android PRoot 真机测试；主动脱离进程组的守护程序不在支持范围内。

HTTP 检测只接受无 URL 用户名／密码的 `localhost`、`127.0.0.1` 或 `[::1]` 地址，超时 600 ms，200–399 表示就绪，不跟随重定向，也不会自动发现服务地址。不使用 HTTP 的服务仍显示真实进程状态。地址由用户或 AI 指定；检测成功只表示该地址可响应，不能证明响应者必然是这个进程。

## 数据和范围

- 配置：`${DSH_HOME:-$HOME/.dsh}/dsh-go/services/services.json`；最多 50 个服务。
- 日志：同目录下 `logs/NAME.log` 和一个轮转文件 `.log.1`，每个最多 1 MiB。移除服务会删除其记录与这两份日志。
- 面板显示最新约 2000 个字符；CLI 默认读最新 8000 字节，`--bytes` 可选 1–32000，`--follow` 每秒刷新一次最新片段。
- 所有对话共用当前主机的服务列表；`--session ID` 只保存来源标记，不限制其他对话管理。
- CLI 通过权限为 `0600` 的本地 Unix socket 调用当前插件，不额外开放 TCP 管理端口。
- 服务继承引擎环境，以引擎相同用户运行；不提供权限隔离。命令参数、目录和 URL 会持久保存，日志保存程序输出；不要把密钥写入参数、URL 或日志，用服务自己的私有配置文件。
- `DSH_SVC_HOME` 可指定服务数据目录；插件和 CLI 须使用相同值。独立 Termux 的服务、系统服务与防火墙不在管理范围内。

卸载：`dsh plugin --profile web remove local-services`。保留服务数据，以便以后重新安装；如需删除，先移除停止的服务，再删除插件目录。

## 开发验证

在仓库根目录、Linux Node.js 22.19+ 中运行：

```sh
node --test examples/plugins/local-services/test/*.test.js
node --check examples/plugins/local-services/lib/client.js
```

测试会创建临时目录和真实子进程，包括 HTTP、进程组停止、管理器崩溃清理、自启恢复、日志轮转、CLI / RPC、Web 路由权限和批量操作。进程管理已在 Android 15 / arm64 的 PRoot 上验证。Web 页面也用浏览器检查了布局、启停、自启、日志、提示词及批量操作；平板实际显示仍需真机检查。

Web 入口注册到 `sidebar.right.pane.tab`，复用宿主现有的 Web 插件加载方式。所有数据和操作走同源 `/local-services/v1/`，由引擎的 `connection.requestRejection()` 核验访问权限，不额外开放端口。前端不能登记任意命令；登记仍使用已有的本地 CLI。不同视图分别保留自己的列表、详情和设置页面，服务配置仍由主机统一保存。

自启状态在服务列表显示，在对应服务详情中修改。配置立即保存，不会立刻启动或停止当前服务；提示词设置不包含服务配置。
