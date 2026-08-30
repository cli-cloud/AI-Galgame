#!/usr/bin/env pwsh
# GalGamerEgg 固件编译脚本 (PowerShell)
# 使用Arduino CLI编译并导出固件

param(
    [string]$OutputDir = "build"
)

$ErrorActionPreference = "Stop"

# 配置参数
$FQBN = "esp32:esp32:esp32s3"
$SKETCH = "GalGamerEgg.ino"
$BOARD_OPTIONS = @(
    "UploadSpeed=921600",
    "USBMode=hwcdc",  # Hardware CDC
    "CPUFreq=240",
    "FlashMode=qio",
    "FlashSize=16M",
    "PartitionScheme=app3M_fat9M_16MB",  # 官方内置分区表: 3MB app + 9MB FFat
    "PSRAM=opi",  # OPI PSRAM (8-line SPI, Octal)
    "DebugLevel=none",
    "EraseFlash=none"
)

Write-Host "🔨 GalGamerEgg 固件编译工具" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 检查Arduino CLI
Write-Host "`n📦 检查 Arduino CLI..." -ForegroundColor Yellow
if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: 未找到 arduino-cli" -ForegroundColor Red
    Write-Host "请从 https://arduino.github.io/arduino-cli/installation/ 安装" -ForegroundColor Red
    exit 1
}

$cliVersion = arduino-cli version
Write-Host "✓ 已安装: $cliVersion" -ForegroundColor Green

# 检查ESP32核心
Write-Host "`n📦 检查 ESP32 核心..." -ForegroundColor Yellow
$cores = arduino-cli core list | Select-String "esp32:esp32"
if (-not $cores) {
    Write-Host "⚠️  未安装 ESP32 核心，正在安装..." -ForegroundColor Yellow
    arduino-cli core install esp32:esp32
} else {
    Write-Host "✓ ESP32 核心已安装" -ForegroundColor Green
}

# 检查依赖库
Write-Host "`n📚 检查依赖库..." -ForegroundColor Yellow
$requiredLibs = @(
    "SparkFun MAX3010x Pulse and Proximity Sensor Library",
    "ArduinoJson"
)

foreach ($lib in $requiredLibs) {
    Write-Host "  检查 $lib..." -NoNewline
    $installed = arduino-cli lib list | Select-String $lib
    if ($installed) {
        Write-Host " ✓" -ForegroundColor Green
    } else {
        Write-Host " ✗ (尝试安装)" -ForegroundColor Yellow
        arduino-cli lib install $lib
    }
}

# 创建输出目录
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# 构建FQBN字符串
$fqbnFull = "$FQBN`:$($BOARD_OPTIONS -join ',')"

Write-Host "`n🔧 编译配置:" -ForegroundColor Yellow
Write-Host "  FQBN: $fqbnFull"
Write-Host "  输出: $OutputDir"

# 编译固件
Write-Host "`n⚙️  正在编译固件..." -ForegroundColor Yellow
$compileArgs = @(
    "compile",
    "--fqbn", $fqbnFull,
    "--output-dir", $OutputDir,
    "--export-binaries",
    $SKETCH
)

try {
    arduino-cli @compileArgs
    
    if ($LASTEXITCODE -ne 0) {
        throw "编译失败"
    }
    
    Write-Host "`n✅ 编译成功!" -ForegroundColor Green
    
    # 查找生成的固件文件
    $firmwareFiles = Get-ChildItem -Path $OutputDir -Filter "*.bin" -Recurse
    
    if ($firmwareFiles.Count -gt 0) {
        Write-Host "`n📦 生成的固件文件:" -ForegroundColor Cyan
        foreach ($file in $firmwareFiles) {
            $sizeKB = [math]::Round($file.Length / 1KB, 2)
            Write-Host "  - $($file.Name) ($sizeKB KB)" -ForegroundColor White
            Write-Host "    路径: $($file.FullName)" -ForegroundColor Gray
        }
        
        # 复制app0固件到根目录（用于OTA）
        $app0 = $firmwareFiles | Where-Object { $_.Name -like "*app0*" } | Select-Object -First 1
        if ($app0) {
            $outputFirmware = Join-Path $OutputDir "GalGamerEgg_v2.0.0.bin"
            Copy-Item $app0.FullName -Destination $outputFirmware -Force
            Write-Host "`n🎯 OTA固件已导出:" -ForegroundColor Green
            Write-Host "   $outputFirmware" -ForegroundColor White
        }
    }
    
    Write-Host "`n✨ 完成!" -ForegroundColor Green
    
} catch {
    Write-Host "`n❌ 编译失败: $_" -ForegroundColor Red
    exit 1
}

# 显示分区表信息
Write-Host "`n📋 分区表 (app3M_fat9M_16MB - 官方内置):" -ForegroundColor Cyan
Write-Host @"
Name       Type    SubType   Offset     Size       Flags
nvs        data    nvs       0x9000     0x5000
otadata    data    ota       0xe000     0x2000
app0       app     ota_0     0x10000    0x300000   (3 MB)
app1       app     ota_1     0x310000   0x300000   (3 MB)
ffat       data    fat       0x610000   0x9E0000   (9.875 MB)
coredump   data    coredump  0xFF0000   0x10000
"@ -ForegroundColor White
