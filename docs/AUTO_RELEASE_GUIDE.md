# 自动发布指南

本项目使用 GitHub Actions 自动构建和发布多平台安装包。

## 支持的平台

### 桌面端（自动构建）
- **Windows**: NSIS 安装程序 + 绿色版 exe
- **Linux**: DEB 包 + AppImage
- **macOS**: DMG (Intel + Apple Silicon)

### 移动端（需要初始化）
- **Android**: APK (多架构支持)

## 快速发布流程

### 1. 桌面端发布

```bash
# 1. 确保代码已提交
git add .
git commit -m "feat: 新功能描述"
git push

# 2. 创建并推送版本标签
git tag v1.0.0
git push origin v1.0.0

# 3. GitHub Actions 会自动：
#    - 构建所有桌面平台
#    - 创建 GitHub Release
#    - 上传所有安装包
```

### 2. Android 发布

```bash
# 1. 首次需要初始化（只需一次）
npm run android:init
git add src-tauri/gen/android
git commit -m "chore: 初始化 Android 项目"
git push

# 2. 创建并推送 Android 标签
git tag v1.0.0-android
git push origin v1.0.0-android

# 3. GitHub Actions 会自动构建 APK
```

## 版本号规则

### 桌面端
- 格式：`v主版本.次版本.修订号`
- 示例：`v1.0.0`, `v1.2.3`, `v2.0.0`
- 触发：推送 `v*.*.*` 格式的标签

### Android 端
- 格式：`v主版本.次版本.修订号-android`
- 示例：`v1.0.0-android`, `v1.2.3-android`
- 触发：推送 `v*.*.*-android` 格式的标签

## 自动化流程详解

### 桌面端构建流程

1. **触发条件**：推送 `v*.*.*` 标签
2. **创建 Release**：自动创建 GitHub Release
3. **并行构建**：
   - Windows (x86_64)
   - Linux (x86_64)
   - macOS (x86_64 + ARM64)
4. **版本更新**：
   - 自动从标签提取版本号
   - 更新 `Cargo.toml`
   - 更新 `tauri.conf.json`
   - 更新窗口标题和产品名称
5. **上传产物**：
   - Windows: NSIS 安装程序 + 绿色版 exe
   - Linux: DEB + AppImage
   - macOS: DMG 文件

### Android 构建流程

1. **触发条件**：推送 `v*.*.*-android` 标签
2. **检查初始化**：验证 Android 项目已初始化
3. **构建 APK**：
   - Universal (通用版)
   - ARM64-v8a (64位 ARM)
   - ARMv7a (32位 ARM)
   - x86_64 (模拟器)
4. **上传到 Release**：自动上传所有架构的 APK

## 构建产物说明

### Windows
- `vcpnewchat_版本号_x64_portable.exe` - 绿色版（推荐）
  - 免安装，直接运行
  - 需要系统已安装 WebView2
- `VCP Chat - tauri版v版本号_版本号_x64-setup.exe` - 安装程序
  - 标准安装程序
  - 支持用户级和系统级安装

### Linux
- `vcp-new-chat_版本号_amd64.deb` - Debian/Ubuntu 包
  - 适用于 Debian、Ubuntu 等系统
  - 使用 `sudo dpkg -i` 安装
- `vcp-new-chat_版本号_amd64.AppImage` - 通用版
  - 适用于所有 Linux 发行版
  - 赋予执行权限后直接运行

### macOS
- `VCP Chat - tauri版v版本号_x64.dmg` - Intel 芯片
  - 适用于 Intel Mac
- `VCP Chat - tauri版v版本号_aarch64.dmg` - Apple Silicon
  - 适用于 M1/M2/M3 芯片

### Android
- `vcpnewchat_版本号_universal.apk` - 通用版（推荐）
  - 支持所有架构，体积较大
- `vcpnewchat_版本号_arm64-v8a.apk` - ARM64
  - 现代 Android 设备（推荐）
- `vcpnewchat_版本号_armeabi-v7a.apk` - ARM32
  - 旧设备支持
- `vcpnewchat_版本号_x86_64.apk` - x86
  - 模拟器使用

## 版本管理最佳实践

### 语义化版本

遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

示例：
```bash
# 修复 bug
git tag v1.0.1

# 新增功能
git tag v1.1.0

# 重大更新
git tag v2.0.0
```

### 预发布版本

测试版本可以使用预发布标签：

```bash
# Alpha 版本
git tag v1.0.0-alpha.1

# Beta 版本
git tag v1.0.0-beta.1

# Release Candidate
git tag v1.0.0-rc.1
```

### 同时发布桌面端和移动端

```bash
# 1. 发布桌面端
git tag v1.0.0
git push origin v1.0.0

# 2. 等待桌面端构建完成后，发布 Android
git tag v1.0.0-android
git push origin v1.0.0-android
```

## Release 说明编写

Release 会自动生成说明，包含：
- 版本号
- 下载链接
- 系统要求
- 更新内容（需要维护 CHANGELOG.md）

### 自定义 Release 说明

如果需要自定义，可以在 GitHub Release 页面手动编辑。

## 故障排查

### 构建失败

1. **检查 Actions 日志**
   - 访问 GitHub 仓库的 Actions 页面
   - 点击失败的 workflow
   - 查看详细日志

2. **常见问题**
   - 版本号格式错误
   - 依赖安装失败
   - 编译错误
   - 权限问题

### Windows 构建失败

- 检查 Cargo.toml 版本号是否正确
- 检查 PowerShell 脚本语法
- 查看 Rust 编译错误

### Linux/macOS 构建失败

- 检查依赖是否完整
- 检查 sed 命令语法
- 查看系统库版本

### Android 构建失败

- 确认已运行 `npm run android:init`
- 确认 `src-tauri/gen/android/` 已提交
- 检查 Android SDK 版本
- 查看 Gradle 构建日志

## 手动构建

如果需要本地构建：

### 桌面端
```bash
# Windows
npm run build:system

# 或内置 WebView2 版本
npm run build:embedded
```

### Android
```bash
# 开发版
npm run android:dev

# 生产版
npm run android:build
```

## 配置 GitHub Secrets

如果需要签名或其他敏感配置：

1. 访问仓库 Settings > Secrets and variables > Actions
2. 添加以下 secrets（可选）：
   - `TAURI_SIGNING_PRIVATE_KEY` - Tauri 签名密钥
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - 密钥密码
   - `ANDROID_SIGNING_KEY` - Android 签名密钥（Base64）
   - `ANDROID_KEY_ALIAS` - 密钥别名
   - `ANDROID_KEYSTORE_PASSWORD` - Keystore 密码
   - `ANDROID_KEY_PASSWORD` - 密钥密码

## 相关文档

- [Android 构建指南](./ANDROID_SETUP.md)
- [开发指南](./DEVELOPMENT.md)
- [贡献指南](../CONTRIBUTING.md)
