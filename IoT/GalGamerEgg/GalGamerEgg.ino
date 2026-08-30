/*
 * GalGamer Egg - IoT心率监测设备 + 体感控制
 * 硬件: ESP32-S3 + MAX30102心率传感器 + MPU-6500加速度传感器
 * 功能: WiFi配网、心率监测、体感控制、WebSocket数据传输、OTA固件更新
 */

// 固件版本信息
#define FIRMWARE_VERSION "1.0.0-b2"
#define FIRMWARE_BUILD_DATE __DATE__ " " __TIME__
#define FIRMWARE_FEATURES "HeartRate, Gesture, WiFi, OTA"

#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <Preferences.h>
#include <Wire.h>
#include <MAX30105.h>
#include "heartRate.h"
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <Update.h>
#include <FFat.h>
#include <FS.h>
#include <mbedtls/md.h>
#include <HTTPClient.h>
#include <WiFiClient.h>

// MPU-6500 寄存器地址
#define MPU6500_ADDR 0x68
#define MPU6500_WHO_AM_I 0x75
#define MPU6500_PWR_MGMT_1 0x6B
#define MPU6500_CONFIG 0x1A
#define MPU6500_GYRO_CONFIG 0x1B
#define MPU6500_ACCEL_CONFIG 0x1C
#define MPU6500_ACCEL_XOUT_H 0x3B

// MPU-6500 配置常量
#define ACCEL_SCALE 16384.0       // ±2g量程的灵敏度 (LSB/g)
#define SAMPLE_RATE 100           // 采样率 (Hz)
#define DEBOUNCE_TIME 200         // 防抖时间 (ms)
#define LOCAL_THRESHOLD 0.5       // 本地硬编码阈值 (g) - 过滤噪音,不可修改

// 设备信息
#define DEVICE_NAME "GalGamer Egg"
#define AP_SSID "GalGamer Egg"
#define AP_PASSWORD_DEFAULT ""  // 默认空密码

// 引脚定义
// I2C0 - MAX30102心率传感器
#define I2C0_SDA 21
#define I2C0_SCL 20

// I2C1 - MPU-6500加速度传感器
#define I2C1_SDA 47
#define I2C1_SCL 19

#define LED_PIN 2

// 全局对象
MAX30105 particleSensor;
WebServer server(80);
WebSocketsServer webSocket(81);
Preferences preferences;
DNSServer dnsServer;
TwoWire I2C_MPU = TwoWire(1);  // 第二个I2C总线用于MPU-6500

// WiFi状态
bool apMode = true;
bool staConnected = false;
String staSsid = "";
String staPassword = "";
String staIP = "";
String apPassword = "";  // AP密码（从Preferences读取）

// 心率数据
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;
bool fingerDetected = false;

// 体感控制数据
struct AccelData {
  float x;
  float y;
  float z;
  float magnitude;
};

bool mpu6500Detected = false;
// 注意: 阈值判断在PC端进行,设备只过滤噪音 (硬编码1.0g)
unsigned long lastGestureTime = 0;
unsigned long lastAccelRead = 0;
const unsigned long ACCEL_INTERVAL = 1000 / SAMPLE_RATE; // 10ms for 100Hz

// OTA 更新状态
bool otaInProgress = false;
String otaStagedFile = "/firmware.bin";
String otaStagedChecksum = "";
size_t otaStagedSize = 0;

// 心跳输出定时器
unsigned long lastHeartbeatPrint = 0;
const unsigned long HEARTBEAT_INTERVAL = 3000; // 3秒输出一次心跳信息

// WiFi扫描结果
String wifiScanResults = "[]";

// 函数声明
void handleRoot();
void handleWifiPage();
void handleAPPage();
void handleAboutPage();
void handleScan();
void handleConnect();
void handleStatus();
void handleReset();
void handleSetAPPassword();
void handleOTAUpload();
void handleOTAUploadResponse();
void handleOTAConfirm();
void handleOTACancel();
void handleOTADownload();

void setup() {
  Serial.begin(115200);
  
  // 启动消息 - JSON格式
  StaticJsonDocument<256> startDoc;
  startDoc["type"] = "system";
  startDoc["event"] = "startup";
  startDoc["device"] = DEVICE_NAME;
  serializeJson(startDoc, Serial);
  Serial.println();
  
  pinMode(LED_PIN, OUTPUT);
  
  // 初始化Preferences
  preferences.begin("galgamer", false);
  staSsid = preferences.getString("ssid", "");
  staPassword = preferences.getString("password", "");
  apPassword = preferences.getString("apPassword", AP_PASSWORD_DEFAULT);
  
  // AP密码信息 - JSON格式
  StaticJsonDocument<256> apDoc;
  apDoc["type"] = "system";
  apDoc["event"] = "ap_password_status";
  apDoc["hasPassword"] = apPassword.length() > 0;
  apDoc["mode"] = apPassword.length() > 0 ? "WPA2-PSK" : "Open";
  serializeJson(apDoc, Serial);
  Serial.println();
  
  // 初始化I2C0 - MAX30102
  Wire.begin(I2C0_SDA, I2C0_SCL);
  
  // 初始化I2C1 - MPU-6500
  I2C_MPU.begin(I2C1_SDA, I2C1_SCL, 100000);  // 100kHz标准速度
  
  // 初始化MAX30102 (使用I2C0)
  StaticJsonDocument<256> max30102Doc;
  max30102Doc["type"] = "system";
  max30102Doc["event"] = "sensor_init";
  max30102Doc["sensor"] = "MAX30102";
  
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    max30102Doc["success"] = false;
    max30102Doc["message"] = "Sensor not detected";
  } else {
    max30102Doc["success"] = true;
    particleSensor.setup();
    particleSensor.setPulseAmplitudeRed(0x0A);
    particleSensor.setPulseAmplitudeGreen(0);
  }
  serializeJson(max30102Doc, Serial);
  Serial.println();
  
  // 初始化 FFat 文件系统
  StaticJsonDocument<256> ffatDoc;
  ffatDoc["type"] = "system";
  ffatDoc["event"] = "ffat_init";
  if (!FFat.begin(true)) {
    ffatDoc["success"] = false;
    ffatDoc["message"] = "FFat mount failed";
  } else {
    ffatDoc["success"] = true;
    ffatDoc["total"] = FFat.totalBytes();
    ffatDoc["used"] = FFat.usedBytes();
    ffatDoc["free"] = FFat.totalBytes() - FFat.usedBytes();
  }
  serializeJson(ffatDoc, Serial);
  Serial.println();
  
  // 初始化MPU-6500
  StaticJsonDocument<256> mpuDoc;
  mpuDoc["type"] = "system";
  mpuDoc["event"] = "sensor_init";
  mpuDoc["sensor"] = "MPU-6500";
  
  if (!initMPU6500()) {
    mpuDoc["success"] = false;
    mpuDoc["message"] = "Sensor not detected";
    mpu6500Detected = false;
  } else {
    mpuDoc["success"] = true;
    mpuDoc["localThreshold"] = LOCAL_THRESHOLD;
    mpu6500Detected = true;
  }
  serializeJson(mpuDoc, Serial);
  Serial.println();
  
  // 启动AP模式
  setupAP();
  
  // 尝试连接STA（如果有保存的配置）
  if (staSsid.length() > 0) {
    connectSTA();
  }
  
  // 启动Web服务器
  setupWebServer();
  
  // 启动WebSocket服务器
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  
  // 初始化完成 - JSON格式
  StaticJsonDocument<256> completeDoc;
  completeDoc["type"] = "system";
  completeDoc["event"] = "init_complete";
  completeDoc["timestamp"] = millis();
  serializeJson(completeDoc, Serial);
  Serial.println();
}

