let mobileConfig = {};
let mobileTelemetry = {};
let mobilePollInterval = null;

async function loadMobileConfig() {
    try {
        const resp = await fetch('config_mobile.json?' + Date.now());
        mobileConfig = await resp.json();
        document.title = mobileConfig.title || "Cargo Stats Mobile";
        document.body.style.background = mobileConfig.background || '#0a0a0a';
        renderMobileDashboard();
        return true;
    } catch (e) {
        console.error("Mobile config error", e);
        const app = document.getElementById('mobile-app');
        app.innerHTML = `<div class="mobile-card"><div class="mobile-card-label">ERRO</div><div style="color:#ff4444;font-size:12px;">config_mobile.json não encontrado</div></div>`;
        return false;
    }
}

function renderMobileDashboard() {
    const app = document.getElementById('mobile-app');
    app.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'mobile-title';
    title.textContent = mobileConfig.title || 'CARGO STATS';
    app.appendChild(title);

    const status = document.createElement('div');
    status.id = 'mobile-status';
    status.className = 'mobile-status-bar';
    status.textContent = 'Conectando...';
    app.appendChild(status);

    const eventoContainer = document.createElement('div');
    eventoContainer.id = 'mobile-evento';
    app.appendChild(eventoContainer);

    const grid = document.createElement('div');
    grid.className = 'mobile-grid';
    grid.id = 'mobile-grid';
    app.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'mobile-footer';
    footer.innerHTML = '&copy; 2026 Cargo Stats';
    app.appendChild(footer);
}

function renderWidgets() {
    const grid = document.getElementById('mobile-grid');
    grid.innerHTML = '';

    if (!mobileConfig.widgets) return;

    const sectionWidgets = {};
    mobileConfig.widgets.forEach((w, idx) => {
        const sec = w.section || 'other';
        if (!sectionWidgets[sec]) sectionWidgets[sec] = [];
        sectionWidgets[sec].push({ widget: w, idx });
    });

    const sectionOrder = ['job', 'gauges', 'route', 'data', 'fluids', 'status'];

    sectionOrder.forEach(secName => {
        if (!sectionWidgets[secName]) return;
        const items = sectionWidgets[secName];

        if (items.length === 1 && items[0].widget.type === 'job-status') {
            const card = createJobStatusCard();
            grid.appendChild(card);
            return;
        }

        if (items.length === 1 && items[0].widget.type === 'big-text') {
            const card = createBigSpeedCard(items[0].widget);
            grid.appendChild(card);
            return;
        }

        const card = document.createElement('div');
        card.className = 'mobile-card';
        card.id = 'mobile-card-' + secName;

        const secConfig = (mobileConfig.sections || {})[secName] || {};
        const label = document.createElement('div');
        label.className = 'mobile-card-label';
        label.textContent = secConfig.label || secName.toUpperCase();
        card.appendChild(label);

        const content = document.createElement('div');
        content.className = 'mobile-card-content';
        content.id = 'mobile-content-' + secName;

        items.forEach(({ widget }) => {
            const el = createMobileWidget(widget);
            if (el) content.appendChild(el);
        });

        card.appendChild(content);
        grid.appendChild(card);
    });

    carregarEventoMobile();
}

function createJobStatusCard() {
    const card = document.createElement('div');
    card.className = 'mobile-card mobile-card-job';
    card.id = 'mobile-job-card';

    const label = document.createElement('div');
    label.className = 'mobile-card-label';
    label.textContent = 'JOB ATIVO';
    card.appendChild(label);

    const content = document.createElement('div');
    content.id = 'mobile-job-content';
    content.innerHTML = '<div class="job-status-row"><div class="job-status-dot inactive"></div><div><div class="job-status-text">Sem job ativo</div></div></div>';
    card.appendChild(content);

    return card;
}

function createBigSpeedCard(widget) {
    const card = document.createElement('div');
    card.className = 'mobile-card';
    card.id = 'mobile-speed-card';

    const label = document.createElement('div');
    label.className = 'mobile-card-label';
    label.textContent = widget.label || 'VELOCIDADE';
    card.appendChild(label);

    const content = document.createElement('div');
    content.className = 'big-speed';
    content.id = 'mobile-big-speed';
    content.innerHTML = `<span class="big-speed-value" id="speed-value">0</span><span class="big-speed-unit">km/h</span>`;
    card.appendChild(content);

    const gaugesRow = document.createElement('div');
    gaugesRow.className = 'mobile-gauges-row';
    gaugesRow.id = 'mobile-gauges-row';
    card.appendChild(gaugesRow);

    return card;
}

