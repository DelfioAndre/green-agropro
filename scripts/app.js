 if (automode) por :
if (autoMode) {
    const limiteSeco = parseInt(document.getElementById('limiteSeco')?.value || 30);
    const limiteUmido = parseInt(document.getElementById('limiteUmido')?.value || 60);
    const limiteDesligar = limiteUmido - HYSTERESIS_OFFSET;
    const motorLigadoAtual = document.getElementById('motorStatusDisplay').textContent === 'Ligado';

    // ⭐ Apenas atualiza a interface (não envia comandos)
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
        // ❌ NÃO envia comando "on" para o Firebase
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
        // ❌ NÃO envia comando "off" para o Firebase
    }
}