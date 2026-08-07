const POLL_INTERVAL = 30000;
const CACHE_KEY = 'cargo_comunidade_cache';
const CACHE_MAX_AGE = 120000;

const EMOJIS = {
    joinha:  { icon: '👍', label: 'Joinha' },
    coracao: { icon: '❤️', label: 'Coracao' },
    fogo:    { icon: '🔥', label: 'Fogo' },
    riso:    { icon: '😂', label: 'Riso' },
    alvo:    { icon: '🎯', label: 'Alvo' }
};

const EMOJI_KEYS = Object.keys(EMOJIS);

let empresasData = [];
let motoristasData = [];
let statsData = {};
let reacoesData = {};
let currentTab = 'empresas';
let usuarioAtual = null;
let lastFetchOk = false;
let usandoFallback = false;
let searchQuery = '';
let syncStatus = null;

function getUsuario() {
    const user = getAuthUser();
    return user ? user.nome : null;
}

function loadCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return;
        const cache = JSON.parse(raw);
        if (Date.now() - cache.timestamp < CACHE_MAX_AGE * 3) {
            empresasData = cache.empresas || [];
            motoristasData = cache.motoristas || [];
            statsData = cache.stats || {};
        }
    } catch (e) {}
}

function saveCache() {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            empresas: empresasData,
            motoristas: motoristasData,
            stats: statsData,
            timestamp: Date.now()
        }));
    } catch (e) {}
}

async function fetchJSONTimeout(url, timeoutMs = 8000) {
    try {
        const sep = url.includes('?') ? '&' : '?';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const r = await fetch(url + sep + '_=' + Date.now(), { signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) return null;
        return await r.json();
    } catch (e) {
        return null;
    }
}

async function fetchComunidade(url) {
    return fetchJSONTimeout(url);
}

async function loadSyncStatus() {
    try {
        const r = await fetch('/api/sync/status?_=' + Date.now());
        if (r.ok) syncStatus = await r.json();
        else syncStatus = null;
    } catch (e) {
        syncStatus = null;
    }
}

async function loadData() {
    const user = getAuthUser();
    usuarioAtual = user ? user.nome : null;

    loadCache();
    await loadSyncStatus();

    const [resEmp, resMot, resStats, resReac] = await Promise.all([
        fetchComunidade('/api/comunidade/ranking?t=empresas'),
        fetchComunidade('/api/comunidade/ranking?t=motoristas'),
        fetchComunidade('/api/comunidade/stats'),
        fetchComunidade('/api/comunidade/reacoes')
    ]);

    if (resEmp && resMot) {
        usandoFallback = false;
        empresasData = (resEmp && resEmp.ranking) || [];
        motoristasData = (resMot && resMot.ranking) || [];
        statsData = resStats || {};
        reacoesData = (resReac && resReac.ok && resReac.reacoes) || {};
        lastFetchOk = true;
        saveCache();
    } else {
        usandoFallback = true;
        const [localEmp, localMot, localStats] = await Promise.all([
            fetchJSONTimeout('/api/ranking/empresas'),
            fetchJSONTimeout('/api/ranking/motoristas'),
            fetchJSONTimeout('/api/stats')
        ]);
        if (localEmp && localMot) {
            empresasData = (localEmp.ranking || []).map(e => ({
                nome: e.nome,
                logo: e.logo || '',
                motoristas: e.motoristas || 0,
                viagens: e.viagens || 0,
                km: e.km || 0,
                pontuacao: e.pontuacao || 0
            }));
            motoristasData = (localMot.ranking || []).map(m => ({
                nome: m.nome,
                empresa: m.empresa,
                viagens: m.viagens || 0,
                km: m.km || 0,
                pontuacao: m.pontuacao || 0,
                plano: m.plano || 'bronze'
            }));
            statsData = localStats || {};
            reacoesData = {};
            lastFetchOk = true;
            saveCache();
        } else {
            lastFetchOk = empresasData.length > 0 || motoristasData.length > 0;
            if (!lastFetchOk) {
                document.getElementById('status').innerText = 'ERRO: Sem conexao com a comunidade';
                document.getElementById('status').className = 'status-bar error';
                return false;
            }
        }
    }

    const totalEmp = statsData.totalEmpresas || empresasData.length;
    const totalMot = statsData.totalMotoristas || motoristasData.length;
    const origem = usandoFallback ? ' (dados locais)' : '';
    document.getElementById('status').innerText = `● Comunidade: ${totalEmp} empresas | ${totalMot} motoristas${origem}`;
    document.getElementById('status').className = 'status-bar connected';
    return true;
}

function getFilteredData() {
    const data = currentTab === 'empresas' ? empresasData : motoristasData;
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(item => {
        if (item.nome && item.nome.toLowerCase().includes(q)) return true;
        if (item.empresa && item.empresa.toLowerCase().includes(q)) return true;
        return false;
    });
}

function getReacoes(alvoNome, alvoTipo) {
    const key = alvoTipo + '_' + alvoNome;
    return reacoesData[key] || {};
}

function usuarioReagiu(reacoes, tipo) {
    if (!usuarioAtual || !reacoes[tipo]) return false;
    return reacoes[tipo].usuarios && reacoes[tipo].usuarios.includes(usuarioAtual);
}

async function toggleReacao(alvoNome, alvoTipo, tipoReacao) {
    if (!usuarioAtual) {
        alert('Faça login para reagir');
        return;
    }

    if (usandoFallback) {
        alert('Reações disponíveis apenas online');
        return;
    }

    const reacs = getReacoes(alvoNome, alvoTipo);
    const ativa = usuarioReagiu(reacs, tipoReacao);

    const key = alvoTipo + '_' + alvoNome;
    if (!reacoesData[key]) reacoesData[key] = {};
    if (!reacoesData[key][tipoReacao]) {
        reacoesData[key][tipoReacao] = { count: 0, usuarios: [] };
    }
    if (ativa) {
        reacoesData[key][tipoReacao].count = Math.max(0, reacoesData[key][tipoReacao].count - 1);
        const idx = reacoesData[key][tipoReacao].usuarios.indexOf(usuarioAtual);
        if (idx !== -1) reacoesData[key][tipoReacao].usuarios.splice(idx, 1);
    } else {
        reacoesData[key][tipoReacao].count++;
        reacoesData[key][tipoReacao].usuarios.push(usuarioAtual);
    }
    renderPage();

    try {
        const r = await fetch('/api/comunidade/reagir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alvo_nome: alvoNome,
                alvo_tipo: alvoTipo,
                tipo_reacao: tipoReacao,
                usuario: usuarioAtual
            })
        });
        if (!r.ok) {
            await loadData();
            renderPage();
        }
    } catch (e) {
        await loadData();
        renderPage();
    }
}

