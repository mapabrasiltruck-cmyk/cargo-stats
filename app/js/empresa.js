let empresaNome = '';
let empresaInfo = null;
let motoristasEmpresa = [];
let cargasStats = [];
let viagensEmpresa = [];
let isOwner = false;
let solicitacoesPendentes = [];
let vagasEmpresa = [];
let candidaturasPendentes = [];

function getEmpresaFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('empresa');
}

function normNome(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').replace(/\./g, '');
}

function isEmpresaOwner() {
    const user = getAuthUser();
    if (!user) return false;
    if (normNome(user.empresa) !== normNome(empresaNome)) return false;
    if (motoristasEmpresa.some(m => normNome(m.nome) === normNome(user.nome) && ['dono', 'diretor', 'chefe_rh'].includes(m.funcao))) return true;
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
        const resVagas = await authFetch(`/api/vagas?empresa=${encodeURIComponent(empresaNome)}`);
        if (resVagas) {
            const vData = await resVagas.json();
            if (vData.ok) vagasEmpresa = vData.vagas || [];
        }
        for (const v of vagasEmpresa) {
            const resCand = await authFetch(`/api/vagas/${v.id}/candidaturas`);
            if (resCand) {
                const cData = await resCand.json();
                if (cData.ok) {
                    const pendentes = (cData.candidaturas || []).filter(c => c.status === 'pendente');
                    if (pendentes.length > 0) candidaturasPendentes.push({ vaga: v, candidaturas: pendentes });
                }
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

    // Calcular posicao no ranking geral
    let posicaoHtml = '';
    try {
        const posicao = (empresaInfo.rankingPos || empresaInfo.posicao || 0);
        if (posicao > 0) {
            const corPos = posicao <= 3 ? '#ffd700' : posicao <= 5 ? '#c0c0c0' : posicao <= 10 ? '#cd7f32' : '#555';
            posicaoHtml = `<div style="text-align:center;padding:4px 12px;background:#1a1a22;border:1px solid ${corPos}40;border-radius:8px;">
                <div style="font-size:8px;color:#888;letter-spacing:1px;">RANKING</div>
                <div style="font-size:20px;font-weight:800;color:${corPos};">#${posicao}</div>
            </div>`;
        }
    } catch(e) {}

    header.innerHTML = `${logoHtml}
        <div style="flex:1">
            <div style="font-size:22px;font-weight:700;color:#00ff88;letter-spacing:2px;">${empresaNome}</div>
            <div id="empresa-descricao-texto" style="font-size:12px;color:#888;margin-top:4px;">${empresaInfo.descricao || ''}</div>
        </div>
        ${posicaoHtml}
        ${isOwner ? `<button onclick="abrirEditarEmpresa()" style="padding:8px 14px;background:#1a2a1a;border:1px solid #00ff8840;border-radius:8px;color:#00ff88;font-size:11px;font-weight:600;cursor:pointer;">✎ EDITAR</button>` : ''}`;
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

    // Webhook Discord - only dono
    (function() {
        const user = getAuthUser();
        const donoCheck = user && motoristasEmpresa.some(m => normNome(m.nome) === normNome(user.nome) && m.funcao === 'dono');
        if (donoCheck) {
            const whSection = document.createElement('div');
            whSection.className = 'section';
            whSection.style.cssText = 'border:1px solid #5865F230;border-radius:12px;margin-bottom:20px;background:#5865F208;';
            whSection.innerHTML = `
                <div class="section-title" style="color:#5865F2;">🔔 WEBHOOK DISCORD</div>
                <div style="padding:12px;">
                    <div style="font-size:11px;color:#888;margin-bottom:8px;">
                        Configure um webhook do Discord para receber notificacoes de <strong>todas as viagens</strong> dos motoristas da empresa, com foto do motorista.
                    </div>
                    <div class="empresa-webhook-status" style="font-size:10px;color:#888;margin-bottom:6px;">Carregando...</div>
                    <div style="display:flex;gap:8px;">
                        <input class="empresa-webhook-input" type="text" placeholder="https://discord.com/api/webhooks/..." style="flex:1;padding:8px 10px;background:#0d1117;border:1px solid #2a2a32;border-radius:6px;color:#e0e0e0;font-size:12px;font-family:Consolas,monospace;">
                        <button class="empresa-webhook-btn" style="padding:8px 16px;background:#5865F2;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Salvar</button>
                        <button class="empresa-webhook-test-btn" style="padding:8px 16px;background:#1a1a22;border:1px solid #5865F2;border-radius:6px;color:#5865F2;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Testar</button>
                        <button class="empresa-webhook-debug-btn" style="padding:8px 16px;background:#1a1a22;border:1px solid #888;border-radius:6px;color:#888;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Verificar</button>
                    </div>
                    <div class="empresa-webhook-debug" style="margin-top:8px;font-size:10px;font-family:Consolas,monospace;color:#888;line-height:1.6;display:none;"></div>
                </div>`;
            frame.appendChild(whSection);

            const whInput = whSection.querySelector('.empresa-webhook-input');
            const whBtn = whSection.querySelector('.empresa-webhook-btn');
            const whTestBtn = whSection.querySelector('.empresa-webhook-test-btn');
            const whDebugBtn = whSection.querySelector('.empresa-webhook-debug-btn');
            const whDebug = whSection.querySelector('.empresa-webhook-debug');
            const whStatus = whSection.querySelector('.empresa-webhook-status');

            // Load current webhook
            (async () => {
                try {
                    const res = await authFetch('/api/empresa/webhook');
                    if (res && res.ok) {
                        const data = await res.json();
                        if (data.webhook_url) {
                            whInput.value = data.webhook_url;
                        }
                    }
                } catch(e) {}
                whStatus.textContent = '';
            })();

            whBtn.addEventListener('click', async () => {
                const url = whInput.value.trim();

                if (!url) {
                    whStatus.style.color = '#ffaa00';
                    whStatus.textContent = 'Cole a URL do webhook do Discord.';
                    return;
                }
                if (!url.startsWith('https://discord.com/api/webhooks/')) {
                    whStatus.style.color = '#ff4444';
                    whStatus.textContent = 'URL invalida. Use o link do Discord.';
                    return;
                }

                whBtn.disabled = true;
                whBtn.textContent = 'Salvando...';
                whStatus.textContent = '';
                try {
                    const res = await authFetch('/api/empresa/webhook', {
                        method: 'PUT',
                        body: JSON.stringify({ webhook_url: url })
                    });
                    if (res && res.ok) {
                        whStatus.style.color = '#00ff88';
                        whStatus.textContent = 'Webhook salvo! Todas as viagens da empresa serao enviadas aqui.';
                    } else if (res) {
                        const data = await res.json();
                        whStatus.style.color = '#ff4444';
                        whStatus.textContent = 'Erro: ' + (data.error || 'desconhecido');
                    }
                } catch (e) {
                    whStatus.style.color = '#ff4444';
                    whStatus.textContent = 'Erro ao salvar webhook.';
                }
                whBtn.disabled = false;
                whBtn.textContent = 'Salvar';
            });

            whTestBtn.addEventListener('click', async () => {
                const url = whInput.value.trim();
                if (!url || !url.startsWith('https://discord.com/api/webhooks/')) {
                    whStatus.style.color = '#ffaa00';
                    whStatus.textContent = 'Salve o webhook primeiro.';
                    return;
                }
                whTestBtn.disabled = true;
                whTestBtn.textContent = 'Testando...';
                whStatus.textContent = '';
                try {
                    const res = await authFetch('/api/empresa/webhook/test', {
                        method: 'POST',
                        body: JSON.stringify({ webhook_url: url })
                    });
                    if (res && res.ok) {
                        const data = await res.json();
                        whStatus.style.color = data.ok ? '#00ff88' : '#ff4444';
                        let msg = data.ok ? 'Teste enviado! Verifique o Discord.' : 'Falha: ' + (data.error || 'desconhecido');
                        if (data.debug) {
                            msg += ' | Empresa: "' + data.debug.empresa_nome + '" | Webhook no BD: ' + (data.debug.webhook_no_banco ? 'SIM' : 'NAO');
                            if (data.debug.resposta_discord) {
                                msg += ' | Discord: ' + data.debug.resposta_discord;
                            }
                        }
                        whStatus.textContent = msg;
                    } else if (res) {
                        const data = await res.json();
                        whStatus.style.color = '#ff4444';
                        whStatus.textContent = 'Erro: ' + (data.error || 'desconhecido');
                    }
                } catch (e) {
                    whStatus.style.color = '#ff4444';
                    whStatus.textContent = 'Erro ao testar webhook.';
                }
                whTestBtn.disabled = false;
                whTestBtn.textContent = 'Testar';
            });

            whDebugBtn.addEventListener('click', async () => {
                try {
                    whDebugBtn.disabled = true;
                    whDebugBtn.textContent = 'Verificando...';
                    whDebug.style.display = 'block';
                    whDebug.style.color = '#888';
                    whDebug.textContent = 'Verificando...';
                    const res = await authFetch('/api/empresa/webhook/debug');
                    if (res && res.ok) {
                        const data = await res.json();
                        if (data.debug) {
                            const d = data.debug;
                            const cor = d.webhook_valido ? '#00ff88' : (d.webhook_no_banco ? '#ffaa00' : '#ff4444');
                            whDebug.style.color = cor;
                            whDebug.innerHTML =
                                'Empresa: <b>' + d.empresa_nome + '</b><br>' +
                                'Motorista: <b>' + d.motorista_nome + '</b><br>' +
                                'Webhook no BD: <b>' + (d.webhook_no_banco ? 'SIM' : 'NAO') + '</b><br>' +
                                (d.webhook_url ? 'URL: <span style="color:#5865F2">' + d.webhook_url + '</span><br>' : '') +
                                'Status: <b>' + (d.webhook_valido ? 'OK - pronto para enviar' : (d.webhook_no_banco ? 'URL invalida' : 'Nenhum webhook configurado')) + '</b>';
                        }
                    } else {
                        whDebug.style.color = '#ff4444';
                        whDebug.textContent = 'Erro ao verificar webhook.';
                    }
                } catch(e) {
                    whDebug.style.color = '#ff4444';
                    whDebug.textContent = 'Erro de conexao.';
                }
                whDebugBtn.disabled = false;
                whDebugBtn.textContent = 'Verificar';
            });
        }
    })();

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

    if (isOwner) {
        const vagasSection = document.createElement('div');
        vagasSection.className = 'section';
        vagasSection.style.cssText = 'border:1px solid #00ff8830;border-radius:12px;margin-bottom:20px;background:#00ff8808;';

        let vagasHtml = `<div class="section-title" style="color:#00ff88;display:flex;align-items:center;justify-content:space-between;">
            <span>MINHAS VAGAS (${vagasEmpresa.length})</span>
            <button onclick="abrirModalCriarVaga()" style="padding:5px 12px;background:#00ff88;color:#000;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;">+ NOVA VAGA</button>
        </div>`;

        if (vagasEmpresa.length === 0) {
            vagasHtml += `<div style="padding:20px;text-align:center;color:#666;font-size:11px;">Nenhuma vaga publicada. Crie uma vaga para recrutar motoristas!</div>`;
        } else {
            vagasEmpresa.forEach(v => {
                const catIcons = { 'geral':'📦','quimicos':'🧪','construcao':'🏗️','veiculos':'🚗','carga_viva':'🐄','maquinas':'🚜','granel':'🌾','passageiros':'🚌' };
                vagasHtml += `
                    <div style="padding:12px;margin:8px;background:#0d1117;border-radius:8px;border:1px solid #1e1e28;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                            <span style="font-size:18px;">${catIcons[v.categoria] || '📦'}</span>
                            <div style="flex:1;">
                                <div style="color:#e0e0e0;font-size:13px;font-weight:700;">${escapeHTML(v.titulo)}</div>
                                <div style="color:#888;font-size:10px;">${v.categoria} · ${v.qtd_vagas} vaga(s) · ${v.candidaturas_pendentes || 0} pendente(s)</div>
                            </div>
                            <div style="display:flex;gap:6px;">
                                <button onclick="fecharVaga(${v.id})" style="padding:4px 10px;background:#ff4444;color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer;">FECHAR</button>
                            </div>
                        </div>
                    </div>`;
            });
        }

        if (candidaturasPendentes.length > 0) {
            vagasHtml += `<div style="padding:8px 12px;color:#ffaa00;font-size:11px;font-weight:700;letter-spacing:1px;margin-top:8px;">CANDIDATURAS PENDENTES</div>`;
            candidaturasPendentes.forEach(({ vaga, candidaturas }) => {
                candidaturas.forEach(c => {
                    vagasHtml += `
                        <div style="display:flex;align-items:center;gap:12px;padding:10px;margin:4px 8px;background:#0d1117;border-radius:8px;border:1px solid #1e1e28;">
                            <div style="width:32px;height:32px;border-radius:50%;background:#1a2a1a;border:2px solid #ffaa00;display:flex;align-items:center;justify-content:center;font-size:14px;">🐺</div>
                            <div style="flex:1;">
                                <a href="perfil_local.html?motorista=${encodeURIComponent(c.motorista)}" style="color:#ffaa00;font-weight:700;font-size:12px;text-decoration:none;">${escapeHTML(c.motorista)}</a>
                                <div style="color:#888;font-size:10px;">Vaga: ${escapeHTML(vaga.titulo)} ${c.mensagem ? '· "' + escapeHTML(c.mensagem) + '"' : ''}</div>
                            </div>
                            <div style="display:flex;gap:6px;">
                                <button onclick="aceitarCandidatura(${c.id})" style="padding:5px 12px;background:#00ff88;color:#000;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;">ACEITAR</button>
                                <button onclick="recusarCandidatura(${c.id})" style="padding:5px 12px;background:#ff4444;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:10px;cursor:pointer;">RECUSAR</button>
                            </div>
                        </div>`;
                });
            });
        }

        vagasSection.innerHTML += vagasHtml;
        frame.appendChild(vagasSection);
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
            const isOwnMot = user && normNome(user.nome) === normNome(m.nome);
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
                    <button onclick="removerMotorista('${escapeAttr(m.nome)}')" style="padding:4px 8px;background:#ff4444;color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer;">X</button>
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
        const cores = { 'geral': '#4CAF50', 'construcao': '#FF9800', 'granel': '#8BC34A', 'combustiveis': '#F44336', 'carga_viva': '#E91E63', 'maquinas': '#9C27B0', 'veiculos': '#2196F3', 'passageiros': '#00BCD4' };
        const nomes = { 'geral': 'Geral', 'construcao': 'Construcao', 'granel': 'Granel', 'combustiveis': 'Combustiveis', 'carga_viva': 'Carga Viva', 'maquinas': 'Maquinas', 'veiculos': 'Veiculos', 'passageiros': 'Passageiros', 'a_classificar': 'Cargas Aleatórias' };
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
        const catIcones = { geral: '📦', quimicos: '🧪', construcao: '🏗️', veiculos: '🚗', carga_viva: '🐄', maquinas: '🚜', granel: '🌾', passageiros: '🚌', combustiveis: '🔥' };
        const catNomes = { geral: 'Geral', construcao: 'Construção', granel: 'Granel', combustiveis: 'Combustíveis', carga_viva: 'Carga Viva', maquinas: 'Máquinas', veiculos: 'Veículos', passageiros: 'Passageiros', quimicos: 'Químicos' };
        let histHtml = `<div class="admin-table"><table class="data-table"><thead><tr><th>Data</th><th>Motorista</th><th>Rota</th><th>Carga</th><th>KM</th><th>Pontos</th><th>Status</th></tr></thead><tbody>`;
        ultimas.forEach(v => {
            const statusCor = v.status === 'completa' ? '#00ff88' : v.status === 'abandonada' ? '#ff6600' : '#888';
            const statusLabel = v.status === 'completa' ? 'Completa' : v.status === 'abandonada' ? 'Abandonada' : v.status === 'cancelada' ? 'Cancelada' : v.status || 'Completa';
            const cat = v.categoria_carga || 'geral';
            const catIcon = catIcones[cat] || '📦';
            const catNome = catNomes[cat] || 'Geral';
            histHtml += `<tr>
                <td>${v.data}</td>
                <td><a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(v.motorista)}">${v.motorista}</a></td>
                <td>${v.origem || '-'} → ${v.destino || '-'}</td>
                <td>${catIcon} ${catNome}</td>
                <td>${v.km}</td>
                <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${v.pontuacao}</td>
                <td style="color:${statusCor};font-weight:700;">${statusLabel}</td>
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

    // Conquistas da Empresa
    const conquistasSection = document.createElement('div');
    conquistasSection.id = 'empresa-conquistas-section';
    conquistasSection.className = 'section';
    conquistasSection.style.marginTop = '20px';
    conquistasSection.innerHTML = `<div class="section-title">🏅 CONQUISTAS DA EMPRESA</div><div style="text-align:center;padding:20px;color:#555;">Carregando...</div>`;
    frame.appendChild(conquistasSection);

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
let eventoRefreshTimer = null;

function getEventoEncerradoId() {
    return sessionStorage.getItem('eventoEncerradoId');
}
function setEventoEncerradoId(id) {
    if (id) sessionStorage.setItem('eventoEncerradoId', String(id));
    else sessionStorage.removeItem('eventoEncerradoId');
}

async function carregarEventoEmpresa() {
    const container = document.getElementById('empresa-evento-section');
    if (!container) return;

    if (eventoCountdownTimer) {
        clearInterval(eventoCountdownTimer);
        eventoCountdownTimer = null;
    }
    if (eventoRefreshTimer) {
        clearTimeout(eventoRefreshTimer);
        eventoRefreshTimer = null;
    }

    const resp = await getProgressoEvento({ empresa: empresaNome });
    if (!resp || !resp.evento || !resp.progresso) {
        container.innerHTML = '';
        container.style.display = 'none';
        setEventoEncerradoId(null);
        return;
    }

    // Se esse evento ja foi encerrado localmente, nao re-mostrar
    if (getEventoEncerradoId() === String(resp.evento.id)) {
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
        if (!cd) return;
        const text = formatCountdown(evento.data_fim);
        if (text === 'ENCERRADO') {
            clearInterval(eventoCountdownTimer);
            eventoCountdownTimer = null;
            if (eventoRefreshTimer) {
                clearTimeout(eventoRefreshTimer);
                eventoRefreshTimer = null;
            }
            setEventoEncerradoId(evento.id);
            container.innerHTML = '';
            container.style.display = 'none';
            fetch('/api/eventos/finalizar', { method: 'POST' }).catch(() => {});
            return;
        }
        cd.textContent = text;
    }, 1000);

    eventoRefreshTimer = setTimeout(() => carregarEventoEmpresa(), 60000);
}

(async function init() {
    try {
        const ok = await loadData();
        console.log('[EMPRESA init] viagensEmpresa:', viagensEmpresa ? viagensEmpresa.length : 'null', 'ultimos IDs:', viagensEmpresa ? viagensEmpresa.map(v => v.id).slice(0, 5) : 'N/A');
        if (ok) {
            renderPage();
            renderConquistasEmpresa();
        }
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
    if (ok) {
        renderPage();
        renderConquistasEmpresa();
    }
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
            if (dataOk) {
                renderPage();
                renderConquistasEmpresa();
            }
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
            showToast('Cargo alterado com sucesso!', 'success');
            const dataOk = await loadData();
            if (dataOk) {
                renderPage();
                renderConquistasEmpresa();
            }
        } else {
            showToast(result.error || 'Erro ao alterar cargo', 'error');
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
            showToast(`Motorista ${motorista} removido!`, 'success');
            const dataOk = await loadData();
            if (dataOk) {
                renderPage();
                renderConquistasEmpresa();
            }
        } else {
            showToast(result.error || 'Erro ao remover motorista', 'error');
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
            showToast('Solicitacao aceita!', 'success');
            const dataOk = await loadData();
            if (dataOk) {
                renderPage();
                renderConquistasEmpresa();
            }
        } else {
            showToast(result.error || 'Erro ao aceitar pedido', 'error');
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
            showToast('Solicitacao recusada', 'warning');
            const dataOk = await loadData();
            if (dataOk) {
                renderPage();
                renderConquistasEmpresa();
            }
        } else {
            showToast(result.error || 'Erro ao recusar pedido', 'error');
        }
    }
}

// ========== EDITAR EMPRESA ==========

function abrirEditarEmpresa() {
    const app = document.getElementById('app');

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#0d1117;border:1px solid #1e1e28;border-radius:16px;padding:28px;width:90%;max-width:480px;max-height:90vh;overflow-y:auto;';

    modal.innerHTML = `
        <div style="font-size:18px;font-weight:700;color:#00ff88;margin-bottom:20px;">✎ EDITAR EMPRESA</div>

        <div style="margin-bottom:16px;">
            <label style="font-size:11px;color:#888;display:block;margin-bottom:6px;">LOGO DA EMPRESA</label>
            <div style="display:flex;align-items:center;gap:12px;">
                <div id="empresa-logo-preview" style="width:64px;height:64px;border-radius:12px;border:2px solid #00ff88;overflow:hidden;background:#1a2a1a;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">
                    ${empresaInfo.logo ? `<img src="${empresaInfo.logo}" style="width:100%;height:100%;object-fit:cover;">` : '🏢'}
                </div>
                <input type="file" id="empresa-logo-input" accept="image/png,image/jpeg,image/gif,image/webp" style="flex:1;padding:8px;background:#0a0a0f;border:1px solid #333;border-radius:6px;color:#888;font-size:11px;">
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <label style="font-size:11px;color:#888;display:block;margin-bottom:6px;">BANNER DA EMPRESA</label>
            <div style="display:flex;align-items:center;gap:12px;">
                <div id="empresa-banner-preview" style="width:80px;height:45px;border-radius:6px;border:1px solid #333;overflow:hidden;background:#1a1a22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
                    ${empresaInfo.banner ? `<img src="${empresaInfo.banner}" style="width:100%;height:100%;object-fit:cover;">` : '🖼️'}
                </div>
                <input type="file" id="empresa-banner-input" accept="image/png,image/jpeg,image/gif,image/webp" style="flex:1;padding:8px;background:#0a0a0f;border:1px solid #333;border-radius:6px;color:#888;font-size:11px;">
            </div>
        </div>

        <div style="margin-bottom:20px;">
            <label style="font-size:11px;color:#888;display:block;margin-bottom:6px;">DESCRIÇÃO</label>
            <textarea id="empresa-descricao-input" style="width:100%;padding:10px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-size:12px;resize:vertical;min-height:80px;font-family:inherit;" placeholder="Descreva sua empresa...">${empresaInfo.descricao || ''}</textarea>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button onclick="this.closest('.modal-overlay').remove()" style="padding:10px 20px;background:#1a1a22;border:1px solid #333;border-radius:8px;color:#888;font-size:12px;cursor:pointer;">CANCELAR</button>
            <button onclick="salvarEditarEmpresa(this)" style="padding:10px 20px;background:#00ff88;border:none;border-radius:8px;color:#000;font-size:12px;font-weight:700;cursor:pointer;">SALVAR</button>
        </div>
        <div id="empresa-edit-status" style="font-size:11px;color:#00ff88;margin-top:12px;text-align:center;"></div>
    `;

    overlay.className = 'modal-overlay';
    overlay.appendChild(modal);
    app.appendChild(overlay);
}

async function salvarEditarEmpresa(btn) {
    const status = document.getElementById('empresa-edit-status');
    if (!status) return;
    status.textContent = 'Salvando...';
    btn.disabled = true;

    const descricao = document.getElementById('empresa-descricao-input')?.value || '';
    const logoFile = document.getElementById('empresa-logo-input')?.files?.[0];
    const bannerFile = document.getElementById('empresa-banner-input')?.files?.[0];

    try {
        let dados;

        if (logoFile || bannerFile) {
            status.style.color = '#ffaa00';
            status.textContent = '📤 Enviando imagens...';

            const formData = new FormData();
            formData.append('descricao', descricao);
            if (logoFile) formData.append('logo', logoFile);
            if (bannerFile) formData.append('banner', bannerFile);

            const res = await authFetch('/api/empresa/atualizar', {
                method: 'POST',
                body: formData,
                headers: {}
            });
            if (!res) { status.textContent = 'Sessao expirada'; btn.disabled = false; return; }
            dados = await res.json();
        } else {
            const res = await authFetch('/api/empresa/atualizar', {
                method: 'POST',
                body: JSON.stringify({ descricao })
            });
            if (!res) { status.textContent = 'Sessao expirada'; btn.disabled = false; return; }
            dados = await res.json();
        }

        if (dados.error) {
            status.textContent = 'Erro: ' + dados.error;
            status.style.color = '#ff4444';
            btn.disabled = false;
            return;
        }

        let msg = '✅ Salvo com sucesso!';
        if (dados.upload) {
            if (logoFile) msg += dados.upload.logo === 'uploaded' ? ' ✅ Logo no servidor' : ' ❌ Logo local';
            if (bannerFile) msg += dados.upload.banner === 'uploaded' ? ' ✅ Banner no servidor' : ' ❌ Banner local';
        }
        if (dados.sync && !dados.sync.configured) msg += ' ⚠️ Sync desconfigurado';
        status.innerHTML = msg;
        status.style.color = logoFile || bannerFile ? (dados.upload?.logo === 'uploaded' || dados.upload?.banner === 'uploaded' ? '#00ff88' : '#ffaa00') : '#00ff88';

        const overlay = btn.closest('.modal-overlay');
        if (overlay) overlay.remove();

        const dataOk = await loadData();
        if (dataOk) {
            renderPage();
            renderConquistasEmpresa();
        }
    } catch (e) {
        status.textContent = 'Erro ao salvar: ' + e.message;
        status.style.color = '#ff4444';
        btn.disabled = false;
    }
}

// ========== CONQUISTAS DA EMPRESA ==========

async function renderConquistasEmpresa() {
    const container = document.getElementById('empresa-conquistas-section');
    if (!container) return;

    try {
        const res = await authFetch(`/api/empresa/conquistas?empresa=${encodeURIComponent(empresaNome)}`);
        if (!res || !res.ok) {
            container.innerHTML = `<div class="section-title">🏅 CONQUISTAS DA EMPRESA</div><div style="text-align:center;padding:20px;color:#555;">Erro ao carregar conquistas</div>`;
            return;
        }
        const data = await res.json();

        const conquistas = data.conquistas || [];

        let html = `<div class="section-title">🏅 CONQUISTAS DA EMPRESA</div>`;
        html += `<div style="padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">`;

        conquistas.forEach(c => {
            const desblocada = c.desbloqueada === true;
            const corBorda = desblocada ? '#00ff88' : '#333';
            const opacidade = desblocada ? '1' : '0.4';
            const icone = c.icone || '🏅';

            html += `<div style="border:1px solid ${corBorda};border-radius:10px;padding:12px;background:${desblocada ? '#0a1a0a' : '#0d0d12'};opacity:${opacidade};transition:0.3s;">
                <div style="font-size:24px;margin-bottom:6px;">${icone}</div>
                <div style="font-size:12px;font-weight:700;color:${desblocada ? '#00ff88' : '#666'};margin-bottom:4px;">${c.titulo}</div>
                <div style="font-size:10px;color:#888;line-height:1.4;">${c.descricao}</div>
                ${desblocada ? '<div style="margin-top:6px;font-size:9px;color:#00ff88;font-weight:700;">✅ DESBLOQUEADA</div>' : '<div style="margin-top:6px;font-size:9px;color:#555;">🔒 Bloqueada</div>'}
            </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div class="section-title">🏅 CONQUISTAS DA EMPRESA</div><div style="text-align:center;padding:20px;color:#555;">Erro: ${e.message}</div>`;
    }
}

// ========== VAGAS ==========

function abrirModalCriarVaga() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <div style="color:#00ff88;font-size:13px;font-weight:700;letter-spacing:1px;margin-bottom:16px;">CRIAR VAGA</div>
            <div style="margin-bottom:12px;">
                <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">TITULO *</label>
                <input type="text" id="vaga-titulo" placeholder="Ex: Motorista para cargas quimicas" maxlength="100" style="width:100%;padding:10px;background:#050508;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">DESCRICAO</label>
                <textarea id="vaga-desc" placeholder="Requisitos, detalhes..." rows="3" maxlength="300" style="width:100%;padding:10px;background:#050508;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;resize:none;"></textarea>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:12px;">
                <div style="flex:1;">
                    <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">CATEGORIA</label>
                    <select id="vaga-categoria" style="width:100%;padding:10px;background:#050508;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;">
                        <option value="geral">📦 Geral</option><option value="quimicos">🧪 Quimicos</option><option value="construcao">🏗️ Construcao</option>
                        <option value="veiculos">🚗 Veiculos</option><option value="carga_viva">🐄 Carga Viva</option><option value="maquinas">🚜 Maquinas</option>
                        <option value="granel">🌾 Granel</option><option value="passageiros">🚌 Passageiros</option>
                    </select>
                </div>
                <div style="width:100px;">
                    <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">VAGAS</label>
                    <input type="number" id="vaga-qtd" value="1" min="1" max="20" style="width:100%;padding:10px;background:#050508;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;">
                </div>
            </div>
            <div style="display:flex;gap:10px;">
                <button onclick="this.closest('.modal-overlay').remove()" style="flex:1;padding:10px;background:#222;border:1px solid #333;border-radius:6px;color:#888;font-size:12px;cursor:pointer;">CANCELAR</button>
                <button onclick="criarVaga()" id="btn-criar-vaga" style="flex:1;padding:10px;background:#00ff88;border:none;border-radius:6px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">CRIAR</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.getElementById('vaga-titulo').focus();
}

async function criarVaga() {
    const titulo = document.getElementById('vaga-titulo').value.trim();
    const descricao = document.getElementById('vaga-desc').value.trim();
    const categoria = document.getElementById('vaga-categoria').value;
    const qtd = parseInt(document.getElementById('vaga-qtd').value) || 1;
    if (!titulo) { showToast('Digite o titulo da vaga', 'warning'); return; }
    const btn = document.getElementById('btn-criar-vaga');
    btn.disabled = true; btn.textContent = 'CRIANDO...';
    const res = await authFetch('/api/vagas', {
        method: 'POST',
        body: JSON.stringify({ empresa: empresaNome, titulo, descricao, categoria, qtd_vagas: qtd })
    });
    if (res) {
        const data = await res.json();
        if (data.ok) {
            showToast('Vaga criada com sucesso!', 'success');
            document.querySelector('.modal-overlay')?.remove();
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            showToast(data.error || 'Erro ao criar vaga', 'error');
            btn.disabled = false; btn.textContent = 'CRIAR';
        }
    }
}

async function fecharVaga(id) {
    if (!confirm('Fechar esta vaga?')) return;
    const res = await authFetch('/api/vagas/' + id, { method: 'PUT', body: JSON.stringify({ status: 'fechada' }) });
    if (res) {
        const data = await res.json();
        if (data.ok) {
            showToast('Vaga fechada', 'info');
            const dataOk = await loadData();
            if (dataOk) renderPage();
        }
    }
}

async function aceitarCandidatura(id) {
    const res = await authFetch('/api/candidaturas/' + id + '/aceitar', { method: 'PUT' });
    if (res) {
        const data = await res.json();
        if (data.ok) {
            showToast('Candidatura aceita! Motorista transferido.', 'success');
            const dataOk = await loadData();
            if (dataOk) renderPage();
        } else {
            showToast(data.error || 'Erro ao aceitar', 'error');
        }
    }
}

async function recusarCandidatura(id) {
    if (!confirm('Recusar esta candidatura?')) return;
    const res = await authFetch('/api/candidaturas/' + id + '/recusar', { method: 'PUT' });
    if (res) {
        const data = await res.json();
        if (data.ok) {
            showToast('Candidatura recusada', 'info');
            const dataOk = await loadData();
            if (dataOk) renderPage();
        }
    }
}

async function convidarMotorista(nomeMotorista) {
    const msg = prompt('Mensagem para o motorista (opcional):');
    if (msg === null) return;
    const res = await authFetch('/api/convites', {
        method: 'POST',
        body: JSON.stringify({ empresa: empresaNome, motorista: nomeMotorista, mensagem: msg || '' })
    });
    if (res) {
        const data = await res.json();
        if (data.ok) showToast('Convite enviado para ' + nomeMotorista, 'success');
        else if (data.duplicate) showToast('Convite ja enviado para este motorista', 'warning');
        else showToast(data.error || 'Erro ao enviar convite', 'error');
    }
}


