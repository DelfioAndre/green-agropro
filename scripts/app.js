// ============================================================
// 🌾 GREEN AGRO COMMODITIES - SISTEMA DE IRRIGAÇÃO INTELIGENTE
// ============================================================
// Sistema automatizado para monitoramento e controle de irrigação
// com sensores de temperatura, humidade e solo
// ============================================================

// ============================================================
// 1️⃣ CONFIGURAÇÕES E CONSTANTES
// ============================================================

// 🔧 Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAmCLjrlCifSFtBjMmqYCr1b0mIQzNs3BM",
    authDomain: "terraflow-iot.firebaseapp.com",
    databaseURL: "https://terraflow-iot-default-rtdb.firebaseio.com",
    projectId: "terraflow-iot",
    storageBucket: "terraflow-iot.firebasestorage.app",
    messagingSenderId: "587013523936",
    appId: "1:587013523936:web:c96773b6ee7621835c0385"
};

// 🔑 Chaves API externas
const VAPID_KEY = "BE3EvV6kB9ZEnaR6LxVACZiMKUb2eNdrL3rM7MuN7cv6ed_LQYziva2LI3eJNpqqwNH6ZQ7phXl98nyJQxtTmdo";
const WEATHER_API_KEY = "ca50095dd2e55f8a7fff4b1c5db19763";

// ⏱️ Constantes de tempo e limites
const OFFLINE_TIMEOUT = 60000;        // 60 segundos
const MOTOR_MAX_TIME = 120000;        // 2 minutos
const HYSTERESIS_OFFSET = 5;          // Histerese para irrigação

// ============================================================
// 2️⃣ VARIÁVEIS GLOBAIS
// ============================================================

// 🌐 Firebase
let database, messaging;

// 👤 Usuário
let usuarioAtual = '';

// 🏃 Motor e Automação
let motorEstado = 'off';              // Estado local: 'on' | 'off'
let autoMode = false;                 // Modo automático ativo?
let motorStartTime = 0;               // Timestamp de início do motor
let ultimoComandoAuto = null;         // Último comando automático enviado
let timeoutAutoDesliga = null;        // ID do timeout de auto-desligamento

// 📊 Sensores
let lastUpdateTime = 0;               // Última vez que dados foram recebidos
let chanceChuva = 0;                  // Chance de chuva em %
let rainAlertActive = false;          // Alerta de chuva ativo?
let sensoresAdicionais = [];          // Sensores personalizados adicionados

// 🗺️ Interface
let map;                              // Mapa Leaflet
let charts = {};                      // Gráficos Chart.js
let recognition;                      // Speech Recognition

// 🤖 IA
let modeloPrevisao;                   // Modelo TensorFlow

// ============================================================
// 3️⃣ FUNÇÕES DE AUTENTICAÇÃO
// ============================================================

/**
 * Realiza login do usuário
 * Valida código de acesso e inicializa o dashboard
 */
function fazerLogin() {
    const code = document.getElementById('access-code').value;
    if (code === '1234') {
        // Oculta tela de login e mostra dashboard
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.add('visible');
        
        // Configura dados do usuário
        document.getElementById('userDisplay').textContent = document.getElementById('username').value || 'Usuário';
        usuarioAtual = document.getElementById('username').value || 'Usuário';
        
        // Ativa primeira página
        document.querySelector('.nav-item[data-page="dashboard"]').classList.add('active');
        
        // Mostra overlay de carregamento
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
        
        // Inicializa componentes
        iniciarFirebase();
        iniciarDashboard();
        iniciarMapa();
        iniciarPrevisaoTempo();
        iniciarModeloIA();
        
        // Oculta overlay após inicialização
        setTimeout(() => {
            if (overlay) overlay.style.display = 'none';
        }, 1000);
    } else {
        showToast('❌ Código inválido! Use 1234', 'error');
    }
}

/**
 * Realiza logout do usuário
 */
function logout() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard-screen').classList.remove('visible');
    document.getElementById('access-code').value = '';
    showToast('👋 Desconectado com sucesso!', 'info');
}

