const NIVEIS = [
    { nome: 'Bronze',   min: 0,       max: 10000,   icon: '🥉', color: '#cd7f32' },
    { nome: 'Prata',    min: 10001,   max: 50000,   icon: '🥈', color: '#c0c0c0' },
    { nome: 'Ouro',     min: 50001,   max: 100000,  icon: '🥇', color: '#ffd700' },
    { nome: 'Diamante', min: 100001,  max: 200000,  icon: '💎', color: '#00e5ff' },
    { nome: 'Elite',    min: 200001,  max: 500000,  icon: '🌟', color: '#ff6b35' },
    { nome: 'Lendário', min: 500001,  max: Infinity, icon: '👑', color: '#ff0000' }
];

const CARGOS = {
    'Aprendiz': '#FF9800',
    'Em treinamento': '#FF5722',
    'Trainee': '#607D8B',
    'Pleno': '#4CAF50',
    'Senior': '#2196F3',
    'Master': '#9C27B0',
    'Elite': '#FFD700',
    'Motorista': '#888'
};

function getNivel(pontuacao) {
    let nivel = NIVEIS[0];
    for (let i = NIVEIS.length - 1; i >= 0; i--) {
        if (pontuacao >= NIVEIS[i].min) {
            nivel = NIVEIS[i];
            break;
        }
    }
    return nivel;
}

function getNivelBadge(pontuacao) {
    const n = getNivel(pontuacao);
    return `<span class="nivel-badge" style="border-color:${n.color};color:${n.color}">${n.icon} ${n.nome}</span>`;
}

function getNivelInfo(pontuacao) {
    let nivelAtual = NIVEIS[0];
    let nivelProximo = NIVEIS[1];

    for (let i = NIVEIS.length - 1; i >= 0; i--) {
        if (pontuacao >= NIVEIS[i].min) {
            nivelAtual = NIVEIS[i];
            nivelProximo = NIVEIS[i + 1] || null;
            break;
        }
    }

    const progresso = nivelProximo
        ? Math.min(((pontuacao - nivelAtual.min) / (nivelProximo.min - nivelAtual.min)) * 100, 100)
        : 100;

    return { nivelAtual, nivelProximo, progresso };
}

function getMesAtual() {
    const now = new Date();
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return {
        mes: now.getMonth() + 1,
        ano: now.getFullYear(),
        label: monthNames[now.getMonth()] + ' ' + now.getFullYear()
    };
}

function getViagensDoMes(viagens, mes, ano) {
    return viagens.filter(v => {
        const d = new Date(v.data);
        return d.getMonth() + 1 === mes && d.getFullYear() === ano;
    });
}

function getWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { inicio: monday, fim: sunday };
}

function getViagensDaSemana(viagens) {
    const { inicio, fim } = getWeekRange();
    return viagens.filter(v => {
        const d = new Date(v.data);
        return d >= inicio && d <= fim;
    });
}

function agruparPorEmpresa(viagens) {
    const map = {};
    viagens.forEach(v => {
        if (!map[v.empresa]) {
            map[v.empresa] = { nome: v.empresa, viagens: 0, km: 0, pontuacao: 0 };
        }
        map[v.empresa].viagens++;
        map[v.empresa].km += v.km;
        map[v.empresa].pontuacao += v.pontuacao;
    });
    return Object.values(map).sort((a, b) => b.pontuacao - a.pontuacao);
}

function agruparPorMotorista(viagens) {
    const map = {};
    viagens.forEach(v => {
        if (!map[v.motorista]) {
            map[v.motorista] = { nome: v.motorista, empresa: v.empresa, viagens: 0, km: 0, pontuacao: 0 };
        }
        map[v.motorista].viagens++;
        map[v.motorista].km += v.km;
        map[v.motorista].pontuacao += v.pontuacao;
    });
    return Object.values(map).sort((a, b) => b.pontuacao - a.pontuacao);
}

