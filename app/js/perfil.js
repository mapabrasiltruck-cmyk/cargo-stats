let motoristaNome = null;
let motoristaStats = null;
let empresaInfo = null;
let viagensData = [];
let conquistasData = [];
let rankingPosition = 0;
let rankingTotal = 0;

function getMotoristaFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('motorista');
}

function isOwnProfile() {
    const user = getAuthUser();
    return user && user.nome === motoristaNome;
}

function isLoboSolitario() {
    return !motoristaStats || !motoristaStats.empresa || motoristaStats.empresa === 'Lobo Solitário';
}

async function uploadFotoPerfil(file) {
    const formData = new FormData();
    formData.append('foto', file);
    const res = await authFetch('/api/perfil/foto', {
        method: 'POST',
        body: formData
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            motoristaStats.foto = result.foto;
            renderPage();
        }
    }
}

function handleFotoClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) uploadFotoPerfil(file);
    };
    input.click();
}

async function loadData() {
    motoristaNome = getMotoristaFromURL();
    if (!motoristaNome) {
        document.getElementById('status').innerText = 'Motorista não especificado';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    const [resConquistas, resViagens, resRanking] = await Promise.all([
        fetchJSON(`/api/conquistas?motorista=${encodeURIComponent(motoristaNome)}`),
        fetchJSON(`/api/viagens?motorista=${encodeURIComponent(motoristaNome)}`),
        fetchJSON('/api/ranking/motoristas')
    ]);

    if (resConquistas.error || !resConquistas.data) {
        document.getElementById('status').innerText = 'Motorista não encontrado';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    motoristaStats = resConquistas.data.motorista;
    conquistasData = resConquistas.data.conquistas || [];
    viagensData = (resViagens.data && resViagens.data.viagens) || [];

    if (motoristaStats.empresa && motoristaStats.empresa !== 'Lobo Solitário') {
        const resEmp = await fetchJSON('/api/empresas');
        if (resEmp.data && resEmp.data.empresas) {
            empresaInfo = resEmp.data.empresas.find(e => e.nome === motoristaStats.empresa) || null;
        }
    }

    if (resRanking.data && resRanking.data.ranking) {
        const ranking = resRanking.data.ranking;
        rankingTotal = ranking.length;
        const pos = ranking.findIndex(r => r.nome === motoristaNome);
        rankingPosition = pos >= 0 ? pos + 1 : rankingTotal;
    }

    document.title = `CARGO STATS - ${motoristaNome}`;
    return true;
}

function getViagensMes() {
    const mes = getMesAtual();
    return viagensData.filter(v => {
        const d = new Date(v.data);
        return d.getMonth() + 1 === mes.mes && d.getFullYear() === mes.ano;
    });
}

function getCidades() {
    const cidades = new Set();
    viagensData.forEach(v => {
        if (v.origem) cidades.add(v.origem);
        if (v.destino) cidades.add(v.destino);
    });
    return [...cidades].sort();
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('perfil_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const nivelInfo = getNivelInfo(motoristaStats.pontuacao || 0);
    const viagensMes = getViagensMes();
    const cidades = getCidades();
    const desbloqueadas = conquistasData.filter(c => c.desbloqueada).length;

    const banner = document.createElement('div');
    banner.className = 'perfil-banner';
    const isLobo = isLoboSolitario();
    const empresaDoMotorista = motoristaStats.empresa || '';
    if (isLobo) {
        banner.style.cssText = 'width:100%;height:180px;background:linear-gradient(135deg,#0a1628 0%,#1a2a3a 50%,#0d2137 100%);border-radius:12px;margin-bottom:0;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;';
        banner.innerHTML = `
            <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2220%22 cy=%2220%22 r=%221.5%22 fill=%22%2300ff8820%22/><circle cx=%2280%22 cy=%2240%22 r=%221%22 fill=%22%23ffaa0020%22/><circle cx=%2250%22 cy=%2280%22 r=%221.2%22 fill=%22%2300ff8815%22/></svg>') repeat;opacity:0.5;"></div>
            <div style="position:relative;z-index:1;text-align:center;">
                <div style="font-size:48px;margin-bottom:8px;">🐺</div>
                <div style="color:#ffaa00;font-size:16px;font-weight:700;letter-spacing:2px;">${motoristaStats.nome.toUpperCase()}</div>
                <div style="color:#888;font-size:11px;margin-top:4px;letter-spacing:1px;">LOBO SOLITÁRIO</div>
            </div>`;
    } else {
        if (empresaInfo && empresaInfo.banner) {
            banner.style.cssText = 'width:100%;height:180px;border-radius:12px;margin-bottom:0;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;';
            banner.innerHTML = `
                <img src="${empresaInfo.banner}" alt="${empresaDoMotorista}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%);"></div>
                <div style="position:relative;z-index:1;text-align:center;">
                    <div style="font-size:48px;margin-bottom:8px;">🏢</div>
                    <div style="color:#fff;font-size:16px;font-weight:700;letter-spacing:2px;text-shadow:0 2px 8px rgba(0,0,0,0.7);">${motoristaStats.nome.toUpperCase()}</div>
                    <div style="color:#ccc;font-size:11px;margin-top:4px;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.7);">
                        <a href="empresa_local.html?empresa=${encodeURIComponent(empresaDoMotorista)}" style="color:#00ff88;text-decoration:none;">${empresaDoMotorista.toUpperCase()}</a>
                    </div>
                </div>`;
        } else {
            banner.style.cssText = 'width:100%;height:180px;background:linear-gradient(135deg,#0a1e0a 0%,#1a3a1a 50%,#0d2a0d 100%);border-radius:12px;margin-bottom:0;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;';
            banner.innerHTML = `
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2220%22 cy=%2220%22 r=%221.5%22 fill=%22%2300ff8820%22/><circle cx=%2280%22 cy=%2240%22 r=%221%22 fill=%22%2300ff8815%22/><circle cx=%2250%22 cy=%2280%22 r=%221.2%22 fill=%22%2300ff8810%22/></svg>') repeat;opacity:0.5;"></div>
                <div style="position:relative;z-index:1;text-align:center;">
                    <div style="font-size:48px;margin-bottom:8px;">🏢</div>
                    <div style="color:#00ff88;font-size:16px;font-weight:700;letter-spacing:2px;">${motoristaStats.nome.toUpperCase()}</div>
                    <div style="color:#888;font-size:11px;margin-top:4px;letter-spacing:1px;">
                        <a href="empresa_local.html?empresa=${encodeURIComponent(empresaDoMotorista)}" style="color:#00ff88;text-decoration:none;">${empresaDoMotorista.toUpperCase()}</a>
                    </div>
                </div>`;
        }
    }
    frame.appendChild(banner);

    const header = document.createElement('div');
    header.className = 'perfil-header';

    const cargo = motoristaStats.cargo || 'Motorista';
    const cargoColor = CARGOS[cargo] || '#888';
    const fotoSrc = motoristaStats.foto || '';
    const isOwner = isOwnProfile();
    const funcaoLabel = motoristaStats.funcao || 'motorista';
    const funcaoCores = { 'dono': '#FFD700', 'diretor': '#00ff88', 'chefe_rh': '#E91E63', 'motorista': '#888' };
    const funcaoNomes = { 'dono': 'Dono', 'diretor': 'Diretor', 'chefe_rh': 'Chefe de RH', 'motorista': 'Motorista' };

    header.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
            <div onclick="${isOwner ? 'handleFotoClick()' : ''}" style="width:80px;height:80px;border-radius:50%;border:3px solid ${isOwner ? (isLobo ? '#ffaa00' : '#00ff88') : '#333'};overflow:hidden;cursor:${isOwner ? 'pointer' : 'default'};position:relative;background:#1a1a2e;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color 0.3s;" onmouseover="this.style.borderColor='${isLobo ? '#ffaa00' : '#00ff88'}'" onmouseout="this.style.borderColor='${isOwner ? (isLobo ? '#ffaa00' : '#00ff88') : '#333'}'">
                ${fotoSrc ? `<img src="${fotoSrc}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:32px;">${isLobo ? '🐺' : '🏢'}</span>`}
                ${isOwner ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:${isLobo ? '#ffaa00' : '#00ff88'};font-size:9px;padding:2px 0;text-align:center;letter-spacing:0.5px;">TROCAR FOTO</div>` : ''}
            </div>
            <div>
                <div class="perfil-name">${motoristaStats.nome}</div>
                <div class="perfil-meta">
                    <span class="perfil-empresa" style="${!isLobo ? 'color:#00ff88' : ''}">${isLobo ? '🐺 Lobo Solitário' : `<a href="empresa_local.html?empresa=${encodeURIComponent(motoristaStats.empresa)}" style="color:#00ff88;text-decoration:none;">🏢 ${motoristaStats.empresa}</a>`}</span>
                    <span class="categoria-badge" style="border-color:${cargoColor};color:${cargoColor};background:${cargoColor}20">${cargo}</span>
                    ${!isLobo && funcaoLabel !== 'motorista' ? `<span class="categoria-badge" style="border-color:${funcaoCores[funcaoLabel]};color:${funcaoCores[funcaoLabel]};background:${funcaoCores[funcaoLabel]}20;font-size:9px;">${funcaoNomes[funcaoLabel]}</span>` : ''}
                    <span class="perfil-status" style="color:${motoristaStats.status === 'Ativo' ? '#00ff88' : '#ffaa00'}">${motoristaStats.status}</span>
                    <span class="perfil-ranking">Ranking #${rankingPosition} de ${rankingTotal}</span>
                </div>
            </div>
        </div>
        <div class="perfil-nivel" style="border-color:${nivelInfo.nivelAtual.color};color:${nivelInfo.nivelAtual.color}">
            ${nivelInfo.nivelAtual.icon} ${nivelInfo.nivelAtual.nome}
        </div>
        ${nivelInfo.nivelProximo ? `
            <div class="perfil-nivel-progress">
                <div class="perfil-nivel-bar">
                    <div class="perfil-nivel-fill" style="width:${nivelInfo.progresso}%;background:${nivelInfo.nivelAtual.color}"></div>
                </div>
                <span class="perfil-nivel-text">${motoristaStats.pontuacao} / ${nivelInfo.nivelProximo.min} pts para ${nivelInfo.nivelProximo.nome}</span>
            </div>
        ` : `
            <div class="perfil-nivel-max">Nível máximo atingido!</div>
        `}`;
    frame.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'perfil-grid';

    const leftCol = document.createElement('div');
    leftCol.className = 'perfil-left';

    const statsCard = document.createElement('div');
    statsCard.className = 'perfil-card';
    statsCard.innerHTML = `
        <div class="perfil-card-title">📊 STATS GERAIS</div>
        <div class="perfil-stats-grid">
            <div class="perfil-stat">
                <div class="perfil-stat-value">${motoristaStats.viagens || 0}</div>
                <div class="perfil-stat-label">VIAGENS</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value">${formatValue(motoristaStats.km || 0, { format: '{value:.0f}' })}</div>
                <div class="perfil-stat-label">KM</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value"><img src="images/LogoMoeda.png" class="cs-gold-icon-lg"> ${formatValue(motoristaStats.pontuacao || 0, { format: '{value:.0f}' })}</div>
                <div class="perfil-stat-label">PONTOS</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value">${cidades.length}</div>
                <div class="perfil-stat-label">CIDADES</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value">${motoristaStats.viagens > 0 ? Math.round((motoristaStats.km || 0) / motoristaStats.viagens) : 0}</div>
                <div class="perfil-stat-label">KM/MÉDIA</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value">${motoristaStats.viagens > 0 ? Math.round((motoristaStats.pontuacao || 0) / motoristaStats.viagens) : 0}</div>
                <div class="perfil-stat-label">PTS/MÉDIA</div>
            </div>
        </div>`;
    leftCol.appendChild(statsCard);

    const mesCard = document.createElement('div');
    mesCard.className = 'perfil-card';
    const totalKmMes = viagensMes.reduce((s, v) => s + v.km, 0);
    const totalPtsMes = viagensMes.reduce((s, v) => s + v.pontuacao, 0);
    mesCard.innerHTML = `
        <div class="perfil-card-title">📈 MÊS ATUAL — ${getMesAtual().label}</div>
        <div class="perfil-stats-grid">
            <div class="perfil-stat">
                <div class="perfil-stat-value">${viagensMes.length}</div>
                <div class="perfil-stat-label">VIAGENS</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value">${formatValue(totalKmMes, { format: '{value:.0f}' })}</div>
                <div class="perfil-stat-label">KM</div>
            </div>
            <div class="perfil-stat">
                <div class="perfil-stat-value"><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${formatValue(totalPtsMes, { format: '{value:.0f}' })}</div>
                <div class="perfil-stat-label">PONTOS</div>
            </div>
        </div>`;
    leftCol.appendChild(mesCard);

    if (isOwnProfile()) {
        const user = getAuthUser();
        const discordCard = document.createElement('div');
        discordCard.className = 'perfil-card';
        discordCard.innerHTML = `
            <div class="perfil-card-title">🔔 NOTIFICAÇÕES DISCORD</div>
            <div style="font-size:11px;color:#888;margin-bottom:8px;">
                Cole a URL do webhook do seu servidor Discord para receber notificações automáticas das suas viagens.
            </div>
            <div style="display:flex;gap:8px;">
                <input id="discord-webhook-input" type="text" placeholder="https://discord.com/api/webhooks/..." style="flex:1;padding:8px 10px;background:#0d1117;border:1px solid #2a2a32;border-radius:6px;color:#e0e0e0;font-size:12px;font-family:Consolas,monospace;">
                <button id="discord-webhook-btn" style="padding:8px 16px;background:#5865F2;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Salvar</button>
            </div>
            <div id="discord-webhook-status" style="font-size:11px;margin-top:6px;"></div>`;
        leftCol.appendChild(discordCard);

        const input = discordCard.querySelector('#discord-webhook-input');
        const btn = discordCard.querySelector('#discord-webhook-btn');
        const status = discordCard.querySelector('#discord-webhook-status');

        if (user && user.discord_webhook) {
            input.value = user.discord_webhook;
        }

        btn.addEventListener('click', async () => {
            const url = input.value.trim();
            if (!url) {
                status.style.color = '#ffaa00';
                status.textContent = 'Cole a URL do webhook do Discord.';
                return;
            }
            if (!url.startsWith('https://discord.com/api/webhooks/')) {
                status.style.color = '#ff4444';
                status.textContent = 'URL inválida. Use o link do Discord.';
                return;
            }
            btn.disabled = true;
            btn.textContent = 'Salvando...';
            status.textContent = '';
            try {
                const res = await authFetch('/api/auth/webhook', {
                    method: 'PUT',
                    body: JSON.stringify({ discord_webhook: url })
                });
                if (res) {
                    const result = await res.json();
                    if (result.ok) {
                        status.style.color = '#00ff88';
                        status.textContent = '✅ Webhook salvo! Você receberá notificações das suas viagens.';
                        if (user) user.discord_webhook = url;
                        setAuth(getAuthToken(), user);
                    } else {
                        status.style.color = '#ff4444';
                        status.textContent = 'Erro: ' + (result.error || 'desconhecido');
                    }
                }
            } catch (e) {
                status.style.color = '#ff4444';
                status.textContent = 'Erro ao salvar webhook.';
            }
            btn.disabled = false;
            btn.textContent = 'Salvar';
        });
    }

    const cidadesCard = document.createElement('div');
    cidadesCard.className = 'perfil-card';
    cidadesCard.innerHTML = `
        <div class="perfil-card-title">🗺️ CIDADES VISITADAS (${cidades.length})</div>
        <div class="perfil-cidades-list">
            ${cidades.map(c => `<span class="perfil-cidade-tag">${c}</span>`).join('')}
        </div>`;
    leftCol.appendChild(cidadesCard);

    grid.appendChild(leftCol);

    const rightCol = document.createElement('div');
    rightCol.className = 'perfil-right';

    const conquistasCard = document.createElement('div');
    conquistasCard.className = 'perfil-card';
    conquistasCard.innerHTML = `
        <div class="perfil-card-title">🏆 CONQUISTAS (${desbloqueadas}/${conquistasData.length})</div>
        <div class="perfil-conquistas-grid">
            ${conquistasData.map(c => {
                const rarityColor = c.raridade === 'lendario' ? '#ffd700' : c.raridade === 'raro' ? '#44aaff' : '#aaa';
                const opacity = c.desbloqueada ? '1' : '0.35';
                return `
                    <div class="perfil-conquista" style="opacity:${opacity}" title="${c.titulo}: ${c.descricao}">
                        <span class="perfil-conquista-icone">${c.icone}</span>
                        <span class="perfil-conquista-titulo">${c.titulo}</span>
                        ${!c.desbloqueada ? `<span class="perfil-conquista-progress">${c.progresso}/${c.meta}</span>` : ''}
                    </div>`;
            }).join('')}
        </div>`;
    rightCol.appendChild(conquistasCard);

    const historicoCard = document.createElement('div');
    historicoCard.className = 'perfil-card perfil-historico';
    const viagensOrdenadas = [...viagensData].sort((a, b) => {
        const cmp = b.data.localeCompare(a.data);
        if (cmp !== 0) return cmp;
        return (b.id || 0) - (a.id || 0);
    });

    historicoCard.innerHTML = `
        <div class="perfil-card-title">📋 HISTÓRICO DE VIAGENS (${viagensData.length})</div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="color:#00ff88">DATA</th>
                        <th style="color:#00ff88">ORIGEM</th>
                        <th style="color:#00ff88">DESTINO</th>
                        <th style="color:#00ff88">KM</th>
                        <th style="color:#00ff88">PONTOS</th>
                    </tr>
                </thead>
                <tbody>
                    ${viagensOrdenadas.map(v => `
                        <tr>
                            <td>${v.data.split('-').reverse().join('/')}</td>
                            <td>${v.origem}</td>
                            <td>${v.destino}</td>
                            <td>${formatValue(v.km, { format: '{value:.0f}' })}</td>
                            <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${formatValue(v.pontuacao, { format: '{value:.0f}' })}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    rightCol.appendChild(historicoCard);

    grid.appendChild(rightCol);
    frame.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `
        <div class="footer-line">App desktop para Windows 10+ | Telemetria ETS2/ATS em tempo real</div>
        <div class="footer-line footer-copy">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);
}

(async function init() {
    const dataOk = await loadData();
    if (!dataOk) return;

    console.log('[PERFIL init] viagensData:', viagensData ? viagensData.length : 'null', 'ultimos IDs:', viagensData ? viagensData.map(v => v.id).slice(0, 5) : 'N/A');
    console.log('[PERFIL init] motoristaStats.km:', motoristaStats ? motoristaStats.km : 'N/A', 'viagens:', motoristaStats ? motoristaStats.viagens : 'N/A');

    renderPage();

    document.getElementById('status').innerText = `● ${motoristaStats.nome} | ${viagensData.length} viagens | ${conquistasData.filter(c => c.desbloqueada).length} conquistas`;
    document.getElementById('status').className = 'status-bar connected';

    window.addEventListener('cargo-trip-recorded', async () => {
        console.log('[PERFIL] Evento recebido! Recarregando dados...');
        console.log('[PERFIL] Motorista atual:', motoristaNome);
        const ok = await loadData();
        console.log('[PERFIL] loadData ok?', ok, 'viagensData:', viagensData ? viagensData.length : 'null', 'ultimos IDs:', viagensData ? viagensData.map(v => v.id).slice(0, 5) : 'N/A');
        console.log('[PERFIL] motoristaStats.km:', motoristaStats ? motoristaStats.km : 'N/A', 'viagens:', motoristaStats ? motoristaStats.viagens : 'N/A');
        if (ok) {
            renderPage();
            document.getElementById('status').innerText = `● ${motoristaStats.nome} | ${viagensData.length} viagens | ${conquistasData.filter(c => c.desbloqueada).length} conquistas`;
            document.getElementById('status').className = 'status-bar connected';
        }
    });
})();