// ============================================================
// 4️⃣ FUNÇÕES DE INTERFACE
// ============================================================

/**
 * Mostra notificação toast (alerta temporário)
 * @param {string} message - Mensagem a exibir
 * @param {string} type - Tipo: 'info', 'warning', 'error', 'success'
 */
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

/**
 * Alterna visibilidade da barra lateral
 */
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

/**
 * Alterna modo escuro/claro
 */
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

/**
 * Muda de página no dashboard
 * @param {string} pagina - Nome da página: 'dashboard', 'graficos', etc
 */
function mudarPagina(pagina) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${pagina}"]`).classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pagina}`).classList.add('active');
    
    const titulos = {
        dashboard: 'Dashboard',
        graficos: 'Gráficos',
        dispositivos: 'Dispositivos',
        alertas: 'Alertas',
        configuracoes: 'Configurações'
    };
    document.getElementById('pageTitle').textContent = titulos[pagina];
    
    if (pagina === 'dispositivos' && map) setTimeout(() => map.invalidateSize(), 100);
    if (pagina === 'alertas') carregarLogs();
    if (window.innerWidth <= 768) toggleSidebar();
}

/**
 * Atualiza data e hora em tempo real
 */
function atualizarDataHora() {
    const agora = new Date();
    document.getElementById('currentDate').textContent = agora.toLocaleDateString('pt-BR');
    document.getElementById('currentTime').textContent = agora.toLocaleTimeString('pt-BR');
}

// ============================================================
// 5️⃣ FUNÇÕES FIREBASE
// ============================================================

/**
 * Inicializa conexão com Firebase
 * Configura listeners e monitora estado da conexão
 */
function iniciarFirebase() {
    try {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        messaging = firebase.messaging();
        console.log('✅ Firebase conectado');

        // Listener para dados de sensores
        database.ref('sensores').on('value', (snapshot) => {
            const dados = snapshot.val();
            if (dados) {
                atualizarDadosFirebase(dados);
                lastUpdateTime = Date.now();
            }
        });

        // Verifica desconexão periódica
        setInterval(() => {
            if (lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > OFFLINE_TIMEOUT) {
                resetToOffline();
            }
        }, 10000);

        // Listener para limite de umidade
        const updateHistereseDisplay = () => {
            const limUmido = parseInt(document.getElementById('limiteUmido')?.value || 60);
            const histereseVal = limUmido - HYSTERESIS_OFFSET;
            document.getElementById('histereseDisplay').innerText = histereseVal;
        };
        document.getElementById('limiteUmido')?.addEventListener('change', updateHistereseDisplay);
        updateHistereseDisplay();

    } catch (e) {
        console.error('❌ Erro Firebase:', e);
        showToast('Erro ao conectar Firebase', 'error');
    }
}

/**
 * Define todos os elementos como offline
 * Chamado quando ESP32 não responde há muito tempo
 */
function resetToOffline() {
    console.log("⚠️ ESP32 offline detectado!");
    
    // Dados dos sensores
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
    
    // Status ESP32
    document.getElementById('espStatus').innerHTML = 'Offline';
    document.getElementById('espStatus').className = 'status-value offline';
    document.getElementById('espStatus2').innerHTML = 'Offline';
    document.getElementById('espStatus2').className = 'status-value offline';
    
    // WiFi
    document.getElementById('wifiStatus').innerHTML = 'Desconectado';
    document.getElementById('wifiStatus').className = 'status-value offline';
    document.getElementById('wifiStatus2').innerHTML = 'Desconectado';
    document.getElementById('wifiStatus2').className = 'status-value offline';
    
    // IP e última comunicação
    document.getElementById('espIP').textContent = '---.---.---.---';
    document.getElementById('ultimaComunicacao').textContent = '---';
    
    // Status dos sensores individuais
    ['sensorTempStatus', 'sensorHumStatus', 'sensorSoilStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = 'Desconectado';
            el.className = 'status-value offline';
        }
    });
    
    ['sensorTempStatusCard', 'sensorHumStatusCard', 'sensorSoilStatusCard'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = 'Desconectado';
            el.className = 'status-value offline';
        }
    });
    
    // Status do motor
    document.getElementById('motorStatusDisplay').innerHTML = 'Desconectado';
    document.getElementById('motorStatusDisplay').className = 'status-value offline';
    document.getElementById('motorStatusDisplay2').innerHTML = 'Desconectado';
    document.getElementById('motorStatusDisplay2').className = 'status-value offline';
    document.getElementById('motorStatusBar').innerHTML = '<i class="fas fa-motor"></i> Sistema aguardando conexão';
    document.getElementById('motorStatusBar').style.background = 'var(--gray-100)';
    
    // Desabilita botões
    document.querySelectorAll('.btn-control').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
    
    addAlert('⚠️ ESP32 offline! Aguardando reconexão...', 'warning');
}

