// ====================================================================
// TERRA FLOW - ESP32 + Firebase (Código Final Corrigido)
// ====================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ===== CONFIGURAÇÕES (substitua com os seus dados) =====
const char* ssid = "Délfio André";
const char* password = "ovvx2646Ds.";
const char* firebaseHost = "https://terraflow-iot-default-rtdb.firebaseio.com";

// ===== PINOS =====
#define DHTPIN 4
#define DHTTYPE DHT11
#define SOIL_PIN 35
#define RELAY_PIN 33

// ===== INTERVALOS =====
const unsigned long sendInterval = 30000;   // enviar dados a cada 30s
const unsigned long commandInterval = 5000; // verificar comandos a cada 5s
const unsigned long modeInterval = 5000;    // verificar modo a cada 5s

// ===== LIMITES =====
const int LIMITE_SECO_PADRAO = 30;
const int LIMITE_UMIDO_PADRAO = 60;
const unsigned long MOTOR_MAX_TIME = 120000; // 2 minutos

// ===== CALIBRAÇÃO YL-69 =====
const int VALOR_SECO = 4095;
const int VALOR_UMIDO = 2000;

// ===== VARIÁVEIS GLOBAIS =====
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastSend = 0;
unsigned long lastCommandCheck = 0;
unsigned long lastModeCheck = 0;

bool motorState = false;
bool autoMode = false;          // ⭐ INICIA EM MODO MANUAL
unsigned long motorStartTime = 0;

int limiteSeco = LIMITE_SECO_PADRAO;
int limiteUmido = LIMITE_UMIDO_PADRAO;

float temperatura = 0;
float umidadeAr = 0;
int umidadeSolo = 0;

// ====================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== TERRA FLOW - ESP32 (INICIA EM MANUAL) ===\n");

    pinMode(SOIL_PIN, INPUT);
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);

    analogReadResolution(12);
    analogSetPinAttenuation(SOIL_PIN, ADC_11db);

    dht.begin();

    conectarWiFi();
    carregarConfiguracoes();
    lerModoDoFirebase();   // lê o modo do Firebase (se existir)

    // Força o modo MANUAL no Firebase, para alinhar com o ESP32
    enviarHttpPUT("configuracoes/modo.json", "manual");
    autoMode = false;

    Serial.println("✅ Sistema pronto. Modo: MANUAL");
}

// ====================================================================
void loop() {
    if (WiFi.status() != WL_CONNECTED) conectarWiFi();

    lerModoDoFirebase();        // atualiza o modo a cada 5s
    verificarComandos();        // processa comandos manuais e mudanças de modo

    if (millis() - lastSend >= sendInterval) {
        lerSensores();
        enviarDadosFirebase();
        lastSend = millis();
    }

    if (autoMode) {
        controleAutomatico();
    }

    // Timer de segurança (desliga motor após 2 min)
    if (motorState && (millis() - motorStartTime) > MOTOR_MAX_TIME) {
        desligarMotor();
        Serial.println("⏱️ Motor desligado por timeout (2 min)");
    }

    delay(100);
}

// ====================================================================
void conectarWiFi() {
    Serial.print("Conectando WiFi...");
    WiFi.begin(ssid, password);
    int tent = 0;
    while (WiFi.status() != WL_CONNECTED && tent < 30) {
        delay(500);
        Serial.print(".");
        tent++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✅ WiFi conectado! IP: " + WiFi.localIP().toString());
    } else {
        Serial.println("\n❌ Falha WiFi");
    }
}

// ====================================================================
void lerSensores() {
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();
    if (isnan(temp) || isnan(hum)) {
        temperatura = 0;
        umidadeAr = 0;
    } else {
        temperatura = temp;
        umidadeAr = hum;
    }

    int raw = analogRead(SOIL_PIN);
    if (raw < 500 || raw > 4000) {
        umidadeSolo = 0;
        Serial.printf("⚠️ YL-69 desconectado (RAW=%d)\n", raw);
    } else {
        umidadeSolo = map(raw, VALOR_UMIDO, VALOR_SECO, 100, 0);
        umidadeSolo = constrain(umidadeSolo, 0, 100);
    }

    Serial.printf("Temp: %.1f°C | HumAr: %.0f%% | Solo: %d%%\n", temperatura, umidadeAr, umidadeSolo);
    Serial.printf("Motor: %s | Modo: %s\n", motorState ? "LIGADO" : "DESLIGADO", autoMode ? "AUTO" : "MANUAL");
}

// ====================================================================
void enviarDadosFirebase() {
    if (WiFi.status() != WL_CONNECTED) return;

    StaticJsonDocument<256> doc;
    doc["temperatura"] = temperatura;
    doc["humidade"] = umidadeAr;
    doc["solo"] = umidadeSolo;
    doc["solo_raw"] = analogRead(SOIL_PIN);
    doc["motor"] = motorState;
    doc["modo"] = autoMode ? "auto" : "manual";
    doc["timestamp"] = millis();

    String json;
    serializeJson(doc, json);

    HTTPClient http;
    String url = String(firebaseHost) + "/sensores.json";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int code = http.PUT(json);
    if (code == 200) Serial.println("✅ Dados enviados");
    else Serial.printf("⚠️ Erro HTTP %d\n", code);
    http.end();
}

