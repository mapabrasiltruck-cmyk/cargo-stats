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
    if (!motoristaStats || !motoristaStats.empresa || motoristaStats.empresa === 'Lobo Solitário') {
        if (isOwnProfile()) {
            const user = getAuthUser();
            if (user && user.empresa && user.empresa !== 'Lobo Solitário') {
                motoristaStats.empresa = user.empresa;
                motoristaStats.funcao = motoristaStats.funcao || 'dono';
                return false;
            }
        }
        return true;
    }
    return false;
}

async function uploadFotoPerfil(file) {
    const formData = new FormData();
    formData.append('foto', file);
    showToast('📤 Enviando foto...', 'info');
    const res = await authFetch('/api/perfil/foto', {
        method: 'POST',
        body: formData
    });
    if (res) {
        const result = await res.json();
        if (result.ok) {
            motoristaStats.foto = result.foto;
            let msg = '✅ Foto atualizada!';
            if (result.upload && result.upload.foto === 'uploaded') {
                msg += ' Enviada ao servidor.';
            } else if (result.upload && result.upload.foto === 'local') {
                msg += ' ⚠️ Foto local — configure sync no Admin.';
            }
            if (result.sync && !result.sync.configured) {
                msg += ' ⚠️ Sync desconfigurado.';
            }
            showToast(msg, result.upload?.foto === 'uploaded' ? 'success' : 'warning');
            renderPage();
        } else {
            showToast('Erro ao atualizar foto', 'error');
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

    const [resConquistas, resViagens, resRanking, resStats] = await Promise.all([
        fetchJSON(`/api/conquistas?motorista=${encodeURIComponent(motoristaNome)}`),
        fetchJSON(`/api/viagens?motorista=${encodeURIComponent(motoristaNome)}`),
        fetchJSON('/api/ranking/motoristas'),
        fetchJSON(`/api/motoristas/estatisticas?motorista=${encodeURIComponent(motoristaNome)}`)
    ]);

    if (resConquistas.error || !resConquistas.data) {
        document.getElementById('status').innerText = 'Motorista não encontrado';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    motoristaStats = (resStats.data && resStats.data.stats) || resConquistas.data.motorista;
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
    const prefix = `${mes.ano}-${String(mes.mes).padStart(2, '0')}`;
    return viagensData.filter(v => v.data && v.data.startsWith(prefix));
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
            const fotoIcon = motoristaStats.foto
            ? `<img src="${motoristaStats.foto}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #00ff88;box-shadow:0 0 20px rgba(0,255,136,0.3);">`
            : `<div style="font-size:48px;margin-bottom:8px;">🚚</div>`;
        banner.innerHTML = `
                <img src="${empresaInfo.banner}" alt="${empresaDoMotorista}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%);"></div>
                <div style="position:relative;z-index:1;text-align:center;">
                    ${fotoIcon}
                    <div style="color:#fff;font-size:16px;font-weight:700;letter-spacing:2px;text-shadow:0 2px 8px rgba(0,0,0,0.7);">${motoristaStats.nome.toUpperCase()}</div>
                    <div style="color:#ccc;font-size:11px;margin-top:4px;letter-spacing:1px;text-shadow:0 1px 4px rgba(0,0,0,0.7);">
                        <a href="empresa_local.html?empresa=${encodeURIComponent(empresaDoMotorista)}" style="color:#00ff88;text-decoration:none;">${empresaDoMotorista.toUpperCase()}</a>
                    </div>
                </div>`;
        } else {
            const fotoIcon2 = motoristaStats.foto
                ? `<img src="${motoristaStats.foto}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #00ff88;box-shadow:0 0 20px rgba(0,255,136,0.3);">`
                : `<div style="font-size:48px;margin-bottom:8px;">🚚</div>`;
            banner.style.cssText = 'width:100%;height:180px;background:linear-gradient(135deg,#0a1e0a 0%,#1a3a1a 50%,#0d2a0d 100%);border-radius:12px;margin-bottom:0;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;';
            banner.innerHTML = `
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2220%22 cy=%2220%22 r=%221.5%22 fill=%22%2300ff8820%22/><circle cx=%2280%22 cy=%2240%22 r=%221%22 fill=%22%2300ff8815%22/><circle cx=%2250%22 cy=%2280%22 r=%221.2%22 fill=%22%2300ff8810%22/></svg>') repeat;opacity:0.5;"></div>
                <div style="position:relative;z-index:1;text-align:center;">
                    ${fotoIcon2}
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
                ${fotoSrc ? `<img src="${fotoSrc}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:32px;">${isLobo ? '🐺' : '🚚'}</span>`}
                ${isOwner ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:${isLobo ? '#ffaa00' : '#00ff88'};font-size:9px;padding:2px 0;text-align:center;letter-spacing:0.5px;">TROCAR FOTO</div>` : ''}
            </div>
            <div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div class="perfil-name">${motoristaStats.nome}</div>
                    <button class="share-btn" onclick="shareProfileUrl('${escapeAttr(motoristaStats.nome)}')" title="Compartilhar perfil">
                        <span>&#128279;</span> Compartilhar
                    </button>
                    ${!isOwnProfile() && getAuthUser() ? `<button class="compare-btn" onclick="compararPerfis('${escapeAttr(getAuthUser().nome)}','${escapeAttr(motoristaStats.nome)}')" title="Comparar com seu perfil"><span>⚖️</span> Comparar</button>` : ''}
                    ${isOwnProfile() ? `<button class="compare-btn" onclick="compararPerfisAleatorio()" title="Comparar com outro motorista"><span>⚖️</span> Comparar</button>` : ''}
                </div>
                <div class="perfil-meta">
                    <span class="perfil-empresa" style="${!isLobo ? 'color:#00ff88' : ''}">${isLobo ? '🐺 Lobo Solitário' : `<a href="empresa_local.html?empresa=${encodeURIComponent(motoristaStats.empresa)}" style="color:#00ff88;text-decoration:none;">🏢 ${motoristaStats.empresa}</a>`}</span>
                    <span class="categoria-badge" style="border-color:${cargoColor};color:${cargoColor};background:${cargoColor}20">${cargo}</span>
                    ${!isLobo && funcaoLabel !== 'motorista' ? `<span class="categoria-badge" style="border-color:${funcaoCores[funcaoLabel]};color:${funcaoCores[funcaoLabel]};background:${funcaoCores[funcaoLabel]}20;font-size:9px;">${funcaoNomes[funcaoLabel]}</span>` : ''}
                    <span class="perfil-status" style="color:${motoristaStats.status === 'Ativo' ? '#00ff88' : '#ffaa00'}">${motoristaStats.status}</span>
                    ${getPlanoBadgeHTML(motoristaStats.plano)}
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

    // Bio card
    const bioCard = document.createElement('div');
    bioCard.className = 'perfil-card';
    const bioKey = 'cargo_bio_' + motoristaNome;
    const savedBio = localStorage.getItem(bioKey) || '';
    const isOwnerProf = isOwnProfile();
    bioCard.innerHTML = `
        <div class="perfil-card-title">📝 BIO</div>
        ${isOwnerProf
            ? `<textarea class="bio-edit" id="bio-textarea" placeholder="Escreva algo sobre você...">${escapeHTML(savedBio)}</textarea>
               <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
                   <button onclick="document.getElementById('bio-textarea').style.minHeight='100px';const val=document.getElementById('bio-textarea').value;localStorage.setItem('${escapeAttr(bioKey)}',val);showToast('Bio salva!','success');" style="padding:6px 16px;background:#00ff88;border:none;border-radius:6px;color:#000;font-weight:700;font-size:10px;cursor:pointer;font-family:inherit;">💾 SALVAR</button>
                   <span id="bio-saved" style="font-size:10px;color:#555;display:none;">Salva!</span>
               </div>`
            : `<div class="bio-display">${savedBio || 'Nenhuma biografia.'}</div>`}`;
    leftCol.appendChild(bioCard);

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
        const lojaCard = document.createElement('div');
        lojaCard.className = 'perfil-card';
        lojaCard.style.cursor = 'pointer';
        lojaCard.onclick = () => { window.location.href = 'loja_local.html'; };
        lojaCard.innerHTML = `
            <div class="perfil-card-title" style="display:flex;align-items:center;gap:8px;">
                <span>🏪</span>
                <span>LOJA CS GOLD</span>
                <span style="margin-left:auto;font-size:10px;color:#00ff88;">→</span>
            </div>
            <div style="font-size:11px;color:#888;">
                Compre titulos exclusivos com CS Gold, veja seus planos e muito mais!
            </div>
            <div style="margin-top:8px;font-size:10px;color:#00ff88;">Clique para abrir a loja</div>`;
        leftCol.appendChild(lojaCard);
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
                const rarityLabel = c.raridade === 'lendario' ? 'LEND\u00c1RIO' : c.raridade === 'raro' ? 'RARO' : 'COMUM';
                const opacity = c.desbloqueada ? '1' : '0.35';
                return `
                    <div class="perfil-conquista" style="opacity:${opacity};border-color:${c.desbloqueada ? rarityColor : '#222'}" title="${c.titulo}: ${c.descricao}">
                        <span class="perfil-conquista-icone">${c.icone}</span>
                        <div style="flex:1;min-width:0;">
                            <span class="perfil-conquista-titulo">${c.titulo}</span>
                            <div style="font-size:7px;color:${rarityColor};letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">${c.desbloqueada ? '\u2713 ' + rarityLabel : rarityLabel}</div>
                        </div>
                        ${!c.desbloqueada ? `<span class="perfil-conquista-progress">${c.progresso}/${c.meta}</span>` : ''}
                    </div>`;
            }).join('')}
        </div>`;
    rightCol.appendChild(conquistasCard);

    // Move viagensOrdenadas BEFORE timeline (fix Temporal Dead Zone)
    const viagensOrdenadas = [...viagensData].sort((a, b) => {
        const cmp = b.data.localeCompare(a.data);
        if (cmp !== 0) return cmp;
        return (b.id || 0) - (a.id || 0);
    });

    // Activity Timeline
    const recentConquistas = conquistasData.filter(c => c.desbloqueada).slice(0, 5);
    if (recentConquistas.length > 0) {
        const timelineCard = document.createElement('div');
        timelineCard.className = 'perfil-card';
        timelineCard.innerHTML = `<div class="perfil-card-title">📜 ATIVIDADES RECENTES</div><div class="timeline">
            ${recentConquistas.map(c => `
                <div class="timeline-item">
                    <div class="tl-time">${c.desbloqueada_em ? new Date(c.desbloqueada_em).toLocaleDateString('pt-BR') : ''}</div>
                    <div class="tl-content">${c.icone} Conquista: <span class="tl-highlight">${escapeHTML(c.titulo)}</span></div>
                </div>`).join('')}
            ${viagensOrdenadas.slice(0, 3).map(v => {
                const statusIcon = v.status === 'abandonada' ? '⚠️' : '🚛';
                const statusCor = v.status === 'abandonada' ? '#ff6600' : '#00ff88';
                return `<div class="timeline-item">
                    <div class="tl-time">${v.data ? v.data.split('-').reverse().join('/') : ''}</div>
                    <div class="tl-content">${statusIcon} Viagem: <span class="tl-highlight">${escapeHTML(v.origem || '?')}</span> → <span class="tl-highlight">${escapeHTML(v.destino || '?')}</span> (${formatValue(v.km, { format: '{value:.0f}' })})
                        <span style="color:${statusCor};font-size:10px;margin-left:6px;">${v.status === 'abandonada' ? 'ABANDONADA' : 'COMPLETA'}</span>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
        rightCol.appendChild(timelineCard);
    }

    const historicoCard = document.createElement('div');
    historicoCard.className = 'perfil-card perfil-historico';

    const catIcones = { geral: '📦', quimicos: '🧪', construcao: '🏗️', veiculos: '🚗', carga_viva: '🐄', maquinas: '🚜', granel: '🌾', passageiros: '🚌', combustiveis: '🔥' };
    const catNomes = { geral: 'Geral', construcao: 'Construção', granel: 'Granel', combustiveis: 'Combustíveis', carga_viva: 'Carga Viva', maquinas: 'Máquinas', veiculos: 'Veículos', passageiros: 'Passageiros', quimicos: 'Químicos' };

    historicoCard.innerHTML = `
        <div class="perfil-card-title">📋 HISTÓRICO DE VIAGENS (${viagensData.length})</div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="color:#00ff88">DATA</th>
                        <th style="color:#00ff88">ORIGEM</th>
                        <th style="color:#00ff88">DESTINO</th>
                        <th style="color:#00ff88">CARGA</th>
                        <th style="color:#00ff88">KM</th>
                        <th style="color:#00ff88">PONTOS</th>
                        <th style="color:#00ff88">STATUS</th>
                    </tr>
                </thead>
                <tbody>
                    ${viagensOrdenadas.map(v => {
                        const statusCor = v.status === 'completa' ? '#00ff88' : v.status === 'abandonada' ? '#ff6600' : '#888';
                        const statusLabel = v.status === 'completa' ? 'Completa' : v.status === 'abandonada' ? 'Abandonada' : v.status === 'cancelada' ? 'Cancelada' : v.status || 'Completa';
                        const cat = v.categoria_carga || 'geral';
                        const catIcon = catIcones[cat] || '📦';
                        const catNome = catNomes[cat] || 'Geral';
                        return `<tr>
                            <td>${v.data.split('-').reverse().join('/')}</td>
                            <td>${v.origem}</td>
                            <td>${v.destino}</td>
                            <td>${catIcon} ${catNome}</td>
                            <td>${formatValue(v.km, { format: '{value:.0f}' })}</td>
                            <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${formatValue(v.pontuacao, { format: '{value:.0f}' })}</td>
                            <td style="color:${statusCor};font-weight:700;">${statusLabel}</td>
                        </tr>`;
                    }).join('')}
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
    showLoading('app', 'Carregando perfil...');

    const dataOk = await loadData();
    if (!dataOk) return;

    renderPage();

    document.getElementById('status').innerText = `● ${motoristaStats.nome} | ${viagensData.length} viagens | ${conquistasData.filter(c => c.desbloqueada).length} conquistas`;
    document.getElementById('status').className = 'status-bar connected';

    window.addEventListener('cargo-trip-recorded', async () => {
        const ok = await loadData();
        if (ok) {
            renderPage();
            document.getElementById('status').innerText = `● ${motoristaStats.nome} | ${viagensData.length} viagens | ${conquistasData.filter(c => c.desbloqueada).length} conquistas`;
            document.getElementById('status').className = 'status-bar connected';
        }
    });
})();