// ===== CONFIGURAÇÕES FIREBASE =====
const firebaseConfig = {
    apiKey: "AIzaSyAmCLjrlCifSFtBjMmqYCr1b0mIQzNs3BM",
    authDomain: "terraflow-iot.firebaseapp.com",
    databaseURL: "https://terraflow-iot-default-rtdb.firebaseio.com",
    projectId: "terraflow-iot",
    storageBucket: "terraflow-iot.firebasestorage.app",
    messagingSenderId: "587013523936",
    appId: "1:587013523936:web:c96773b6ee7621835c0385"
};
const VAPID_KEY = "BE3EvV6kB9ZEnaR6LxVACZiMKUb2eNdrL3rM7MuN7cv6ed_LQYziva2LI3eJNpqqwNH6ZQ7phXl98nyJQxtTmdo";
const WEATHER_API_KEY = "ca50095dd2e55f8a7fff4b1c5db19763";

let database, messaging;
let usuarioAtual = '';
let motorEstado = 'off';
let autoMode = false;
let sensoresAdicionais = [];
let map;
let charts = {};
let lastUpdateTime = 0;
const OFFLINE_TIMEOUT = 60000;

let motorStartTime = 0;
const MOTOR_MAX_TIME = 120000;
let rainAlertActive = false;
let chanceChuva = 0;
const HYSTERESIS_OFFSET = 5;

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = 'fa-info-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    if (type === 'error') icon = 'fa-times-circle';
    if (type === 'success') icon = 'fa-check-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function togglePasswordVisibility() {
    const input = document.getElementById('access-code');
    const icon = document.getElementById('passwordToggleIcon');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function fazerLogin() {
    const code = document.getElementById('access-code').value;
    if (code === '1234') {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.add('visible');
        document.getElementById('userDisplay').textContent = document.getElementById('username').value || 'Usuário';
        usuarioAtual = document.getElementById('username').value || 'Usuário';
        document.querySelector('.nav-item[data-page="dashboard"]').classList.add('active');
        
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
        
        iniciarFirebase();
        iniciarDashboard();
        iniciarMapa();
        iniciarPrevisaoTempo();
        iniciarModeloIA();
        
        setTimeout(() => {
            if (overlay) overlay.style.display = 'none';
        }, 1000);
    } else {
        alert('Código inválido! Use 1234');
    }
}

function logout() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard-screen').classList.remove('visible');
}

function mudarPagina(pagina) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${pagina}"]`).classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pagina}`).classList.add('active');
    const titulos = { dashboard: 'Dashboard', graficos: 'Gráficos', dispositivos: 'Dispositivos', alertas: 'Alertas', configuracoes: 'Configurações' };
    document.getElementById('pageTitle').textContent = titulos[pagina];
    if (pagina === 'dispositivos' && map) setTimeout(() => map.invalidateSize(), 100);
    if (pagina === 'alertas') carregarLogs();
    if (window.innerWidth <= 768) toggleSidebar();
}

function atualizarDataHora() {
    const agora = new Date();
    document.getElementById('currentDate').textContent = agora.toLocaleDateString('pt-BR');
    document.getElementById('currentTime').textContent = agora.toLocaleTimeString('pt-BR');
}

function iniciarFirebase() {
    try {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        messaging = firebase.messaging();
        console.log('✅ Firebase conectado');

        setTimeout(() => {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay && overlay.style.display === 'flex') overlay.style.display = 'none';
        }, 3000);

        database.ref('sensores').on('value', (snapshot) => {
            const dados = snapshot.val();
            if (dados) {
                atualizarDadosFirebase(dados);
                lastUpdateTime = Date.now();
            }
        });

        setInterval(() => {
            if (lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > OFFLINE_TIMEOUT) {
                resetToOffline();
            }
        }, 10000);

        const updateHistereseDisplay = () => {
            const limUmido = parseInt(document.getElementById('limiteUmido').value);
            const histereseVal = limUmido - HYSTERESIS_OFFSET;
            document.getElementById('histereseDisplay').innerText = histereseVal;
        };
        document.getElementById('limiteUmido').addEventListener('change', updateHistereseDisplay);
        updateHistereseDisplay();

    } catch(e) { console.error('Firebase erro:', e); }
}