function createMobileWidget(widget) {
    switch (widget.type) {
        case 'text':
            return createMobileTextRow(widget);
        case 'progress-bar':
            return createMobileProgressBar(widget);
        case 'status':
            return createMobileStatusIcons(widget);
        default:
            return null;
    }
}

function createMobileTextRow(widget) {
    const row = document.createElement('div');
    row.className = 'mobile-row';
    row.id = 'mobile-row-' + widget.field.replace(/\./g, '-');

    const label = document.createElement('span');
    label.className = 'mobile-row-label';
    label.textContent = widget.label || widget.field;
    row.appendChild(label);

    const value = document.createElement('span');
    value.className = 'mobile-row-value';
    if (widget.color) value.style.color = widget.color;
    value.id = 'mobile-val-' + widget.field.replace(/\./g, '-');
    value.textContent = '--';
    row.appendChild(value);

    return row;
}

function createMobileProgressBar(widget) {
    const container = document.createElement('div');
    container.className = 'mobile-progress';
    container.id = 'mobile-prog-' + widget.field.replace(/\./g, '-');

    const label = document.createElement('span');
    label.className = 'mobile-progress-label';
    label.textContent = widget.label || widget.field;
    container.appendChild(label);

    const bar = document.createElement('div');
    bar.className = 'mobile-progress-bar';

    const fill = document.createElement('div');
    fill.className = 'mobile-progress-fill';
    fill.id = 'mobile-fill-' + widget.field.replace(/\./g, '-');
    fill.style.background = widget.color || '#00aaff';
    fill.style.width = '0%';
    bar.appendChild(fill);

    container.appendChild(bar);

    const value = document.createElement('span');
    value.className = 'mobile-progress-value';
    value.id = 'mobile-progval-' + widget.field.replace(/\./g, '-');
    value.textContent = '--';
    container.appendChild(value);

    return container;
}

function createMobileStatusIcons(widget) {
    const container = document.createElement('div');
    container.className = 'mobile-status-icons';
    container.id = 'mobile-status-icons';

    if (widget.icons) {
        for (const [key, icon] of Object.entries(widget.icons)) {
            const span = document.createElement('span');
            span.className = 'mobile-status-icon';
            span.id = 'mobile-icon-' + key;
            span.textContent = icon;
            span.title = key;
            container.appendChild(span);
        }
    }

    return container;
}

function updateMobileDashboard(data) {
    if (!data) return;
    mobileTelemetry = data;

    const hasJob = data.job && (data.job.income > 0 || !!data.job.sourceCity);

    updateMobileJobCard(data, hasJob);
    updateMobileBigSpeed(data);
    updateMobileGaugesRow(data);

    if (!mobileConfig.widgets) return;

    mobileConfig.widgets.forEach(w => {
        if (w.type === 'job-status' || w.type === 'big-text') return;

        const field = w.field;
        if (field === 'job.sourceCity' || field === 'job.destinationCity' ||
            field === 'job.sourceCompany' || field === 'job.destinationCompany') {
            if (!hasJob) {
                const el = document.getElementById('mobile-val-' + field.replace(/\./g, '-'));
                if (el) el.textContent = '--';
                return;
            }
        }

        const rawValue = getNestedValue(data, field);
        if (rawValue === undefined) return;

        switch (w.type) {
            case 'text': {
                const el = document.getElementById('mobile-val-' + field.replace(/\./g, '-'));
                if (el) el.textContent = formatMobileValue(rawValue, w);
                break;
            }
            case 'progress-bar': {
                const fill = document.getElementById('mobile-fill-' + field.replace(/\./g, '-'));
                const val = document.getElementById('mobile-progval-' + field.replace(/\./g, '-'));
                if (fill) {
                    const num = parseFloat(rawValue) || 0;
                    const max = w.max || 100;
                    const min = w.min || 0;
                    let pct = Math.min(1, Math.max(0, (num - min) / (max - min))) * 100;
                    fill.style.width = pct + '%';
                }
                if (val) val.textContent = formatMobileValue(rawValue, w);
                break;
            }
            case 'status': {
                if (w.icons) {
                    let activeKeys = [];
                    if (Array.isArray(rawValue)) activeKeys = rawValue;
                    else if (typeof rawValue === 'object' && rawValue !== null) {
                        activeKeys = Object.keys(rawValue).filter(k => rawValue[k] === true);
                    }
                    for (const key of Object.keys(w.icons)) {
                        const el = document.getElementById('mobile-icon-' + key);
                        if (el) {
                            const isActive = activeKeys.includes(key);
                            el.className = 'mobile-status-icon';
                            if (isActive) {
                                const isWarning = key.includes('Warning') || key.includes('warn');
                                el.classList.add(isWarning ? 'warning' : 'active');
                            }
                        }
                    }
                }
                break;
            }
        }
    });
}