/**
 * Atualiza a interface com dados recebidos do Firebase
 * @param {object} dados - Dados dos sensores
 */
function atualizarDadosFirebase(dados) {
    console.log("📥 Dados recebidos:", dados);
    
    if (lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > OFFLINE_TIMEOUT) {
        addAlert('✅ ESP32 reconectado! Dados recebidos.', 'success');
    }
    lastUpdateTime = Date.now();

    // Atualiza temperatura
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
            
            // Atualiza em várias áreas da interface
            ['configTempStatus', 'sensorTempStatus', 'sensorTempStatusCard'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = temp + '°C';
                    el.className = 'status-value online';
                }
            });
        }
    }

    // Atualiza humidade do ar
    if (dados.humidade !== undefined && dados.humidade !== null) {
        let hum = parseFloat(dados.humidade);
        if (!isNaN(hum)) {
            document.getElementById('humValue').textContent = hum + ' %';
            document.getElementById('humProgress').style.width = hum + '%';
            document.getElementById('humStatus').innerHTML = '✓ Online';
            document.getElementById('humStatus').className = 'sensor-status status-good';
            
            ['configHumStatus', 'sensorHumStatus', 'sensorHumStatusCard'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = hum + '%';
                    el.className = 'status-value online';
                }
            });
        }
    }

    // Atualiza humidade do solo e controla automação
    if (dados.solo !== undefined && dados.solo !== null) {
        let solo = parseFloat(dados.solo);
        if (!isNaN(solo)) {
            document.getElementById('soilValue').textContent = solo + ' %';
            document.getElementById('soilProgress').style.width = solo + '%';
            document.getElementById('soilStatus').innerHTML = '✓ Online';
            document.getElementById('soilStatus').className = 'sensor-status status-good';
            
            ['configSoilStatus', 'sensorSoilStatus', 'sensorSoilStatusCard'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = solo + '%';
                    el.className = 'status-value online';
                }
            });
            
            // 🤖 Lógica de automação - SÓ DECIDE LIGAR/DESLIGAR
            if (autoMode) {
                const limiteSeco = parseInt(document.getElementById('limiteSeco')?.value || 30);
                const limiteUmido = parseInt(document.getElementById('limiteUmido')?.value || 60);
                const limiteDesligar = limiteUmido - HYSTERESIS_OFFSET;
                const motorLigadoAtual = document.getElementById('motorStatusDisplay').textContent.includes('Ligado');
                
                // Solo seco: DECIDIR ligar motor (se ainda não está ligado)
                if (solo < limiteSeco && !motorLigadoAtual && ultimoComandoAuto !== 'on') {
                    // Envia comando para ligar
                    acionarMotorAutomatico('on');
                    ultimoComandoAuto = 'on';
                }
                // Solo úmido: DECIDIR desligar motor (se ainda não está desligado)
                else if (solo > limiteDesligar && motorLigadoAtual && ultimoComandoAuto !== 'off') {
                    // Envia comando para desligar
                    acionarMotorAutomatico('off');
                    ultimoComandoAuto = 'off';
                }
            }
        }
    }

    // Atualiza UI dos botões conforme modo
    const btnOn = document.querySelector('.btn-control.on');
    const btnOff = document.querySelector('.btn-control.off');
    const btnAuto = document.querySelector('.btn-control.auto');
    const toggleAuto = document.getElementById('autoModeToggle');
    
    if (btnOn && btnOff && btnAuto && toggleAuto) {
        if (autoMode) {
            btnOn.disabled = true;
            btnOff.disabled = true;
            btnOn.style.opacity = '0.5';
            btnOff.style.opacity = '0.5';
            btnAuto.classList.add('active');
            toggleAuto.classList.add('active');
        } else {
            btnOn.disabled = false;
            btnOff.disabled = false;
            btnOn.style.opacity = '1';
            btnOff.style.opacity = '1';
            btnAuto.classList.remove('active');
            toggleAuto.classList.remove('active');
        }
    }

    // Atualiza status ESP32
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

    // Ativa botões
    document.querySelectorAll('.btn-control').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });

    // Atualiza gráficos
    atualizarGraficos(dados);
}

