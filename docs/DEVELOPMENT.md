# 开发指南

本文档介绍如何在本地开发和调试 VCP New Chat。

## 环境要求

### 必需
- **Node.js**: 18.x 或更高版本
- **Rust**: 最新稳定版
- **npm**: 8.x 或更高版本

### 桌面端开发
- **Windows**: Windows 10 1809+ 或 Windows 11
- **Linux**: 支持 GTK 3.24+ 的发行版
- **macOS**: macOS 10.15+

### 移动端开发（可选）
- **Android Studio**: 最新版本
- **Android SDK**: API 24+
- **Android NDK**: 最新版本

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/huppugo1/VCPChat.git
cd VCPChat
```

### 2. 安装依赖

```bash
npm install
```

### 3. 开发模式运行

```bash
# 启动开发服务器
npm run dev

# 在另一个终端启动 Tauri
npm run tauri dev
```

## 项目结构

```
VCPChat/
├── .github/
│   └── workflows/          # GitHub Actions 配置
│       ├── release.yml     # 桌面端自动发布
│       └── android-release.yml  # Android 自动发布
├── AppData/                # 应用数据目录
├── assets/                 # 静态资源
├── docs/                   # 文档
├── modules/                # 功能模块
├── scripts/                # 构建脚本
├── src-tauri/              # Tauri 后端
│   ├── src/               # Rust 源码
│   ├── icons/             # 应用图标
│   ├── Cargo.toml         # Rust 依赖
│   ├── tauri.conf.json    # 桌面端配置
│   ├── tauri.conf.mobile.json  # 移动端配置
│   └── gen/               # 生成的文件
│       └── android/       # Android 项目（需初始化）
├── styles/                 # 样式文件
├── utils/                  # 工具函数
├── vendor/                 # 第三方库
├── index.html              # 桌面端入口
├── index-mobile.html       # 移动端入口
├── renderer.js             # 桌面端主脚本
├── renderer-mobile.js      # 移动端主脚本
├── style.css               # 桌面端样式
├── style-mobile.css        # 移动端样式
├── package.json            # Node.js 依赖
└── vite.config.js          # Vite 配置
```

## 开发工作流

### 桌面端开发

#### 启动开发服务器
```bash
npm run dev
```

这会启动 Vite 开发服务器在 `http://localhost:1421`

#### 启动 Tauri 开发模式
```bash
npm run tauri dev
```

这会：
1. 编译 Rust 代码
2. 启动应用窗口
3. 启用热重载（前端修改自动刷新）

#### 调试

**前端调试：**
- 在 Tauri 窗口中按 `F12` 打开开发者工具
- 或在 `tauri.conf.json` 中设置 `"devtools": true`

**后端调试：**
```bash
# 查看 Rust 日志
RUST_LOG=debug npm run tauri dev
```

### 移动端开发

#### 初始化 Android 项目
```bash
npm run android:init
```

#### 启动 Android 开发模式
```bash
npm run android:dev
```

这会：
1. 构建移动端前端
2. 编译 Rust 代码为 Android
3. 在模拟器或真机上运行

#### Android 调试

**查看日志：**
```bash
adb logcat | grep -i tauri
```

**Chrome 远程调试：**
1. 在 Chrome 中访问 `chrome://inspect`
2. 选择你的设备
3. 点击 "inspect"

## 构建

### 桌面端构建

#### Windows
```bash
# 系统 WebView2 版本
npm run build:system

# 内置 WebView2 版本
npm run build:embedded

# 构建两个版本
npm run build:both
```

#### Linux/macOS
```bash
npm run build
npm run tauri build
```

### 移动端构建

```bash
# 构建 APK
npm run android:build

# 构建特定架构
npm run tauri android build -- --target aarch64
```

## 代码规范

### JavaScript/HTML/CSS

- 使用 2 空格缩进
- 使用单引号
- 文件末尾保留空行
- 使用语义化的变量名