function renderReacoes(alvoNome, alvoTipo) {
    if (usandoFallback) return '';
    const reacs = getReacoes(alvoNome, alvoTipo);
    let html = '';
    EMOJI_KEYS.forEach(key => {
        const emoji = EMOJIS[key];
        const count = (reacs[key] && reacs[key].count) || 0;
        const ativa = usuarioReagiu(reacs, key);
        const escapedNome = escapeAttr(alvoNome);
        html += `<button class="reacao-btn${ativa ? ' ativa' : ''}" onclick="toggleReacao('${escapedNome}', '${alvoTipo}', '${key}')" title="${emoji.label}">
            <span class="emoji">${emoji.icon}</span>
            <span class="count">${count}</span>
        </button>`;
    });
    return html;
}

function renderSyncBar() {
    if (!syncStatus) return '';
    const configured = syncStatus.configured || false;
    const enabled = syncStatus.enabled || false;
    const lastSync = syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString('pt-BR') : 'Nunca';
    const isSyncing = syncStatus.isSyncing || false;
    const lastError = syncStatus.lastError || null;

    let icon = '⚪', color = '#888';
    if (configured && enabled && !lastError) { icon = '🟢'; color = '#00ff88'; }
    else if (configured && enabled && lastError) { icon = '🟡'; color = '#ffaa00'; }
    else if (configured && !enabled) { icon = '⚪'; color = '#666'; }
    else { icon = '🔴'; color = '#ff4444'; }

    return `<div class="sync-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0d1117;border:1px solid #1e1e28;border-radius:8px;margin-bottom:12px;font-size:11px;flex-wrap:wrap;">
        <span style="color:${color}">${icon}</span>
        <span style="color:#aaa;">Sync:</span>
        <span style="color:#e0e0e0;">${lastSync}</span>
        ${isSyncing ? '<span style="color:#f5c842;">🔄 Sincronizando...</span>' : ''}
        ${lastError ? `<span style="color:#ff8888;font-size:10px;margin-left:4px;">(último erro: ${lastError.substring(0, 50)})</span>` : ''}
        <button class="reacao-btn" onclick="forcarSync(this)" style="margin-left:auto;padding:4px 12px;font-size:10px;" title="Sincronizar agora">🔄 Sincronizar</button>
    </div>`;
}

async function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