// ============================================================
// 6️⃣ FUNÇÕES DE CONTROLE DO MOTOR
// ============================================================

/**
 * Controla o motor (CONTROLE MANUAL)
 * @param {string} comando - 'on' (ligar), 'off' (desligar), 'auto' (automático)
 */
function controlarMotor(comando) {
    // Impede controle manual em modo automático
    if ((comando === 'on' || comando === 'off') && autoMode) {
        showToast('❌ Modo automático ativo! Desative para controle manual.', 'warning');
        return;
    }

    // 🤖 Alternar para modo automático
    if (comando === 'auto') {
        autoMode = true;
        ultimoComandoAuto = null;  // Reseta para que automação avalie condições
        showToast('🤖 Modo automático ativado!', 'success');
        addAlert('Modo automático ativado', 'success');
        registrarLog('motor', 'Modo automático ativado');
        // Envia comando para microcontrolador
        if (database) database.ref('comandos/motor').set({ modo: 'auto', timestamp: Date.now() });
        return;
    }

    // 🟢 Ligar motor MANUALMENTE
    if (comando === 'on') {
        if (motorEstado === 'on') {
            showToast('⚠️ Motor já está ligado!', 'warning');
            return;
        }
        // Limpar timeout anterior se existir
        if (timeoutAutoDesliga) clearTimeout(timeoutAutoDesliga);
        
        motorEstado = 'on';
        motorStartTime = Date.now();
        atualizarUIMotor('on', false);
        showToast('🟢 Motor ligado manualmente', 'success');
        addAlert('Motor ligado manualmente', 'success');
        registrarLog('motor', 'Motor ligado manualmente');
        
        // Envia comando para microcontrolador
        if (database) database.ref('comandos/motor').set({ estado: 'on', modo: 'manual', timestamp: Date.now() });
        
        // Auto-desliga após 2 minutos (apenas em modo manual)
        timeoutAutoDesliga = setTimeout(() => {
            if (motorEstado === 'on' && !autoMode) {
                controlarMotor('off');
                showToast('⏱️ Motor desligado automaticamente após 2 minutos!', 'info');
                addAlert('⏱️ Motor desligado automaticamente (limite de 2 minutos)', 'warning');
            }
        }, MOTOR_MAX_TIME);
    }
    // 🔴 Desligar motor MANUALMENTE
    else if (comando === 'off') {
        if (motorEstado === 'off') {
            showToast('⚠️ Motor já está desligado!', 'warning');
            return;
        }
        // Limpar timeout
        if (timeoutAutoDesliga) clearTimeout(timeoutAutoDesliga);
        
        motorEstado = 'off';
        motorStartTime = 0;
        atualizarUIMotor('off', false);
        showToast('🔴 Motor desligado manualmente', 'info');
        addAlert('Motor desligado manualmente', 'info');
        registrarLog('motor', 'Motor desligado manualmente');
        
        // Envia comando para microcontrolador
        if (database) database.ref('comandos/motor').set({ estado: 'off', modo: 'manual', timestamp: Date.now() });
    }
}

/**
 * Aciona motor em modo AUTOMÁTICO
 * @param {string} comando - 'on' ou 'off'
 */