function formatValue(rawValue, w) {
    let numericValue = parseFloat(rawValue);
    if (w.format) {
        try {
            return w.format.replace(/\{value(:[^}]+)?\}/g, (match, fmt) => {
                const divisor = w.unit === 'km' ? 1000 : 1;
                if (fmt) {
                    if (fmt === ':.0f') return Math.round(numericValue / divisor);
                    if (fmt === ':.1f') return (numericValue / divisor).toFixed(1);
                    if (fmt === ':.2f') return (numericValue / divisor).toFixed(2);
                }
                return rawValue;
            });
        } catch(e) { return rawValue; }
    }
    if (w.unit === '%' && !isNaN(numericValue)) {
        if (w.max && w.max <= 1) return (numericValue * 100).toFixed(0) + '%';
        return numericValue.toFixed(0) + '%';
    }
    if (w.unit === 'km/h' && !isNaN(numericValue)) return Math.round(numericValue) + ' km/h';
    if (w.unit === 'rpm' && !isNaN(numericValue)) return Math.round(numericValue) + ' rpm';
    if (w.unit === 'L' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' L';
    if (w.unit === '°C' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' °C';
    if (w.unit === 'bar' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' bar';
    if (w.unit === 'V' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' V';
    if (w.unit === 'km' && !isNaN(numericValue)) return (numericValue / 1000).toFixed(1) + ' km';
    if (w.unit === 'min' && !isNaN(numericValue)) return Math.round(numericValue) + ' min';
    if (w.unit === '€' && !isNaN(numericValue)) return '\u20AC' + numericValue.toLocaleString();
    if (!isNaN(numericValue)) return numericValue.toFixed(1);
    return rawValue;
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
}

// ========== AUTH FUNCTIONS ==========

function getAuthToken() {
    return localStorage.getItem('cargo_token');
}

function getAuthUser() {
    const data = localStorage.getItem('cargo_user');
    if (!data) return null;
    try { return JSON.parse(data); } catch(e) { return null; }
}

function setAuth(token, user) {
    localStorage.setItem('cargo_token', token);
    localStorage.setItem('cargo_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('cargo_token');
    localStorage.removeItem('cargo_user');
}

function isLoggedIn() {
    return !!getAuthToken();
}

function isAdmin() {
    const user = getAuthUser();
    return user && user.tipo === 'admin' && user.email === 'admin@cargostats.com';
}

async function authFetch(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = getAuthToken();
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, options);
    if (response.status === 401) {
        clearAuth();
        window.location.href = 'login_local.html';
        return null;
    }
    return response;
}

// ========== NAVIGATION ==========

function renderNav(activePage) {
    const nav = document.createElement('nav');
    nav.className = 'nav-bar';

    const brand = document.createElement('span');
    brand.className = 'nav-brand';
    brand.innerHTML = '<img src="images/logo.png" alt="CS" style="height:18px;vertical-align:middle;margin-right:6px;">CARGO STATS';
    nav.appendChild(brand);

    const links = document.createElement('div');
    links.className = 'nav-links';

    const user = getAuthUser();

    const pages = [
        { name: 'Dashboard', file: 'dashboard_local.html' },
        { name: 'Ranking', file: 'empresas_local.html' }
    ];

    if (user && user.tipo !== 'admin') {
        if (user.empresa && user.empresa !== 'Lobo Solitário') {
            pages.splice(1, 0, { name: 'Minha Empresa', file: 'empresa_local.html?empresa=' + encodeURIComponent(user.empresa) });
            pages.splice(2, 0, { name: 'Premiação', file: 'premiacao_local.html?empresa=' + encodeURIComponent(user.empresa) });
        } else {
            pages.splice(1, 0, { name: 'Meu Perfil', file: 'perfil_local.html?motorista=' + encodeURIComponent(user.nome) });
            pages.splice(2, 0, { name: 'Encontrar Empresa', file: 'lobo_local.html' });
        }
    }

    if (user && user.tipo === 'admin') {
        pages.push({ name: 'Admin', file: 'admin_local.html' });
    }

    pages.forEach(p => {
        const a = document.createElement('a');
        a.className = 'nav-link' + (p.file.split('?')[0] === activePage ? ' active' : '');
        a.href = p.file;
        a.textContent = p.name;
        links.appendChild(a);
    });

    nav.appendChild(links);

    const userDiv = document.createElement('div');
    userDiv.className = 'nav-user';

    if (user) {
        const perfilUrl = user.empresa
            ? `perfil_local.html?motorista=${encodeURIComponent(user.nome)}`
            : `perfil_local.html?motorista=${encodeURIComponent(user.nome)}`;
        userDiv.innerHTML = `
            <a href="${perfilUrl}" style="text-decoration:none;color:#e0e0e0;">
                <span class="nav-user-name">${user.nome}</span>
            </a>
            <span class="nav-user-tipo">${user.empresa ? user.empresa : (user.tipo === 'admin' ? 'Admin' : 'Lobo Solit\u00e1rio')}</span>
            <button class="nav-btn-logout" id="btn-logout">Sair</button>`;
        setTimeout(() => {
            const btn = document.getElementById('btn-logout');
            if (btn) btn.addEventListener('click', fazerLogout);
        }, 0);
    } else {
        userDiv.innerHTML = `
            <a class="nav-link" href="login_local.html">Entrar</a>
            <a class="nav-link" href="cadastro_local.html">Cadastrar</a>`;
    }
    nav.appendChild(userDiv);

    return nav;
}

async function fazerLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getAuthToken() }
        });
    } catch(e) {}
    clearAuth();
    window.location.href = window.location.origin + '/login_local.html';
}

