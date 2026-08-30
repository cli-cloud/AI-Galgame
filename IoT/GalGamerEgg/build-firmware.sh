#!/bin/bash
# GalGamerEgg 固件编译脚本 (Bash)
# 使用Arduino CLI编译并导出固件

set -e

# 配置参数
FQBN="esp32:esp32:esp32s3"
SKETCH="GalGamerEgg.ino"
OUTPUT_DIR="${1:-build}"

BOARD_OPTIONS="UploadSpeed=921600,USBMode=hwcdc,CPUFreq=240,FlashMode=qio,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi,DebugLevel=none,EraseFlash=none"

echo -e "\033[36m🔨 GalGamerEgg 固件编译工具\033[0m"
echo -e "\033[36m================================\033[0m"

# 检查Arduino CLI
echo -e "\n\033[33m📦 检查 Arduino CLI...\033[0m"
if ! command -v arduino-cli &> /dev/null; then
    echo -e "\033[31m❌ 错误: 未找到 arduino-cli\033[0m"
    echo -e "\033[31m请从 https://arduino.github.io/arduino-cli/installation/ 安装\033[0m"
    exit 1
fi

CLI_VERSION=$(arduino-cli version)
echo -e "\033[32m✓ 已安装: $CLI_VERSION\033[0m"

# 检查ESP32核心
echo -e "\n\033[33m📦 检查 ESP32 核心...\033[0m"
if ! arduino-cli core list | grep -q "esp32:esp32"; then
    echo -e "\033[33m⚠️  未安装 ESP32 核心，正在安装...\033[0m"
    arduino-cli core install esp32:esp32
else
    echo -e "\033[32m✓ ESP32 核心已安装\033[0m"
fi

# 检查依赖库
echo -e "\n\033[33m📚 检查依赖库...\033[0m"
REQUIRED_LIBS=("SparkFun MAX3010x Pulse and Proximity Sensor Library" "ArduinoJson")

for lib in "${REQUIRED_LIBS[@]}"; do
    echo -n "  检查 $lib..."
    if arduino-cli lib list | grep -q "$lib"; then
        echo -e " \033[32m✓\033[0m"
    else
        echo -e " \033[33m✗ (尝试安装)\033[0m"
        arduino-cli lib install "$lib"
    fi
done

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 构建完整FQBN
FQBN_FULL="${FQBN}:${BOARD_OPTIONS}"

echo -e "\n\033[33m🔧 编译配置:\033[0m"
echo "  FQBN: $FQBN_FULL"
echo "  输出: $OUTPUT_DIR"

# 编译固件
echo -e "\n\033[33m⚙️  正在编译固件...\033[0m"
if arduino-cli compile \
    --fqbn "$FQBN_FULL" \
    --output-dir "$OUTPUT_DIR" \
    --export-binaries \
    "$SKETCH"; then
    
    echo -e "\n\033[32m✅ 编译成功!\033[0m"
    
    # 查找生成的固件文件
    echo -e "\n\033[36m📦 生成的固件文件:\033[0m"
    find "$OUTPUT_DIR" -name "*.bin" -type f | while read -r file; do
        size_kb=$(du -k "$file" | cut -f1)
        echo -e "  - $(basename "$file") (${size_kb} KB)"
        echo -e "    \033[90m路径: $file\033[0m"
    done
    
    # 复制app0固件到根目录（用于OTA）
    APP0_BIN=$(find "$OUTPUT_DIR" -name "*app0*.bin" -type f | head -n 1)
    if [ -n "$APP0_BIN" ]; then
        OUTPUT_FIRMWARE="$OUTPUT_DIR/GalGamerEgg_v2.0.0.bin"
        cp "$APP0_BIN" "$OUTPUT_FIRMWARE"
        echo -e "\n\033[32m🎯 OTA固件已导出:\033[0m"
        echo -e "   $OUTPUT_FIRMWARE"
    fi
    
    echo -e "\n\033[32m✨ 完成!\033[0m"
    
else
    echo -e "\n\033[31m❌ 编译失败\033[0m"
    exit 1
fi

# 显示分区表信息
echo -e "\n\033[36m📋 分区表 (app3M_fat9M_16MB - 官方内置):\033[0m"
cat <<EOF
Name       Type    SubType   Offset     Size       Flags
nvs        data    nvs       0x9000     0x5000
otadata    data    ota       0xe000     0x2000
app0       app     ota_0     0x10000    0x300000   (3 MB)
app1       app     ota_1     0x310000   0x300000   (3 MB)
ffat       data    fat       0x610000   0x9E0000   (9.875 MB)
coredump   data    coredump  0xFF0000   0x10000
EOF
