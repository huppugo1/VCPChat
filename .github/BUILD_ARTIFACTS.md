# 构建产物说明

本文档详细说明 VCP New Chat 各平台构建产物的特点和使用方法。

---

## 📦 Windows 平台

### 1. 绿色版 (推荐) ⭐⭐⭐

**文件名**: `vcpnewchat_x.x.x_x64.exe`

**特点**:
- ✅ 单文件可执行，无需安装
- ✅ 不写入注册表，不留系统痕迹
- ✅ 可放在任意目录运行
- ✅ 便于携带和备份
- ✅ 体积最小（约 5-10 MB）

**使用方法**:
1. 下载 `.exe` 文件
2. 双击运行即可
3. 首次运行会在同目录创建 `AppData` 文件夹存储数据

**适用场景**:
- 个人使用
- 便携式使用（U盘、移动硬盘）
- 不想安装软件的用户
- 需要多版本共存

**系统要求**:
- Windows 10 (1809+) 或 Windows 11
- WebView2 Runtime（通常已预装）
- Visual C++ 2015-2022 Redistributable

---

### 2. NSIS 安装程序 ⭐⭐

**文件名**: `vcpnewchat_x.x.x_x64_setup.exe`

**特点**:
- ✅ 标准安装向导
- ✅ 自动创建桌面快捷方式
- ✅ 添加到开始菜单
- ✅ 支持卸载程序
- ✅ 可选择安装路径

**使用方法**:
1. 下载 `_setup.exe` 文件
2. 双击运行安装向导
3. 按提示完成安装
4. 从开始菜单或桌面启动

**适用场景**:
- 企业部署
- 需要统一安装路径
- 希望集成到系统的用户

**安装位置**:
- 默认: `C:\Program Files\VCP New Chat`
- 数据: `%APPDATA%\com.vcp.newchat`

---

### 3. MSI 安装包 ⭐

**文件名**: `vcpnewchat_x.x.x_x64.msi`

**特点**:
- ✅ Windows Installer 标准格式
- ✅ 支持组策略部署
- ✅ 支持静默安装
- ✅ 企业级管理

**使用方法**:

**图形界面安装**:
```cmd
双击 .msi 文件，按向导操作
```

**命令行安装**:
```cmd
msiexec /i vcpnewchat_x.x.x_x64.msi /quiet
```

**命令行卸载**:
```cmd
msiexec /x vcpnewchat_x.x.x_x64.msi /quiet
```

**适用场景**:
- 企业批量部署
- 需要 GPO 部署
- 需要静默安装

---

## 🐧 Linux 平台

### 1. DEB 包 (Debian/Ubuntu) ⭐⭐⭐

**文件名**: `vcpnewchat_x.x.x_amd64.deb`

**特点**:
- ✅ Debian/Ubuntu 原生包格式
- ✅ 自动处理依赖
- ✅ 集成到系统应用菜单
- ✅ 支持 apt 管理

**使用方法**:

**图形界面安装**:
```bash
# 双击 .deb 文件，使用软件中心安装
```

**命令行安装**:
```bash
sudo dpkg -i vcpnewchat_x.x.x_amd64.deb
sudo apt-get install -f  # 修复依赖
```

**卸载**:
```bash
sudo apt remove vcpnewchat
```

**适用系统**:
- Ubuntu 20.04+
- Debian 11+
- Linux Mint 20+
- Pop!_OS 20.04+

---

### 2. AppImage (通用版) ⭐⭐⭐

**文件名**: `vcpnewchat_x.x.x_amd64.AppImage`

**特点**:
- ✅ 单文件可执行，无需安装
- ✅ 跨发行版兼容
- ✅ 不需要 root 权限
- ✅ 便于携带

**使用方法**:
```bash
# 1. 添加执行权限
chmod +x vcpnewchat_x.x.x_amd64.AppImage

# 2. 运行
./vcpnewchat_x.x.x_amd64.AppImage
```

**集成到系统**:
```bash
# 使用 AppImageLauncher（推荐）
sudo apt install appimagelauncher
# 双击 AppImage 文件，选择"集成并运行"
```

**适用系统**:
- 所有主流 Linux 发行版
- 需要 FUSE 支持

---

### 3. RPM 包 (Fedora/RHEL) ⭐⭐

**文件名**: `vcpnewchat_x.x.x_x86_64.rpm`

**特点**:
- ✅ Red Hat 系发行版原生格式
- ✅ 自动处理依赖
- ✅ 集成到系统

**使用方法**:

**Fedora**:
```bash
sudo dnf install vcpnewchat_x.x.x_x86_64.rpm
```

**RHEL/CentOS**:
```bash
sudo yum install vcpnewchat_x.x.x_x86_64.rpm
```

**卸载**:
```bash
sudo dnf remove vcpnewchat
```

