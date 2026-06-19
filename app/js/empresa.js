let empresaNome = '';
let empresaInfo = null;
let motoristasEmpresa = [];
let cargasStats = [];
let viagensEmpresa = [];
let isOwner = false;
let solicitacoesPendentes = [];

function getEmpresaFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('empresa');
}

function isEmpresaOwner() {
    const user = getAuthUser();
    if (!user) return false;
    if (user.empresa !== empresaNome) return false;
    if (motoristasEmpresa.some(m => m.nome === user.nome && ['dono', 'diretor', 'chefe_rh'].includes(m.funcao))) return true;
    if (empresaInfo && empresaInfo.criada_por && empresaInfo.criada_por === user.id) return true;
    return false;
}

async function loadData() {
    empresaNome = getEmpresaFromURL();
    if (empresaNome === 'Lobo Solitário' || empresaNome === 'Lobo Solitario') {
        window.location.href = 'lobo_local.html';
        return false;
    }
    if (!empresaNome) {
        document.getElementById('app').innerHTML = `
            <div style="text-align:center;padding:60px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">🏢</div>
                <div style="color:#888;font-size:14px;">Nenhuma empresa selecionada</div>
                <a href="empresas_local.html" style="color:#00ff88;font-size:13px;margin-top:12px;display:inline-block;">Ver ranking de empresas</a>
            </div>`;
        document.getElementById('status').innerText = 'Empresa nao especificada';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    const [resEmp, resMot, resCargas, resViagens] = await Promise.all([
        fetchJSON('/api/empresas'),
        fetchJSON(`/api/motoristas?empresa=${encodeURIComponent(empresaNome)}`),
        fetchJSON(`/api/cargas/estatisticas?empresa=${encodeURIComponent(empresaNome)}`),
        fetchJSON(`/api/viagens?empresa=${encodeURIComponent(empresaNome)}`)
    ]);

    if (resEmp.data) {
        const allEmpresas = resEmp.data.empresas || [];
        empresaInfo = allEmpresas.find(e => e.nome === empresaNome);
    }

    if (!empresaInfo) {
        empresaInfo = { nome: empresaNome, logo: '', banner: '', descricao: '', motoristas: 0, viagens: 0, km: 0, pontuacao: 0 };
    }

    motoristasEmpresa = (resMot.data && resMot.data.motoristas) || [];
    cargasStats = (resCargas.data && resCargas.data.cargas) || [];
    viagensEmpresa = (resViagens.data && resViagens.data.viagens) || [];
    isOwner = isEmpresaOwner();

    if (isOwner) {
        const resSol = await authFetch(`/api/solicitacoes?empresa=${encodeURIComponent(empresaNome)}`);
        if (resSol) {
            const solData = await resSol.json();
            if (solData.ok) {
                solicitacoesPendentes = (solData.solicitacoes || []).filter(s => s.status === 'pendente');
            }
        }
    }

    document.title = `CARGO STATS - ${empresaNome}`;
    return true;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('empresa_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    // Banner
    const banner = document.createElement('div');
    banner.className = 'empresa-banner';
    if (empresaInfo.banner) {
        banner.innerHTML = `<img src="${empresaInfo.banner}" alt="${empresaNome}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;">`;
    } else {
        banner.style.cssText = 'height:120px;background:linear-gradient(135deg,#0d1117 0%,#1a2a1a 50%,#0d1117 100%);border-radius:12px;display:flex;align-items:center;justify-content:center;';
        banner.innerHTML = `<span style="font-size:48px;opacity:0.3">🏢</span>`;
    }
    frame.appendChild(banner);

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:16px;padding:20px 0;border-bottom:1px solid #1e1e28;margin-bottom:20px;';
    let logoHtml = empresaInfo.logo
        ? `<img src="${empresaInfo.logo}" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:2px solid #00ff88;">`
        : `<div style="width:64px;height:64px;border-radius:12px;background:#1a2a1a;border:2px solid #00ff88;display:flex;align-items:center;justify-content:center;font-size:28px;">🏢</div>`;
    header.innerHTML = `${logoHtml}
        <div style="flex:1">
            <div style="font-size:22px;font-weight:700;color:#00ff88;letter-spacing:2px;">${empresaNome}</div>
            ${empresaInfo.descricao ? `<div style="font-size:12px;color:#888;margin-top:4px;">${empresaInfo.descricao}</div>` : ''}
        </div>`;
    frame.appendChild(header);

    // Stats
    const statsGrid = document.createElement('div');
    statsGrid.className = 'perfil-stats-grid';
    statsGrid.style.marginBottom = '24px';
    statsGrid.innerHTML = `
        <div class="perfil-stat"><div class="perfil-stat-value">${empresaInfo.motoristas || 0}</div><div class="perfil-stat-label">MOTORISTAS</div></div>
        <div class="perfil-stat"><div class="perfil-stat-value">${empresaInfo.viagens || 0}</div><div class="perfil-stat-label">VIAGENS</div></div>
        <div class="perfil-stat"><div class="perfil-stat-value">${(empresaInfo.km || 0).toLocaleString()}</div><div class="perfil-stat-label">KM</div></div>
        <div class="perfil-stat"><div class="perfil-stat-value"><img src="images/LogoMoeda.png" class="cs-gold-icon-lg"> ${(empresaInfo.pontuacao || 0).toLocaleString()}</div><div class="perfil-stat-label">PONTOS</div></div>`;
    frame.appendChild(statsGrid);

    if (isOwner && solicitacoesPendentes.length > 0) {
        const solSection = document.createElement('div');
        solSection.className = 'section';
        solSection.style.cssText = 'border:1px solid #ffaa0030;border-radius:12px;margin-bottom:20px;background:#ffaa0008;';
        solSection.innerHTML = `<div class="section-title" style="color:#ffaa00;">PEDIDOS PENDENTES (${solicitacoesPendentes.length})</div>`;

        let solHtml = `<div style="padding:8px;">`;
        solicitacoesPendentes.forEach(s => {
            solHtml += `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#0d1117;border-radius:8px;margin-bottom:8px;border:1px solid #1e1e28;">
                    <div style="width:36px;height:36px;border-radius:50%;background:#1a2a1a;border:2px solid #ffaa00;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🐺</div>
                    <div style="flex:1;">
                        <a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(s.motorista)}" style="color:#ffaa00;font-weight:700;font-size:13px;text-decoration:none;">${s.motorista}</a>
                        <div style="color:#666;font-size:10px;margin-top:2px;">Pedido em ${s.criada_em ? new Date(s.criada_em + 'Z').toLocaleDateString('pt-BR') : '-'}</div>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button onclick="aceitarSolicitacao(${s.id})" style="padding:6px 14px;background:#00ff88;color:#000;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;">ACEITAR</button>
                        <button onclick="recusarSolicitacao(${s.id})" style="padding:6px 14px;background:#ff4444;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;">RECUSAR</button>
                    </div>
                </div>`;
        });
        solHtml += '</div>';
        solSection.innerHTML += solHtml;
        frame.appendChild(solSection);
    }

    // Evento ativo
    const eventSection = document.createElement('div');
    eventSection.id = 'empresa-evento-section';
    frame.appendChild(eventSection);
    carregarEventoEmpresa();

    // Grid layout
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid';
    const leftCol = document.createElement('div');
    leftCol.className = 'dashboard-left';
    const rightCol = document.createElement('div');
    rightCol.className = 'dashboard-right';

    // Motoristas
    const motSection = document.createElement('div');
    motSection.className = 'section';
    motSection.innerHTML = `<div class="section-title">MOTORISTAS</div>`;

    if (motoristasEmpresa.length > 0) {
        const funcaoCores = { 'dono': '#FFD700', 'diretor': '#00ff88', 'chefe_rh': '#E91E63', 'motorista': '#888' };
        const funcaoNomes = { 'dono': 'Dono', 'diretor': 'Diretor', 'chefe_rh': 'Chefe de RH', 'motorista': 'Motorista' };
        let motHtml = `<div class="admin-table"><table class="data-table"><thead><tr><th>Motorista</th><th>Funcao</th><th>Cargo</th><th>Viagens</th><th>KM</th><th>Pontos</th>${isOwner ? '<th>Acoes</th>' : ''}</tr></thead><tbody>`;
        const motViagens = {};
        viagensEmpresa.forEach(v => {
            if (!motViagens[v.motorista]) motViagens[v.motorista] = { viagens: 0, km: 0, pontuacao: 0 };
            motViagens[v.motorista].viagens++;
            motViagens[v.motorista].km += v.km;
            motViagens[v.motorista].pontuacao += v.pontuacao;
        });
        const sortedMot = [...motoristasEmpresa].sort((a, b) => {
            const funcaoOrder = { 'dono': 0, 'diretor': 1, 'chefe_rh': 2, 'motorista': 3 };
            const orderA = funcaoOrder[a.funcao || 'motorista'] ?? 2;
            const orderB = funcaoOrder[b.funcao || 'motorista'] ?? 2;
            if (orderA !== orderB) return orderA - orderB;
            return (motViagens[b.nome]?.pontuacao || 0) - (motViagens[a.nome]?.pontuacao || 0);
        });
        sortedMot.forEach(m => {
            const stats = motViagens[m.nome] || { viagens: 0, km: 0, pontuacao: 0 };
            const cargo = m.cargo || 'Motorista';
            const cc = CARGOS[cargo] || '#888';
            const funcao = m.funcao || 'motorista';
            const fc = funcaoCores[funcao] || '#888';
            const fn = funcaoNomes[funcao] || 'Motorista';
            const user = getAuthUser();
            const isOwnMot = user && user.nome === m.nome;
            motHtml += `<tr>
                <td><a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(m.nome)}">${m.nome}</a></td>
                <td><span class="categoria-badge" style="border-color:${fc};color:${fc};background:${fc}20;font-size:9px;padding:2px 6px;">${fn}</span></td>
                <td><span class="categoria-badge" style="border-color:${cc};color:${cc};background:${cc}20;font-size:9px;padding:2px 6px;">${cargo}</span></td>
                <td>${stats.viagens}</td>
                <td>${stats.km.toLocaleString()}</td>
                <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${stats.pontuacao}</td>
                ${isOwner && !isOwnMot ? `<td style="display:flex;gap:4px;align-items:center;">
                    <select onchange="alterarFuncao('${encodeURIComponent(m.nome)}', this.value, '${encodeURIComponent(cargo)}')" style="padding:4px 6px;background:#0d1117;border:1px solid #333;border-radius:4px;color:#e0e0e0;font-size:9px;">
                        <option value="motorista" ${funcao === 'motorista' ? 'selected' : ''}>Motorista</option>
                        <option value="chefe_rh" ${funcao === 'chefe_rh' ? 'selected' : ''}>Chefe RH</option>
                        <option value="diretor" ${funcao === 'diretor' ? 'selected' : ''}>Diretor</option>
                        <option value="dono" ${funcao === 'dono' ? 'selected' : ''}>Dono</option>
                    </select>
                    <select onchange="alterarCargo('${encodeURIComponent(m.nome)}', '${encodeURIComponent(funcao)}', this.value)" style="padding:4px 6px;background:#0d1117;border:1px solid #333;border-radius:4px;color:#e0e0e0;font-size:9px;">
                        <option value="Aprendiz" ${cargo === 'Aprendiz' ? 'selected' : ''}>Aprendiz</option>
                        <option value="Em treinamento" ${cargo === 'Em treinamento' ? 'selected' : ''}>Trein.</option>
                        <option value="Trainee" ${cargo === 'Trainee' ? 'selected' : ''}>Trainee</option>
                        <option value="Pleno" ${cargo === 'Pleno' ? 'selected' : ''}>Pleno</option>
                        <option value="Senior" ${cargo === 'Senior' ? 'selected' : ''}>Senior</option>
                        <option value="Master" ${cargo === 'Master' ? 'selected' : ''}>Master</option>
                        <option value="Elite" ${cargo === 'Elite' ? 'selected' : ''}>Elite</option>
                        <option value="Motorista" ${cargo === 'Motorista' ? 'selected' : ''}>Motorista</option>
                    </select>
                    <button onclick="removerMotorista('${encodeURIComponent(m.nome)}')" style="padding:4px 8px;background:#ff4444;color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer;">X</button>
                </td>` : (isOwner && isOwnMot ? '<td style="color:#FFD700;font-size:10px;">VOCE</td>' : '')}
            </tr>`;
        });
        motHtml += `</tbody></table></div>`;
        motSection.innerHTML += motHtml;
    } else {
        motSection.innerHTML += `<div style="text-align:center;color:#555;padding:20px;">Nenhum motorista cadastrado</div>`;
    }
    leftCol.appendChild(motSection);

    // Cargas
    const cargasSection = document.createElement('div');
    cargasSection.className = 'section';
    cargasSection.innerHTML = `<div class="section-title">CARGAS TRANSPORTADAS</div>`;
    if (cargasStats.length > 0) {
        const cores = { 'geral': '#4CAF50', 'construcao': '#FF9800', 'granel': '#8BC34A', 'combustiveis': '#F44336', 'carga_viva': '#E91E63', 'maquinas': '#9C27B0', 'veiculos': '#2196F3' };
        const nomes = { 'geral': 'Geral', 'construcao': 'Construcao', 'granel': 'Granel', 'combustiveis': 'Combustiveis', 'carga_viva': 'Carga Viva', 'maquinas': 'Maquinas', 'veiculos': 'Veiculos' };
        let cargasHtml = '<div style="display:flex;flex-direction:column;gap:8px;padding:12px;">';
        const totalViagens = cargasStats.reduce((s, c) => s + c.total, 0);
        cargasStats.forEach(c => {
            const cor = cores[c.categoria_carga] || '#666';
            const nome = nomes[c.categoria_carga] || c.categoria_carga;
            const pct = totalViagens > 0 ? (c.total / totalViagens * 100).toFixed(1) : 0;
            cargasHtml += `<div style="display:flex;align-items:center;gap:10px;">
                <span style="width:90px;font-size:10px;font-weight:700;color:${cor};text-transform:uppercase;">${nome}</span>
                <div style="flex:1;height:20px;background:#1a1a22;border-radius:4px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${cor};border-radius:4px;transition:width 0.5s;"></div></div>
                <span style="width:40px;font-size:11px;color:#ccc;text-align:right;">${c.total}</span>
                <span style="width:40px;font-size:10px;color:#888;text-align:right;">${pct}%</span>
            </div>`;
        });
        cargasHtml += '</div>';
        cargasSection.innerHTML += cargasHtml;
    } else {
        cargasSection.innerHTML += `<div style="text-align:center;color:#555;padding:20px;">Nenhuma viagem registrada</div>`;
    }
    rightCol.appendChild(cargasSection);

    // Ultimas viagens
    const histSection = document.createElement('div');
    histSection.className = 'section';
    histSection.innerHTML = `<div class="section-title">ULTIMAS VIAGENS</div>`;
    if (viagensEmpresa.length > 0) {
        const ultimas = viagensEmpresa.slice(0, 10);
        let histHtml = `<div class="admin-table"><table class="data-table"><thead><tr><th>Data</th><th>Motorista</th><th>Rota</th><th>KM</th><th>Pontos</th></tr></thead><tbody>`;
        ultimas.forEach(v => {
            histHtml += `<tr>
                <td>${v.data}</td>
                <td><a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(v.motorista)}">${v.motorista}</a></td>
                <td>${v.origem || '-'} → ${v.destino || '-'}</td>
                <td>${v.km}</td>
                <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${v.pontuacao}</td>
            </tr>`;
        });
        histHtml += `</tbody></table></div>`;
        histSection.innerHTML += histHtml;
    } else {
        histSection.innerHTML += `<div style="text-align:center;color:#555;padding:20px;">Nenhuma viagem registrada</div>`;
    }
    rightCol.appendChild(histSection);

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    frame.appendChild(grid);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `<div class="footer-line">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);

    document.getElementById('status').innerText = `● ${empresaNome} - Dados carregados`;
    document.getElementById('status').className = 'status-bar connected';
    if (typeof updateFloatingStatus === 'function') {
        updateFloatingStatus(true, false);
    }
}

let eventoCountdownTimer = null;

async function carregarEventoEmpresa() {
    const container = document.getElementById('empresa-evento-section');
    if (!container) return;

    if (eventoCountdownTimer) {
        clearInterval(eventoCountdownTimer);
        eventoCountdownTimer = null;
    }

    const resp = await getProgressoEvento({ empresa: empresaNome });
    if (!resp || !resp.evento || !resp.progresso) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const { evento, progresso } = resp;
    const params = evento.parametros || {};
    const icones = { maratona_viagens: '📦', desafio_km: '🛣️', foco_carga: '🎯', caixa_pontos: '⭐', explorador_cidades: '🗺️' };
    const icone = icones[evento.tipo] || '🔥';

    const pctGeral = params.meta > 0 ? Math.min(Math.round((progresso.metas / Math.max(progresso.total, 1)) * 100), 100) : 0;

    let html = `<div class="section" style="border:1px solid #ff660040;background:#1a0d00;margin-bottom:20px;">
        <div class="section-title" style="color:#ff8800;">🔥 DESAFIO ATIVO</div>
        <div style="padding:8px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                <span style="font-size:28px;">${icone}</span>
                <div style="flex:1;">
                    <div style="font-size:16px;font-weight:700;color:#ff8800;">${evento.titulo}</div>
                    <div style="font-size:11px;color:#aaa;margin-top:4px;">${evento.descricao}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:10px;color:#888;">TEMPO RESTANTE</div>
                    <div id="emp-evento-countdown" style="font-size:18px;font-weight:700;color:#ffaa00;font-family:Consolas,monospace;">${formatCountdown(evento.data_fim)}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <span style="font-size:11px;color:#888;">MOTORISTAS: <strong style="color:#ff8800;">${progresso.metas}/${progresso.total}</strong> atingiram a meta</span>
                <div style="flex:1;height:6px;background:#1a1a22;border-radius:3px;overflow:hidden;">
                    <div style="width:${pctGeral}%;height:100%;background:#ff8800;border-radius:3px;transition:width 0.5s;"></div>
                </div>
            </div>
            <div style="font-size:10px;color:#888;margin-bottom:6px;">PROGRESSO DOS MOTORISTAS:</div>`;

    if (progresso.motoristas && progresso.motoristas.length > 0) {
        const sorted = [...progresso.motoristas].sort((a, b) => (b.meta_atingida ? 1 : 0) - (a.meta_atingida ? 1 : 0) || b.progresso - a.progresso);
        sorted.forEach(m => {
            const pct = params.meta > 0 ? Math.min(Math.round((m.progresso / params.meta) * 100), 100) : 0;
            const cor = m.meta_atingida ? '#00ff88' : '#ff8800';
            html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a22;">
                <span style="width:120px;font-size:11px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    <a href="perfil_local.html?motorista=${encodeURIComponent(m.motorista)}" style="color:${cor};text-decoration:none;">${m.motorista}</a>
                </span>
                <div style="flex:1;height:16px;background:#1a1a22;border-radius:4px;overflow:hidden;position:relative;">
                    <div style="width:${pct}%;height:100%;background:${cor};border-radius:4px;transition:width 0.5s;"></div>
                    <span style="position:absolute;right:4px;top:1px;font-size:9px;color:#fff;text-shadow:0 0 3px #000;">${m.progresso}/${params.meta}</span>
                </div>
                ${m.meta_atingida ? '<span style="font-size:14px;">✅</span>' : ''}
            </div>`;
        });
    } else {
        html += `<div style="text-align:center;color:#555;padding:12px;">Nenhum motorista com progresso neste evento</div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;

    eventoCountdownTimer = setInterval(() => {
        const cd = document.getElementById('emp-evento-countdown');
        if (cd) cd.textContent = formatCountdown(evento.data_fim);
    }, 1000);

    setTimeout(() => carregarEventoEmpresa(), 60000);
}

(async function init() {
    try {
        const ok = await loadData();
        console.log('[EMPRESA init] viagensEmpresa:', viagensEmpresa ? viagensEmpresa.length : 'null', 'ultimos IDs:', viagensEmpresa ? viagensEmpresa.map(v => v.id).slice(0, 5) : 'N/A');
        if (ok) renderPage();
    } catch(e) {
        console.error('Erro ao carregar empresa:', e);
        document.getElementById('status').innerText = 'Erro ao carregar dados da empresa';
        document.getElementById('status').className = 'status-bar error';
    }
})();

window.addEventListener('cargo-trip-recorded', async () => {
    console.log('[EMPRESA] Evento recebido! Recarregando dados...');
    const ok = await loadData();
    console.log('[EMPRESA] loadData ok?', ok, 'viagensEmpresa:', viagensEmpresa ? viagensEmpresa.length : 'null', 'ultimos IDs:', viagensEmpresa ? viagensEmpresa.map(v => v.id).slice(0, 5) : 'N/A');
    if (ok) renderPage();
});

async function alterarFuncao(motoristaEncoded, novaFuncao, cargoAtualEncoded) {
    const motorista = decodeURIComponent(motoristaEncoded);
    const cargo = decodeURIComponent(cargoAtualEncoded);
    const res = await authFetch('/api/empresa/motoristas/funcao', {
        method: 'PUT',
        body: JSON.stringify({ motorista, funcao: novaFuncao, cargo })
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            alert(result.error || 'Erro ao alterar funcao');
        }
    }
}

async function alterarCargo(motoristaEncoded, funcaoAtualEncoded, novoCargo) {
    const motorista = decodeURIComponent(motoristaEncoded);
    const funcao = decodeURIComponent(funcaoAtualEncoded);
    const res = await authFetch('/api/empresa/motoristas/funcao', {
        method: 'PUT',
        body: JSON.stringify({ motorista, funcao, cargo: novoCargo })
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            alert(result.error || 'Erro ao alterar cargo');
        }
    }
}

async function removerMotorista(motoristaEncoded) {
    const motorista = decodeURIComponent(motoristaEncoded);
    if (!confirm(`Remover ${motorista} da empresa?`)) return;
    const res = await authFetch('/api/empresa/motoristas/remover', {
        method: 'DELETE',
        body: JSON.stringify({ motorista })
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            alert(result.error || 'Erro ao remover motorista');
        }
    }
}

async function aceitarSolicitacao(id) {
    const res = await authFetch('/api/solicitacoes/aceitar', {
        method: 'PUT',
        body: JSON.stringify({ id })
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            alert(result.error || 'Erro ao aceitar pedido');
        }
    }
}

async function recusarSolicitacao(id) {
    if (!confirm('Recusar este pedido?')) return;
    const res = await authFetch('/api/solicitacoes/recusar', {
        method: 'PUT',
        body: JSON.stringify({ id })
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            alert(result.error || 'Erro ao recusar pedido');
        }
    }
}