function resetToOffline() {
    console.log("⚠️ ESP32 offline detectado!");
    document.getElementById('tempValue').textContent = '--.- °C';
    document.getElementById('tempProgress').style.width = '0%';
    document.getElementById('tempStatus').innerHTML = '⏳ Aguardando dados';
    document.getElementById('tempStatus').className = 'sensor-status status-offline';
    document.getElementById('humValue').textContent = '--.- %';
    document.getElementById('humProgress').style.width = '0%';
    document.getElementById('humStatus').innerHTML = '⏳ Aguardando dados';
    document.getElementById('humStatus').className = 'sensor-status status-offline';
    document.getElementById('soilValue').textContent = '--.- %';
    document.getElementById('soilProgress').style.width = '0%';
    document.getElementById('soilStatus').innerHTML = '⏳ Aguardando dados';
    document.getElementById('soilStatus').className = 'sensor-status status-offline';
    
    document.getElementById('espStatus').innerHTML = 'Offline';
    document.getElementById('espStatus').className = 'status-value offline';
    document.getElementById('espStatus2').innerHTML = 'Offline';
    document.getElementById('espStatus2').className = 'status-value offline';
    document.getElementById('wifiStatus').innerHTML = 'Desconectado';
    document.getElementById('wifiStatus').className = 'status-value offline';
    document.getElementById('wifiStatus2').innerHTML = 'Desconectado';
    document.getElementById('wifiStatus2').className = 'status-value offline';
    document.getElementById('espIP').textContent = '---.---.---.---';
    document.getElementById('ultimaComunicacao').textContent = '---';
    
    document.getElementById('sensorTempStatus').innerHTML = 'Desconectado';
    document.getElementById('sensorTempStatus').className = 'status-value offline';
    document.getElementById('sensorHumStatus').innerHTML = 'Desconectado';
    document.getElementById('sensorHumStatus').className = 'status-value offline';
    document.getElementById('sensorSoilStatus').innerHTML = 'Desconectado';
    document.getElementById('sensorSoilStatus').className = 'status-value offline';
    document.getElementById('sensorTempStatusCard').innerHTML = 'Desconectado';
    document.getElementById('sensorTempStatusCard').className = 'status-value offline';
    document.getElementById('sensorHumStatusCard').innerHTML = 'Desconectado';
    document.getElementById('sensorHumStatusCard').className = 'status-value offline';
    document.getElementById('sensorSoilStatusCard').innerHTML = 'Desconectado';
    document.getElementById('sensorSoilStatusCard').className = 'status-value offline';
    
    document.getElementById('motorStatusDisplay').innerHTML = 'Desconectado';
    document.getElementById('motorStatusDisplay').className = 'status-value offline';
    document.getElementById('motorStatusDisplay2').innerHTML = 'Desconectado';
    document.getElementById('motorStatusDisplay2').className = 'status-value offline';
    document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-motor"></i> Sistema aguardando conexão';
    document.getElementById('motorStatusBar').style.background = 'var(--gray-100)';
    
    document.querySelectorAll('.btn-control').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
    
    addAlert('⚠️ ESP32 offline! Aguardando reconexão...', 'warning');
}