void loop() {
  // 处理DNS请求（用于配网页面强制跳转）
  dnsServer.processNextRequest();
  
  // 处理HTTP请求
  server.handleClient();
  
  // 处理WebSocket
  webSocket.loop();
  
  // 读取心率数据
  updateHeartRate();
  
  // 读取体感数据
  if (mpu6500Detected) {
    updateGestureControl();
  }
  
  // 串口心跳输出
  printHeartbeat();
  
  // 串口命令处理
  handleSerialCommands();
  
  // LED指示
  updateLED();
}

// ==================== WiFi配置 ====================

void setupAP() {
  // 使用保存的AP密码，如果为空则开放AP
  const char* password = apPassword.length() > 0 ? apPassword.c_str() : nullptr;
  
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, password);
  
  IPAddress apIP(10, 78, 91, 1);
  IPAddress gateway(10, 78, 91, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, gateway, subnet);
  
  // 启动DNS服务器，将所有请求重定向到AP的IP
  dnsServer.start(53, "*", apIP);
  
  // AP启动信息 - JSON格式
  StaticJsonDocument<256> doc;
  doc["type"] = "system";
  doc["event"] = "ap_started";
  doc["ssid"] = AP_SSID;
  doc["ip"] = WiFi.softAPIP().toString();
  doc["security"] = password ? "WPA2-PSK" : "Open";
  serializeJson(doc, Serial);
  Serial.println();
  
  apMode = true;
}

void connectSTA() {
  WiFi.begin(staSsid.c_str(), staPassword.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    attempts++;
  }
  
  StaticJsonDocument<256> doc;
  doc["type"] = "system";
  doc["event"] = "sta_connection";
  
  if (WiFi.status() == WL_CONNECTED) {
    staConnected = true;
    staIP = WiFi.localIP().toString();
    doc["success"] = true;
    doc["ssid"] = staSsid;
    doc["ip"] = staIP;
  } else {
    staConnected = false;
    doc["success"] = false;
    doc["ssid"] = staSsid;
  }
  
  serializeJson(doc, Serial);
  Serial.println();
}

// ==================== Web服务器 ====================

void setupWebServer() {
  // 主页 - 底部 Dock 导航
  server.on("/", HTTP_GET, handleRoot);
  
  // WiFi 配置页面
  server.on("/wifi", HTTP_GET, handleWifiPage);
  server.on("/scan", HTTP_GET, handleScan);
  server.on("/connect", HTTP_POST, handleConnect);
  
  // AP 配置页面
  server.on("/ap", HTTP_GET, handleAPPage);
  server.on("/set-ap-password", HTTP_POST, handleSetAPPassword);
  
  // 系统信息页面
  server.on("/about", HTTP_GET, handleAboutPage);
  
  // OTA 更新接口
  server.on("/ota/upload", HTTP_POST, handleOTAUploadResponse, handleOTAUpload);
  server.on("/ota/confirm", HTTP_POST, handleOTAConfirm);
  server.on("/ota/cancel", HTTP_POST, handleOTACancel);
  server.on("/ota/download", HTTP_GET, handleOTADownload); // 互联网固件下载
  
  // API 接口
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/reset", HTTP_POST, handleReset);
  
  // 404处理 - 重定向到主页（用于配网）
  server.onNotFound([]() {
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
  });
  
  server.begin();
  
  // Web服务器启动 - JSON格式
  StaticJsonDocument<128> doc;
  doc["type"] = "system";
  doc["event"] = "webserver_started";
  doc["port"] = 80;
  serializeJson(doc, Serial);
  Serial.println();
}