**适用系统**:
- Fedora 36+
- RHEL 8+
- CentOS Stream 8+
- Rocky Linux 8+

---

## 🍎 macOS 平台

### 1. DMG 磁盘镜像 (Intel) ⭐⭐⭐

**文件名**: `vcpnewchat_x.x.x_x64.dmg`

**特点**:
- ✅ macOS 标准分发格式
- ✅ 拖拽安装
- ✅ 支持 Intel 芯片

**使用方法**:
1. 下载 `.dmg` 文件
2. 双击打开磁盘镜像
3. 将应用拖拽到 `Applications` 文件夹
4. 从启动台或应用程序文件夹启动

**首次运行**:
```bash
# 如果提示"无法打开，因为来自身份不明的开发者"
# 右键点击应用 -> 打开 -> 确认打开
```

**适用系统**:
- macOS 10.15 (Catalina) 或更高
- Intel 芯片 Mac

---

### 2. DMG 磁盘镜像 (Apple Silicon) ⭐⭐⭐

**文件名**: `vcpnewchat_x.x.x_aarch64.dmg`

**特点**:
- ✅ 原生支持 Apple Silicon
- ✅ 性能最优
- ✅ 能效更好

**使用方法**:
同 Intel 版本

**适用系统**:
- macOS 11.0 (Big Sur) 或更高
- Apple Silicon (M1/M2/M3) Mac

---

### 3. Universal Binary (通用版) ⭐⭐

**文件名**: `vcpnewchat_x.x.x_universal.dmg`

**特点**:
- ✅ 同时支持 Intel 和 Apple Silicon
- ✅ 一个文件适配所有 Mac
- ❌ 体积较大（约为单架构的 2 倍）

**使用方法**:
同上

**适用场景**:
- 不确定 Mac 芯片类型
- 需要在多台不同架构 Mac 上使用

---

## 🔐 文件校验

每个 Release 都包含 SHA256 校验和，用于验证文件完整性。

### Windows (PowerShell)

```powershell
Get-FileHash vcpnewchat_x.x.x_x64.exe -Algorithm SHA256
```

### Linux/macOS

```bash
shasum -a 256 vcpnewchat_x.x.x_amd64.deb
```

### 验证方法

1. 在 Release 页面找到 `checksums.txt`
2. 计算下载文件的校验和
3. 对比两者是否一致

---

## 📊 构建产物对比

| 平台 | 格式 | 体积 | 安装 | 便携 | 推荐度 |
|------|------|------|------|------|--------|
| Windows | EXE (绿色版) | 小 | 无需 | ✅ | ⭐⭐⭐ |
| Windows | NSIS Setup | 中 | 需要 | ❌ | ⭐⭐ |
| Windows | MSI | 中 | 需要 | ❌ | ⭐ |
| Linux | AppImage | 中 | 无需 | ✅ | ⭐⭐⭐ |
| Linux | DEB | 小 | 需要 | ❌ | ⭐⭐⭐ |
| Linux | RPM | 小 | 需要 | ❌ | ⭐⭐ |
| macOS | DMG (Intel) | 中 | 拖拽 | ✅ | ⭐⭐⭐ |
| macOS | DMG (ARM) | 中 | 拖拽 | ✅ | ⭐⭐⭐ |
| macOS | DMG (Universal) | 大 | 拖拽 | ✅ | ⭐⭐ |

---

## 🐛 常见问题

### Windows: "Windows 已保护你的电脑"

**原因**: 应用未签名

**解决方案**:
1. 点击"更多信息"
2. 点击"仍要运行"

### macOS: "无法打开，因为来自身份不明的开发者"

**解决方案**:
```bash
# 方法 1: 右键打开
右键点击应用 -> 打开 -> 确认打开

# 方法 2: 命令行
xattr -cr /Applications/VCP\ New\ Chat.app
```

### Linux: AppImage 无法运行

**解决方案**:
```bash
# 安装 FUSE
sudo apt install fuse libfuse2  # Debian/Ubuntu
sudo dnf install fuse fuse-libs  # Fedora

# 添加执行权限
chmod +x vcpnewchat_x.x.x_amd64.AppImage
```

---

## 📝 更新说明

### 自动更新（规划中）

未来版本将支持应用内自动更新：
- 自动检测新版本
- 后台下载更新
- 一键安装更新

### 手动更新

当前版本需要手动更新：
1. 下载新版本
2. 备份 `AppData` 目录（如需要）
3. 安装/替换新版本
4. 数据会自动迁移

---

## 🔗 相关链接

- [下载最新版本](https://github.com/yourusername/vcpnewchat-tauri/releases/latest)
- [查看所有版本](https://github.com/yourusername/vcpnewchat-tauri/releases)
- [报告问题](https://github.com/yourusername/vcpnewchat-tauri/issues)