function controlarMotor(comando) {
    if (comando === 'on' && autoMode) {
        showToast('❌ Modo automático ativo! Para ligar manualmente, desative o modo automático.', 'warning');
        return;
    }
    if (comando === 'off' && autoMode) {
        showToast('❌ Modo automático ativo! Para desligar manualmente, desative o modo automático.', 'warning');
        return;
    }
    if (comando === 'auto') {
        autoMode = true;
        document.getElementById('autoModeToggle').classList.add('active');
        showToast('🤖 Modo automático ativado! A irrigação será controlada pela umidade do solo.', 'success');
        document.querySelectorAll('.btn-control').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.btn-control.auto').classList.add('active');
        document.querySelector('.btn-control.on').disabled = true;
        document.querySelector('.btn-control.off').disabled = true;
        document.querySelector('.btn-control.on').style.opacity = '0.5';
        document.querySelector('.btn-control.off').style.opacity = '0.5';
        if (database) database.ref('comandos/motor').set({ estado: 'auto', timestamp: Date.now() });
        addAlert('Modo automático ativado', 'success');
        registrarLog('motor', 'Modo automático ativado');
        return;
    }
    
    if (comando === 'on') {
        if (document.getElementById('motorStatusDisplay').textContent === 'Ligado') {
            showToast('⚠️ Motor já está ligado!', 'warning');
            return;
        }
        motorEstado = 'on';
        motorStartTime = Date.now();
        document.getElementById('motorStatusDisplay').textContent = 'Ligado';
        document.getElementById('motorStatusDisplay').className = 'status-value online';
        document.getElementById('motorStatusDisplay2').textContent = 'Ligado';
        document.getElementById('motorStatusDisplay2').className = 'status-value online';
        document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-play-circle"></i> Motor LIGADO (Manual)';
        document.getElementById('motorStatusBar').style.background = '#d1fae5';
        document.querySelectorAll('.btn-control').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.btn-control.on').classList.add('active');
        addAlert('Motor ligado manualmente', 'success');
        registrarLog('motor', 'Motor ligado manualmente');
        if (database) database.ref('comandos/motor').set({ estado: 'on', timestamp: Date.now() });
        setTimeout(() => {
            if (motorEstado === 'on' && document.getElementById('motorStatusDisplay').textContent === 'Ligado') {
                controlarMotor('off');
                showToast('⏱️ Motor desligado automaticamente após 2 minutos!', 'info');
                addAlert('⏱️ Motor desligado automaticamente (tempo máximo de 2 minutos)', 'warning');
            }
        }, MOTOR_MAX_TIME);
    } else if (comando === 'off') {
        if (document.getElementById('motorStatusDisplay').textContent === 'Desligado') {
            showToast('⚠️ Motor já está desligado!', 'warning');
            return;
        }
        motorEstado = 'off';
        motorStartTime = 0;
        document.getElementById('motorStatusDisplay').textContent = 'Desligado';
        document.getElementById('motorStatusDisplay').className = 'status-value offline';
        document.getElementById('motorStatusDisplay2').textContent = 'Desligado';
        document.getElementById('motorStatusDisplay2').className = 'status-value offline';
        document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-stop-circle"></i> Motor DESLIGADO (Manual)';
        document.getElementById('motorStatusBar').style.background = '#fee2e2';
        document.querySelectorAll('.btn-control').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.btn-control.off').classList.add('active');
        addAlert('Motor desligado manualmente', 'info');
        registrarLog('motor', 'Motor desligado manualmente');
        if (database) database.ref('comandos/motor').set({ estado: 'off', timestamp: Date.now() });
    }
}

