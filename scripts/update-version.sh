#!/bin/bash

# 版本号更新脚本
# 用法: ./update-version.sh 0.2.0

set -e

if [ -z "$1" ]; then
    echo "错误: 请提供版本号"
    echo "用法: $0 <版本号>"
    echo "示例: $0 0.2.0"
    exit 1
fi

VERSION=$1

# 验证版本号格式
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "错误: 版本号格式不正确"
    echo "正确格式: x.y.z 或 x.y.z-alpha.1"
    exit 1
fi

echo "📦 更新版本号到 $VERSION"

# 1. 更新 package.json
echo "✓ 更新 package.json"
npm version $VERSION --no-git-tag-version

# 2. 更新 Cargo.toml
echo "✓ 更新 src-tauri/Cargo.toml"
if [ -f "src-tauri/Cargo.toml" ]; then
    sed -i.bak "s/^version = .*/version = \"$VERSION\"/" src-tauri/Cargo.toml
    rm src-tauri/Cargo.toml.bak
fi

# 3. 更新 tauri.conf.json
echo "✓ 更新 src-tauri/tauri.conf.json"
if [ -f "src-tauri/tauri.conf.json" ]; then
    sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json
    sed -i.bak "s/\"productName\": \"[^\"]*\"/\"productName\": \"VCP Chat - tauri版v$VERSION\"/" src-tauri/tauri.conf.json
    rm src-tauri/tauri.conf.json.bak
fi

# 4. 更新 Cargo.lock
echo "✓ 更新 src-tauri/Cargo.lock"
cd src-tauri
cargo update --workspace
cd ..

echo ""
echo "✅ 版本号已更新为 $VERSION"
echo ""
echo "📝 下一步操作:"
echo "1. 更新 CHANGELOG.md"
echo "2. 提交更改: git add . && git commit -m \"chore: release v$VERSION\""
echo "3. 创建标签: git tag -a v$VERSION -m \"Release v$VERSION\""
echo "4. 推送代码: git push origin main && git push origin v$VERSION"
