# 发布指南

本文档说明如何发布新版本的 VCP New Chat。

## 📋 发布前检查清单

### 1. 代码准备

- [ ] 所有功能已完成并测试
- [ ] 所有测试通过
- [ ] 代码已合并到 `main` 分支
- [ ] 无未解决的严重 Bug

### 2. 文档更新

- [ ] 更新 `CHANGELOG.md`
- [ ] 更新 `README.md`（如有新功能）
- [ ] 更新 `开发进度.md`
- [ ] 检查所有文档链接有效

### 3. 版本号更新

- [ ] 确定新版本号（遵循语义化版本）
- [ ] 更新 `package.json` 中的版本号
- [ ] 更新 `src-tauri/Cargo.toml` 中的版本号
- [ ] 更新 `src-tauri/tauri.conf.json` 中的版本号

### 4. 配置检查

- [ ] 关闭开发者工具（`devtools: false`）
- [ ] 移除调试代码和 console.log
- [ ] 检查生产环境配置

---

## 🚀 发布流程

### 方式一：自动发布（推荐）

#### 步骤 1：更新版本号

```bash
# 1. 确保在 main 分支
git checkout main
git pull origin main

# 2. 更新版本号（选择其一）
npm version patch  # 0.1.0 -> 0.1.1 (Bug 修复)
npm version minor  # 0.1.0 -> 0.2.0 (新功能)
npm version major  # 0.1.0 -> 1.0.0 (重大更新)

# 3. 手动更新其他文件中的版本号
# - src-tauri/Cargo.toml
# - src-tauri/tauri.conf.json
```

#### 步骤 2：更新 CHANGELOG

编辑 `CHANGELOG.md`，将 `[未发布]` 部分改为新版本：

```markdown
## [0.2.0] - 2025-01-15

### 新增
- 添加了自动更新功能
- 支持插件系统

### 修复
- 修复了主题切换闪烁问题
```

#### 步骤 3：提交并打标签

```bash
# 1. 提交版本更新
git add .
git commit -m "chore: release v0.2.0"

# 2. 创建标签
git tag -a v0.2.0 -m "Release v0.2.0"

# 3. 推送到远程
git push origin main
git push origin v0.2.0
```

#### 步骤 4：等待自动构建

推送标签后，GitHub Actions 会自动：
1. 创建 Release
2. 构建所有平台的安装包
3. 上传构建产物
4. 生成校验和

查看构建进度：`https://github.com/你的用户名/vcpnewchat-tauri/actions`

---

### 方式二：手动发布

如果自动发布失败，可以手动构建和发布。

#### 步骤 1：本地构建

```bash
# Windows
npm run tauri build

# Linux
npm run tauri build -- --target x86_64-unknown-linux-gnu

# macOS (Intel)
npm run tauri build -- --target x86_64-apple-darwin

# macOS (Apple Silicon)
npm run tauri build -- --target aarch64-apple-darwin
```

#### 步骤 2：生成校验和

```bash
# Windows (PowerShell)
cd src-tauri/target/release/bundle
Get-ChildItem -Recurse -Include *.exe,*.msi | Get-FileHash -Algorithm SHA256 | Format-List

# Linux/macOS
cd src-tauri/target/release/bundle
find . -type f \( -name "*.deb" -o -name "*.AppImage" -o -name "*.dmg" \) -exec shasum -a 256 {} \;
```

#### 步骤 3：创建 Release

1. 访问 `https://github.com/你的用户名/vcpnewchat-tauri/releases/new`
2. 选择标签：`v0.2.0`
3. 填写标题：`VCP New Chat v0.2.0`
4. 填写说明（参考 CHANGELOG.md）
5. 上传构建产物
6. 发布 Release

---

## 📦 构建产物说明

### Windows