function toggleAutoMode() {
    const toggle = document.getElementById('autoModeToggle');
    if (autoMode) {
        autoMode = false;
        toggle.classList.remove('active');
        showToast('🔧 Modo manual ativado! Você controla a irrigação manualmente.', 'info');
        addAlert('Modo manual ativado', 'info');
        registrarLog('config', 'Modo manual ativado');
        document.querySelector('.btn-control.on').disabled = false;
        document.querySelector('.btn-control.off').disabled = false;
        document.querySelector('.btn-control.on').style.opacity = '1';
        document.querySelector('.btn-control.off').style.opacity = '1';
        document.querySelector('.btn-control.auto').classList.remove('active');
    } else {
        autoMode = true;
        toggle.classList.add('active');
        showToast('🤖 Modo automático ativado! A irrigação será controlada pela umidade do solo.', 'success');
        addAlert('Modo automático ativado', 'success');
        registrarLog('config', 'Modo automático ativado');
        document.querySelector('.btn-control.on').disabled = true;
        document.querySelector('.btn-control.off').disabled = true;
        document.querySelector('.btn-control.on').style.opacity = '0.5';
        document.querySelector('.btn-control.off').style.opacity = '0.5';
        document.querySelector('.btn-control.auto').classList.add('active');
        document.querySelector('.btn-control.on').classList.remove('active');
        document.querySelector('.btn-control.off').classList.remove('active');
        if (database) database.ref('comandos/motor').set({ estado: 'auto', timestamp: Date.now() });
    }
}