void handleRoot() {
  String html = R"rawliteral(<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>GalGamer Egg v)rawliteral" FIRMWARE_VERSION R"rawliteral(</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#E3F2FD 0%,#FCE4EC 100%);color:#333;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.header{text-align:center;padding:20px;background:rgba(255,255,255,0.85);backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,0.12)}
.header h1{font-size:1.5em;margin-bottom:5px;color:#1976D2;text-shadow:0 2px 4px rgba(25,118,210,0.2)}
.header .version{opacity:0.6;font-size:0.85em;color:#666}
.content{flex:1;padding:15px;overflow-y:auto;overflow-x:hidden}
.card{background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 4px 16px rgba(0,0,0,0.1);border:1px solid rgba(255,255,255,0.6);transition:all 0.3s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.15)}
.card h2{margin-bottom:12px;font-size:1.1em;color:#1976D2;border-bottom:2px solid #E3F2FD;padding-bottom:8px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(240,240,240,0.7);font-size:0.9em}
.row:last-child{border-bottom:none}
.row .label{color:#666}
.row .value{font-weight:600;color:#333}
.status-ok{color:#4CAF50}
.status-err{color:#f44336}
.dock{display:flex;justify-content:space-around;background:rgba(255,255,255,0.9);backdrop-filter:blur(15px);box-shadow:0 -4px 16px rgba(0,0,0,0.12);padding:10px 0}
.dock-item{flex:1;text-align:center;padding:10px;color:#999;text-decoration:none;transition:all 0.3s ease;border-radius:10px;margin:0 4px;font-size:0.75em}
.dock-item.active{color:#1976D2;background:linear-gradient(135deg,rgba(227,242,253,0.9),rgba(252,228,236,0.5));box-shadow:0 2px 8px rgba(25,118,210,0.2)}
.dock-item:hover{background:rgba(245,245,245,0.8);transform:scale(1.05)}
.progress-bar{height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;margin-top:4px}
.progress-fill{height:100%;background:linear-gradient(90deg,#4CAF50,#8BC34A);transition:width 0.3s;box-shadow:0 0 8px rgba(76,175,80,0.4)}
</style></head><body>
<div class="header">
<h1>GalGamer Egg</h1>
<div class="version">v)rawliteral" FIRMWARE_VERSION R"rawliteral(</div>
</div>
<div class="content">
<div class="card">
<h2>AP 热点</h2>
<div class="row"><span class="label">状态:</span><strong class="value" id="ap-status">检测中...</strong></div>
<div class="row"><span class="label">IP地址:</span><strong class="value" id="ap-ip">-</strong></div>
</div>
<div class="card">
<h2>Station 连接</h2>
<div class="row"><span class="label">状态:</span><strong class="value" id="sta-status">检测中...</strong></div>
<div class="row"><span class="label">SSID:</span><strong class="value" id="sta-ssid">-</strong></div>
<div class="row"><span class="label">IP地址:</span><strong class="value" id="sta-ip">-</strong></div>
</div>
<div class="card">
<h2>系统资源</h2>
<div class="row"><span class="label">CPU频率:</span><strong class="value" id="cpu-freq">-</strong></div>
<div class="row">
<span class="label">堆内存:</span>
<div style="flex:1;margin-left:10px">
<div style="display:flex;justify-content:space-between;font-size:0.8em;color:#666">
<span id="heap-used">-</span><span id="heap-total">-</span>
</div>
<div class="progress-bar"><div class="progress-fill" id="heap-bar"></div></div>
</div>
</div>
<div class="row"><span class="label">运行时间:</span><strong class="value" id="uptime">-</strong></div>
</div>
<div class="card">
<h2>传感器</h2>
<div class="row"><span class="label">心率传感器:</span><strong class="value" id="hr">检测中...</strong></div>
<div class="row"><span class="label">体感传感器:</span><strong class="value" id="gs">检测中...</strong></div>
</div>
</div>
<nav class="dock">
<a href="/" class="dock-item active">状态</a>
<a href="/wifi" class="dock-item">WiFi</a>
<a href="/ap" class="dock-item">AP</a>
<a href="/about" class="dock-item">关于</a>
</nav>
<script>
function formatBytes(bytes){
if(bytes<1024)return bytes+' B';
if(bytes<1048576)return(bytes/1024).toFixed(1)+' KB';
return(bytes/1048576).toFixed(1)+' MB';
}
function formatUptime(sec){
const d=Math.floor(sec/86400);
const h=Math.floor((sec%86400)/3600);
const m=Math.floor((sec%3600)/60);
if(d>0)return d+'天'+h+'时';
if(h>0)return h+'时'+m+'分';
return m+'分';
}
setInterval(()=>{
fetch('/status').then(r=>r.json()).then(d=>{
document.getElementById('ap-status').textContent=d.apMode?'运行中':'已关闭';
document.getElementById('ap-status').className='value '+(d.apMode?'status-ok':'status-err');
document.getElementById('ap-ip').textContent=d.apIP||'-';
document.getElementById('sta-status').textContent=d.staConnected?'已连接':'未连接';
document.getElementById('sta-status').className='value '+(d.staConnected?'status-ok':'status-err');
document.getElementById('sta-ssid').textContent=d.staSsid||'-';
document.getElementById('sta-ip').textContent=d.staIP||'-';
document.getElementById('cpu-freq').textContent=d.cpuFreq+' MHz';
document.getElementById('heap-used').textContent=formatBytes(d.heapUsed);
document.getElementById('heap-total').textContent=formatBytes(d.heapTotal);
document.getElementById('heap-bar').style.width=(d.heapUsed/d.heapTotal*100)+'%';
document.getElementById('uptime').textContent=formatUptime(d.uptime);
document.getElementById('hr').textContent=d.heartRateDetected?'已检测':'未检测';
document.getElementById('hr').className='value '+(d.heartRateDetected?'status-ok':'status-err');
document.getElementById('gs').textContent=d.gestureDetected?'已检测':'未检测';
document.getElementById('gs').className='value '+(d.gestureDetected?'status-ok':'status-err');
}).catch(()=>{});
},1000);
</script>
</body></html>
)rawliteral";
  server.send(200, "text/html", html);
}

// WiFi 配置页面
void handleWifiPage() {
  String html = R"rawliteral(<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WiFi配置</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#E3F2FD 0%,#FCE4EC 100%);color:#333;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.header{text-align:center;padding:20px;background:rgba(255,255,255,0.85);backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,0.12)}
.header h1{font-size:1.5em;color:#1976D2;text-shadow:0 2px 4px rgba(25,118,210,0.2)}
.content{flex:1;padding:15px;overflow-y:auto;overflow-x:hidden}
.card{background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 4px 16px rgba(0,0,0,0.1);border:1px solid rgba(255,255,255,0.6);transition:all 0.3s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.15)}
.btn{width:100%;padding:12px;background:#1976D2;border:none;border-radius:8px;color:#fff;font-size:1em;cursor:pointer;margin-top:10px;box-shadow:0 4px 12px rgba(25,118,210,0.3);transition:all 0.3s ease}
.btn:active{background:#1565C0;transform:scale(0.98)}
.btn:disabled{background:#ccc;cursor:not-allowed;box-shadow:none}
.input-group{margin-bottom:12px}
.input-group label{display:block;margin-bottom:6px;color:#666;font-size:0.9em}
.input-group input{width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;font-size:1em;transition:border-color 0.3s ease}
.input-group input:focus{outline:none;border-color:#1976D2;box-shadow:0 0 0 3px rgba(25,118,210,0.1)}
.network-list{list-style:none}
.network-item{padding:12px;background:rgba(245,245,245,0.9);backdrop-filter:blur(5px);border-radius:8px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:all 0.3s ease}
.network-item:active{background:rgba(224,224,224,0.9);transform:scale(0.98)}
.network-info{flex:1}
.network-name{font-weight:600;margin-bottom:2px}
.network-signal{display:flex;align-items:center;gap:4px;font-size:0.85em;color:#666}
.signal-bars{display:flex;gap:2px;align-items:flex-end}
.signal-bar{width:3px;background:#ccc;border-radius:1px;transition:background 0.3s}
.signal-bar.active{background:#4CAF50;box-shadow:0 0 4px rgba(76,175,80,0.5)}
.signal-bar:nth-child(1){height:4px}
.signal-bar:nth-child(2){height:7px}
.signal-bar:nth-child(3){height:10px}
.signal-bar:nth-child(4){height:13px}
.loading{display:none;text-align:center;padding:20px}
.spinner{border:3px solid #f3f3f3;border-top:3px solid #1976D2;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 10px;filter:drop-shadow(0 2px 4px rgba(25,118,210,0.3))}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.dock{display:flex;justify-content:space-around;background:rgba(255,255,255,0.9);backdrop-filter:blur(15px);box-shadow:0 -4px 16px rgba(0,0,0,0.12);padding:10px 0}
.dock-item{flex:1;text-align:center;padding:10px;color:#999;text-decoration:none;transition:all 0.3s ease;border-radius:10px;margin:0 4px;font-size:0.75em}
.dock-item.active{color:#1976D2;background:linear-gradient(135deg,rgba(227,242,253,0.9),rgba(252,228,236,0.5));box-shadow:0 2px 8px rgba(25,118,210,0.2)}
.dock-item:hover{background:rgba(245,245,245,0.8);transform:scale(1.05)}
</style></head><body>
<div class="header"><h1>WiFi 配置</h1></div>
<div class="content">
<div class="card">
<button class="btn" onclick="scanNetworks()">🔄 扫描网络</button>
<ul id="networks" class="network-list">
<li style="padding:20px;text-align:center;color:#999">点击上方按钮扫描WiFi网络</li>
</ul>
</div>
<div class="card">
<h3 style="margin-bottom:12px;font-size:1em">手动连接</h3>
<div class="input-group"><label>WiFi名称 (SSID)</label><input type="text" id="ssid" placeholder="输入WiFi名称"></div>
<div class="input-group"><label>密码</label><input type="password" id="password" placeholder="输入密码"></div>
<button class="btn" id="connect-btn" onclick="connectWiFi()">连接</button>
<div class="loading" id="loading">
<div class="spinner"></div>
<p style="color:#666">正在连接...</p>
</div>
</div>
</div>
<nav class="dock">
<a href="/" class="dock-item">状态</a>
<a href="/wifi" class="dock-item active">WiFi</a>
<a href="/ap" class="dock-item">AP</a>
<a href="/about" class="dock-item">关于</a>
</nav>
<script>
function getSignalBars(rssi){
let level=4;
if(rssi>-50)level=4;
else if(rssi>-60)level=3;
else if(rssi>-70)level=2;
else level=1;
let html='<div class="signal-bars">';
for(let i=1;i<=4;i++){
html+='<div class="signal-bar'+(i<=level?' active':'')+'"></div>';
}
html+='</div>';
return html;
}
function scanNetworks(){
const list=document.getElementById('networks');
list.innerHTML='<li style="padding:12px;text-align:center;color:#666">扫描中...</li>';
fetch('/scan').then(r=>r.json()).then(networks=>{
list.innerHTML='';
networks.forEach(n=>{
const li=document.createElement('li');
li.className='network-item';
li.innerHTML='<div class="network-info"><div class="network-name">'+n.ssid+'</div><div class="network-signal">'+getSignalBars(n.rssi)+'<span>'+n.rssi+' dBm'+(n.secure?' • 加密':'')+'</span></div></div>';
li.onclick=()=>{
document.getElementById('ssid').value=n.ssid;
document.getElementById('password').focus();
};
list.appendChild(li);
});
if(networks.length===0)list.innerHTML='<li style="padding:12px;text-align:center;color:#999">未找到网络</li>';
}).catch(()=>{
list.innerHTML='<li style="padding:12px;text-align:center;color:#f44336">扫描失败</li>';
});
}
function connectWiFi(){
const ssid=document.getElementById('ssid').value;
const password=document.getElementById('password').value;
if(!ssid){alert('请输入WiFi名称');return;}
const btn=document.getElementById('connect-btn');
const loading=document.getElementById('loading');
btn.style.display='none';
loading.style.display='block';
fetch('/connect',{
method:'POST',
headers:{'Content-Type':'application/x-www-form-urlencoded'},
body:'ssid='+encodeURIComponent(ssid)+'&password='+encodeURIComponent(password)
}).then(r=>r.json()).then(d=>{
btn.style.display='block';
loading.style.display='none';
if(d.success){
alert('连接成功! IP: '+d.ip);
setTimeout(()=>location.href='/',1000);
}else{
alert('连接失败: '+d.message);
}
}).catch(()=>{
btn.style.display='block';
loading.style.display='none';
alert('请求失败');
});
}
</script>
</body></html>
)rawliteral";
  server.send(200, "text/html", html);
}

// AP 配置页面
void handleAPPage() {
  String html = R"rawliteral(<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AP配置</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#E3F2FD 0%,#FCE4EC 100%);color:#333;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.header{text-align:center;padding:20px;background:rgba(255,255,255,0.85);backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,0.12)}
.header h1{font-size:1.5em;color:#1976D2;text-shadow:0 2px 4px rgba(25,118,210,0.2)}
.content{flex:1;padding:15px;overflow-y:auto;overflow-x:hidden}
.card{background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 4px 16px rgba(0,0,0,0.1);border:1px solid rgba(255,255,255,0.6);transition:all 0.3s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.15)}
.input-group{margin-bottom:12px}
.input-group label{display:block;margin-bottom:6px;color:#666;font-size:0.9em}
.input-group input{width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;font-size:1em;transition:border-color 0.3s ease}
.input-group input:focus{outline:none;border-color:#1976D2;box-shadow:0 0 0 3px rgba(25,118,210,0.1)}
.btn{width:100%;padding:12px;background:#1976D2;border:none;border-radius:8px;color:#fff;font-size:1em;cursor:pointer;margin-top:10px;box-shadow:0 4px 12px rgba(25,118,210,0.3);transition:all 0.3s ease}
.btn:active{background:#1565C0;transform:scale(0.98)}
.btn-danger{background:#f44336;box-shadow:0 4px 12px rgba(244,67,54,0.3)}
.btn-danger:active{background:#d32f2f;transform:scale(0.98)}
.dock{display:flex;justify-content:space-around;background:rgba(255,255,255,0.9);backdrop-filter:blur(15px);box-shadow:0 -4px 16px rgba(0,0,0,0.12);padding:10px 0}
.dock-item{flex:1;text-align:center;padding:10px;color:#999;text-decoration:none;transition:all 0.3s ease;border-radius:10px;margin:0 4px;font-size:0.75em}
.dock-item.active{color:#1976D2;background:linear-gradient(135deg,rgba(227,242,253,0.9),rgba(252,228,236,0.5));box-shadow:0 2px 8px rgba(25,118,210,0.2)}
.dock-item:hover{background:rgba(245,245,245,0.8);transform:scale(1.05)}
</style></head><body>
<div class="header"><h1>AP 配置</h1></div>
<div class="content">
<div class="card">
<p style="margin-bottom:12px;color:#666">当前AP名称: <strong>GalGamer Egg</strong></p>
<div class="input-group">
<label>新密码（留空=无密码）</label>
<input type="password" id="password" placeholder="输入新密码">
</div>
<button class="btn" onclick="setPassword()">保存</button>
</div>
<div class="card">
<p style="margin-bottom:10px;color:#f57c00">⚠ 重置设备将清除所有WiFi配置</p>
<button class="btn btn-danger" onclick="resetDevice()">重置设备</button>
</div>
</div>
<nav class="dock">
<a href="/" class="dock-item">状态</a>
<a href="/wifi" class="dock-item">WiFi</a>
<a href="/ap" class="dock-item active">AP</a>
<a href="/about" class="dock-item">关于</a>
</nav>
<script>
function setPassword(){
const password=document.getElementById('password').value;
fetch('/set-ap-password',{
method:'POST',
headers:{'Content-Type':'application/x-www-form-urlencoded'},
body:'password='+encodeURIComponent(password)
}).then(r=>r.json()).then(d=>{
alert(d.success?'密码已保存，重启后生效':'保存失败');
}).catch(()=>alert('请求失败'));
}
function resetDevice(){
if(!confirm('确定要重置设备吗？所有WiFi配置将被清除！'))return;
fetch('/reset',{method:'POST'}).then(r=>r.json()).then(()=>{
alert('设备已重置，正在重启...');
setTimeout(()=>location.href='/',2000);
}).catch(()=>alert('重置失败'));
}
</script>
</body></html>
)rawliteral";
  server.send(200, "text/html", html);
}

// 关于页面 (含OTA上传和互联网下载)
void handleAboutPage() {
  String html = R"rawliteral(<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>关于与OTA</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#E3F2FD 0%,#FCE4EC 100%);color:#333;height:100vh;display:flex;flex-direction:column;overflow:hidden}
.header{text-align:center;padding:20px;background:rgba(255,255,255,0.85);backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,0.12)}
.header h1{font-size:1.5em;color:#1976D2;text-shadow:0 2px 4px rgba(25,118,210,0.2)}
.content{flex:1;padding:15px;overflow-y:auto;overflow-x:hidden}
.card{background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 4px 16px rgba(0,0,0,0.1);border:1px solid rgba(255,255,255,0.6);transition:all 0.3s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.15)}
.card h3{margin-bottom:10px;color:#1976D2;font-size:1.1em;border-bottom:2px solid #E3F2FD;padding-bottom:8px}
.info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(240,240,240,0.7);font-size:0.9em}
.info-row:last-child{border-bottom:none}
.info-row span:first-child{color:#666}
.info-row span:last-child{font-weight:600;color:#333}
.btn{width:100%;padding:12px;background:#1976D2;border:none;border-radius:8px;color:#fff;font-size:1em;cursor:pointer;margin-top:10px;box-shadow:0 4px 12px rgba(25,118,210,0.3);transition:all 0.3s ease}
.btn:active{background:#1565C0;transform:scale(0.98)}
.btn-success{background:#43a047;box-shadow:0 4px 12px rgba(67,160,71,0.3)}
.btn-success:active{background:#388e3c}
.btn-danger{background:#f44336;box-shadow:0 4px 12px rgba(244,67,54,0.3)}
.btn-danger:active{background:#d32f2f}
.file-input{display:none}
.input-group{margin-bottom:12px}
.input-group label{display:block;margin-bottom:6px;color:#666;font-size:0.9em}
.input-group input{width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;font-size:1em;transition:border-color 0.3s ease}
.input-group input:focus{outline:none;border-color:#1976D2;box-shadow:0 0 0 3px rgba(25,118,210,0.1)}
.progress{width:100%;height:8px;background:rgba(224,224,224,0.8);backdrop-filter:blur(5px);border-radius:4px;overflow:hidden;margin-top:10px}
.progress-bar{height:100%;background:linear-gradient(90deg,#1976D2,#64B5F6);transition:width 0.3s;box-shadow:0 0 8px rgba(25,118,210,0.5)}
.status-text{text-align:center;margin-top:8px;font-size:0.9em;color:#666}
.dock{display:flex;justify-content:space-around;background:rgba(255,255,255,0.9);backdrop-filter:blur(15px);box-shadow:0 -4px 16px rgba(0,0,0,0.12);padding:10px 0}
.dock-item{flex:1;text-align:center;padding:10px;color:#999;text-decoration:none;transition:all 0.3s ease;border-radius:10px;margin:0 4px;font-size:0.75em}
.dock-item.active{color:#1976D2;background:linear-gradient(135deg,rgba(227,242,253,0.9),rgba(252,228,236,0.5));box-shadow:0 2px 8px rgba(25,118,210,0.2)}
.dock-item:hover{background:rgba(245,245,245,0.8);transform:scale(1.05)}
</style></head><body>
<div class="header"><h1>关于设备</h1></div>
<div class="content">
<div class="card"><h3>固件信息</h3>
<div class="info-row"><span>版本</span><span>)rawliteral" FIRMWARE_VERSION R"rawliteral(</span></div>
<div class="info-row"><span>编译时间</span><span>)rawliteral" FIRMWARE_BUILD_DATE R"rawliteral(</span></div>
<div class="info-row"><span>特性</span><span>)rawliteral" FIRMWARE_FEATURES R"rawliteral(</span></div>
</div>
<div class="card"><h3>本地固件上传</h3>
<p style="margin-bottom:12px;font-size:0.9em;color:#666">从电脑上传固件文件 (.bin)</p>
<input type="file" id="firmwareFile" class="file-input" accept=".bin">
<button class="btn" onclick="document.getElementById('firmwareFile').click()">选择文件</button>
<button class="btn" id="uploadBtn" style="display:none" onclick="uploadFirmware()">开始上传</button>
<div id="uploadStatus"></div>
</div>
<div class="card"><h3>互联网固件下载</h3>
<p style="margin-bottom:12px;font-size:0.9em;color:#666">从URL下载固件（需STA模式）</p>
<div class="input-group">
<label>固件URL</label>
<input type="text" id="firmwareUrl" placeholder="https://example.com/firmware.bin">
</div>
<button class="btn" onclick="downloadFirmware()">下载固件</button>
<div id="downloadStatus"></div>
</div>
</div>
<nav class="dock">
<a href="/" class="dock-item">状态</a>
<a href="/wifi" class="dock-item">WiFi</a>
<a href="/ap" class="dock-item">AP</a>
<a href="/about" class="dock-item active">关于</a>
</nav>
<script>
document.getElementById('firmwareFile').addEventListener('change',function(){
if(this.files.length>0){
document.getElementById('uploadBtn').style.display='block';
document.getElementById('uploadStatus').innerHTML='<p class="status-text">已选择: '+this.files[0].name+' ('+(this.files[0].size/1024/1024).toFixed(2)+' MB)</p>';
}
});

function uploadFirmware(){
const file=document.getElementById('firmwareFile').files[0];
if(!file){alert('请先选择文件');return;}
const formData=new FormData();
formData.append('firmware',file);
document.getElementById('uploadStatus').innerHTML='<div class="progress"><div class="progress-bar" style="width:50%"></div></div><p class="status-text">正在上传...</p>';
fetch('/ota/upload',{method:'POST',body:formData})
.then(r=>r.json())
.then(d=>{
if(d.success){
document.getElementById('uploadStatus').innerHTML='<p class="status-text" style="color:#43a047">✓ 上传成功</p><p class="status-text">SHA256: '+d.checksum.substring(0,16)+'...</p><button class="btn btn-success" onclick="confirmOTA()">确认安装</button><button class="btn btn-danger" onclick="cancelOTA()">取消</button>';
}else{
document.getElementById('uploadStatus').innerHTML='<p class="status-text" style="color:#f44336">✗ 上传失败: '+d.message+'</p>';
}
}).catch(()=>{document.getElementById('uploadStatus').innerHTML='<p class="status-text" style="color:#f44336">✗ 上传失败</p>';});
}

function downloadFirmware(){
const url=document.getElementById('firmwareUrl').value;
if(!url){alert('请输入固件URL');return;}
document.getElementById('downloadStatus').innerHTML='<div class="progress"><div class="progress-bar" id="downloadProgress" style="width:0%"></div></div><p class="status-text">正在下载...</p>';
const eventSource=new EventSource('/ota/download?url='+encodeURIComponent(url));
eventSource.addEventListener('progress',function(e){
const data=JSON.parse(e.data);
document.getElementById('downloadProgress').style.width=data.progress+'%';
document.querySelector('#downloadStatus .status-text').textContent='下载中: '+data.progress+'% ('+data.downloaded+'/'+data.total+' bytes)';
});
eventSource.addEventListener('complete',function(e){
eventSource.close();
const data=JSON.parse(e.data);
if(data.success){
document.getElementById('downloadStatus').innerHTML='<p class="status-text" style="color:#43a047">✓ 下载成功</p><p class="status-text">SHA256: '+data.checksum.substring(0,16)+'...</p><button class="btn btn-success" onclick="confirmOTA()">确认安装</button><button class="btn btn-danger" onclick="cancelOTA()">取消</button>';
}else{
document.getElementById('downloadStatus').innerHTML='<p class="status-text" style="color:#f44336">✗ 下载失败: '+data.message+'</p>';
}
});
eventSource.addEventListener('error',function(){
eventSource.close();
document.getElementById('downloadStatus').innerHTML='<p class="status-text" style="color:#f44336">✗ 下载失败</p>';
});
}

function confirmOTA(){
document.getElementById('uploadStatus').innerHTML=document.getElementById('downloadStatus').innerHTML='<div class="progress"><div class="progress-bar" style="width:100%"></div></div><p class="status-text">正在安装固件...</p>';
fetch('/ota/confirm',{method:'POST'})
.then(r=>r.json())
.then(d=>{
if(d.success){
document.getElementById('uploadStatus').innerHTML=document.getElementById('downloadStatus').innerHTML='<p class="status-text" style="color:#43a047">✓ 安装成功！设备将在3秒后重启</p>';
setTimeout(()=>location.href='/',5000);
}else{
document.getElementById('uploadStatus').innerHTML=document.getElementById('downloadStatus').innerHTML='<p class="status-text" style="color:#f44336">✗ 安装失败: '+d.message+'</p>';
}
}).catch(()=>{document.getElementById('uploadStatus').innerHTML=document.getElementById('downloadStatus').innerHTML='<p class="status-text" style="color:#f44336">✗ 安装失败</p>';});
}

function cancelOTA(){
fetch('/ota/cancel',{method:'POST'}).then(()=>{
document.getElementById('uploadStatus').innerHTML=document.getElementById('downloadStatus').innerHTML='<p class="status-text">已取消OTA升级</p>';
document.getElementById('uploadBtn').style.display='none';
document.getElementById('firmwareFile').value='';
document.getElementById('firmwareUrl').value='';
});
}
</script>
</body></html>
)rawliteral";
  server.send(200, "text/html", html);
}

void handleScan() {
  int n = WiFi.scanNetworks();
  
  StaticJsonDocument<2048> doc;
  JsonArray networks = doc.to<JsonArray>();
  
  for (int i = 0; i < n && i < 20; i++) {
    JsonObject net = networks.createNestedObject();
    net["ssid"] = WiFi.SSID(i);
    net["rssi"] = WiFi.RSSI(i);
    net["secure"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
  }
  
  String output;
  serializeJson(doc, output);
  wifiScanResults = output;
  
  server.send(200, "application/json", output);
}

void handleConnect() {
  if (!server.hasArg("ssid")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"缺少SSID\"}");
    return;
  }
  
  String newSsid = server.arg("ssid");
  String newPassword = server.arg("password");
  
  // 保存配置
  preferences.putString("ssid", newSsid);
  preferences.putString("password", newPassword);
  
  staSsid = newSsid;
  staPassword = newPassword;
  
  // 尝试连接
  WiFi.disconnect();
  delay(100);
  WiFi.begin(newSsid.c_str(), newPassword.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    attempts++;
  }
  
  StaticJsonDocument<256> doc;
  
  if (WiFi.status() == WL_CONNECTED) {
    staConnected = true;
    staIP = WiFi.localIP().toString();
    
    doc["success"] = true;
    doc["ip"] = staIP;
    doc["ssid"] = newSsid;
  } else {
    staConnected = false;
    doc["success"] = false;
    doc["message"] = "连接超时";
  }
  
  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

void handleStatus() {
  StaticJsonDocument<512> doc;
  
  doc["apMode"] = apMode;
  doc["apIP"] = WiFi.softAPIP().toString();
  doc["staConnected"] = staConnected;
  doc["staSsid"] = staSsid;
  doc["staIP"] = staIP;
  doc["heartRate"] = beatAvg;
  doc["fingerDetected"] = fingerDetected;
  doc["gestureDetected"] = mpu6500Detected;
  doc["heartRateDetected"] = fingerDetected;
  doc["uptime"] = millis() / 1000;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["firmwareBuildDate"] = FIRMWARE_BUILD_DATE;
  doc["firmwareFeatures"] = FIRMWARE_FEATURES;
  doc["otaSupported"] = true;
  doc["cpuFreq"] = getCpuFrequencyMhz();
  doc["heapUsed"] = ESP.getHeapSize() - ESP.getFreeHeap();
  doc["heapTotal"] = ESP.getHeapSize();
  
  // 返回当前设备实际连接的SSID和IP
  if (staConnected) {
    doc["ssid"] = staSsid;
    doc["ip"] = staIP;
  } else if (apMode) {
    doc["ssid"] = AP_SSID;
    doc["ip"] = WiFi.softAPIP().toString();
  }
  
  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

void handleReset() {
  preferences.clear();
  server.send(200, "application/json", "{\"success\":true}");
  delay(1000);
  ESP.restart();
}

void handleSetAPPassword() {
  if (!server.hasArg("password")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"缺少密码参数\"}");
    return;
  }
  
  String newPassword = server.arg("password");
  
  // 验证密码长度（如果不为空）
  if (newPassword.length() > 0 && newPassword.length() < 8) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"密码至少需要8位\"}");
    return;
  }
  
  // 保存到Preferences
  preferences.putString("apPassword", newPassword);
  apPassword = newPassword;
  
  server.send(200, "application/json", "{\"success\":true,\"message\":\"AP密码已更新\"}");
  
  // 延迟后重启以应用新密码
  delay(1000);
  ESP.restart();
}

// ==================== WebSocket ====================

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      // 客户端断开 - JSON格式日志
      {
        StaticJsonDocument<128> doc;
        doc["type"] = "system";
        doc["event"] = "websocket_disconnected";
        doc["client"] = num;
        serializeJson(doc, Serial);
        Serial.println();
      }
      break;
      
    case WStype_CONNECTED:
      {
        IPAddress ip = webSocket.remoteIP(num);
        
        // 客户端连接 - JSON格式日志
        StaticJsonDocument<256> logDoc;
        logDoc["type"] = "system";
        logDoc["event"] = "websocket_connected";
        logDoc["client"] = num;
        logDoc["ip"] = ip.toString();
        serializeJson(logDoc, Serial);
        Serial.println();
        
        // 发送欢迎消息
        StaticJsonDocument<512> doc;
        doc["type"] = "welcome";
        doc["device"] = DEVICE_NAME;
        doc["version"] = "1.2.0";
        doc["capabilities"]["heartRate"] = true;
        doc["capabilities"]["gesture"] = mpu6500Detected;
        doc["localThreshold"] = LOCAL_THRESHOLD;  // 告知PC端本地阈值
        
        String output;
        serializeJson(doc, output);
        webSocket.sendTXT(num, output);
      }
      break;
      
    case WStype_TEXT:
      {
        // 解析JSON命令
        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
          const char* cmd = doc["command"];
          
          if (strcmp(cmd, "getStatus") == 0) {
            StaticJsonDocument<512> response;
            response["type"] = "status";
            response["mpu6500Detected"] = mpu6500Detected;
            response["localThreshold"] = LOCAL_THRESHOLD;
            response["heartRate"] = beatAvg;
            response["fingerDetected"] = fingerDetected;
            
            String output;
            serializeJson(response, output);
            webSocket.sendTXT(num, output);
          }
        }
      }
      break;
  }
}

void broadcastHeartRate() {
  if (webSocket.connectedClients() == 0) return;
  
  StaticJsonDocument<256> doc;
  doc["type"] = "heartrate";
  doc["bpm"] = beatAvg;
  doc["instant"] = (int)beatsPerMinute;
  doc["fingerDetected"] = fingerDetected;
  doc["timestamp"] = millis();
  
  String output;
  serializeJson(doc, output);
  webSocket.broadcastTXT(output);
}

// ==================== 心率监测 ====================

void updateHeartRate() {
  long irValue = particleSensor.getIR();
  
  // 检测手指
  if (irValue < 50000) {
    if (fingerDetected) {
      fingerDetected = false;
      beatsPerMinute = 0;
      beatAvg = 0;
    }
    return;
  }
  
  fingerDetected = true;
  
  // 检测心跳
  if (checkForBeat(irValue)) {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    
    beatsPerMinute = 60 / (delta / 1000.0);
    
    // 过滤不合理的值
    if (beatsPerMinute < 40 || beatsPerMinute > 200) {
      return;
    }
    
    // 更新平均值
    rates[rateSpot++] = (byte)beatsPerMinute;
    rateSpot %= RATE_SIZE;
    
    beatAvg = 0;
    for (byte x = 0; x < RATE_SIZE; x++) {
      beatAvg += rates[x];
    }
    beatAvg /= RATE_SIZE;
    
    // 广播数据
    broadcastHeartRate();
  }
}

// ==================== 心跳输出 ====================

void printHeartbeat() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastHeartbeatPrint >= HEARTBEAT_INTERVAL) {
    lastHeartbeatPrint = currentTime;
    
    // 输出心跳信息到串口，格式为JSON
    StaticJsonDocument<512> doc;
    doc["type"] = "heartbeat";
    doc["apIP"] = WiFi.softAPIP().toString();
    doc["staConnected"] = staConnected;
    doc["staSsid"] = staSsid;
    doc["staIP"] = staIP;
    doc["heartRate"] = beatAvg;
    doc["fingerDetected"] = fingerDetected;
    doc["mpu6500Detected"] = mpu6500Detected;
    doc["localThreshold"] = LOCAL_THRESHOLD;
    
    serializeJson(doc, Serial);
    Serial.println(); // 换行
  }
}

// ==================== LED指示 ====================

void updateLED() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  
  unsigned long now = millis();
  
  if (fingerDetected && beatAvg > 0) {
    // 心跳闪烁
    unsigned long interval = 60000 / beatAvg; // 毫秒
    if (now - lastBlink >= interval / 2) {
      lastBlink = now;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
    }
  } else if (staConnected) {
    // 慢速闪烁 - 已连接WiFi
    if (now - lastBlink >= 1000) {
      lastBlink = now;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
    }
  } else {
    // 快速闪烁 - 仅AP模式
    if (now - lastBlink >= 200) {
      lastBlink = now;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
    }
  }
}

// ==================== MPU-6500 体感控制 ====================

/**
 * 初始化MPU-6500 (使用独立I2C1总线)
 */
bool initMPU6500() {
  // 检查WHO_AM_I寄存器
  I2C_MPU.beginTransmission(MPU6500_ADDR);
  I2C_MPU.write(MPU6500_WHO_AM_I);
  I2C_MPU.endTransmission(false);
  I2C_MPU.requestFrom(MPU6500_ADDR, 1);
  
  if (I2C_MPU.available()) {
    uint8_t whoami = I2C_MPU.read();
    
    // MPU-6500的WHO_AM_I应该是0x70
    if (whoami != 0x70) {
      return false;
    }
  } else {
    return false;
  }
  
  // 唤醒设备 (清除SLEEP位)
  I2C_MPU.beginTransmission(MPU6500_ADDR);
  I2C_MPU.write(MPU6500_PWR_MGMT_1);
  I2C_MPU.write(0x00);
  I2C_MPU.endTransmission(true);
  delay(100);
  
  // 配置加速度计: ±2g量程
  I2C_MPU.beginTransmission(MPU6500_ADDR);
  I2C_MPU.write(MPU6500_ACCEL_CONFIG);
  I2C_MPU.write(0x00);  // ±2g
  I2C_MPU.endTransmission(true);
  
  // 配置低通滤波器: 94Hz
  I2C_MPU.beginTransmission(MPU6500_ADDR);
  I2C_MPU.write(MPU6500_CONFIG);
  I2C_MPU.write(0x02);
  I2C_MPU.endTransmission(true);
  
  // MPU-6500配置完成 - JSON格式
  StaticJsonDocument<128> configDoc;
  configDoc["type"] = "system";
  configDoc["event"] = "mpu6500_configured";
  configDoc["localThreshold"] = LOCAL_THRESHOLD;
  configDoc["message"] = "硬编码,不可修改";
  serializeJson(configDoc, Serial);
  Serial.println();
  
  return true;
}

/**
 * 读取加速度数据 (使用独立I2C1总线)
 */
AccelData readAccelData() {
  AccelData data;
  
  I2C_MPU.beginTransmission(MPU6500_ADDR);
  I2C_MPU.write(MPU6500_ACCEL_XOUT_H);
  I2C_MPU.endTransmission(false);
  I2C_MPU.requestFrom(MPU6500_ADDR, 6);
  
  if (I2C_MPU.available() >= 6) {
    // 读取16位原始数据
    int16_t ax = (I2C_MPU.read() << 8) | I2C_MPU.read();
    int16_t ay = (I2C_MPU.read() << 8) | I2C_MPU.read();
    int16_t az = (I2C_MPU.read() << 8) | I2C_MPU.read();
    
    // 转换为g值
    data.x = ax / ACCEL_SCALE;
    data.y = ay / ACCEL_SCALE;
    data.z = az / ACCEL_SCALE;
    
    // 计算总加速度
    float totalMag = sqrt(data.x * data.x + 
                         data.y * data.y + 
                         data.z * data.z);
    
    // 去除重力1g (防止重力干扰)
    data.magnitude = abs(totalMag - 1.0);
  } else {
    data.x = 0;
    data.y = 0;
    data.z = 0;
    data.magnitude = 0;
  }
  
  return data;
}

/**
 * 发送体感事件 (WebSocket + 串口)
 * 注意: 不进行阈值判断,将所有数据发送给PC端
 */
void sendGestureEvent(AccelData accel) {
  StaticJsonDocument<256> doc;
  doc["type"] = "gesture";
  doc["magnitude"] = accel.magnitude;
  doc["ax"] = accel.x;
  doc["ay"] = accel.y;
  doc["az"] = accel.z;
  doc["timestamp"] = millis();
  
  String output;
  serializeJson(doc, output);
  
  // 发送到WebSocket
  if (webSocket.connectedClients() > 0) {
    webSocket.broadcastTXT(output);
  }
  
  // 发送到串口
  Serial.println(output);
}

/**
 * 更新体感控制 (主循环调用)
 * ESP32只过滤噪音 (硬编码LOCAL_THRESHOLD),实际阈值判断在PC端
 */
void updateGestureControl() {
  unsigned long now = millis();
  
  // 按采样率读取
  if (now - lastAccelRead < ACCEL_INTERVAL) {
    return;
  }
  lastAccelRead = now;
  
  AccelData accel = readAccelData();
  
  // 本地硬编码阈值判断 - 仅过滤噪音
  if (accel.magnitude > LOCAL_THRESHOLD) {
    // 防抖处理
    if (now - lastGestureTime > DEBOUNCE_TIME) {
      sendGestureEvent(accel);
      lastGestureTime = now;
    }
  }
}

/**
 * 处理串口命令
 */
void handleSerialCommands() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    
    if (cmd == "GET_STATUS") {
      // 输出设备状态
      StaticJsonDocument<512> doc;
      doc["type"] = "status";
      doc["apIP"] = WiFi.softAPIP().toString();
      doc["staConnected"] = staConnected;
      doc["staSsid"] = staSsid;
      doc["staIP"] = staIP;
      doc["heartRate"] = beatAvg;
      doc["fingerDetected"] = fingerDetected;
      doc["mpu6500Detected"] = mpu6500Detected;
      doc["localThreshold"] = LOCAL_THRESHOLD;
      
      serializeJson(doc, Serial);
      Serial.println();
    }
    else if (cmd == "GET_THRESHOLD") {
      StaticJsonDocument<256> doc;
      doc["type"] = "threshold_info";
      doc["localThreshold"] = LOCAL_THRESHOLD;
      doc["hardcoded"] = true;
      doc["message"] = "本地阈值固定,仅过滤噪音。实际体感阈值请在PC端IoT面板设置";
      
      serializeJson(doc, Serial);
      Serial.println();
    }
  }
}

// ==================== OTA 更新处理 ====================

// OTA 固件上传处理
void handleOTAUpload() {
  HTTPUpload& upload = server.upload();
  static File uploadFile;
  static mbedtls_md_context_t ctx;
  static unsigned char shaResult[32];
  
  if (upload.status == UPLOAD_FILE_START) {
    otaInProgress = true;
    
    // 删除旧的暂存文件
    if (FFat.exists(otaStagedFile)) {
      FFat.remove(otaStagedFile);
    }
    
    // 创建新文件
    uploadFile = FFat.open(otaStagedFile, FILE_WRITE);
    if (!uploadFile) {
      StaticJsonDocument<128> doc;
      doc["type"] = "ota";
      doc["event"] = "upload_error";
      doc["message"] = "Failed to create staging file";
      serializeJson(doc, Serial);
      Serial.println();
      return;
    }
    
    // 初始化 SHA256
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
    mbedtls_md_starts(&ctx);
    
    otaStagedSize = 0;
    
    StaticJsonDocument<128> doc;
    doc["type"] = "ota";
    doc["event"] = "upload_start";
    doc["filename"] = upload.filename.c_str();
    serializeJson(doc, Serial);
    Serial.println();
    
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (uploadFile) {
      uploadFile.write(upload.buf, upload.currentSize);
      mbedtls_md_update(&ctx, upload.buf, upload.currentSize);
      otaStagedSize += upload.currentSize;
    }
    
  } else if (upload.status == UPLOAD_FILE_END) {
    if (uploadFile) {
      uploadFile.close();
      
      // 完成 SHA256 计算
      mbedtls_md_finish(&ctx, shaResult);
      mbedtls_md_free(&ctx);
      
      // 转换为十六进制字符串
      otaStagedChecksum = "";
      for (int i = 0; i < 32; i++) {
        char hex[3];
        sprintf(hex, "%02x", shaResult[i]);
        otaStagedChecksum += hex;
      }
      
      StaticJsonDocument<256> doc;
      doc["type"] = "ota";
      doc["event"] = "upload_complete";
      doc["size"] = otaStagedSize;
      doc["checksum"] = otaStagedChecksum;
      serializeJson(doc, Serial);
      Serial.println();
    }
    
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    if (uploadFile) {
      uploadFile.close();
      FFat.remove(otaStagedFile);
    }
    otaInProgress = false;
    
    StaticJsonDocument<128> doc;
    doc["type"] = "ota";
    doc["event"] = "upload_aborted";
    serializeJson(doc, Serial);
    Serial.println();
  }
}

// OTA 上传完成后的响应
void handleOTAUploadResponse() {
  if (otaInProgress && otaStagedSize > 0) {
    StaticJsonDocument<256> doc;
    doc["success"] = true;
    doc["size"] = otaStagedSize;
    doc["checksum"] = otaStagedChecksum;
    
    String output;
    serializeJson(doc, output);
    server.send(200, "application/json", output);
  } else {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"上传失败\"}");
  }
}

// OTA 确认并应用
void handleOTAConfirm() {
  if (!otaInProgress || otaStagedSize == 0) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"No staged firmware\"}");
    return;
  }
  
  // 打开暂存文件
  File firmware = FFat.open(otaStagedFile, FILE_READ);
  if (!firmware) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Failed to open firmware\"}");
    return;
  }
  
  // 开始 OTA 更新
  if (!Update.begin(otaStagedSize)) {
    firmware.close();
    String error = Update.errorString();
    server.send(500, "application/json", "{\"success\":false,\"message\":\"" + error + "\"}");
    return;
  }
  
  StaticJsonDocument<128> doc;
  doc["type"] = "ota";
  doc["event"] = "applying";
  serializeJson(doc, Serial);
  Serial.println();
  
  // 写入固件
  size_t written = Update.writeStream(firmware);
  firmware.close();
  
  if (written != otaStagedSize) {
    Update.abort();
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Size mismatch\"}");
    return;
  }
  
  // 完成更新
  if (!Update.end(true)) {
    String error = Update.errorString();
    server.send(500, "application/json", "{\"success\":false,\"message\":\"" + error + "\"}");
    return;
  }
  
  // 清理暂存文件
  FFat.remove(otaStagedFile);
  
  doc.clear();
  doc["type"] = "ota";
  doc["event"] = "success";
  doc["version"] = FIRMWARE_VERSION;
  serializeJson(doc, Serial);
  Serial.println();
  
  server.send(200, "application/json", "{\"success\":true,\"message\":\"Update successful, rebooting...\"}");
  
  delay(1000);
  ESP.restart();
}

// OTA 取消
void handleOTACancel() {
  if (otaInProgress && FFat.exists(otaStagedFile)) {
    FFat.remove(otaStagedFile);
    otaInProgress = false;
    otaStagedSize = 0;
    otaStagedChecksum = "";
    
    StaticJsonDocument<128> doc;
    doc["type"] = "ota";
    doc["event"] = "cancelled";
    serializeJson(doc, Serial);
    Serial.println();
    
    server.send(200, "application/json", "{\"success\":true}");
  } else {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"No OTA in progress\"}");
  }
}

// OTA互联网下载 (Server-Sent Events流式传输)
void handleOTADownload() {
  // 检查是否已连接WiFi (STA模式)
  if (WiFi.status() != WL_CONNECTED) {
    server.send(400, "text/plain", "data: {\"success\":false,\"message\":\"需要先连接WiFi\"}\n\n");
    return;
  }
  
  // 获取URL参数
  if (!server.hasArg("url")) {
    server.send(400, "text/plain", "data: {\"success\":false,\"message\":\"缺少URL参数\"}\n\n");
    return;
  }
  
  String firmwareUrl = server.arg("url");
  
  // 删除旧的暂存文件
  if (FFat.exists(otaStagedFile)) {
    FFat.remove(otaStagedFile);
  }
  
  // 设置SSE响应头
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/event-stream", "");
  
  HTTPClient http;
  http.begin(firmwareUrl);
  http.setTimeout(30000); // 30秒超时
  
  int httpCode = http.GET();
  
  if (httpCode != HTTP_CODE_OK) {
    String errorMsg = "data: {\"success\":false,\"message\":\"HTTP错误: " + String(httpCode) + "\"}\n\n";
    server.sendContent(errorMsg);
    http.end();
    return;
  }
  
  int totalSize = http.getSize();
  if (totalSize <= 0) {
    server.sendContent("data: {\"success\":false,\"message\":\"无法获取文件大小\"}\n\n");
    http.end();
    return;
  }
  
  // 打开FFat文件写入
  File file = FFat.open(otaStagedFile, "w");
  if (!file) {
    server.sendContent("data: {\"success\":false,\"message\":\"无法创建暂存文件\"}\n\n");
    http.end();
    return;
  }
  
  // 初始化SHA256计算
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  const mbedtls_md_info_t *md_info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_setup(&ctx, md_info, 0);
  mbedtls_md_starts(&ctx);
  
  WiFiClient *stream = http.getStreamPtr();
  uint8_t buffer[512];
  int downloaded = 0;
  int lastProgress = -1;
  
  // 流式下载并计算SHA256
  while (http.connected() && (downloaded < totalSize || totalSize == -1)) {
    size_t available = stream->available();
    if (available) {
      int bytesRead = stream->readBytes(buffer, min((size_t)512, available));
      file.write(buffer, bytesRead);
      mbedtls_md_update(&ctx, buffer, bytesRead);
      downloaded += bytesRead;
      
      // 发送进度更新 (每10%更新一次)
      int progress = (downloaded * 100) / totalSize;
      if (progress != lastProgress && progress % 10 == 0) {
        String progressMsg = "event: progress\ndata: {\"progress\":" + String(progress) + 
                              ",\"downloaded\":" + String(downloaded) + 
                              ",\"total\":" + String(totalSize) + "}\n\n";
        server.sendContent(progressMsg);
        lastProgress = progress;
      }
    }
    delay(1);
  }
  
  file.close();
  http.end();
  
  // 完成SHA256计算
  unsigned char hash[32];
  mbedtls_md_finish(&ctx, hash);
  mbedtls_md_free(&ctx);
  
  // 转换为十六进制字符串
  String checksum = "";
  for (int i = 0; i < 32; i++) {
    char hex[3];
    sprintf(hex, "%02x", hash[i]);
    checksum += hex;
  }
  
  otaInProgress = true;
  otaStagedSize = downloaded;
  otaStagedChecksum = checksum;
  
  // 发送完成事件
  String completeMsg = "event: complete\ndata: {\"success\":true,\"checksum\":\"" + checksum + 
                       "\",\"size\":" + String(downloaded) + "}\n\n";
  server.sendContent(completeMsg);
  
  StaticJsonDocument<128> doc;
  doc["type"] = "ota";
  doc["event"] = "downloaded";
  doc["size"] = downloaded;
  doc["checksum"] = checksum;
  serializeJson(doc, Serial);
  Serial.println();
}