function acionarMotorAutomatico(comando) {
    // Limpar timeout anterior se existir
    if (timeoutAutoDesliga) clearTimeout(timeoutAutoDesliga);
    
    if (comando === 'on') {
        motorEstado = 'on';
        motorStartTime = Date.now();
        atualizarUIMotor('on', true);
        addAlert('💧 Solo seco! Irrigação automática ligada', 'warning');
        registrarLog('motor', 'Automático: LIGADO por condição de solo seco');
        
        // Envia comando
        if (database) database.ref('comandos/motor').set({ estado: 'on', modo: 'auto', timestamp: Date.now() });
        
        // Auto-desliga após 2 minutos (apenas em modo automático)
        timeoutAutoDesliga = setTimeout(() => {
            if (motorEstado === 'on' && autoMode) {
                acionarMotorAutomatico('off');
                addAlert('⏱️ Motor desligado automaticamente após 2 minutos (Auto)', 'info');
            }
        }, MOTOR_MAX_TIME);
    } 
    else if (comando === 'off') {
        motorEstado = 'off';
        motorStartTime = 0;
        atualizarUIMotor('off', true);
        addAlert('✅ Solo úmido! Irrigação automática desligada', 'success');
        registrarLog('motor', 'Automático: DESLIGADO por condição de solo úmido');
        
        // Envia comando
        if (database) database.ref('comandos/motor').set({ estado: 'off', modo: 'auto', timestamp: Date.now() });
    }
}

/**
 * Atualiza UI do motor
 * @param {string} estado - 'on' ou 'off'
 * @param {boolean} isAuto - Se é ação automática
 */
function atualizarUIMotor(estado, isAuto = false) {
    const modoText = isAuto ? '(Auto)' : '(Manual)';
    const statusClass = estado === 'on' ? 'online' : 'offline';
    const statusText = estado === 'on' ? 'Ligado' : 'Desligado';
    const bgColor = estado === 'on' ? '#d1fae5' : '#fee2e2';
    const icon = estado === 'on' ? 'fa-play-circle' : 'fa-stop-circle';
    
    // Atualiza displays de status
    document.getElementById('motorStatusDisplay').textContent = statusText + ' ' + modoText;
    document.getElementById('motorStatusDisplay').className = 'status-value ' + statusClass;
    document.getElementById('motorStatusDisplay2').textContent = statusText + ' ' + modoText;
    document.getElementById('motorStatusDisplay2').className = 'status-value ' + statusClass;
    
    // Atualiza barra de status
    const bar = document.getElementById('motorStatusBar');
    bar.innerHTML = `<i class="fas ${icon}"></i> Motor ${statusText.toUpperCase()} ${modoText}`;
    bar.style.background = bgColor;
    
    // Atualiza botões
    document.querySelectorAll('.btn-control').forEach(btn => btn.classList.remove('active'));
    if (estado === 'on') {
        document.querySelector('.btn-control.on')?.classList.add('active');
    } else {
        document.querySelector('.btn-control.off')?.classList.add('active');
    }
}

/**
 * Alterna entre modo automático e manual
 */
function toggleAutoMode() {
    const toggle = document.getElementById('autoModeToggle');
    if (autoMode) {
        autoMode = false;
        toggle.classList.remove('active');
        showToast('🔧 Modo manual ativado!', 'info');
        addAlert('Modo manual ativado', 'info');
        registrarLog('config', 'Modo manual ativado');
        document.querySelector('.btn-control.on').disabled = false;
        document.querySelector('.btn-control.off').disabled = false;
        document.querySelector('.btn-control.on').style.opacity = '1';
        document.querySelector('.btn-control.off').style.opacity = '1';
        document.querySelector('.btn-control.auto').classList.remove('active');
    } else {
        controlarMotor('auto');
    }
}

// ============================================================
// 7️⃣ FUNÇÕES DE GRÁFICOS
// ============================================================

/**
 * Atualiza gráficos com novos dados
 * @param {object} dados - Dados dos sensores
 */
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