function atualizarDadosFirebase(dados) {
    console.log("📥 Dados recebidos:", dados);
    if (lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > OFFLINE_TIMEOUT) {
        addAlert('✅ ESP32 reconectado! Dados recebidos.', 'success');
    }
    lastUpdateTime = Date.now();
    
    if (dados.temperatura !== undefined && dados.temperatura !== null) {
        let temp = parseFloat(dados.temperatura);
        if (!isNaN(temp)) {
            document.getElementById('tempValue').textContent = temp + ' °C';
            const TEMP_MAX = 45;
            let percent = (temp / TEMP_MAX) * 100;
            if (percent > 100) percent = 100;
            document.getElementById('tempProgress').style.width = percent + '%';
            document.getElementById('tempStatus').innerHTML = '✓ Online';
            document.getElementById('tempStatus').className = 'sensor-status status-good';
            document.getElementById('configTempStatus').innerHTML = temp + '°C';
            document.getElementById('configTempStatus').className = 'status-value online';
            document.getElementById('sensorTempStatus').innerHTML = temp + '°C';
            document.getElementById('sensorTempStatus').className = 'status-value online';
            document.getElementById('sensorTempStatusCard').innerHTML = temp + '°C';
            document.getElementById('sensorTempStatusCard').className = 'status-value online';
        }
    }
    
    if (dados.humidade !== undefined && dados.humidade !== null) {
        let hum = parseFloat(dados.humidade);
        if (!isNaN(hum)) {
            document.getElementById('humValue').textContent = hum + ' %';
            document.getElementById('humProgress').style.width = hum + '%';
            document.getElementById('humStatus').innerHTML = '✓ Online';
            document.getElementById('humStatus').className = 'sensor-status status-good';
            document.getElementById('configHumStatus').innerHTML = hum + '%';
            document.getElementById('configHumStatus').className = 'status-value online';
            document.getElementById('sensorHumStatus').innerHTML = hum + '%';
            document.getElementById('sensorHumStatus').className = 'status-value online';
            document.getElementById('sensorHumStatusCard').innerHTML = hum + '%';
            document.getElementById('sensorHumStatusCard').className = 'status-value online';
        }
    }
    
    if (dados.solo !== undefined && dados.solo !== null) {
        let solo = parseFloat(dados.solo);
        if (!isNaN(solo)) {
            document.getElementById('soilValue').textContent = solo + ' %';
            document.getElementById('soilProgress').style.width = solo + '%';
            document.getElementById('soilStatus').innerHTML = '✓ Online';
            document.getElementById('soilStatus').className = 'sensor-status status-good';
            document.getElementById('configSoilStatus').innerHTML = solo + '%';
            document.getElementById('configSoilStatus').className = 'status-value online';
            document.getElementById('sensorSoilStatus').innerHTML = solo + '%';
            document.getElementById('sensorSoilStatus').className = 'status-value online';
            document.getElementById('sensorSoilStatusCard').innerHTML = solo + '%';
            document.getElementById('sensorSoilStatusCard').className = 'status-value online';
            
            if (autoMode) {
                const limiteSeco = parseInt(document.getElementById('limiteSeco')?.value || 30);
                const limiteUmido = parseInt(document.getElementById('limiteUmido')?.value || 60);
                const limiteDesligar = limiteUmido - HYSTERESIS_OFFSET;
                const motorLigadoAtual = document.getElementById('motorStatusDisplay').textContent === 'Ligado';
                
                if (solo < limiteSeco && !motorLigadoAtual) {
                    motorEstado = 'on';
                    motorStartTime = Date.now();
                    document.getElementById('motorStatusDisplay').textContent = 'Ligado (Auto)';
                    document.getElementById('motorStatusDisplay').className = 'status-value online';
                    document.getElementById('motorStatusDisplay2').textContent = 'Ligado (Auto)';
                    document.getElementById('motorStatusDisplay2').className = 'status-value online';
                    document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-play-circle"></i> Motor LIGADO (Automático)';
                    document.getElementById('motorStatusBar').style.background = '#d1fae5';
                    addAlert('💧 Solo seco! Irrigação automática ligada', 'warning');
                    registrarLog('motor', 'Irrigação automática LIGADA - Solo seco: ' + solo + '%');
                    if (database) database.ref('comandos/motor').set({ estado: 'on', timestamp: Date.now() });
                    setTimeout(() => {
                        if (autoMode && document.getElementById('motorStatusDisplay').textContent.includes('Ligado')) {
                            motorEstado = 'off';
                            document.getElementById('motorStatusDisplay').textContent = 'Desligado (Auto)';
                            document.getElementById('motorStatusDisplay').className = 'status-value offline';
                            document.getElementById('motorStatusDisplay2').textContent = 'Desligado (Auto)';
                            document.getElementById('motorStatusDisplay2').className = 'status-value offline';
                            document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-stop-circle"></i> Motor DESLIGADO (Automático)';
                            document.getElementById('motorStatusBar').style.background = '#fee2e2';
                            addAlert('⏱️ Motor desligado automaticamente após 2 minutos (Auto)', 'info');
                            if (database) database.ref('comandos/motor').set({ estado: 'off', timestamp: Date.now() });
                        }
                    }, MOTOR_MAX_TIME);
                } else if (solo > limiteDesligar && motorLigadoAtual) {
                    motorEstado = 'off';
                    motorStartTime = 0;
                    document.getElementById('motorStatusDisplay').textContent = 'Desligado (Auto)';
                    document.getElementById('motorStatusDisplay').className = 'status-value offline';
                    document.getElementById('motorStatusDisplay2').textContent = 'Desligado (Auto)';
                    document.getElementById('motorStatusDisplay2').className = 'status-value offline';
                    document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-stop-circle"></i> Motor DESLIGADO (Automático)';
                    document.getElementById('motorStatusBar').style.background = '#fee2e2';
                    addAlert('✅ Solo úmido! Irrigação automática desligada', 'success');
                    registrarLog('motor', 'Irrigação automática DESLIGADA - Solo úmido: ' + solo + '%');
                    if (database) database.ref('comandos/motor').set({ estado: 'off', timestamp: Date.now() });
                }
            }
        }
    }
    
    if (autoMode) {
        document.querySelector('.btn-control.on').disabled = true;
        document.querySelector('.btn-control.off').disabled = true;
        document.querySelector('.btn-control.on').style.opacity = '0.5';
        document.querySelector('.btn-control.off').style.opacity = '0.5';
        document.querySelector('.btn-control.auto').classList.add('active');
        document.getElementById('autoModeToggle').classList.add('active');
    } else {
        document.querySelector('.btn-control.on').disabled = false;
        document.querySelector('.btn-control.off').disabled = false;
        document.querySelector('.btn-control.on').style.opacity = '1';
        document.querySelector('.btn-control.off').style.opacity = '1';
        document.querySelector('.btn-control.auto').classList.remove('active');
        document.getElementById('autoModeToggle').classList.remove('active');
    }
    
    document.getElementById('espStatus').innerHTML = 'Online';
    document.getElementById('espStatus').className = 'status-value online';
    document.getElementById('espStatus2').innerHTML = 'Online';
    document.getElementById('espStatus2').className = 'status-value online';
    document.getElementById('wifiStatus').innerHTML = 'Conectado';
    document.getElementById('wifiStatus').className = 'status-value online';
    document.getElementById('wifiStatus2').innerHTML = 'Conectado';
    document.getElementById('wifiStatus2').className = 'status-value online';
    if (dados.ip) document.getElementById('espIP').textContent = dados.ip;
    document.getElementById('ultimaComunicacao').textContent = new Date().toLocaleTimeString();
    
    document.querySelectorAll('.btn-control').forEach(btn => { btn.disabled = false; btn.style.opacity = '1'; });
    
    atualizarGraficos(dados);
}

