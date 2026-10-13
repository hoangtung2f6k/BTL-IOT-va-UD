#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ===================== CAU HINH WIFI =====================
const char* WIFI_SSID     = "FK";
const char* WIFI_PASSWORD = "oniichann3k";

// ===================== CAU HINH MQTT =====================
const char* MQTT_BROKER = "broker.emqx.io";
const int   MQTT_PORT   = 1883;
const char* MQTT_CLIENT_ID = "esp8266_iot_client_001";

const char* TOPIC_SENSOR   = "iot/room/1/sensor/data";
const char* TOPIC_CONTROL  = "iot/room/1/device/control";
const char* TOPIC_RESPONSE = "iot/room/1/device/response";

// ===================== CHAN (PINS) =====================
#define DHTPIN    D4
#define DHTTYPE   DHT11
#define LDRPIN    A0
#define PIN_LIGHT D5   // LED Do - Den
#define PIN_FAN   D6   // LED Vang - Quat
#define PIN_AC    D7   // LED Xanh - Dieu hoa

// ===================== NGUONG TU DONG =====================
const int   LIGHT_ON_THRESHOLD   = 400;
const int   LIGHT_OFF_THRESHOLD  = 450;
const float HUMID_ON_THRESHOLD   = 62.0;
const float HUMID_OFF_THRESHOLD  = 58.0;
const float TEMP_ON_THRESHOLD    = 28.0;
const float TEMP_OFF_THRESHOLD   = 27.0;

// ===================== DOI TUONG =====================
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ===================== TRANG THAI =====================
bool lightOn = false;
bool fanOn   = false;
bool acOn    = false;
// Khoi dong o che do THU CONG: cam dien vao mach khong tu bat thiet bi nao.
// Truoc day mac dinh la false (tu dong), nen vua cap nguon la quat va dieu hoa
// bat ngay khi phong qua 28 do C / 62% am - gan nhu luc nao cung dung o VN.
// Muon chay theo nguong thi go "AUTO" trong Serial Monitor.
bool manualMode = true;

// Luu trang thai cu de so sanh, chi gui MQTT khi co thay doi
bool prevLightOn = false;
bool prevFanOn   = false;
bool prevAcOn    = false;

unsigned long lastSensorSend = 0;
const unsigned long SENSOR_INTERVAL = 5000;

// Dinh ky bao lai trang thai 3 thiet bi cho server, phong truong hop
// server khoi dong sau mach nen bo lo lan bao truoc do.
unsigned long lastStateSync = 0;
const unsigned long STATE_SYNC_INTERVAL = 30000;

// ===================== DOC QUANG TRO =====================
int readLdrFiltered(uint8_t samples = 10) {
  long sum = 0;
  for (uint8_t i = 0; i < samples; i++) {
    sum += (1024 - analogRead(LDRPIN));
    delay(5);
  }
  return (int)(sum / samples);
}

// ===================== GUI TRANG THAI THIET BI LEN SERVER =====================
void publishDeviceState(const char* device, bool state) {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<200> res;
  res["device"] = device;
  res["action"] = state ? "ON" : "OFF";
  // Backend doc truong "state" de ghi vao devices.current_state.
  // Truoc day thieu truong nay nen web khong bao gio biet mach da doi trang thai.
  res["state"]  = state ? "ON" : "OFF";
  res["status"] = "SUCCESS";
  res["source"] = "AUTO";
  char buf[200];
  serializeJson(res, buf);
  mqttClient.publish(TOPIC_RESPONSE, buf);
  Serial.print("[SYNC] Da cap nhat: ");
  Serial.print(device);
  Serial.print(" -> ");
  Serial.println(state ? "ON" : "OFF");
}

// Gui ca 3 trang thai cung luc. Dung khi: vua ket noi MQTT, dieu khien bang
// lenh Serial, va dinh ky - de web lay lai dung trang thai ngay ca khi
// server khoi dong sau mach hoac bo lo mot goi tin.
void publishAllStates() {
  publishDeviceState("den", lightOn);
  publishDeviceState("quat", fanOn);
  publishDeviceState("dieuhoa", acOn);
}

