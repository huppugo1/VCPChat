@echo off
REM 版本号更新脚本 (Windows CMD)
REM 用法: update-version.bat 0.2.0

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo 错误: 请提供版本号
    echo 用法: %~nx0 ^<版本号^>
    echo 示例: %~nx0 0.2.0
    exit /b 1
)

set VERSION=%~1

echo 📦 更新版本号到 %VERSION%

REM 1. 更新 package.json
echo ✓ 更新 package.json
call npm version %VERSION% --no-git-tag-version

REM 2. 更新 Cargo.toml
echo ✓ 更新 src-tauri/Cargo.toml
if exist "src-tauri\Cargo.toml" (
    powershell -Command "(Get-Content 'src-tauri\Cargo.toml') -replace 'version = \".*\"', 'version = \"%VERSION%\"' | Set-Content 'src-tauri\Cargo.toml'"
)

REM 3. 更新 tauri.conf.json
echo ✓ 更新 src-tauri/tauri.conf.json
if exist "src-tauri\tauri.conf.json" (
    powershell -Command "$content = Get-Content 'src-tauri\tauri.conf.json' -Raw; $content = $content -replace '\"version\": \"[^\"]*\"', '\"version\": \"%VERSION%\"'; $content = $content -replace '\"productName\": \"[^\"]*\"', '\"productName\": \"VCP Chat - tauri版v%VERSION%\"'; Set-Content 'src-tauri\tauri.conf.json' $content"
)

REM 4. 更新 Cargo.lock
echo ✓ 更新 src-tauri/Cargo.lock
cd src-tauri
cargo update --workspace
cd ..

echo.
echo ✅ 版本号已更新为 %VERSION%
echo.
echo 📝 下一步操作:
echo 1. 更新 CHANGELOG.md
echo 2. 提交更改: git add . ^&^& git commit -m "chore: release v%VERSION%"
echo 3. 创建标签: git tag -a v%VERSION% -m "Release v%VERSION%"
echo 4. 推送代码: git push origin main ^&^& git push origin v%VERSION%

endlocal