/**
 * Inicializa gráficos do dashboard
 */
function iniciarGraficos() {
    const labels = Array.from({ length: 24 }, (_, i) => i + ':00');
    
    // Gráfico principal (3 sensores)
    charts.mainChart = new Chart(document.getElementById('mainChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Temperatura (°C)', data: Array(24).fill(null), borderColor: '#ff6b6b', tension: 0.4 },
                { label: 'Humidade Ar (%)', data: Array(24).fill(null), borderColor: '#4a90e2', tension: 0.4 },
                { label: 'Humidade Solo (%)', data: Array(24).fill(null), borderColor: '#2ecc71', tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    
    // Gráfico de temperatura
    charts.tempChart = new Chart(document.getElementById('tempChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Temperatura', data: Array(24).fill(null), borderColor: '#ff6b6b' }] },
        options: { responsive: true }
    });
    
    // Gráfico de humidade do ar
    charts.humChart = new Chart(document.getElementById('humChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Humidade Ar', data: Array(24).fill(null), borderColor: '#4a90e2' }] },
        options: { responsive: true }
    });
    
    // Gráfico de humidade do solo
    charts.soilChart = new Chart(document.getElementById('soilChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Humidade Solo', data: Array(24).fill(null), borderColor: '#2ecc71' }] },
        options: { responsive: true }
    });
}

// ============================================================
// 8️⃣ FUNÇÕES DE SENSORES E CONFIGURAÇÃO
// ============================================================

/**
 * Inicializa mapa Leaflet
 */
function iniciarMapa() {
    map = L.map('map').setView([-15.1167, 39.2667], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
    L.marker([-15.1167, 39.2667]).addTo(map).bindPopup('<b>ESP32</b><br>Aguardando dados...');
}

/**
 * Inicializa previsão de tempo
 */
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
                rainAlertMsg.innerHTML = `🌧️ Atenção: ${chanceChuva}% de chance de chuva.`;
                if (!rainAlertActive) {
                    rainAlertActive = true;
                    addAlert(`🌧️ Alerta: ${chanceChuva}% de chance de chuva.`, 'warning');
                }
            } else {
                rainAlertDiv.style.display = 'none';
                if (rainAlertActive) {
                    rainAlertActive = false;
                    addAlert('✅ Condições normais. Alerta de chuva encerrado.', 'success');
                }
            }
        } catch (e) {
            console.error('Erro previsão:', e);
            document.getElementById('previsaoConteudo').innerHTML = 'Erro na previsão';
        }
    }, () => {
        document.getElementById('previsaoConteudo').innerHTML = 'Permita localização';
    });
}

/**
 * Inicializa reconhecimento de voz
 */
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
    recognition.onerror = () => { btn.classList.remove('listening'); };
    recognition.onend = () => { btn.classList.remove('listening'); };
}

/**
 * Inicializa modelo de IA para previsões
 */
async function iniciarModeloIA() {
    modeloPrevisao = tf.sequential();
    modeloPrevisao.add(tf.layers.dense({ units: 10, inputShape: [1], activation: 'relu' }));
    modeloPrevisao.add(tf.layers.dense({ units: 1 }));
    modeloPrevisao.compile({ loss: 'meanSquaredError', optimizer: 'adam' });
}

/**
 * Adiciona novo sensor customizado
 */
function adicionarSensor() {
    const novoSensor = {
        tipo: document.getElementById('tipoSensor').value,
        nome: document.getElementById('nomeSensor').value || 'Novo Sensor',
        gpio: document.getElementById('gpioSensor').value,
        unidade: document.getElementById('unidadeSensor').value,
        id: Date.now()
    };
    sensoresAdicionais.push(novoSensor);
    document.getElementById('sensores-lista').innerHTML += `<div class="setting-item"><div class="setting-info"><strong>${novoSensor.nome}</strong><small>GPIO ${novoSensor.gpio}</small></div><span class="status-value waiting">Aguardando</span></div>`;
    document.getElementById('novoSensorForm').style.display = 'none';
    addAlert('✅ Sensor ' + novoSensor.nome + ' adicionado!', 'success');
}