async function fetchJSON(url) {
    try {
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(url + separator + '_=' + Date.now());
        if (!response.ok) throw new Error('Servidor offline');
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return { data, error: null };
    } catch(e) {
        return { data: null, error: e.message };
    }
}

// ========== EVENTOS ==========

async function getEventoAtivo() {
    const { data } = await fetchJSON('/api/eventos/ativo');
    return data ? data.evento : null;
}

async function getProgressoEvento(params) {
    const q = new URLSearchParams(params).toString();
    const res = await authFetch('/api/eventos/progresso?' + q + '&_=' + Date.now());
    if (!res.ok) return null;
    return res.json();
}

function formatCountdown(targetDate) {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return 'ENCERRADO';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// ========== TELEMETRY AUTO-RECORD (runs on all pages) ==========

let autoRecorder = {
    lastJobActive: false,
    lastCargo: '',
    lastOrigin: '',
    lastDestination: '',
    lastDistance: 0,
    lastIncome: 0,
    tripCount: 0,
    isRecording: false
};

try {
    const saved = sessionStorage.getItem('cargo_auto_recorder');
    if (saved) Object.assign(autoRecorder, JSON.parse(saved));
} catch (e) {}

function saveAutoRecorderState() {
    try {
        sessionStorage.setItem('cargo_auto_recorder', JSON.stringify({
            lastJobActive: autoRecorder.lastJobActive,
            lastCargo: autoRecorder.lastCargo,
            lastCargoId: autoRecorder.lastCargoId,
            lastOrigin: autoRecorder.lastOrigin,
            lastDestination: autoRecorder.lastDestination,
            lastDistance: autoRecorder.lastDistance,
            lastIncome: autoRecorder.lastIncome,
            tripCount: autoRecorder.tripCount,
            isRecording: autoRecorder.isRecording
        }));
    } catch (e) {}
}

function getTelemetryField(data, ...paths) {
    for (const p of paths) {
        const val = getNestedValue(data, p);
        if (val !== undefined && val !== null && val > 0) return val;
    }
    return 0;
}

function isJobActive(data) {
    if (!data || !data.job) return false;
    return (data.job.income > 0) || !!data.job.sourceCity;
}

function processAutoRecord(data) {
    const jobActive = isJobActive(data);

    if (!autoRecorder.isRecording && autoRecorder.lastJobActive && !jobActive && autoRecorder.lastCargo) {
        console.log('[AUTO-RECORD] Job concluído detectado!');
        console.log('[AUTO-RECORD] Carga:', autoRecorder.lastCargo, 'ID:', autoRecorder.lastCargoId, 'Rota:', autoRecorder.lastOrigin, '→', autoRecorder.lastDestination, 'KM:', autoRecorder.lastDistance, 'Ganho:', autoRecorder.lastIncome);
        const cargo = autoRecorder.lastCargo;
        const cargoId = autoRecorder.lastCargoId;
        const origin = autoRecorder.lastOrigin;
        const destination = autoRecorder.lastDestination;
        const distance = autoRecorder.lastDistance;
        const income = autoRecorder.lastIncome;
        autoRecorder.isRecording = true;
        saveAutoRecorderState();
        autoRecordTrip(cargo, origin, destination, distance, income, cargoId);
    }

    if (jobActive && !autoRecorder.lastJobActive) {
        console.log('[AUTO-RECORD] Novo job detectado!');
        const distMeters = getTelemetryField(data, 'job.distance', 'navigation.estimatedDistance', 'job.distance.remaining', 'job.destination.distance');
        autoRecorder.lastDistance = Math.round((distMeters || 0) / 1000);
        console.log('[AUTO-RECORD] Distância capturada no início do job:', autoRecorder.lastDistance, 'km');
    }
    if (!jobActive && autoRecorder.lastJobActive) {
        console.log('[AUTO-RECORD] Aguardando dados do job concluído...');
    }

    if (jobActive) {
        const cargo = getNestedValue(data, 'trailer.name') || getNestedValue(data, 'job.cargo.name') || '';
        const cargoId = getNestedValue(data, 'trailer.id') || '';
        const origem = getNestedValue(data, 'job.sourceCity') || getNestedValue(data, 'job.source.city') || '';
        const destino = getNestedValue(data, 'job.destinationCity') || getNestedValue(data, 'job.destination.city') || '';
        if (cargo !== autoRecorder.lastCargo || origem !== autoRecorder.lastOrigin) {
            console.log('[AUTO-RECORD] Job ativo:', cargo, '|', origem, '→', destino, '| ID:', cargoId);
        }
        autoRecorder.lastCargo = cargo;
        autoRecorder.lastCargoId = cargoId;
        autoRecorder.lastOrigin = origem;
        autoRecorder.lastDestination = destino;
        autoRecorder.lastIncome = getNestedValue(data, 'job.income') || 0;

        const currentDist = getTelemetryField(data, 'job.distance', 'navigation.estimatedDistance', 'job.distance.remaining', 'job.destination.distance');
        const distKm = Math.round((currentDist || 0) / 1000);
        if (distKm > 0 && distKm > autoRecorder.lastDistance) {
            autoRecorder.lastDistance = distKm;
        }
    }

    autoRecorder.lastJobActive = jobActive;
    saveAutoRecorderState();
}

async function autoRecordTrip(cargo, origem, destino, km, income, cargoId) {
    const user = getAuthUser();
    if (!user) {
        console.log('[AUTO-RECORD] Usuário não logado — viagem NÃO registrada');
        showAutoNotif('Faça login para registrar viagens automaticamente', '#ffaa00');
        autoRecorder.isRecording = false;
        saveAutoRecorderState();
        return;
    }
    const empresa = user.empresa || 'Lobo Solitário';
    autoRecorder.tripCount++;
    const pontos = Math.round(km * 2 + (income / 100));

    console.log('[AUTO-RECORD] Enviando viagem para o servidor...');
    console.log('[AUTO-RECORD] Dados:', { motorista: user.nome, empresa, origem, destino, km, pontuacao: pontos, carga: cargo, cargoId });

    try {
        const res = await authFetch('/api/viagens/auto', {
            method: 'POST',
            body: JSON.stringify({
                motorista: user.nome,
                empresa: empresa,
                origem: origem || '',
                destino: destino || '',
                km: km || 0,
                pontuacao: pontos || 0,
                carga_nome: cargo || '',
                cargo_id: cargoId || ''
            })
        });
        if (res) {
            const result = await res.json();
            if (result && result.ok) {
                console.log('[AUTO-RECORD] Viagem registrada com sucesso!', result);
                showAutoNotif(`Viagem registrada! ${km}km - ${pontos}pts - ${result.categoria_carga || 'geral'}`, '#00ff88');
                window.dispatchEvent(new CustomEvent('cargo-trip-recorded', { detail: { km, pontuacao: pontos, categoria: result.categoria_carga } }));
                autoRecorder.lastCargo = '';
                autoRecorder.lastCargoId = '';
                autoRecorder.lastOrigin = '';
                autoRecorder.lastDestination = '';
                autoRecorder.lastDistance = 0;
                autoRecorder.lastIncome = 0;
                autoRecorder.isRecording = false;
                saveAutoRecorderState();
            } else {
                console.log('[AUTO-RECORD] Erro na resposta do servidor:', result);
                showAutoNotif(`Erro: ${(result && result.error) || 'resposta invalida'}`, '#ff4444');
                autoRecorder.isRecording = false;
                saveAutoRecorderState();
            }
        } else {
            console.log('[AUTO-RECORD] authFetch retornou nulo (401? Não autenticado)');
            showAutoNotif('Sessão expirada. Faça login novamente.', '#ff4444');
            autoRecorder.isRecording = false;
            saveAutoRecorderState();
        }
    } catch (e) {
        console.error('[AUTO-RECORD] Exceção ao registrar:', e);
        showAutoNotif('Erro ao registrar viagem automatica', '#ff4444');
        autoRecorder.isRecording = false;
        saveAutoRecorderState();
    }
}

function showAutoNotif(texto, cor) {
    let container = document.getElementById('auto-recorder-notifs');
    if (!container) {
        container = document.createElement('div');
        container.id = 'auto-recorder-notifs';
        container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }

    const notif = document.createElement('div');
    notif.style.cssText = `
        background: #0d1117; border: 1px solid ${cor}; border-left: 4px solid ${cor};
        color: #e0e0e0; padding: 12px 16px; border-radius: 8px; font-size: 12px;
        font-family: Consolas, monospace; max-width: 380px; opacity: 0;
        transition: opacity 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.5);`;
    notif.innerHTML = `<span style="color:${cor};font-weight:700">AUTO-REC</span> ${texto}`;
    container.appendChild(notif);

    requestAnimationFrame(() => notif.style.opacity = '1');
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 300);
    }, 5000);
}

