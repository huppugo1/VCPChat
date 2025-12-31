# 快速开始 - 自动发布系统

## 🚀 5 分钟发布新版本

### 步骤 1: 更新版本号

选择适合你系统的脚本：

```bash
# Windows CMD
scripts\update-version.bat 0.2.0

# Windows PowerShell  
.\scripts\update-version.ps1 0.2.0

# Linux/macOS
chmod +x scripts/update-version.sh
./scripts/update-version.sh 0.2.0
```

脚本会自动更新：
- ✅ `package.json`
- ✅ `src-tauri/Cargo.toml`
- ✅ `src-tauri/tauri.conf.json`
- ✅ `src-tauri/Cargo.lock`

### 步骤 2: 更新 CHANGELOG.md

编辑 `CHANGELOG.md`，将 `[未发布]` 改为新版本：

```markdown
## [0.2.0] - 2025-01-15

### 新增
- 添加了自动更新功能
- 支持插件系统

### 修复
- 修复了主题切换闪烁问题
```

### 步骤 3: 提交并打标签

```bash
# 提交更改
git add .
git commit -m "chore: release v0.2.0"

# 创建标签
git tag -a v0.2.0 -m "Release v0.2.0"

# 推送到 GitHub
git push origin main
git push origin v0.2.0
```

### 步骤 4: 等待自动构建

推送标签后：
1. 访问 `https://github.com/你的用户名/vcpnewchat-tauri/actions`
2. 查看 "Release Build" 工作流
3. 等待构建完成（约 15-30 分钟）

### 步骤 5: 验证发布

构建完成后：
1. 访问 `https://github.com/你的用户名/vcpnewchat-tauri/releases`
2. 检查新版本是否已发布
3. 验证所有平台的安装包都已上传

---

## 📦 构建产物

自动构建会生成以下文件：

### Windows
- `vcpnewchat_x.x.x_x64.exe` - 绿色版
- `vcpnewchat_x.x.x_x64_setup.exe` - 安装程序
- `vcpnewchat_x.x.x_x64.msi` - MSI 安装包

### Linux
- `vcpnewchat_x.x.x_amd64.deb` - Debian/Ubuntu
- `vcpnewchat_x.x.x_amd64.AppImage` - 通用版

### macOS
- `vcpnewchat_x.x.x_x64.dmg` - Intel 芯片
- `vcpnewchat_x.x.x_aarch64.dmg` - Apple Silicon

---

## 🔧 版本号规则

遵循语义化版本：`主版本号.次版本号.修订号`

```bash
# Bug 修复
npm version patch  # 0.1.0 -> 0.1.1

# 新功能
npm version minor  # 0.1.0 -> 0.2.0

# 重大更新
npm version major  # 0.1.0 -> 1.0.0

# 测试版本
npm version prerelease --preid=alpha  # 0.1.0 -> 0.1.1-alpha.0
```

---

## 🐛 故障排除

### 问题：构建失败

**查看日志**：
1. 访问 Actions 页面
2. 点击失败的工作流
3. 查看错误信息

**常见原因**：
- Rust 编译错误
- 依赖安装失败
- 权限问题

### 问题：标签推送失败

```bash
# 删除本地标签
git tag -d v0.2.0

# 删除远程标签
git push origin :refs/tags/v0.2.0

# 重新创建并推送
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

### 问题：版本号不一致

重新运行版本更新脚本：

```bash
# 确保所有文件版本号一致
scripts\update-version.bat 0.2.0
```

---

## 📚 更多文档

- [完整发布指南](RELEASE_GUIDE.md)
- [构建产物说明](BUILD_ARTIFACTS.md)
- [更新日志](../CHANGELOG.md)
- [README](../README.md)
