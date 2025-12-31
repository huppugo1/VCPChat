VCPEverything 插件使用说明
1. 插件概述
VCPEverything 是一款为 VCP (Variable & Command Protocol) 系统设计的强大本地文件检索引擎。它通过与著名的 Windows 极速搜索工具 Everything 进行联动，赋予 AI Agent 洞察和访问本地文件系统的超能力。

本插件采用目前最稳定、最高效的官方推荐方式——直接与 Everything 的内置 HTTP 服务器进行通信，以获得毫秒级的搜索响应和精准的搜索结果。

2. 核心依赖与先决条件
为了让本插件正常工作，您必须在运行 VCP 服务器的 Windows 电脑上完成以下准备工作：

安装 Everything: 您需要预先下载并安装 Everything 的主程序。

启用 HTTP 服务器: 这是本插件工作的绝对核心，您必须手动开启 Everything 的这项功能。

3. 关键步骤：开启 Everything 的 HTTP 服务器
这是使用本插件前唯一需要您手动配置的步骤。请严格按照以下流程操作：

打开 Everything 程序：启动您电脑上的 Everything。

进入选项菜单：点击顶部菜单栏的“工具(T)”，然后选择“选项(O)”。

定位到HTTP服务器设置：在弹出的选项窗口中，从左侧的列表中找到并点击“HTTP服务器”。

启用服务：在窗口右侧，将“启用HTTP服务器”前面的复选框勾选上。

确认端口：请确保“监听端口”的设置与您在插件 .env 文件中配置的 EVERYTHING_PORT 一致。通常情况下，保持默认的 80 端口即可。

保存设置：点击窗口下方的“确定”按钮。

完成以上步骤后，Everything 就已经准备好接收来自 VCP 插件的搜索指令了。

4. 插件配置
本插件的配置非常简单，您只需要在插件目录下的 .env 文件（如果存在的话）中关注一个参数：

EVERYTHING_PORT: 指定 Everything HTTP 服务器正在监听的端口。此值必须与您在 Everything 选项中设置的端口号完全一致。如果此项未配置，插件将默认尝试连接 80 端口。

# Plugin/VCPEverything/.env 文件示例
EVERYTHING_PORT=80

5. 使用方法
您无需进行任何特殊操作。一旦插件安装并正确配置，您的 AI Agent（如女仆团成员）在需要搜索本地文件时，便会自动调用此插件。

例如，您可以直接下达指令：

“小爱，帮我找一下电脑里所有关于‘VCP项目规划’的文档。”

AI 将会理解您的意图，并调用 VCPEverything 插件来执行搜索，然后将结果呈报给您。

6. 故障排查
错误信息提示 ECONNREFUSED 或 Connection to Everything HTTP server refused：

首要原因：您没有按照 步骤三 的指示，在 Everything 的选项中启用“HTTP服务器”。

次要原因：您在插件 .env 文件中配置的 EVERYTHING_PORT 与 Everything 选项中实际设置的端口号不一致。请仔细检查并确保两者完全相同。

其他原因：您的防火墙或安全软件可能阻止了 VCP 服务器对 Everything 端口的本地访问。请检查相关设置。