// Auto-start telemetry monitoring on every page
console.log('[AUTO-RECORD] Monitor de telemetria iniciado (polling a cada 500ms)');
let telemetryPollCount = 0;
setInterval(async () => {
    const { data, error } = await fetchJSON('/api/telemetry');
    telemetryPollCount++;
    if (error && telemetryPollCount <= 3) {
        console.log('[AUTO-RECORD] Telemetria indisponível:', error);
        updateFloatingStatus(false, false);
    }
    if (data) {
        processAutoRecord(data);
        const jobActive = isJobActive(data);
        updateFloatingStatus(true, jobActive);
    }
    if (telemetryPollCount === 1 && data) {
        const jobActive = isJobActive(data);
        console.log('[AUTO-RECORD] Primeiro dado recebido. Job ativo:', jobActive);
        if (jobActive) {
            console.log('[AUTO-RECORD] Monitorando job em andamento');
        }
    }
}, 500);

// Detect job transitions while tab is in background
let lastVisibleJobActive = false;
document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
        lastVisibleJobActive = autoRecorder.lastJobActive;
        if (lastVisibleJobActive) {
            console.log('[AUTO-RECORD] Aba oculta — capturando distância antes de perder foco...');
            try {
                const { data } = await fetchJSON('/api/telemetry');
                if (data && isJobActive(data)) {
                    const currentDist = getTelemetryField(data, 'job.distance', 'navigation.estimatedDistance', 'job.distance.remaining', 'job.destination.distance');
                    const distKm = Math.round((currentDist || 0) / 1000);
                    if (distKm > autoRecorder.lastDistance) {
                        autoRecorder.lastDistance = distKm;
                        saveAutoRecorderState();
                        console.log('[AUTO-RECORD] Distância salva ao sair da aba:', distKm, 'km');
                    }
                }
            } catch (e) {}
        }
    } else {
        console.log('[AUTO-RECORD] Aba visível novamente');
        const { data } = await fetchJSON('/api/telemetry');
        if (!data) return;
        const jobActive = isJobActive(data);
        if (!autoRecorder.isRecording && lastVisibleJobActive && !jobActive && autoRecorder.lastCargo) {
            console.log('[AUTO-RECORD] Job concluído enquanto a aba estava oculta!');
            autoRecorder.isRecording = true;
            saveAutoRecorderState();
            autoRecordTrip(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination, autoRecorder.lastDistance, autoRecorder.lastIncome, autoRecorder.lastCargoId);
        } else {
            processAutoRecord(data);
        }
    }
});