/**
 * Mostra formulário para adicionar sensor
 */
function mostrarFormSensor() {
    document.getElementById('novoSensorForm').style.display = 'block';
}

/**
 * Cancela adição de sensor
 */
function cancelarAdicionarSensor() {
    document.getElementById('novoSensorForm').style.display = 'none';
}

// ============================================================
// 9️⃣ FUNÇÕES DE LOGS E ALERTAS
// ============================================================

/**
 * Adiciona alerta/notificação
 * @param {string} mensagem - Mensagem do alerta
 * @param {string} tipo - Tipo: 'info', 'warning', 'success'
 */
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

/**
 * Registra log de ação
 * @param {string} acao - Tipo de ação
 * @param {string} detalhes - Detalhes da ação
 */
function registrarLog(acao, detalhes) {
    if (!database) return;
    database.ref('logs').push({
        timestamp: Date.now(),
        usuario: usuarioAtual,
        acao: acao,
        detalhes: detalhes
    });
}

/**
 * Carrega logs do Firebase
 */
function carregarLogs() {
    if (!database) return;
    const data = document.getElementById('filtroData')?.value;
    const acao = document.getElementById('filtroAcao')?.value;
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

/**
 * Limpa filtros de logs
 */
function limparFiltros() {
    document.getElementById('filtroData').value = '';
    document.getElementById('filtroAcao').value = '';
    carregarLogs();
}

// ============================================================
// 🔟 FUNÇÕES DE EXPORTAÇÃO E BACKUP
// ============================================================

/**
 * Exporta dados para CSV
 */
function exportarDados() {
    if (!database) return;
    database.ref('historico').limitToLast(100).once('value', s => {
        let csv = 'Data/Hora,Temperatura,Humidade Ar,Humidade Solo\n';
        s.forEach(c => {
            const d = c.val();
            csv += `${new Date(d.timestamp).toLocaleString()},${d.temperatura},${d.humidade},${d.solo}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `greenagro_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        addAlert('✅ Dados exportados!', 'success');
    });
}

/**
 * Realiza backup das configurações
 */
function fazerBackup() {
    const backup = {
        data: new Date().toISOString(),
        usuario: usuarioAtual,
        configuracoes: {
            autoMode,
            limiteSeco: document.getElementById('limiteSeco')?.value,
            limiteUmido: document.getElementById('limiteUmido')?.value
        }
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `greenagro_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    addAlert('✅ Backup realizado!', 'success');
}

/**
 * Solicita permissão para notificações push
 */
function requestNotificationPermission() {
    if (!messaging) return;
    Notification.requestPermission().then(p => {
        if (p === 'granted') {
            messaging.getToken({ vapidKey: VAPID_KEY }).then(token => {
                console.log('Token:', token);
                addAlert('✅ Notificações ativadas!', 'success');
            });
        }
    });
}

// ============================================================
// 1️⃣1️⃣ INICIALIZAÇÃO
// ============================================================

/**
 * Inicializa o dashboard após login
 */
function iniciarDashboard() {
    // Atualiza data/hora a cada segundo
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    
    // Restaura tema salvo
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('darkModeToggle').classList.add('active');
    }
    
    // Inicializa gráficos
    iniciarGraficos();
    
    // Carrega logs após 2 segundos
    setTimeout(carregarLogs, 2000);
    
    // Configura estado inicial
    document.querySelector('.btn-control.on').disabled = false;
    document.querySelector('.btn-control.off').disabled = false;
    document.querySelector('.btn-control.auto').disabled = false;
    autoMode = false;
    document.getElementById('autoModeToggle').classList.remove('active');
    
    // Inicializa reconhecimento de voz se disponível
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) recognition = new SpeechRecognition();
    
    console.log('✅ Dashboard inicializado');
}

/**
 * Executado quando a página carrega
 */
window.onload = function () {
    // Limpa campo de senha
    const codeInput = document.getElementById('access-code');
    if (codeInput) codeInput.value = '';
    console.log('✅ Página carregada');
};
