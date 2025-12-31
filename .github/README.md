# GitHub 配置文档

本目录包含 VCP New Chat 项目的 GitHub 相关配置和文档。

---

## 📁 目录结构

```
.github/
├── workflows/              # GitHub Actions 工作流
│   ├── release.yml        # 自动发布工作流
│   └── build-test.yml     # 构建测试工作流
├── ACTIONS_SETUP.md       # Actions 配置详解
├── BUILD_ARTIFACTS.md     # 构建产物说明
├── QUICK_START.md         # 快速开始指南
├── RELEASE_GUIDE.md       # 完整发布指南
└── README.md              # 本文件
```

---

## 🚀 快速开始

### 发布新版本（5 分钟）

```bash
# 1. 更新版本号
scripts\update-version.bat 0.2.0

# 2. 更新 CHANGELOG.md

# 3. 提交并推送
git add .
git commit -m "chore: release v0.2.0"
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin main && git push origin v0.2.0
```

详见：[QUICK_START.md](QUICK_START.md)

---

## 📚 文档导航

### 新手入门

1. **[快速开始](QUICK_START.md)** ⭐
   - 5 分钟发布新版本
   - 版本号规则
   - 故障排除

### 详细指南

2. **[发布指南](RELEASE_GUIDE.md)**
   - 发布前检查清单
   - 自动发布流程
   - 手动发布方法
   - 版本号管理

3. **[构建产物说明](BUILD_ARTIFACTS.md)**
   - Windows 安装包说明
   - Linux 安装包说明
   - macOS 安装包说明
   - 文件校验方法

4. **[Actions 配置](ACTIONS_SETUP.md)**
   - 工作流配置
   - 权限设置
   - 性能优化
   - 故障排除

---

## 🔧 工作流说明

### Release Build

**触发条件**：推送 `v*.*.*` 标签

**功能**：
- ✅ 自动构建所有平台
- ✅ 创建 GitHub Release
- ✅ 上传构建产物
- ✅ 生成校验和

**构建平台**：
- Windows x64
- Linux x64
- macOS Intel
- macOS Apple Silicon

**查看状态**：
[![Release Build](https://github.com/你的用户名/vcpnewchat-tauri/workflows/Release%20Build/badge.svg)](https://github.com/你的用户名/vcpnewchat-tauri/actions)

---

### Build Test

**触发条件**：推送到 `main`/`develop` 或创建 PR

**功能**：
- ✅ 前端构建测试
- ✅ Rust 单元测试
- ✅ Clippy 代码检查
- ✅ 调试版本构建

**目的**：确保代码质量

**查看状态**：
[![Build Test](https://github.com/你的用户名/vcpnewchat-tauri/workflows/Build%20Test/badge.svg)](https://github.com/你的用户名/vcpnewchat-tauri/actions)

---

## 📦 构建产物

### Windows
- `vcpnewchat_x.x.x_x64.exe` - 绿色版 ⭐
- `vcpnewchat_x.x.x_x64_setup.exe` - 安装程序
- `vcpnewchat_x.x.x_x64.msi` - MSI 安装包

### Linux
- `vcpnewchat_x.x.x_amd64.deb` - Debian/Ubuntu ⭐
- `vcpnewchat_x.x.x_amd64.AppImage` - 通用版 ⭐

### macOS
- `vcpnewchat_x.x.x_x64.dmg` - Intel 芯片 ⭐
- `vcpnewchat_x.x.x_aarch64.dmg` - Apple Silicon ⭐

详见：[BUILD_ARTIFACTS.md](BUILD_ARTIFACTS.md)

---

## 🔐 安全配置

### Secrets 配置（可选）

在 `Settings` -> `Secrets and variables` -> `Actions` 中配置：

| Secret | 说明 | 必需 |
|--------|------|------|
| `TAURI_SIGNING_PRIVATE_KEY` | 代码签名私钥 | 否 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | 否 |

### 权限配置

在 `Settings` -> `Actions` -> `General` -> `Workflow permissions`：

- ✅ Read and write permissions
- ✅ Allow GitHub Actions to create and approve pull requests

详见：[ACTIONS_SETUP.md](ACTIONS_SETUP.md#初始配置)

---

## 🐛 故障排除

### 常见问题

1. **构建失败**
   - 查看 Actions 日志
   - 检查依赖安装
   - 验证配置文件

2. **标签推送失败**
   ```bash
   git tag -d v0.2.0
   git push origin :refs/tags/v0.2.0
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin v0.2.0
   ```

3. **版本号不一致**
   ```bash
   scripts\update-version.bat 0.2.0
   ```

详见：[QUICK_START.md](QUICK_START.md#故障排除)

---

## 📊 版本管理

### 语义化版本

```
主版本号.次版本号.修订号

例如：1.2.3
```

| 类型 | 何时增加 | 示例 |
|------|---------|------|
| 主版本号 | 不兼容的 API 修改 | 1.0.0 -> 2.0.0 |
| 次版本号 | 向下兼容的功能新增 | 1.0.0 -> 1.1.0 |
| 修订号 | 向下兼容的 Bug 修复 | 1.0.0 -> 1.0.1 |

### 版本更新脚本

```bash
# Windows CMD
scripts\update-version.bat 0.2.0

# Windows PowerShell
.\scripts\update-version.ps1 0.2.0

# Linux/macOS
./scripts/update-version.sh 0.2.0
```

详见：[RELEASE_GUIDE.md](RELEASE_GUIDE.md#版本号管理)

---

## 📈 监控和统计

### 构建状态徽章

在 README.md 中添加：

```markdown
[![Release](https://img.shields.io/github/v/release/你的用户名/vcpnewchat-tauri)](https://github.com/你的用户名/vcpnewchat-tauri/releases)
[![Build](https://github.com/你的用户名/vcpnewchat-tauri/workflows/Release%20Build/badge.svg)](https://github.com/你的用户名/vcpnewchat-tauri/actions)
```

### 查看统计

- [Releases](../../releases) - 所有发布版本
- [Actions](../../actions) - 构建历史
- [Insights](../../pulse) - 项目活跃度

---

## 🔗 相关链接

### 项目文档
- [README](../README.md) - 项目主文档
- [CHANGELOG](../CHANGELOG.md) - 更新日志
- [开发进度](../开发进度.md) - 开发计划

### 外部资源
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Tauri 文档](https://tauri.app/)
- [语义化版本](https://semver.org/lang/zh-CN/)

---

## 💡 最佳实践

1. **发布前测试**
   - 本地构建测试
   - 运行单元测试
   - 检查代码质量

2. **版本号规范**
   - 遵循语义化版本
   - 保持版本号一致
   - 及时更新 CHANGELOG

3. **文档维护**
   - 更新 README
   - 记录重要变更
   - 保持文档同步

4. **安全意识**
   - 保护 Secrets
   - 定期更新依赖
   - 审查代码变更

---

## 🆘 获取帮助

- 📖 查看文档：本目录下的各个 `.md` 文件
- 🐛 报告问题：[提交 Issue](../../issues)
- 💬 讨论交流：[Discussions](../../discussions)
- 📧 联系维护者：查看 [README](../README.md)

---

## 📝 贡献指南

欢迎改进文档和工作流配置！

1. Fork 项目
2. 创建分支
3. 提交更改
4. 创建 Pull Request

详见：[贡献指南](../README.md#贡献指南)

---

<div align="center">

**[⬆ 返回顶部](#github-配置文档)**

Made with ❤️ by VCP Team

</div>