function atualizarGraficos(dados) {
    const hora = new Date().getHours();
    if (charts.mainChart) {
        charts.mainChart.data.datasets[0].data[hora] = dados.temperatura;
        charts.mainChart.data.datasets[1].data[hora] = dados.humidade;
        charts.mainChart.data.datasets[2].data[hora] = dados.solo;
        charts.mainChart.update();
    }
    if (charts.tempChart && dados.temperatura) {
        charts.tempChart.data.datasets[0].data[hora] = dados.temperatura;
        charts.tempChart.update();
    }
    if (charts.humChart && dados.humidade) {
        charts.humChart.data.datasets[0].data[hora] = dados.humidade;
        charts.humChart.update();
    }
    if (charts.soilChart && dados.solo) {
        charts.soilChart.data.datasets[0].data[hora] = dados.solo;
        charts.soilChart.update();
    }
}

function toggleDarkMode() {
    const toggle = document.getElementById('darkModeToggle');
    toggle.classList.toggle('active');
    if (toggle.classList.contains('active')) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

function iniciarMapa() {
    map = L.map('map').setView([-15.1167, 39.2667], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.marker([-15.1167, 39.2667]).addTo(map).bindPopup('<b>ESP32</b><br>Aguardando dados...');
}

async function iniciarPrevisaoTempo() {
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&units=metric&lang=pt_br&appid=${WEATHER_API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            let maxPop = 0;
            for (let i = 0; i < 2; i++) {
                if (data.list[i] && data.list[i].pop) {
                    maxPop = Math.max(maxPop, data.list[i].pop * 100);
                }
            }
            chanceChuva = maxPop;
            const primeiraPrevisao = data.list[0];
            const icone = primeiraPrevisao.weather[0].icon;
            const temp = primeiraPrevisao.main.temp;
            const desc = primeiraPrevisao.weather[0].description;
            document.getElementById('previsaoConteudo').innerHTML = `
                <img src="https://openweathermap.org/img/wn/${icone}.png">
                <div>
                    <strong>${temp}°C</strong> - ${desc}<br>
                    <small>🌧️ Chance de chuva: ${chanceChuva}%</small>
                </div>
            `;
            
            const rainAlertDiv = document.getElementById('rainAlert');
            const rainAlertMsg = document.getElementById('rainAlertMsg');
            if (chanceChuva > 90) {
                rainAlertDiv.style.display = 'flex';
                rainAlertMsg.innerHTML = `🌧️ Atenção: ${chanceChuva}% de chance de chuva. Considere suspender a irrigação manualmente.`;
                if (!rainAlertActive) {
                    rainAlertActive = true;
                    addAlert(`🌧️ Alerta: ${chanceChuva}% de chance de chuva nas próximas horas.`, 'warning');
                }
            } else {
                rainAlertDiv.style.display = 'none';
                if (rainAlertActive) {
                    rainAlertActive = false;
                    addAlert('✅ Condições normais. Alerta de chuva encerrado.', 'success');
                }
            }
        } catch(e) {
            console.error('Erro previsão:', e);
            document.getElementById('previsaoConteudo').innerHTML = 'Erro na previsão';
        }
    }, () => {
        document.getElementById('previsaoConteudo').innerHTML = 'Permita localização';
    });
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) recognition = new SpeechRecognition();

