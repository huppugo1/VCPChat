# 版本号更新脚本 (Windows PowerShell)
# 用法: .\update-version.ps1 0.2.0

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# 验证版本号格式
if ($Version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$') {
    Write-Host "错误: 版本号格式不正确" -ForegroundColor Red
    Write-Host "正确格式: x.y.z 或 x.y.z-alpha.1"
    exit 1
}

Write-Host "📦 更新版本号到 $Version" -ForegroundColor Cyan

# 1. 更新 package.json
Write-Host "✓ 更新 package.json" -ForegroundColor Green
npm version $Version --no-git-tag-version

# 2. 更新 Cargo.toml
Write-Host "✓ 更新 src-tauri/Cargo.toml" -ForegroundColor Green
if (Test-Path "src-tauri/Cargo.toml") {
    $cargoContent = Get-Content "src-tauri/Cargo.toml" -Raw
    $cargoContent = $cargoContent -replace 'version = ".*"', "version = `"$Version`""
    Set-Content "src-tauri/Cargo.toml" $cargoContent
}

# 3. 更新 tauri.conf.json
Write-Host "✓ 更新 src-tauri/tauri.conf.json" -ForegroundColor Green
if (Test-Path "src-tauri/tauri.conf.json") {
    $tauriContent = Get-Content "src-tauri/tauri.conf.json" -Raw
    $tauriContent = $tauriContent -replace '"version": "[^"]*"', "`"version`": `"$Version`""
    $tauriContent = $tauriContent -replace '"productName": "[^"]*"', "`"productName`": `"VCP Chat - tauri版v$Version`""
    Set-Content "src-tauri/tauri.conf.json" $tauriContent
}

# 4. 更新 Cargo.lock
Write-Host "✓ 更新 src-tauri/Cargo.lock" -ForegroundColor Green
Push-Location src-tauri
cargo update --workspace
Pop-Location

Write-Host ""
Write-Host "✅ 版本号已更新为 $Version" -ForegroundColor Green
Write-Host ""
Write-Host "📝 下一步操作:" -ForegroundColor Yellow
Write-Host "1. 更新 CHANGELOG.md"
Write-Host "2. 提交更改: git add . ; git commit -m `"chore: release v$Version`""
Write-Host "3. 创建标签: git tag -a v$Version -m `"Release v$Version`""
Write-Host "4. 推送代码: git push origin main ; git push origin v$Version"