function updateMobileJobCard(data, hasJob) {
    const content = document.getElementById('mobile-job-content');
    const card = document.getElementById('mobile-job-card');
    if (!content) return;

    if (hasJob) {
        const origem = getNestedValue(data, 'job.sourceCity') || '?';
        const destino = getNestedValue(data, 'job.destinationCity') || '?';
        const cargo = getNestedValue(data, 'trailer.name') || getNestedValue(data, 'job.cargo.name') || '';
        const income = getNestedValue(data, 'job.income') || 0;

        card.className = 'mobile-card mobile-card-job-active';

        let cargoHtml = '';
        if (cargo) cargoHtml = `<div class="job-status-cargo">${cargo}</div>`;

        content.innerHTML = `
            <div class="job-status-row">
                <div class="job-status-dot active"></div>
                <div>
                    <div class="job-status-text">${origem} → ${destino}</div>
                    ${cargoHtml}
                    <div style="font-size:11px;color:#ffaa00;margin-top:2px;">€ ${Number(income).toLocaleString()}</div>
                </div>
            </div>`;
    } else {
        card.className = 'mobile-card mobile-card-job';
        content.innerHTML = `
            <div class="job-status-row">
                <div class="job-status-dot inactive"></div>
                <div>
                    <div class="job-status-text">Sem job ativo</div>
                    <div class="job-status-cargo">Aguardando novo trabalho...</div>
                </div>
            </div>`;
    }
}

function updateMobileBigSpeed(data) {
    const el = document.getElementById('speed-value');
    if (!el) return;

    const raw = getNestedValue(data, 'truck.speed');
    const speed = raw !== undefined ? Math.round(parseFloat(raw) || 0) : 0;
    el.textContent = speed;

    const hue = speed > 100 ? 0 : speed > 60 ? 40 : 120;
    const color = `hsl(${hue}, 100%, 55%)`;
    el.style.color = color;
    el.style.textShadow = `0 0 20px ${color}40`;
}

function updateMobileGaugesRow(data) {
    const row = document.getElementById('mobile-gauges-row');
    if (!row) return;

    const rpm = getNestedValue(data, 'truck.engineRpm');
    const gear = getNestedValue(data, 'truck.gear');
    const fuel = getNestedValue(data, 'truck.fuel');

    let html = '';

    if (rpm !== undefined) {
        const rpmNum = Math.round(parseFloat(rpm) || 0);
        html += `<div class="mobile-gauge-item">
            <div class="mobile-gauge-label">RPM</div>
            <div class="mobile-gauge-value" style="color:#ffaa00">${rpmNum}<span class="mobile-gauge-unit">rpm</span></div>
        </div>`;
    }

    if (gear !== undefined) {
        const gearStr = gear.toString();
        html += `<div class="mobile-gauge-item">
            <div class="mobile-gauge-label">MARCHA</div>
            <div class="mobile-gauge-value" style="color:#ffffff">${gearStr}</div>
        </div>`;
    }

    row.innerHTML = html;
}

function formatMobileValue(rawValue, w) {
    const numericValue = parseFloat(rawValue);
    if (isNaN(numericValue)) return rawValue || '--';

    if (w.format) {
        try {
            return w.format.replace(/\{value(:[^}]+)?\}/g, (match, fmt) => {
                const divisor = w.unit === 'km' ? 1000 : 1;
                if (fmt === ':.0f') return Math.round(numericValue / divisor).toString();
                if (fmt === ':.1f') return (numericValue / divisor).toFixed(1);
                if (fmt === ':.2f') return (numericValue / divisor).toFixed(2);
                return rawValue;
            });
        } catch (e) { return rawValue; }
    }

    switch (w.unit) {
        case 'km/h': return Math.round(numericValue) + ' km/h';
        case 'rpm': return Math.round(numericValue) + ' rpm';
        case 'L': return numericValue.toFixed(1) + ' L';
        case '°C': return numericValue.toFixed(1) + ' °C';
        case 'bar': return numericValue.toFixed(1) + ' bar';
        case 'V': return numericValue.toFixed(1) + ' V';
        case 'km': return (numericValue / 1000).toFixed(1) + ' km';
        case 'L/100km': return numericValue.toFixed(2) + ' L/100km';
        case '€': return '€' + Math.round(numericValue).toLocaleString();
        case '%': return Math.round(numericValue) + '%';
        default: {
            if (!isNaN(numericValue)) return numericValue.toFixed(1);
            return rawValue;
        }
    }
}

