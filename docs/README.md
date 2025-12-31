# VCP New Chat 文档

欢迎查阅 VCP New Chat 的技术文档。

## 📚 文档目录

### 快速开始
- [开发指南](./DEVELOPMENT.md) - 本地开发环境搭建和开发流程
- [自动发布指南](./AUTO_RELEASE_GUIDE.md) - 使用 GitHub Actions 自动构建和发布

### 平台特定
- [Android 构建指南](./ANDROID_SETUP.md) - Android 移动端开发和构建

### 其他
- [贡献指南](../CONTRIBUTING.md) - 如何为项目贡献代码
- [更新日志](../CHANGELOG.md) - 版本更新记录

## 🚀 快速链接

### 我想...

#### 开始开发
👉 查看 [开发指南](./DEVELOPMENT.md)

```bash
git clone https://github.com/huppugo1/VCPChat.git
cd VCPChat
npm install
npm run dev
```

#### 发布新版本
👉 查看 [自动发布指南](./AUTO_RELEASE_GUIDE.md)

```bash
git tag v1.0.0
git push origin v1.0.0
```

#### 构建 Android 版本
👉 查看 [Android 构建指南](./ANDROID_SETUP.md)

```bash
npm run android:init
npm run android:build
```

#### 了解项目架构
👉 查看 [开发指南 - 项目结构](./DEVELOPMENT.md#项目结构)

#### 添加新功能
👉 查看 [开发指南 - 添加新功能](./DEVELOPMENT.md#添加新功能)

#### 解决构建问题
👉 查看 [自动发布指南 - 故障排查](./AUTO_RELEASE_GUIDE.md#故障排查)

## 🏗️ 技术栈

### 前端
- **框架**: Vanilla JavaScript (无框架)
- **构建工具**: Vite
- **UI**: 原生 HTML/CSS

### 后端
- **框架**: Tauri 2.0
- **语言**: Rust
- **跨平台**: Windows, Linux, macOS, Android

### 开发工具
- **版本控制**: Git
- **CI/CD**: GitHub Actions
- **包管理**: npm

## 📦 支持的平台

### 桌面端
- ✅ Windows 10/11 (x64)
- ✅ Linux (x64, GTK 3.24+)
- ✅ macOS 10.15+ (Intel + Apple Silicon)

### 移动端
- ✅ Android 7.0+ (API 24+)
- 🚧 iOS (计划中)

## 🔧 开发环境

### 必需
- Node.js 18+
- Rust (最新稳定版)
- npm 8+

### 可选（移动端）
- Android Studio
- Android SDK & NDK
- Java 17

## 📖 文档约定

### 代码块

```bash
# Shell 命令
npm install
```

```javascript
// JavaScript 代码
const result = await invoke('command');
```

```rust
// Rust 代码
#[tauri::command]
fn my_command() {}
```

### 提示框

**重要提示：** 关键信息

**注意：** 需要注意的事项

**提示：** 有用的建议

## 🤝 贡献

欢迎贡献！请查看 [贡献指南](../CONTRIBUTING.md)

### 贡献文档

如果发现文档有误或需要改进：

1. Fork 本仓库
2. 创建分支：`git checkout -b docs/improve-xxx`
3. 修改文档
4. 提交：`git commit -m "docs: 改进 xxx 文档"`
5. 推送：`git push origin docs/improve-xxx`
6. 创建 Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](../LICENSE) 文件了解详情

## 🔗 相关链接

- [GitHub 仓库](https://github.com/huppugo1/VCPChat)
- [问题反馈](https://github.com/huppugo1/VCPChat/issues)
- [讨论区](https://github.com/huppugo1/VCPChat/discussions)
- [Releases](https://github.com/huppugo1/VCPChat/releases)

## 📮 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 [Issue](https://github.com/huppugo1/VCPChat/issues)
- 参与 [Discussions](https://github.com/huppugo1/VCPChat/discussions)

---

最后更新：2024年
