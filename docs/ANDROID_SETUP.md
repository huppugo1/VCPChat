# Android 版本构建指南

## 概述

本项目支持为 Android 构建**独立的移动端界面**，与桌面版使用不同的 HTML/CSS/JS 文件。

**文件结构：**
- 桌面版：`index.html` + `style.css` + `renderer.js`
- 移动版：`index-mobile.html` + `style-mobile.css` + `renderer-mobile.js`

## 快速开始

```bash
# 1. 初始化 Android 项目（首次运行）
npm run android:init

# 2. 提交生成的 Android 项目文件到仓库
git add src-tauri/gen/android
git commit -m "chore: 初始化 Android 项目"
git push

# 3. 开发调试
npm run android:dev

# 4. 构建 APK
npm run android:build

# 5. 推送 Android 标签触发自动构建
git tag v0.1.0-android
git push origin v0.1.0-android
```

**重要提示：**
- Android 项目需要先在本地初始化（`npm run android:init`）
- 生成的 `src-tauri/gen/android/` 目录需要提交到仓库
- GitHub Actions 使用 `-android` 后缀的标签触发（例如 `v0.1.0-android`）

## 1. 环境准备

### 安装依赖
```bash
# 安装 Android Studio
# 下载地址: https://developer.android.com/studio

# 配置环境变量（Windows）
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx NDK_HOME "%LOCALAPPDATA%\Android\Sdk\ndk\<version>"

# 或者在 Linux/macOS
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/<version>
```

### 安装 Rust Android 目标
```bash
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add i686-linux-android
rustup target add x86_64-linux-android
```

## 2. 初始化 Android 项目

```bash
# 初始化 Android 平台
npm run tauri android init

# 这会创建以下目录结构：
# src-tauri/gen/android/
```

## 3. 前端适配

### 响应式布局
在你的 CSS 中添加移动端适配：

```css
/* 移动端适配 */
@media (max-width: 768px) {
  /* 调整布局 */
  .container {
    padding: 10px;
  }
  
  /* 增大触摸目标 */
  button {
    min-height: 44px;
    min-width: 44px;
  }
  
  /* 隐藏桌面端特有元素 */
  .desktop-only {
    display: none;
  }
}
```

### 检测平台
在 JavaScript 中检测平台：

```javascript
import { platform } from '@tauri-apps/plugin-os';

const currentPlatform = await platform();
if (currentPlatform === 'android') {
  // Android 特定逻辑
}
```

## 4. 配置 Android 权限

编辑 `src-tauri/gen/android/app/src/main/AndroidManifest.xml`：

```xml
<manifest>
  <!-- 网络权限 -->
  <uses-permission android:name="android.permission.INTERNET" />
  
  <!-- 存储权限（如果需要） -->
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
  
  <!-- 其他权限根据需要添加 -->
</manifest>
```

## 5. 构建 APK

```bash
# 开发版本（调试）
npm run tauri android dev

# 生产版本
npm run tauri android build

# 指定架构
npm run tauri android build -- --target aarch64
```

构建产物位置：
- `src-tauri/gen/android/app/build/outputs/apk/universal/release/` - 通用版
- `src-tauri/gen/android/app/build/outputs/apk/arm64-v8a/release/` - ARM64
- `src-tauri/gen/android/app/build/outputs/apk/armeabi-v7a/release/` - ARM32

## 6. 签名 APK（发布用）

### 生成签名密钥
```bash
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### 配置签名
在 `src-tauri/gen/android/app/build.gradle.kts` 中添加：

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("path/to/my-release-key.keystore")
            storePassword = "your-store-password"
            keyAlias = "my-key-alias"
            keyPassword = "your-key-password"
        }
    }
    
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

## 7. 测试

```bash
# 在模拟器或真机上运行
npm run tauri android dev

# 或者安装 APK
adb install src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

## 8. 前端调整建议

### 必须调整的部分：
1. **窗口控制栏** - Android 不需要自定义标题栏（`decorations: false` 在移动端无效）
2. **导航方式** - 考虑使用底部导航或汉堡菜单
3. **输入框** - 适配虚拟键盘
4. **滚动区域** - 确保触摸滚动流畅

### 可选优化：
1. 使用 PWA 风格的移动端 UI 框架
2. 添加下拉刷新
3. 优化图片加载
4. 添加离线支持

## 9. GitHub Actions 自动构建

已创建 `.github/workflows/android-release.yml`，推送标签时会自动构建。

需要在 GitHub Secrets 中配置（如果需要签名）：
- `ANDROID_SIGNING_KEY` - Base64 编码的 keystore 文件
- `ANDROID_KEY_ALIAS` - 密钥别名
- `ANDROID_KEYSTORE_PASSWORD` - Keystore 密码
- `ANDROID_KEY_PASSWORD` - 密钥密码

## 常见问题

### Q: 构建失败，提示找不到 Android SDK
A: 确保设置了 `ANDROID_HOME` 环境变量

### Q: 前端在手机上显示异常
A: 使用 Chrome DevTools 的移动端模拟器测试，或使用 `adb logcat` 查看日志

### Q: APK 体积太大
A: 使用架构特定的构建（aarch64、armeabi-v7a）而不是通用版

### Q: 需要访问原生功能
A: 使用 Tauri 插件或编写自定义 Kotlin/Java 代码