function iniciarEscuta() {
    if (!recognition) { alert('Seu navegador não suporta voz'); return; }
    const btn = document.querySelector('.voice-btn');
    btn.classList.add('listening');
    btn.innerHTML = '<i class="fas fa-microphone"></i> Ouvindo...';
    recognition.start();
    recognition.onresult = (e) => {
        const comando = e.results[0][0].transcript.toLowerCase();
        btn.classList.remove('listening');
        btn.innerHTML = '<i class="fas fa-microphone"></i> Comando de Voz';
        if (comando.includes('modo automático') || comando.includes('modo auto')) {
            toggleAutoMode();
        } else if (comando.includes('ligar motor')) {
            controlarMotor('on');
        } else if (comando.includes('desligar motor')) {
            controlarMotor('off');
        } else {
            showToast('Comando não reconhecido: ' + comando, 'warning');
        }
    };
    recognition.onerror = () => { btn.classList.remove('listening'); btn.innerHTML = '<i class="fas fa-microphone"></i> Comando de Voz'; };
    recognition.onend = () => { btn.classList.remove('listening'); btn.innerHTML = '<i class="fas fa-microphone"></i> Comando de Voz'; };
}

let modeloPrevisao;
async function iniciarModeloIA() {
    modeloPrevisao = tf.sequential();
    modeloPrevisao.add(tf.layers.dense({ units: 10, inputShape: [1], activation: 'relu' }));
    modeloPrevisao.add(tf.layers.dense({ units: 1 }));
    modeloPrevisao.compile({ loss: 'meanSquaredError', optimizer: 'adam' });
}

function registrarLog(acao, detalhes) {
    if (!database) return;
    database.ref('logs').push({ timestamp: Date.now(), usuario: usuarioAtual, acao: acao, detalhes: detalhes });
}

function carregarLogs() {
    if (!database) return;
    const data = document.getElementById('filtroData').value;
    const acao = document.getElementById('filtroAcao').value;
    database.ref('logs').orderByChild('timestamp').limitToLast(50).once('value', (snapshot) => {
        const logsLista = document.getElementById('logsLista');
        logsLista.innerHTML = '';
        let logs = [];
        snapshot.forEach(child => logs.push(child.val()));
        logs.reverse();
        logs.forEach(log => {
            if (data && new Date(log.timestamp).toISOString().split('T')[0] !== data) return;
            if (acao && log.acao !== acao) return;
            const div = document.createElement('div');
            div.className = 'alert-item';
            div.innerHTML = `<div class="alert-icon success"><i class="fas fa-info-circle"></i></div><div><strong>${log.acao.toUpperCase()}</strong> - ${log.detalhes}</div><small>${new Date(log.timestamp).toLocaleTimeString()}</small>`;
            logsLista.appendChild(div);
        });
        if (logsLista.children.length === 0) logsLista.innerHTML = '<div class="alert-item">Nenhum log encontrado</div>';
    });
}

function limparFiltros() {
    document.getElementById('filtroData').value = '';
    document.getElementById('filtroAcao').value = '';
    carregarLogs();
}

function addAlert(mensagem, tipo) {
    const alertasLista = document.getElementById('alertasLista');
    if (!alertasLista) return;
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.innerHTML = `<div class="alert-icon ${tipo}"><i class="fas fa-${tipo === 'warning' ? 'exclamation' : 'info-circle'}"></i></div><div>${mensagem}</div><small>agora</small>`;
    alertasLista.insertBefore(div, alertasLista.firstChild);
    if (alertasLista.children.length > 10) alertasLista.removeChild(alertasLista.lastChild);
    registrarLog('alerta', mensagem);
}

