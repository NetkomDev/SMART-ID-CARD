/*
  AKSIS Card Writer Station Firmware
  Hardware: ESP32 DevKit v1 + Adafruit / Elechouse PN532 NFC Module
  Protocol: Newline-delimited JSON over USB Serial (115200 baud)
  Card Type: MIFARE Classic 1K (13.56 MHz)
  
  Firmware Contract:
  - Baudrate: 115200
  - Commands received via Serial:
      {"id":"<uuid>","command":"READ_CARD"}
      {"id":"<uuid>","command":"WRITE_CARD","payload":"<str>","expected_uid":"<hex>"}
  - Responses sent via Serial:
      {"id":"<uuid>","ok":true,"uid":"<hex>","payload":"<str>"}
      {"id":"<uuid>","ok":true}
      {"id":"<uuid>","ok":false,"error":"<CODE>"}
*/

#include <Wire.h>
#include <SPI.h>
#include <Adafruit_PN532.h>
#include <ArduinoJson.h>

// Communication with PN532: I2C mode
// PN532 SDA -> ESP32 GPIO 21, SCL -> GPIO 22
#define PN532_IRQ   (4)
#define PN532_RESET (5)

Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET);

// MIFARE Classic default factory key (Key A)
static uint8_t keyA[6] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };
// Target data sector: Sector 1 (Blocks 4, 5, 6; Block 7 is sector trailer)
const uint8_t TARGET_BLOCK_START = 4;
const uint8_t MAX_PAYLOAD_LEN = 64;

void sendResponse(const String &id, bool ok, const String &uid = "", const String &payload = "", const String &error = "") {
  StaticJsonDocument<256> doc;
  doc["id"] = id;
  doc["ok"] = ok;
  if (uid.length() > 0) doc["uid"] = uid;
  if (payload.length() > 0) doc["payload"] = payload;
  if (error.length() > 0) doc["error"] = error;

  String output;
  serializeJson(doc, output);
  Serial.println(output);
}

String formatUid(uint8_t *uid, uint8_t uidLength) {
  String hexStr = "";
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) hexStr += "0";
    hexStr += String(uid[i], HEX);
  }
  hexStr.toUpperCase();
  return hexStr;
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    // PN532 not detected on bus
    return;
  }

  // Configure PN532 to read RFID tags
  nfc.SAMConfig();
}

void handleReadCard(const String &id) {
  uint8_t success;
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };
  uint8_t uidLength;

  success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 500);
  if (!success) {
    sendResponse(id, false, "", "", "NO_CARD");
    return;
  }

  String uidStr = formatUid(uid, uidLength);

  // Authenticate Sector 1 (Block 4) with Key A
  success = nfc.mifareclassic_AuthenticateBlock(uid, uidLength, TARGET_BLOCK_START, 0, keyA);
  if (!success) {
    sendResponse(id, false, uidStr, "", "AUTH_FAILED");
    return;
  }

  // Read Block 4 and Block 5 (16 bytes each = up to 32 bytes payload)
  uint8_t dataBlock[16];
  char payloadBuf[65];
  memset(payloadBuf, 0, sizeof(payloadBuf));

  success = nfc.mifareclassic_ReadDataBlock(4, dataBlock);
  if (success) {
    memcpy(payloadBuf, dataBlock, 16);
  }
  success = nfc.mifareclassic_ReadDataBlock(5, dataBlock);
  if (success) {
    memcpy(payloadBuf + 16, dataBlock, 16);
  }

  payloadBuf[64] = '\0';
  String payloadStr = String(payloadBuf);
  payloadStr.trim();

  sendResponse(id, true, uidStr, payloadStr, "");
}

void handleWriteCard(const String &id, const String &payload, const String &expectedUid) {
  uint8_t success;
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };
  uint8_t uidLength;

  success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 500);
  if (!success) {
    sendResponse(id, false, "", "", "NO_CARD");
    return;
  }

  String observedUid = formatUid(uid, uidLength);
  if (expectedUid.length() > 0 && !observedUid.equalsIgnoreCase(expectedUid)) {
    sendResponse(id, false, observedUid, "", "UID_MISMATCH");
    return;
  }

  // Authenticate Sector 1 with Key A
  success = nfc.mifareclassic_AuthenticateBlock(uid, uidLength, TARGET_BLOCK_START, 0, keyA);
  if (!success) {
    sendResponse(id, false, observedUid, "", "AUTH_FAILED");
    return;
  }

  // Prepare payload buffer (32 bytes across block 4 and 5)
  uint8_t block4[16];
  uint8_t block5[16];
  memset(block4, 0, sizeof(block4));
  memset(block5, 0, sizeof(block5));

  int pLen = payload.length();
  for (int i = 0; i < 16 && i < pLen; i++) {
    block4[i] = (uint8_t)payload.charAt(i);
  }
  for (int i = 0; i < 16 && (i + 16) < pLen; i++) {
    block5[i] = (uint8_t)payload.charAt(i + 16);
  }

  // Write Block 4
  success = nfc.mifareclassic_WriteDataBlock(4, block4);
  if (!success) {
    sendResponse(id, false, observedUid, "", "WRITE_BLOCK_4_FAILED");
    return;
  }

  // Write Block 5
  success = nfc.mifareclassic_WriteDataBlock(5, block5);
  if (!success) {
    sendResponse(id, false, observedUid, "", "WRITE_BLOCK_5_FAILED");
    return;
  }

  sendResponse(id, true, observedUid, "", "");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) return;

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) {
      sendResponse("unknown", false, "", "", "JSON_PARSE_ERROR");
      return;
    }

    const char *id = doc["id"];
    const char *command = doc["command"];
    if (!id || !command) {
      sendResponse(id ? String(id) : "unknown", false, "", "", "INVALID_COMMAND_FORMAT");
      return;
    }

    String cmdStr = String(command);
    if (cmdStr.equalsIgnoreCase("READ_CARD")) {
      handleReadCard(String(id));
    } else if (cmdStr.equalsIgnoreCase("WRITE_CARD")) {
      const char *payload = doc["payload"];
      const char *expectedUid = doc["expected_uid"];
      handleWriteCard(String(id), payload ? String(payload) : "", expectedUid ? String(expectedUid) : "");
    } else {
      sendResponse(String(id), false, "", "", "UNKNOWN_COMMAND");
    }
  }
}