async function fetchMobileTelemetry() {
    const { data, error } = await fetchJSON('/api/telemetry');
    const statusEl = document.getElementById('mobile-status');
    if (!statusEl) return;

    if (data) {
        updateMobileDashboard(data);
        const hasJob = data.job && (data.job.income > 0 || !!data.job.sourceCity);
        statusEl.textContent = hasJob ? '\u25CF Job Ativo' : '\u25CF Conectado';
        statusEl.className = 'mobile-status-bar' + (hasJob ? ' job-active' : ' connected');

        if (typeof processAutoRecord === 'function') {
            processAutoRecord(data);
        }
    } else {
        statusEl.textContent = '\u25CF Desconectado';
        statusEl.className = 'mobile-status-bar error';
    }
}

function startMobilePolling() {
    if (mobilePollInterval) clearInterval(mobilePollInterval);
    const interval = mobileConfig.updateIntervalMs || 250;
    fetchMobileTelemetry();
    mobilePollInterval = setInterval(fetchMobileTelemetry, interval);
}

async function carregarEventoMobile() {
    try {
        const evento = await getEventoAtivo();
        const container = document.getElementById('mobile-evento');
        if (!container) return;

        container.innerHTML = '';

        if (!evento) return;

        const card = document.createElement('div');
        card.className = 'mobile-card mobile-evento-banner';

        const label = document.createElement('div');
        label.className = 'mobile-card-label';
        label.textContent = 'EVENTO ATIVO';
        card.appendChild(label);

        const icones = { maratona_viagens: '\uD83D\uDCE6', desafio_km: '\uD83D\uDEE3\uFE0F', foco_carga: '\uD83C\uDFAF', caixa_pontos: '\u2B50', explorador_cidades: '\uD83D\uDDFA\uFE0F' };
        const icone = icones[evento.tipo] || '\uD83D\uDD25';
        const params = evento.parametros || {};
        const meta = params.meta || 1;

        const header = document.createElement('div');
        header.className = 'mobile-evento-header';
        header.innerHTML = `<span>${icone}</span><span>${evento.titulo}</span><span style="margin-left:auto;font-size:10px;color:#888;">${formatCountdown(evento.data_fim)}</span>`;
        card.appendChild(header);

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;';
        desc.textContent = evento.descricao;
        card.appendChild(desc);

        const user = getAuthUser();
        if (user && user.nome) {
            const progContainer = document.createElement('div');
            progContainer.id = 'mobile-evento-progresso';
            card.appendChild(progContainer);
            atualizarProgressoMobile(progContainer, evento.id, user.nome, meta);
        }

        container.appendChild(card);
    } catch (e) {
        console.error('[MOBILE] Evento error:', e);
    }
}

async function atualizarProgressoMobile(container, eventoId, motorista, meta) {
    const resp = await getProgressoEvento({ motorista });
    if (!resp || !resp.progresso) {
        container.innerHTML = `<div class="mobile-evento-progress"><span class="mobile-evento-text">0/${meta}</span><div class="mobile-evento-bar"><div class="mobile-evento-fill" style="width:0%"></div></div></div>`;
        return;
    }

    const p = resp.progresso;
    const progAtual = p.progresso || 0;
    const pct = Math.min(Math.round((progAtual / meta) * 100), 100);
    const atingiu = p.meta_atingida || false;

    container.innerHTML = `
        <div class="mobile-evento-progress">
            <span class="mobile-evento-text" style="color:${atingiu ? '#00ff88' : '#ffaa00'}">${progAtual}/${meta}</span>
            <div class="mobile-evento-bar">
                <div class="mobile-evento-fill" style="width:${pct}%;background:${atingiu ? '#00ff88' : '#ff8800'};"></div>
            </div>
            ${atingiu ? '<span style="font-size:14px;">✅</span>' : ''}
        </div>`;
}

(async function initMobile() {
    await loadMobileConfig();
    renderWidgets();
    startMobilePolling();
})();