// ====================================================================
void lerModoDoFirebase() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (millis() - lastModeCheck < modeInterval) return;
    lastModeCheck = millis();

    HTTPClient http;
    String url = String(firebaseHost) + "/configuracoes/modo.json";
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
        String payload = http.getString();
        payload.trim();
        if (payload == "auto" && !autoMode) {
            autoMode = true;
            Serial.println("🔁 Modo alterado para: AUTOMÁTICO (via Firebase)");
        } else if (payload == "manual" && autoMode) {
            autoMode = false;
            Serial.println("🔁 Modo alterado para: MANUAL (via Firebase)");
        }
    }
    http.end();
}

// ====================================================================
void verificarComandos() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (millis() - lastCommandCheck < commandInterval) return;
    lastCommandCheck = millis();

    HTTPClient http;
    String url = String(firebaseHost) + "/comandos/motor.json";
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
        String payload = http.getString();
        payload.trim();
        if (payload != "null" && payload != "") {
            DynamicJsonDocument doc(512);
            deserializeJson(doc, payload);
            // Suporta ambos os formatos: { "estado": "on" } ou { "modo": "auto" }
            const char* estado = doc["estado"] | "";
            const char* modoCmd = doc["modo"] | "";

            if (strlen(modoCmd) > 0) {
                String m = String(modoCmd);
                Serial.printf("📩 Comando modo: %s | Modo atual: %s\n", m.c_str(), autoMode ? "AUTO" : "MANUAL");
                if (m == "auto") {
                    autoMode = true;
                    enviarHttpPUT("configuracoes/modo.json", "auto");
                    Serial.println("🤖 Modo alterado para AUTOMÁTICO via comando");
                } else if (m == "manual") {
                    autoMode = false;
                    enviarHttpPUT("configuracoes/modo.json", "manual");
                    Serial.println("🤖 Modo alterado para MANUAL via comando");
                }
            } else if (strlen(estado) > 0) {
                String e = String(estado);
                Serial.printf("📩 Comando estado: %s | Modo atual: %s\n", e.c_str(), autoMode ? "AUTO" : "MANUAL");
                if (e == "on") {
                    if (!autoMode) ligarMotor();
                    else Serial.println("⚠️ Comando 'on' ignorado (modo automático)");
                } else if (e == "off") {
                    if (!autoMode) desligarMotor();
                    else Serial.println("⚠️ Comando 'off' ignorado (modo automático)");
                } else if (e == "auto") {
                    autoMode = true;
                    enviarHttpPUT("configuracoes/modo.json", "auto");
                    Serial.println("🤖 Modo alterado para AUTOMÁTICO via comando");
                } else if (e == "manual") {
                    autoMode = false;
                    enviarHttpPUT("configuracoes/modo.json", "manual");
                    Serial.println("🤖 Modo alterado para MANUAL via comando");
                }
            }

            // Apagar comando
            http.begin(url);
            http.sendRequest("DELETE");
        }
    }
    http.end();
}

// ====================================================================
void ligarMotor() {
    if (motorState) return;
    digitalWrite(RELAY_PIN, HIGH);
    motorState = true;
    motorStartTime = millis();
    Serial.println("🔌 Motor LIGADO");
    enviarEstadoMotor();
}

void desligarMotor() {
    if (!motorState) return;
    digitalWrite(RELAY_PIN, LOW);
    motorState = false;
    motorStartTime = 0;
    Serial.println("🔌 Motor DESLIGADO");
    enviarEstadoMotor();
}

void enviarEstadoMotor() {
    StaticJsonDocument<128> doc;
    doc["motor"] = motorState;
    doc["modo"] = autoMode ? "auto" : "manual";
    String json;
    serializeJson(doc, json);
    enviarHttpPUT("sensores/motor.json", json);
}

// ====================================================================
void controleAutomatico() {
    if (!autoMode) return;
    if (umidadeSolo == 0) return; // sensor desconectado

    if (umidadeSolo < limiteSeco && !motorState) {
        ligarMotor();
        Serial.printf("💧 Solo seco (%d%% <%d%%) - LIGANDO (auto)\n", umidadeSolo, limiteSeco);
    }
    else if (umidadeSolo > limiteUmido && motorState) {
        desligarMotor();
        Serial.printf("✅ Solo úmido (%d%% >%d%%) - DESLIGANDO (auto)\n", umidadeSolo, limiteUmido);
    }
}

// ====================================================================
void carregarConfiguracoes() {
    HTTPClient http;
    String url = String(firebaseHost) + "/configuracoes/limites.json";
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(256);
        deserializeJson(doc, payload);
        limiteSeco = doc["seco"] | LIMITE_SECO_PADRAO;
        limiteUmido = doc["umido"] | LIMITE_UMIDO_PADRAO;
        Serial.printf("Limites: seco=%d%%, umido=%d%%\n", limiteSeco, limiteUmido);
    }
    http.end();
}

void enviarHttpPUT(String path, String dados) {
    HTTPClient http;
    String url = String(firebaseHost) + "/" + path;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    // Garante que strings simples sejam enviados como JSON válido (entre aspas)
    if (dados.length() > 0) {
        char first = dados.charAt(0);
        if (first != '{' && first != '[' && first != '"') {
            dados = String('"') + dados + String('"');
        }
    }
    http.PUT(dados);
    http.end();
}