// ========== FLOATING STATUS BUTTON ==========

let floatingStatusConnected = false;

function initFloatingStatus() {
    const btn = document.createElement('div');
    btn.id = 'floating-status';
    btn.innerHTML = '<div class="fs-dot"></div><div class="fs-tooltip"><div class="fs-label">Status</div><div class="fs-value fs-disconnected">Aguardando telemetria...</div></div>';
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        const currentText = btn.querySelector('.fs-value')?.textContent || '';
        if (currentText === 'Desconectado' || currentText.includes('offline')) {
            showDiagnosticModal();
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

async function showDiagnosticModal() {
    let info = { dotnet: { installed: false, version: 'N/A' }, plugins: { exeExists: false }, telemetry: { running: false } };
    if (window.cargoStats && window.cargoStats.getDiagnostics) {
        try { info = await window.cargoStats.getDiagnostics(); } catch (e) {}
    }
    const dotnetStatus = info.dotnet && info.dotnet.installed
        ? info.dotnet.version
        : 'AUSENTE (' + ((info.dotnet && info.dotnet.error) || 'desconhecido') + ')';
    const pluginStatus = info.plugins && info.plugins.exeExists ? 'Sim' : 'Nao';
    const pluginPath = info.plugins ? info.plugins.path : 'N/A';

    const overlay = document.createElement('div');
    overlay.id = 'diagnostic-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:Consolas,monospace;';
    overlay.innerHTML = `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:24px;max-width:500px;width:90%;color:#e0e0e0;">
            <h2 style="margin:0 0 16px;font-size:16px;color:#ff8800;">Diagnostico da Telemetria</h2>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <tr><td style="padding:6px 8px;color:#888;">Plugins:</td><td style="padding:6px 8px;">${pluginStatus}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Pasta plugins:</td><td style="padding:6px 8px;word-break:break-all;font-size:11px;">${pluginPath}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">.NET Framework:</td><td style="padding:6px 8px;">${dotnetStatus}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Telemetria rodando:</td><td style="padding:6px 8px;">${info.telemetry && info.telemetry.running ? 'Sim (PID: ' + info.telemetry.pid + ')' : 'Nao'}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Versao:</td><td style="padding:6px 8px;">${info.version || 'N/A'}${info.isDev ? ' (dev)' : ''}</td></tr>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#888;">
                Se plugins = Nao, reinstale o app.<br>
                Se .NET = AUSENTE, instale .NET Framework 4.5+ em <a href="https://dotnet.microsoft.com/download/dotnet-framework" target="_blank" style="color:#58a6ff;">dotnet.microsoft.com</a><br>
                Se Telemetria rodando = Nao, pode ser antivirus bloqueando.
            </p>
            <button onclick="this.closest('#diagnostic-overlay').remove()" style="margin-top:12px;padding:8px 20px;background:#30363d;border:1px solid #58a6ff;border-radius:6px;color:#58a6ff;cursor:pointer;">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
}

function updateFloatingStatus(connected, jobActive) {
    const btn = document.getElementById('floating-status');
    if (!btn) return;

    const tooltipValue = btn.querySelector('.fs-value');
    btn.classList.remove('connected', 'disconnected', 'job-active');

    if (jobActive) {
        btn.classList.add('job-active');
        if (tooltipValue) {
            tooltipValue.className = 'fs-value fs-job-active';
            tooltipValue.textContent = 'Job Ativo!';
        }
    } else if (connected) {
        btn.classList.add('connected');
        if (tooltipValue) {
            tooltipValue.className = 'fs-value fs-connected';
            tooltipValue.textContent = 'Aguardando Job';
        }
    } else {
        btn.classList.add('disconnected');
        if (tooltipValue) {
            tooltipValue.className = 'fs-value fs-disconnected';
            tooltipValue.textContent = 'Desconectado';
        }
    }
}

initFloatingStatus();