| 文件 | 说明 | 推荐 |
|------|------|------|
| `vcpnewchat_x.x.x_x64.exe` | 绿色版，单文件可执行 | ⭐⭐⭐ |
| `vcpnewchat_x.x.x_x64_setup.exe` | NSIS 安装程序 | ⭐⭐ |
| `vcpnewchat_x.x.x_x64.msi` | MSI 安装包 | ⭐ |

### Linux

| 文件 | 说明 | 推荐 |
|------|------|------|
| `vcpnewchat_x.x.x_amd64.deb` | Debian/Ubuntu 包 | ⭐⭐⭐ |
| `vcpnewchat_x.x.x_amd64.AppImage` | 通用版，无需安装 | ⭐⭐⭐ |
| `vcpnewchat_x.x.x_amd64.rpm` | Fedora/RHEL 包 | ⭐⭐ |

### macOS

| 文件 | 说明 | 推荐 |
|------|------|------|
| `vcpnewchat_x.x.x_x64.dmg` | Intel 芯片 | ⭐⭐⭐ |
| `vcpnewchat_x.x.x_aarch64.dmg` | Apple Silicon | ⭐⭐⭐ |
| `vcpnewchat_x.x.x_universal.dmg` | 通用版（体积较大） | ⭐⭐ |

---

## 🔧 版本号管理

### 语义化版本规则

```
主版本号.次版本号.修订号

例如：1.2.3
```

**何时增加版本号**：

| 版本类型 | 何时增加 | 示例 |
|---------|---------|------|
| **主版本号** | 不兼容的 API 修改 | 1.0.0 -> 2.0.0 |
| **次版本号** | 向下兼容的功能新增 | 1.0.0 -> 1.1.0 |
| **修订号** | 向下兼容的 Bug 修复 | 1.0.0 -> 1.0.1 |

**先行版本**：

```
1.0.0-alpha.1   # Alpha 测试版
1.0.0-beta.1    # Beta 测试版
1.0.0-rc.1      # Release Candidate
```

### 版本号同步

确保以下文件中的版本号一致：

1. `package.json`
   ```json
   {
     "version": "0.2.0"
   }
   ```

2. `src-tauri/Cargo.toml`
   ```toml
   [package]
   version = "0.2.0"
   ```

3. `src-tauri/tauri.conf.json`
   ```json
   {
     "version": "0.2.0",
     "productName": "VCP Chat - tauri版v0.2.0"
   }
   ```

---

## 🐛 故障排除

### 问题：GitHub Actions 构建失败

**解决方案**：

1. 查看 Actions 日志：`https://github.com/你的用户名/vcpnewchat-tauri/actions`
2. 检查常见问题：
   - Rust 工具链版本
   - 依赖安装失败
   - 权限问题

### 问题：构建产物缺失

**解决方案**：

1. 检查 `tauri.conf.json` 中的 `bundle` 配置
2. 确认目标平台支持
3. 查看构建日志

### 问题：版本号不一致

**解决方案**：

使用脚本统一更新：

```bash
# update-version.sh
#!/bin/bash
VERSION=$1

# 更新 package.json
npm version $VERSION --no-git-tag-version

# 更新 Cargo.toml
sed -i "s/^version = .*/version = \"$VERSION\"/" src-tauri/Cargo.toml

# 更新 tauri.conf.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json

echo "版本号已更新为 $VERSION"
```

使用方式：
```bash
chmod +x update-version.sh
./update-version.sh 0.2.0
```

---

## 📝 发布后任务

- [ ] 验证 Release 页面信息正确
- [ ] 测试下载链接可用
- [ ] 在不同平台测试安装包
- [ ] 更新项目主页（如有）
- [ ] 发布更新公告
- [ ] 通知用户更新

---

## 🔗 相关链接

- [GitHub Releases](https://github.com/你的用户名/vcpnewchat-tauri/releases)
- [GitHub Actions](https://github.com/你的用户名/vcpnewchat-tauri/actions)
- [语义化版本规范](https://semver.org/lang/zh-CN/)
- [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)