// ===================== KET NOI WIFI =====================
void setupWifi() {
  Serial.print("\nDang ket noi WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\n=> WiFi OK! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n=> WiFi THAT BAI! Se thu lai sau...");
  }
}

// ===================== XU LY LENH MQTT TU WEB =====================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  Serial.print("\n[MQTT NHAN] Topic: ");
  Serial.print(topic);
  Serial.print(" | Data: ");
  Serial.println(msg);

  // Goi lenh kem JWT token dai ~290 byte -> ban 200 byte khong du cho de parse,
  // se bao "Loi parse JSON!". Tang len 512 byte.
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) { Serial.println("Loi parse JSON!"); return; }

  const char* device = doc["device"];
  const char* action = doc["action"];
  const char* requestId = doc["requestId"];
  if (!device || !action) return;

  String dev = String(device);
  String act = String(action);
  act.toUpperCase();

  manualMode = true;
  bool success = true;

  if (dev == "den") {
    lightOn = (act == "ON");
    digitalWrite(PIN_LIGHT, lightOn ? HIGH : LOW);
    prevLightOn = lightOn;
  } else if (dev == "quat") {
    fanOn = (act == "ON");
    digitalWrite(PIN_FAN, fanOn ? HIGH : LOW);
    prevFanOn = fanOn;
  } else if (dev == "dieuhoa") {
    acOn = (act == "ON");
    digitalWrite(PIN_AC, acOn ? HIGH : LOW);
    prevAcOn = acOn;
  } else {
    success = false;
  }

  // Gui phan hoi ve cho Backend (Topic 3) kem requestId
  StaticJsonDocument<256> res;
  res["device"] = device;
  res["action"] = action;
  res["state"] = act;
  res["status"] = success ? "SUCCESS" : "FAILED";
  if (requestId) res["requestId"] = requestId;
  char resBuffer[256];
  serializeJson(res, resBuffer);
  mqttClient.publish(TOPIC_RESPONSE, resBuffer);
  Serial.print("[WEB] ");
  Serial.print(device);
  Serial.print(" -> ");
  Serial.println(action);
}

// ===================== KET NOI MQTT =====================
void reconnectMqtt() {
  if (mqttClient.connected()) return;
  Serial.print("Dang ket noi MQTT...");
  if (mqttClient.connect(MQTT_CLIENT_ID)) {
    Serial.println(" OK!");
    mqttClient.subscribe(TOPIC_CONTROL);
    Serial.print("Da subscribe: ");
    Serial.println(TOPIC_CONTROL);
    // Vua noi lai duoc thi bao ngay trang thai hien tai cho server
    publishAllStates();
  } else {
    Serial.print(" THAT BAI (rc=");
    Serial.print(mqttClient.state());
    Serial.println("). Thu lai sau 5s...");
  }
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_AC, OUTPUT);
  digitalWrite(PIN_LIGHT, LOW);
  digitalWrite(PIN_FAN, LOW);
  digitalWrite(PIN_AC, LOW);

  dht.begin();
  setupWifi();

  // Mac dinh PubSubClient chi dem 256 byte -> goi lenh co kem JWT token (~290 byte)
  // se bi bo qua im lang. Tang len 512 de nhan duoc day du.
  mqttClient.setBufferSize(512);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  Serial.println("\n========= HE THONG IOT SAN SANG =========");
  Serial.println("Dieu khien qua Serial:");
  Serial.println("  DEN ON / DEN OFF");
  Serial.println("  QUAT ON / QUAT OFF");
  Serial.println("  AC ON / AC OFF");
  Serial.println("  AUTO  (chuyen sang che do tu dong)");
  Serial.println("------------------------------------------");
  Serial.println("Che do hien tai: THU CONG - khong tu bat gi ca.");
  Serial.println("==========================================");
}