async function forcarSync(btnElement) {
    const btn = btnElement || (typeof event !== 'undefined' && event ? event.target : null);
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    const token = getAuthToken();
    if (!token) {
        if (btn) { btn.textContent = '❌ Sem login'; btn.disabled = false; }
        setTimeout(() => { if (btn) btn.textContent = '🔄 Sincronizar'; }, 3000);
        return;
    }

    try {
        const r = await fetch('/api/sync/now', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (r && r.ok) {
            const data = await r.json();
            if (data.ok) {
                clearCache();
                await loadData();
                renderPage();
                if (btn) btn.textContent = '✅ Feito!';
                setTimeout(() => { if (btn) btn.textContent = '🔄 Sincronizar'; btn.disabled = false; }, 2000);
                return;
            }
            if (btn) btn.textContent = '❌ ' + (data.reason || 'Erro no sync');
        } else if (r && r.status === 401) {
            if (btn) btn.textContent = '❌ Sessão expirada';
        } else {
            if (btn) btn.textContent = '❌ Erro servidor';
        }
        setTimeout(() => { if (btn) btn.textContent = '🔄 Sincronizar'; btn.disabled = false; }, 3000);
    } catch (e) {
        if (btn) { btn.textContent = '❌ Sem conexão'; btn.disabled = false; }
        setTimeout(() => { if (btn) btn.textContent = '🔄 Sincronizar'; }, 3000);
    }
}

function renderSearchBar() {
    return `<div style="display:flex;gap:8px;margin-bottom:12px;">
        <input type="text" id="comunidade-search" placeholder="Buscar por nome ou empresa..." value="${searchQuery}"
            style="flex:1;padding:8px 12px;background:#0d1117;border:1px solid #2a2a32;border-radius:6px;color:#e0e0e0;font-size:12px;outline:none;"
            oninput="searchQuery=this.value;renderPage();">
    </div>`;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('comunidade_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const header = document.createElement('div');
    header.className = 'comunidade-header';
    header.innerHTML = `<div class="title">COMUNIDADE</div>
        <div class="subtitle">Ranking global de todas as empresas e motoristas</div>`;
    frame.appendChild(header);

    // Sync status bar
    const syncHtml = renderSyncBar();
    if (syncHtml) {
        const syncDiv = document.createElement('div');
        syncDiv.innerHTML = syncHtml;
        frame.appendChild(syncDiv.firstElementChild || syncDiv);
    }

    if (!lastFetchOk) {
        const offline = document.createElement('div');
        offline.className = 'comunidade-offline';
        offline.innerHTML = `<div class="icon">🌐</div>
            <div class="msg">Sem conexao com a comunidade<br><span style="font-size:11px;color:#555;">Verifique sua conexao com a internet</span></div>`;
        frame.appendChild(offline);
        app.appendChild(frame);
        document.getElementById('status').innerText = 'Sem conexao com a comunidade';
        document.getElementById('status').className = 'status-bar error';
        return;
    }

    // Stats
    const statsEl = document.createElement('div');
    statsEl.className = 'comunidade-stats';
    statsEl.innerHTML = `
        <div class="comunidade-stat"><div class="value">${statsData.totalEmpresas || empresasData.length}</div><div class="label">Empresas</div></div>
        <div class="comunidade-stat"><div class="value">${statsData.totalMotoristas || motoristasData.length}</div><div class="label">Motoristas</div></div>
        <div class="comunidade-stat"><div class="value">${statsData.totalViagens || 0}</div><div class="label">Viagens</div></div>
        <div class="comunidade-stat"><div class="value">${formatKm(statsData.totalKm || 0)}</div><div class="label">KM Rodados</div></div>`;
    frame.appendChild(statsEl);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'comunidade-tabs';
    tabs.innerHTML = `<button class="${currentTab === 'empresas' ? 'active' : ''}" onclick="switchTab('empresas')">Empresas</button>
        <button class="${currentTab === 'motoristas' ? 'active' : ''}" onclick="switchTab('motoristas')">Motoristas</button>`;
    frame.appendChild(tabs);

    // Search
    const searchContainer = document.createElement('div');
    searchContainer.innerHTML = renderSearchBar();
    frame.appendChild(searchContainer.firstElementChild);

    // List
    const list = document.createElement('div');
    list.id = 'comunidade-list';

    const filteredData = getFilteredData();
    if (filteredData.length === 0) {
        list.innerHTML = searchQuery
            ? `<div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">Nenhum resultado</div>
                <div class="empty-desc">Nenhum item encontrado para "${escapeHTML(searchQuery)}"<br>Tente buscar por outro termo</div>
               </div>`
            : `<div class="empty-state">
                <div class="empty-icon">📭</div>
                <div class="empty-title">Nenhum dado disponível</div>
                <div class="empty-desc">Os dados da comunidade ainda não foram carregados.<br>Verifique sua conexão com a internet.</div>
               </div>`;
    } else {
        filteredData.forEach((item, i) => {
            const pos = i + 1;
            let posClass = '';
            if (pos === 1) posClass = 'top-1';
            else if (pos === 2) posClass = 'top-2';
            else if (pos === 3) posClass = 'top-3';

            const isCurrentUser = usuarioAtual && item.nome === usuarioAtual;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'comunidade-item';
            if (isCurrentUser) {
                itemDiv.style.border = '1px solid #f5c84260';
                itemDiv.style.background = '#1a1500';
            }

            // Position
            const posDiv = document.createElement('div');
            posDiv.className = 'pos ' + posClass;
            posDiv.textContent = pos + '\u00BA';
            itemDiv.appendChild(posDiv);

            // Info
            const info = document.createElement('div');
            info.className = 'info';

            if (currentTab === 'empresas') {
                const empresaNomeEscaped = escapeHTML(item.nome);
                info.innerHTML = `<div class="nome"><a href="empresa_local.html?empresa=${encodeURIComponent(item.nome)}">${empresaNomeEscaped}${isCurrentUser ? ' <span style="color:#f5c842;font-size:10px;">(você)</span>' : ''}</a></div>
                    <div class="stats"><span>Viagens: <span class="num">${item.viagens || 0}</span></span><span>KM: <span class="num">${formatKm(item.km || 0)}</span></span><span>Pontos: <span class="num">${(item.pontuacao || 0).toLocaleString()}</span></span></div>`;
            } else {
                const nomeEscaped = escapeHTML(item.nome);
                const cargoBadge = item.cargo ? `<span class="cargo-badge-small ${getCargoBadgeClass(item.cargo)}">${escapeHTML(item.cargo)}</span>` : '';
                const empresaLink = item.empresa && item.empresa !== 'Lobo Solitário'
                    ? `<a class="empresa-link" href="empresa_local.html?empresa=${encodeURIComponent(item.empresa)}">${escapeHTML(item.empresa)}</a>`
                    : '<span style="color:#ffaa00;font-size:11px;">Lobo Solitario</span>';
                const planoBadge = getPlanoBadgeHTML(item.plano);
                info.innerHTML = `<div class="nome"><a href="perfil_local.html?motorista=${encodeURIComponent(item.nome)}">${nomeEscaped}</a>${planoBadge}${cargoBadge} — ${empresaLink}${isCurrentUser ? ' <span style="color:#f5c842;font-size:10px;">(você)</span>' : ''}</div>
                    <div class="stats"><span>Viagens: <span class="num">${item.viagens || 0}</span></span><span>KM: <span class="num">${formatKm(item.km || 0)}</span></span><span>Pontos: <span class="num">${(item.pontuacao || 0).toLocaleString()}</span></span></div>`;
            }
            itemDiv.appendChild(info);

            // Reactions
            if (!usandoFallback) {
                const reacDiv = document.createElement('div');
                reacDiv.className = 'reacoes';
                reacDiv.innerHTML = renderReacoes(item.nome, currentTab === 'empresas' ? 'empresa' : 'motorista');
                itemDiv.appendChild(reacDiv);
            }

            list.appendChild(itemDiv);
        });
    }
    frame.appendChild(list);

    // Footer info
    const refreshInfo = document.createElement('div');
    refreshInfo.className = 'comunidade-refresh';
    const origem = usandoFallback ? ' — Usando dados locais (Hostinger offline)' : '';
    refreshInfo.innerHTML = `<span class="info">Atualizado automaticamente a cada ${POLL_INTERVAL / 1000}s — Dados globais de todas as instalacoes${origem}</span>`;
    frame.appendChild(refreshInfo);

    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `<div class="footer-line">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);
}

function switchTab(tab) {
    currentTab = tab;
    renderPage();
}

function formatKm(km) {
    if (km >= 1000000) return (km / 1000000).toFixed(1) + 'M';
    if (km >= 1000) return (km / 1000).toFixed(1) + 'k';
    return km || 0;
}

function getCargoBadgeClass(cargo) {
    const map = {
        'Aprendiz': 'cargo-aprendiz',
        'Em treinamento': 'cargo-treinamento',
        'Trainee': 'cargo-trainee',
        'Pleno': 'cargo-pleno',
        'Senior': 'cargo-senior',
        'Master': 'cargo-master',
        'Elite': 'cargo-elite',
        'Motorista': 'cargo-motorista'
    };
    return map[cargo] || 'cargo-motorista';
}

let pollTimer = null;

(async function init() {
    const ok = await loadData();
    renderPage();
    pollTimer = setInterval(async () => {
        const ok = await loadData();
        if (ok) renderPage();
    }, POLL_INTERVAL);
})();