function requestNotificationPermission() {
    if (!messaging) return;
    Notification.requestPermission().then(p => {
        if (p === 'granted') messaging.getToken({ vapidKey: VAPID_KEY }).then(token => console.log('Token:', token));
    });
}

function mostrarFormSensor() { document.getElementById('novoSensorForm').style.display = 'block'; }
function cancelarAdicionarSensor() { document.getElementById('novoSensorForm').style.display = 'none'; }
function adicionarSensor() {
    const novoSensor = { tipo: document.getElementById('tipoSensor').value, nome: document.getElementById('nomeSensor').value || 'Novo Sensor', gpio: document.getElementById('gpioSensor').value, unidade: document.getElementById('unidadeSensor').value, id: Date.now() };
    sensoresAdicionais.push(novoSensor);
    document.getElementById('sensores-lista').innerHTML += `<div class="setting-item"><div class="setting-info"><strong>${novoSensor.nome}</strong><small>GPIO ${novoSensor.gpio}</small></div><span class="status-value waiting">Aguardando</span></div>`;
    document.getElementById('novoSensorForm').style.display = 'none';
    addAlert('Sensor ' + novoSensor.nome + ' adicionado!', 'success');
}

function exportarDados() {
    if (!database) return;
    database.ref('historico').limitToLast(100).once('value', s => {
        let csv = 'Data/Hora,Temperatura,Humidade Ar,Humidade Solo\n';
        s.forEach(c => { const d = c.val(); csv += `${new Date(d.timestamp).toLocaleString()},${d.temperatura},${d.humidade},${d.solo}\n`; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `greenagro_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        addAlert('Dados exportados!', 'success');
    });
}

function fazerBackup() {
    const backup = { data: new Date().toISOString(), usuario: usuarioAtual, configuracoes: { autoMode, limiteSeco: document.getElementById('limiteSeco')?.value, limiteUmido: document.getElementById('limiteUmido')?.value } };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `greenagro_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    addAlert('Backup realizado!', 'success');
}

function iniciarDashboard() {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); document.getElementById('darkModeToggle').classList.add('active'); }
    iniciarGraficos();
    setTimeout(carregarLogs, 2000);
    document.querySelector('.btn-control.on').disabled = false;
    document.querySelector('.btn-control.off').disabled = false;
    document.querySelector('.btn-control.auto').disabled = false;
    autoMode = false;
    document.getElementById('autoModeToggle').classList.remove('active');
}

function iniciarGraficos() {
    const labels = Array.from({length:24}, (_,i)=> i+':00');
    charts.mainChart = new Chart(document.getElementById('mainChart'), { type:'line', data:{ labels, datasets:[
        { label:'Temperatura (°C)', data:Array(24).fill(null), borderColor:'#ff6b6b', tension:0.4 },
        { label:'Humidade Ar (%)', data:Array(24).fill(null), borderColor:'#4a90e2', tension:0.4 },
        { label:'Humidade Solo (%)', data:Array(24).fill(null), borderColor:'#2ecc71', tension:0.4 }
    ]}, options:{ responsive:true, maintainAspectRatio:false } });
    charts.tempChart = new Chart(document.getElementById('tempChart'), { type:'line', data:{ labels, datasets:[{ label:'Temperatura', data:Array(24).fill(null), borderColor:'#ff6b6b' }] }, options:{ responsive:true } });
    charts.humChart = new Chart(document.getElementById('humChart'), { type:'line', data:{ labels, datasets:[{ label:'Humidade Ar', data:Array(24).fill(null), borderColor:'#4a90e2' }] }, options:{ responsive:true } });
    charts.soilChart = new Chart(document.getElementById('soilChart'), { type:'line', data:{ labels, datasets:[{ label:'Humidade Solo', data:Array(24).fill(null), borderColor:'#2ecc71' }] }, options:{ responsive:true } });
}

window.onload = function() { 
    document.getElementById('access-code').value = ''; 
};