// ===================== LOOP =====================
void loop() {
  if (WiFi.status() != WL_CONNECTED) setupWifi();
  if (!mqttClient.connected()) reconnectMqtt();
  mqttClient.loop();

  // Dong bo lai trang thai thiet bi theo chu ky (dat truoc khoi doc cam bien
  // vi khoi do co the "return" som khi DHT loi)
  if (millis() - lastStateSync >= STATE_SYNC_INTERVAL) {
    lastStateSync = millis();
    publishAllStates();
  }

  // ---- Lenh tu Serial Monitor ----
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "DEN ON")        { manualMode = true; lightOn = true; }
    else if (cmd == "DEN OFF")  { manualMode = true; lightOn = false; }
    else if (cmd == "QUAT ON")  { manualMode = true; fanOn = true; }
    else if (cmd == "QUAT OFF") { manualMode = true; fanOn = false; }
    else if (cmd == "AC ON")    { manualMode = true; acOn = true; }
    else if (cmd == "AC OFF")   { manualMode = true; acOn = false; }
    else if (cmd == "AUTO")     { manualMode = false; Serial.println("[TU DONG] -> CHE DO TU DONG"); }

    digitalWrite(PIN_LIGHT, lightOn ? HIGH : LOW);
    digitalWrite(PIN_FAN, fanOn ? HIGH : LOW);
    digitalWrite(PIN_AC, acOn ? HIGH : LOW);
    prevLightOn = lightOn;
    prevFanOn = fanOn;
    prevAcOn = acOn;

    Serial.print("[THU CONG] DEN="); Serial.print(lightOn ? "ON" : "OFF");
    Serial.print(" QUAT="); Serial.print(fanOn ? "ON" : "OFF");
    Serial.print(" AC="); Serial.println(acOn ? "ON" : "OFF");

    // Lenh go tu Serial Monitor truoc day chi doi chan GPIO ma khong bao
    // cho server, nen web van hien thi trang thai cu.
    publishAllStates();
    lastStateSync = millis();
  }

  // ---- Doc cam bien & gui data moi 2 giay ----
  if (millis() - lastSensorSend >= SENSOR_INTERVAL) {
    lastSensorSend = millis();

    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();
    int   lightRaw    = readLdrFiltered();

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Loi: Khong doc duoc DHT11!");
      return;
    }

    // ---- Logic Tu dong (chi chay khi khong o manualMode) ----
    if (!manualMode) {
      // Den theo anh sang
      if (lightRaw < LIGHT_ON_THRESHOLD) lightOn = true;
      else if (lightRaw > LIGHT_OFF_THRESHOLD) lightOn = false;

      // Quat theo do am
      if (humidity > HUMID_ON_THRESHOLD) fanOn = true;
      else if (humidity < HUMID_OFF_THRESHOLD) fanOn = false;

      // Dieu hoa theo nhiet do
      if (temperature > TEMP_ON_THRESHOLD) acOn = true;
      else if (temperature < TEMP_OFF_THRESHOLD) acOn = false;

      // Cap nhat LED
      digitalWrite(PIN_LIGHT, lightOn ? HIGH : LOW);
      digitalWrite(PIN_FAN, fanOn ? HIGH : LOW);
      digitalWrite(PIN_AC, acOn ? HIGH : LOW);

      // Neu trang thai thay doi -> gui cap nhat len Server
      if (lightOn != prevLightOn) {
        publishDeviceState("den", lightOn);
        prevLightOn = lightOn;
      }
      if (fanOn != prevFanOn) {
        publishDeviceState("quat", fanOn);
        prevFanOn = fanOn;
      }
      if (acOn != prevAcOn) {
        publishDeviceState("dieuhoa", acOn);
        prevAcOn = acOn;
      }
    }

    // ---- Gui data cam bien len Server qua MQTT ----
    if (mqttClient.connected()) {
      StaticJsonDocument<200> doc;
      doc["temperature"] = round(temperature * 10) / 10.0;
      doc["humidity"]    = round(humidity * 10) / 10.0;
      doc["lightRaw"]    = lightRaw;
      char buffer[200];
      serializeJson(doc, buffer);
      mqttClient.publish(TOPIC_SENSOR, buffer);
    }

    // ---- In ra Serial Monitor ----
    Serial.print("Temp: "); Serial.print(temperature, 1); Serial.print("*C");
    Serial.print(" | Humid: "); Serial.print(humidity, 1); Serial.print("%");
    Serial.print(" | Light: "); Serial.print(lightRaw);
    
    
    
    Serial.println();
  }
}
