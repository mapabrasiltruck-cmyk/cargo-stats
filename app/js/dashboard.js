let config = {};
let widgetsInstances = {};
let telemetryData = {};
let pollInterval = null;
let remoteAccess = false;
let telemetryFailCount = 0;
let telemetryStatusChecked = false;

function isRemoteAccess() {
    const h = window.location.hostname;
    return h !== 'localhost' && h !== '127.0.0.1' && h !== '';
}

async function loadConfig() {
    try {
        const response = await fetch('config.json?' + Date.now());
        config = await response.json();
        document.title = config.title || "Dashboard ETS2/ATS";
        document.body.style.background = config.background || '#111';
        remoteAccess = isRemoteAccess();
        renderDashboard();
        return true;
    } catch(e) {
        console.error("Erro ao carregar config.json", e);
        document.getElementById('status').innerText = "Erro: config.json não encontrado";
        return false;
    }
}

function renderDashboard() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    widgetsInstances = {};

    const nav = renderNav('dashboard_local.html');
    app.appendChild(nav);

    if (remoteAccess) {
        const banner = document.createElement('div');
        banner.id = 'remote-warning';
        banner.className = 'remote-warning';
        banner.innerHTML = `
            <div class="remote-warning-icon">&#9888;</div>
            <div class="remote-warning-text">
                <strong>Acesso Remoto Detectado</strong><br>
                A telemetria em tempo real do jogo so funciona quando o 
                <strong>ETS2 Telemetry Server</strong> esta rodando no mesmo computador que o servidor.
                As outras funcionalidades (Empresas, Motoristas, Ranking, Conquistas) funcionam normalmente.
            </div>`;
        app.appendChild(banner);
    }

    if (!config.widgets) return;

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const title = document.createElement('div');
    title.className = 'dashboard-title';
    title.textContent = config.title || 'DASHBOARD';
    frame.appendChild(title);

    // Evento banner
    const eventoBanner = document.createElement('div');
    eventoBanner.id = 'dashboard-evento-banner';
    frame.appendChild(eventoBanner);
    carregarEventoBanner();

    const grid = document.createElement('div');
    grid.className = 'dashboard-grid';

    const leftCol = document.createElement('div');
    leftCol.className = 'dashboard-left';

    const rightCol = document.createElement('div');
    rightCol.className = 'dashboard-right';

    const sectionWidgets = {};
    config.widgets.forEach((widget, idx) => {
        const sec = widget.section || 'other';
        if (!sectionWidgets[sec]) sectionWidgets[sec] = [];
        sectionWidgets[sec].push({ widget, idx });
    });

    const leftSections = ['instruments', 'fluids', 'wear'];
    const rightSections = ['data', 'status', 'info'];
    const bottomSections = ['route'];

    leftSections.forEach(secName => {
        if (!sectionWidgets[secName]) return;
        const sectionDiv = createSection(secName, sectionWidgets[secName]);
        leftCol.appendChild(sectionDiv);
    });

    rightSections.forEach(secName => {
        if (!sectionWidgets[secName]) return;
        const sectionDiv = createSection(secName, sectionWidgets[secName]);
        rightCol.appendChild(sectionDiv);
    });

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    frame.appendChild(grid);

    bottomSections.forEach(secName => {
        if (!sectionWidgets[secName]) return;
        const bottomDiv = document.createElement('div');
        bottomDiv.className = 'dashboard-bottom';
        const sectionDiv = createSection(secName, sectionWidgets[secName]);
        bottomDiv.appendChild(sectionDiv);
        frame.appendChild(bottomDiv);
    });

    const user = getAuthUser();
    if (user && user.empresa) {
        const empresaLink = document.createElement('div');
        empresaLink.style.cssText = 'text-align:center;padding:16px;';
        empresaLink.innerHTML = `<a href="empresa_local.html?empresa=${encodeURIComponent(user.empresa)}" style="color:#00ff88;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;">VER MINHA EMPRESA: ${user.empresa.toUpperCase()}</a>`;
        frame.appendChild(empresaLink);
    } else if (user && !user.empresa && user.tipo !== 'admin') {
        const link = document.createElement('div');
        link.style.cssText = 'text-align:center;padding:16px;';
        link.innerHTML = `<a href="perfil_local.html?motorista=${encodeURIComponent(user.nome)}" style="color:#ffaa00;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;">VER MEU PERFIL: ${user.nome.toUpperCase()}</a>`;
        frame.appendChild(link);
    }

    const mobileAccess = document.createElement('div');
    mobileAccess.id = 'mobile-access-card';
    mobileAccess.style.cssText = 'margin-top:16px;padding:14px 18px;background:#0a0d0a;border:1px solid #00ff8820;border-radius:10px;display:flex;align-items:center;gap:16px;';
    mobileAccess.innerHTML = `
        <div style="flex-shrink:0;">
            <img id="mobile-qrcode-img" src="" alt="QR Code" style="width:90px;height:90px;border-radius:6px;background:#fff;display:block;">
        </div>
        <div style="flex:1;min-width:0;">
            <div style="font-size:9px;font-weight:700;letter-spacing:2px;color:#00ff88;text-transform:uppercase;margin-bottom:2px;">Acesso Mobile</div>
            <div style="font-size:10px;color:#888;margin-bottom:4px;">Escaneie com o celular na mesma rede WiFi</div>
            <div id="mobile-access-url" style="font-size:12px;font-weight:700;color:#e0e0e0;word-break:break-all;">Carregando...</div>
        </div>
        <button id="mobile-copy-ip" style="flex-shrink:0;padding:6px 12px;font-size:10px;font-family:inherit;font-weight:600;color:#aaa;background:#1a1a22;border:1px solid #2a2a32;border-radius:6px;cursor:pointer;letter-spacing:1px;">Copiar</button>`;
    frame.appendChild(mobileAccess);

    fetch('/api/network/ip')
        .then(r => r.json())
        .then(data => {
            const urlEl = document.getElementById('mobile-access-url');
            const imgEl = document.getElementById('mobile-qrcode-img');
            if (urlEl) urlEl.textContent = data.url || 'Indisponivel';
            if (imgEl) imgEl.src = '/api/network/qrcode?' + Date.now();
        })
        .catch(() => {
            const urlEl = document.getElementById('mobile-access-url');
            if (urlEl) urlEl.textContent = 'Servidor nao disponivel';
        });

    setTimeout(() => {
        const btn = document.getElementById('mobile-copy-ip');
        if (btn) btn.addEventListener('click', () => {
            const urlEl = document.getElementById('mobile-access-url');
            if (urlEl && urlEl.textContent) {
                navigator.clipboard.writeText(urlEl.textContent).then(() => {
                    btn.textContent = 'Copiado!';
                    btn.style.borderColor = '#00ff88';
                    btn.style.color = '#00ff88';
                    setTimeout(() => { btn.textContent = 'Copiar'; btn.style.borderColor = '#2a2a32'; btn.style.color = '#aaa'; }, 2000);
                }).catch(() => {});
            }
        });
    }, 0);

    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `
        <div class="footer-line">App desktop para Windows 10+ | Telemetria ETS2/ATS em tempo real</div>
        <div class="footer-line footer-copy">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);
}

function createSection(secName, items) {
    const secConfig = (config.sections || {})[secName] || {};
    const div = document.createElement('div');
    div.className = `section section-${secName}`;
    div.id = `section-${secName}`;

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = secConfig.label || secName.toUpperCase();
    div.appendChild(title);

    items.forEach(({ widget, idx }) => {
        const widgetDiv = createWidget(widget, idx);
        div.appendChild(widgetDiv);
    });

    return div;
}

function createWidget(widget, idx) {
    const div = document.createElement('div');
    div.className = `widget widget-${widget.type}`;
    div.id = `widget-${idx}`;

    if (widget.color) {
        div.style.setProperty('--accent', widget.color);
    }

    let inner = '';

    switch(widget.type) {
        case 'gauge':
            inner = `
                <div class="widget-label">${widget.label || widget.field}</div>
                <canvas class="gauge-canvas" width="280" height="200"></canvas>
                <div class="widget-value gauge-value"></div>`;
            break;
        case 'dual-gauge':
            inner = `
                <div class="widget-label">${widget.label || widget.field}</div>
                <canvas class="gauge-canvas" width="300" height="200"></canvas>
                <div class="widget-value gauge-value"></div>`;
            break;
        case 'progress-bar':
            inner = `
                <div class="widget-label">${widget.label || widget.field}</div>
                <div class="progress-wrapper">
                    <div class="progress-bar-container">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-info">
                        <span class="progress-value"></span>
                        <span class="progress-max">${widget.max || ''}${widget.unit ? ' ' + widget.unit : ''}</span>
                    </div>
                </div>`;
            break;
        case 'text':
            inner = `
                <div class="widget-label">${widget.label || widget.field}</div>
                <div class="widget-value text-value"></div><span class="widget-unit">${widget.unit || ''}</span>`;
            break;
        case 'status':
            inner = `
                <div class="widget-icons status-icons"></div>`;
            break;
        case 'bar-chart':
            inner = `<canvas class="chart-canvas" width="300" height="150"></canvas>`;
            break;
        case 'map':
            inner = `<canvas class="map-canvas" width="300" height="200"></canvas>`;
            break;
        default:
            inner = `<div class="widget-value"></div>`;
    }

    div.innerHTML = inner;
    widgetsInstances[idx] = { element: div, config: widget };
    return div;
}

function updateDashboard(data) {
    if (!data) return;
    telemetryData = data;

    if (data.trailer && data.trailer.name) {
        console.log('[DIAG] Trailer:', JSON.stringify(data.trailer), 'Truck:', JSON.stringify(data.truck));
    }

    for (let [idx, instance] of Object.entries(widgetsInstances)) {
        const w = instance.config;
        const container = instance.element;

        if (w.fields) {
            updateMultiFieldWidget(container, w, data);
            continue;
        }

        let rawValue = getNestedValue(data, w.field);
        if (rawValue === undefined) continue;

        let displayValue = formatValue(rawValue, w);
        let numericValue = parseFloat(rawValue);

        switch(w.type) {
            case 'gauge':
                updateGauge(container, numericValue, w, displayValue);
                break;
            case 'progress-bar':
                updateProgressBar(container, numericValue, w, displayValue);
                break;
            case 'text':
                updateText(container, displayValue, w);
                break;
            case 'status':
                updateStatus(container, rawValue, w);
                break;
            case 'bar-chart':
                updateBarChart(container, data, w);
                break;
            case 'map':
                updateMap(container, data, w);
                break;
        }
    }
}

function updateMultiFieldWidget(container, w, data) {
    switch(w.type) {
        case 'dual-gauge':
            let v1 = getNestedValue(data, w.fields[0].field);
            let v2 = getNestedValue(data, w.fields[1].field);
            let n1 = parseFloat(v1) || 0;
            let n2 = parseFloat(v2) || 0;
            drawDualGauge(container.querySelector('canvas'), n1, n2, w);
            let label = `${formatValue(v1, w.fields[0])} / ${formatValue(v2, w.fields[1])}`;
            let valueDiv = container.querySelector('.gauge-value');
            if (valueDiv) valueDiv.innerText = label;
            break;
    }
}

function updateGauge(container, value, w, display) {
    const canvas = container.querySelector('canvas');
    const valueDiv = container.querySelector('.gauge-value');
    if (canvas) drawGauge(canvas, value, w.min || 0, w.max || 100, w.color || '#0f0', w);
    if (valueDiv) valueDiv.innerText = display;
}

function updateProgressBar(container, value, w, display) {
    const fill = container.querySelector('.progress-fill');
    const valueDiv = container.querySelector('.progress-value');
    let percent = 0;
    if (w.max !== undefined && w.min !== undefined) {
        percent = (value - w.min) / (w.max - w.min);
    }
    percent = Math.min(1, Math.max(0, percent)) * 100;
    if (fill) {
        fill.style.width = percent + '%';
        fill.style.background = w.color || '#0f0';
    }
    if (valueDiv) valueDiv.innerText = display;
}

function updateText(container, display, w) {
    const valueDiv = container.querySelector('.text-value');
    if (valueDiv) valueDiv.innerText = display;
}

function updateStatus(container, rawValue, w) {
    const iconsDiv = container.querySelector('.status-icons');
    if (!iconsDiv || !w.icons) return;
    let activeKeys = [];
    if (Array.isArray(rawValue)) {
        activeKeys = rawValue;
    } else if (typeof rawValue === 'object' && rawValue !== null) {
        activeKeys = Object.keys(rawValue).filter(k => rawValue[k] === true);
    }
    let html = '';
    for (let [key, icon] of Object.entries(w.icons)) {
        let isActive = activeKeys.includes(key);
        html += `<span class="status-icon${isActive ? ' active' : ''}" title="${key}">${icon}</span>`;
    }
    iconsDiv.innerHTML = html;
}

function updateBarChart(container, data, w) {
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    if (!w.fields) return;
    const barWidth = cw / w.fields.length - 4;
    let maxVal = w.max || 100;

    w.fields.forEach((f, i) => {
        let val = getNestedValue(data, f.field) || 0;
        let numVal = parseFloat(val);
        let barHeight = (numVal / maxVal) * (ch - 30);
        let x = i * (barWidth + 4) + 2;
        let y = ch - barHeight - 20;

        ctx.fillStyle = f.color || '#0f0';
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = '#ccc';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(f.label || '', x + barWidth/2, ch - 4);
        ctx.fillText(Math.round(numVal), x + barWidth/2, y - 4);
    });
}

function updateMap(container, data, w) {
    const canvas = container.querySelector('.map-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    let truck = data.truck && data.truck.placement;
    let trailer = data.trailer && data.trailer.placement;
    if (!truck) return;

    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, cw, ch);

    let scale = w.scale || 0.01;
    let cx = cw / 2;
    let cy = ch / 2;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(-truck.x * scale, -truck.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();

    if (trailer) {
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(-trailer.x * scale, -trailer.z * scale, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawGauge(canvas, value, minV, maxV, color, w) {
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const cx = cw / 2;
    const cy = ch * 0.6;
    const radius = Math.min(cw, ch) * 0.38;
    const startAngle = -0.75 * Math.PI;
    const endAngle = 0.75 * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    let ratio = Math.min(1, Math.max(0, (value - minV) / (maxV - minV)));
    let angle = startAngle + ratio * (endAngle - startAngle);

    let gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    if (w.gradientColors) {
        w.gradientColors.forEach((c, i) => gradient.addColorStop(i / (w.gradientColors.length - 1), c));
    } else {
        gradient.addColorStop(0, '#0f0');
        gradient.addColorStop(0.5, '#ff0');
        gradient.addColorStop(1, '#f00');
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, angle);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    let tickCount = w.ticks || 10;
    for (let i = 0; i <= tickCount; i++) {
        let tickAngle = startAngle + (i / tickCount) * (endAngle - startAngle);
        let inner = radius - 10;
        let outer = radius + 10;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(tickAngle) * inner, cy + Math.sin(tickAngle) * inner);
        ctx.lineTo(cx + Math.cos(tickAngle) * outer, cy + Math.sin(tickAngle) * outer);
        ctx.strokeStyle = '#2a2a32';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

function drawDualGauge(canvas, v1, v2, w) {
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    let f1 = w.fields[0];
    let f2 = w.fields[1];
    let r1 = Math.min(cw/2, ch) * 0.35;

    drawArc(ctx, cw * 0.3, ch * 0.55, r1, v1, f1.min || 0, f1.max || 100, f1.color || '#0f0');
    drawArc(ctx, cw * 0.7, ch * 0.55, r1, v2, f2.min || 0, f2.max || 100, f2.color || '#0af');
}

function drawArc(ctx, cx, cy, radius, value, minV, maxV, color) {
    const startAngle = -0.75 * Math.PI;
    const endAngle = 0.75 * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = 10;
    ctx.stroke();

    let ratio = Math.min(1, Math.max(0, (value - minV) / (maxV - minV)));
    let angle = startAngle + ratio * (endAngle - startAngle);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();
}

async function fetchTelemetry() {
    const { data, error } = await fetchJSON('/api/telemetry');
    if (data) {
        telemetryFailCount = 0;
        telemetryStatusChecked = false;
        updateDashboard(data);
        document.getElementById('status').innerText = '\u25CF Conectado ao ETS2 Telemetry Server';
        document.getElementById('status').className = 'status-bar connected';
        if (typeof updateFloatingStatus === 'function') {
            const jobActive = (data.job && ((data.job.income > 0) || !!data.job.sourceCity)) || false;
            updateFloatingStatus(true, jobActive);
        }
    } else {
        telemetryFailCount++;
        if (typeof updateFloatingStatus === 'function') {
            updateFloatingStatus(false, false);
        }
        if (remoteAccess) {
            setStatus('\u25CF Telemetria indisponivel (acesso remoto)', 'warning');
            return;
        }
        if (telemetryFailCount <= 5) {
            setStatus('\u25CF Aguardando servidor de telemetria... (' + telemetryFailCount + ')', 'starting');
        } else if (!telemetryStatusChecked) {
            telemetryStatusChecked = true;
            const { data: statusData } = await fetchJSON('/api/telemetry/status');
            if (statusData && statusData.status === 'no_game') {
                setStatus('\u25CF Jogo nao detectado — inicie o ETS2/ATS', 'warning');
            } else if (statusData && statusData.status === 'offline') {
                setStatus('\u25CF ETS2 Telemetry Server offline (porta 25555)', 'error');
            } else {
                setStatus('\u25CF ETS2 Telemetry Server nao encontrado (porta 25555)', 'error');
            }
        } else {
            const statusEl = document.getElementById('status');
            if (statusEl && !statusEl.innerText.includes('Jogo') && !statusEl.innerText.includes('offline')) {
                setStatus('\u25CF ETS2 Telemetry Server nao encontrado (porta 25555)', 'error');
            }
        }
    }
}

function setStatus(text, className) {
    const el = document.getElementById('status');
    if (el) {
        el.innerText = text;
        el.className = 'status-bar ' + className;
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    const interval = config.updateIntervalMs || 100;
    pollInterval = setInterval(fetchTelemetry, interval);
}

let eventoCountdownTimer = null;

async function carregarEventoBanner() {
    const evento = await getEventoAtivo();
    const container = document.getElementById('dashboard-evento-banner');
    if (!container) return;

    if (eventoCountdownTimer) {
        clearInterval(eventoCountdownTimer);
        eventoCountdownTimer = null;
    }

    if (!evento) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = '';

    const params = evento.parametros || {};
    const icones = { maratona_viagens: '📦', desafio_km: '🛣️', foco_carga: '🎯', caixa_pontos: '⭐', explorador_cidades: '🗺️' };
    const icone = icones[evento.tipo] || '🔥';
    const meta = params.meta || 1;
    const user = getAuthUser();

    const header = document.createElement('div');
    header.className = 'evento-banner-header';

    const countdown = document.createElement('span');
    countdown.className = 'evento-countdown';
    countdown.id = 'dashboard-evento-countdown';
    countdown.textContent = formatCountdown(evento.data_fim);

    header.innerHTML = `
        <span class="evento-icone">${icone}</span>
        <span class="evento-titulo">${evento.titulo}</span>
        <span class="evento-desc">${evento.descricao}</span>
        <span class="evento-label">META: ${meta}</span>
    `;
    header.appendChild(countdown);
    container.appendChild(header);

    // Progresso individual do usuario logado
    if (user && user.nome) {
        const barContainer = document.createElement('div');
        barContainer.id = 'dashboard-evento-progresso';
        barContainer.style.cssText = 'padding:8px 16px 12px;border-top:1px solid #ff660020;margin-top:8px;';
        container.appendChild(barContainer);
        await atualizarProgressoIndividual(barContainer, evento.id, user.nome, meta);
    }

    // Auto-update countdown
    eventoCountdownTimer = setInterval(() => {
        const cd = document.getElementById('dashboard-evento-countdown');
        if (cd) cd.textContent = formatCountdown(evento.data_fim);
    }, 1000);

    // Refresh event data periodically
    setTimeout(() => carregarEventoBanner(), 30000);
}

async function atualizarProgressoIndividual(container, eventoId, motorista, meta) {
    const resp = await getProgressoEvento({ motorista });
    if (!resp || !resp.progresso) {
        container.innerHTML = `<div style="font-size:11px;color:#888;">Seu progresso: <strong>0/${meta}</strong></div>
            <div style="margin-top:4px;height:8px;background:#1a1a22;border-radius:4px;overflow:hidden;">
                <div style="width:0%;height:100%;background:#ff8800;border-radius:4px;transition:width 0.5s;"></div>
            </div>`;
        return;
    }

    const p = resp.progresso;
    const progAtual = p.progresso || 0;
    const atingiu = p.meta_atingida || false;
    const pct = Math.min(Math.round((progAtual / meta) * 100), 100);
    const bonusRecebido = p.bonus_recebido || false;

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:11px;color:#888;">Seu progresso:</span>
            <div style="flex:1;height:8px;background:#1a1a22;border-radius:4px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${atingiu ? '#00ff88' : '#ff8800'};border-radius:4px;transition:width 0.5s;"></div>
            </div>
            <span style="font-size:12px;font-weight:700;color:${atingiu ? '#00ff88' : '#ffaa00'};white-space:nowrap;">${progAtual}/${meta}</span>
            ${atingiu ? `<span style="font-size:14px;" title="Bonus ja ${bonusRecebido ? 'recebido' : 'a receber'}">✅ ${bonusRecebido ? '+'+ (resp.evento?.parametros?.bonus_pontos || '') + 'pts' : 'META!'}</span>` : ''}
        </div>`;
}

(async function init() {
    await loadConfig();
    startPolling();
})();