### Rust

- 遵循 Rust 官方风格指南
- 使用 `cargo fmt` 格式化代码
- 使用 `cargo clippy` 检查代码

```bash
# 格式化
cd src-tauri
cargo fmt

# 检查
cargo clippy
```

## 常用命令

### 开发
```bash
npm run dev              # 启动前端开发服务器
npm run tauri dev        # 启动 Tauri 开发模式
npm run android:dev      # 启动 Android 开发模式
```

### 构建
```bash
npm run build            # 构建前端
npm run build:mobile     # 构建移动端前端
npm run tauri build      # 构建桌面端应用
npm run android:build    # 构建 Android APK
```

### 测试
```bash
# 前端测试（如果有）
npm test

# Rust 测试
cd src-tauri
cargo test
```

### 清理
```bash
# 清理前端构建
rm -rf dist

# 清理 Rust 构建
cd src-tauri
cargo clean

# 清理 Android 构建
cd src-tauri/gen/android
./gradlew clean
```

## 添加新功能

### 1. 前端功能

1. 在 `modules/` 或相应目录创建新模块
2. 在 `renderer.js` 中导入和初始化
3. 添加对应的 HTML 和 CSS

### 2. 后端功能

1. 在 `src-tauri/src/` 中添加新的 Rust 模块
2. 使用 `#[tauri::command]` 标记命令函数
3. 在 `main.rs` 中注册命令

示例：
```rust
// src-tauri/src/commands.rs
#[tauri::command]
fn my_custom_command(param: String) -> Result<String, String> {
    Ok(format!("Received: {}", param))
}

// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            my_custom_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

前端调用：
```javascript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('my_custom_command', { param: 'test' });
console.log(result);
```

### 3. 移动端特定功能

在 `renderer-mobile.js` 中添加移动端专用逻辑：

```javascript
// 检测平台
import { platform } from '@tauri-apps/plugin-os';

const currentPlatform = await platform();
if (currentPlatform === 'android') {
    // Android 特定代码
}
```

## 性能优化

### 前端优化

1. **代码分割**：使用动态 import
2. **资源压缩**：Vite 自动处理
3. **懒加载**：延迟加载非关键资源

### 后端优化

1. **异步操作**：使用 `async/await`
2. **避免阻塞**：耗时操作放在后台线程
3. **缓存**：缓存频繁访问的数据

### 移动端优化

1. **触摸优化**：增大触摸目标（最小 44x44px）
2. **滚动优化**：使用 `-webkit-overflow-scrolling: touch`
3. **图片优化**：使用适当的分辨率和格式

## 调试技巧

### 前端调试

```javascript
// 使用 console
console.log('Debug info:', data);
console.error('Error:', error);

// 使用 debugger
debugger; // 代码会在此处暂停
```

### 后端调试

```rust
// 使用 println!
println!("Debug: {:?}", data);

// 使用 dbg! 宏
dbg!(&variable);

// 使用日志
use log::{info, warn, error};
info!("Info message");
warn!("Warning message");
error!("Error message");
```

### 网络调试

在开发者工具的 Network 标签查看网络请求。

## 常见问题

### Q: 开发模式启动失败
A: 检查端口 1421 是否被占用，或修改 `vite.config.js` 中的端口

### Q: Rust 编译错误
A: 运行 `cargo clean` 清理后重新编译

### Q: 前端修改不生效
A: 检查是否启用了热重载，或手动刷新窗口

### Q: Android 构建失败
A: 确保已安装 Android SDK 和 NDK，并设置环境变量

## 贡献代码

请参考 [贡献指南](../CONTRIBUTING.md)

## 相关资源

- [Tauri 官方文档](https://tauri.app/)
- [Vite 文档](https://vitejs.dev/)
- [Rust 文档](https://doc.rust-lang.org/)
- [Android 开发文档](https://developer.android.com/)
