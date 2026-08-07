let motoristaNome = null;
let empresaNome = null;
let premiacaoData = null;
let empresaInfo = null;
let isDriverView = false;

function getParams() {
    const params = new URLSearchParams(window.location.search);
    return { motorista: params.get('motorista'), empresa: params.get('empresa') };
}

async function loadData() {
    const { motorista, empresa } = getParams();

    if (motorista) {
        isDriverView = true;
        motoristaNome = motorista;
        const [resPrem, resEmp] = await Promise.all([
            fetchJSON(`/api/premiacao/motorista?motorista=${encodeURIComponent(motoristaNome)}`),
            fetchJSON('/api/empresas')
        ]);

        if (resPrem.error || !resPrem.data || !resPrem.data.premiacao) {
            document.getElementById('app').innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <div style="font-size:48px;margin-bottom:16px;">🏆</div>
                    <div style="color:#888;font-size:14px;">Motorista "${motoristaNome}" sem dados para premiação</div>
                    <a href="perfil_local.html?motorista=${encodeURIComponent(motoristaNome)}" style="color:#00ff88;font-size:13px;margin-top:12px;display:inline-block;">← Voltar para o perfil</a>
                </div>`;
            document.getElementById('status').innerText = 'Sem dados para premiação';
            document.getElementById('status').className = 'status-bar error';
            return false;
        }

        premiacaoData = resPrem.data.premiacao;

        if (premiacaoData.stats && premiacaoData.stats.empresa && premiacaoData.stats.empresa !== 'Lobo Solitário') {
            if (resEmp.data && resEmp.data.empresas) {
                empresaInfo = resEmp.data.empresas.find(e => e.nome === premiacaoData.stats.empresa) || null;
            }
        }

        document.title = `CARGO STATS - Premiação - ${motoristaNome}`;
        return true;
    }

    if (empresa) {
        isDriverView = false;
        empresaNome = empresa;
        const [resPrem, resEmp] = await Promise.all([
            fetchJSON(`/api/premiacao?empresa=${encodeURIComponent(empresaNome)}`),
            fetchJSON('/api/empresas')
        ]);

        if (resEmp.data && resEmp.data.empresas) {
            empresaInfo = resEmp.data.empresas.find(e => e.nome === empresaNome) || null;
        }
        if (!empresaInfo) {
            empresaInfo = { nome: empresaNome, logo: '', banner: '', descricao: '', motoristas: 0, viagens: 0, km: 0, pontuacao: 0 };
        }

        if (resPrem.error || !resPrem.data || !resPrem.data.premiacao) {
            document.getElementById('app').innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <div style="font-size:48px;margin-bottom:16px;">🏆</div>
                    <div style="color:#888;font-size:14px;">Empresa "${empresaNome}" sem dados suficientes para premiação</div>
                    <a href="empresa_local.html?empresa=${encodeURIComponent(empresaNome)}" style="color:#00ff88;font-size:13px;margin-top:12px;display:inline-block;">← Voltar para empresa</a>
                </div>`;
            document.getElementById('status').innerText = 'Sem dados para premiação';
            document.getElementById('status').className = 'status-bar error';
            return false;
        }

        premiacaoData = resPrem.data.premiacao;
        document.title = `CARGO STATS - Premiação - ${empresaNome}`;
        return true;
    }

    document.getElementById('app').innerHTML = `
        <div style="text-align:center;padding:60px 20px;">
            <div style="font-size:48px;margin-bottom:16px;">🏆</div>
            <div style="color:#888;font-size:14px;">Nenhum motorista ou empresa selecionado</div>
            <a href="empresas_local.html" style="color:#00ff88;font-size:13px;margin-top:12px;display:inline-block;">Ver ranking</a>
        </div>`;
    document.getElementById('status').innerText = 'Parâmetros ausentes';
    document.getElementById('status').className = 'status-bar error';
    return false;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('premiacao_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    renderBanner(frame);
    renderHeader(frame);

    if (isDriverView) {
        renderDriverStats(frame);
        renderTierGrid(frame, premiacaoData.categorias || [], 'motorista');
    } else {
        if (premiacaoData.podio && premiacaoData.podio.length > 0) renderPodio(frame);
        if (premiacaoData.medalhas && premiacaoData.medalhas.length > 0) renderMedalhas(frame);
        if (premiacaoData.trofeus && premiacaoData.trofeus.length > 0) renderTrofeusEspeciais(frame);
        if (premiacaoData.categoriasEmpresa && premiacaoData.categoriasEmpresa.length > 0) {
            renderTierGrid(frame, premiacaoData.categoriasEmpresa, 'empresa');
        }
        if (premiacaoData.todasMedalhas && premiacaoData.todasMedalhas.length > 0) renderTodasMedalhasDetalhadas(frame);
        if (premiacaoData.hallOfFame && premiacaoData.hallOfFame.length > 0) renderHallOfFame(frame);
    }

    renderFooter(frame);
    app.appendChild(frame);

    document.getElementById('status').innerText = `● ${isDriverView ? motoristaNome : empresaNome} - Premiação carregada`;
    document.getElementById('status').className = 'status-bar connected';
    if (typeof updateFloatingStatus === 'function') updateFloatingStatus(true, false);
}

function renderBanner(frame) {
    const banner = document.createElement('div');
    banner.className = 'empresa-banner';

    let bg = isDriverView
        ? 'linear-gradient(135deg,#0a0a1a 0%,#1a0d2a 30%,#0a0a1a 70%,#0d0d12 100%)'
        : 'linear-gradient(135deg,#1a1200 0%,#2a1a00 30%,#1a1200 70%,#0d0d12 100%)';

    if (!isDriverView && empresaInfo && empresaInfo.banner) {
        banner.innerHTML = `<img src="${empresaInfo.banner}" alt="${empresaNome}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;">`;
    } else if (isDriverView && empresaInfo && empresaInfo.banner) {
        banner.innerHTML = `<img src="${empresaInfo.banner}" alt="${empresaNome}" style="width:100%;height:180px;object-fit:cover;border-radius:12px;">
            <div style="position:absolute;bottom:0;left:0;right:0;height:60%;background:linear-gradient(to top, rgba(0,0,0,0.7), transparent);"></div>`;
    } else {
        const icon = isDriverView ? '⭐' : '🏆';
        banner.style.cssText = `height:140px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;`;
        banner.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, rgba(255,215,0,0.08) 0%, transparent 70%);"></div>
            <span style="font-size:56px;opacity:0.5;filter:drop-shadow(0 0 20px rgba(255,215,0,0.3));">${icon}</span>`;
    }
    frame.appendChild(banner);
}

function renderHeader(frame) {
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:16px;padding:20px 0;border-bottom:1px solid #1a1a22;margin-bottom:24px;';

    if (isDriverView) {
        const s = premiacaoData.stats || {};
        const fotoSrc = s.foto || '';
        const fotoHtml = fotoSrc
            ? `<img src="${fotoSrc}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #ffd700;">`
            : `<div style="width:52px;height:52px;border-radius:50%;background:#1a0d2a;border:2px solid #ffd700;display:flex;align-items:center;justify-content:center;font-size:22px;">🚚</div>`;
        const empresaLabel = s.empresa && s.empresa !== 'Lobo Solitário'
            ? `<a href="empresa_local.html?empresa=${encodeURIComponent(s.empresa)}" style="color:#00ff88;text-decoration:none;font-size:10px;">🏢 ${s.empresa}</a>`
            : '<span style="color:#888;font-size:10px;">🐺 Lobo Solitário</span>';

        header.innerHTML = `${fotoHtml}
            <div style="flex:1">
                <div style="font-size:11px;letter-spacing:3px;color:#ffd700;font-weight:700;">MURAL DE PREMIAÇÃO</div>
                <div style="font-size:18px;font-weight:700;color:#e0e0e0;margin-top:2px;">${motoristaNome}</div>
                <div style="margin-top:2px;">${empresaLabel}</div>
            </div>
            <a href="perfil_local.html?motorista=${encodeURIComponent(motoristaNome)}" style="padding:8px 16px;background:#1a1a22;border:1px solid #333;border-radius:6px;color:#888;font-size:11px;text-decoration:none;font-weight:600;">← PERFIL</a>`;
    } else {
        let logoHtml = empresaInfo && empresaInfo.logo
            ? `<img src="${empresaInfo.logo}" style="width:56px;height:56px;border-radius:12px;object-fit:cover;border:2px solid #ffd700;">`
            : `<div style="width:56px;height:56px;border-radius:12px;background:#1a1200;border:2px solid #ffd700;display:flex;align-items:center;justify-content:center;font-size:24px;">🏢</div>`;
        let posicaoHtml = '';
        if (premiacaoData.categoriasEmpresa) {
            const topoCat = premiacaoData.categoriasEmpresa.find(c => c.id === 'topo_ranking');
            if (topoCat && topoCat.progresso > 0 && topoCat.progresso < 999) {
                const pos = topoCat.progresso;
                const corPos = pos <= 3 ? '#ffd700' : pos <= 5 ? '#c0c0c0' : pos <= 10 ? '#cd7f32' : '#555';
                posicaoHtml = `<div style="text-align:center;padding:6px 14px;background:#1a1a22;border:1px solid ${corPos}40;border-radius:8px;">
                    <div style="font-size:9px;color:#888;letter-spacing:1px;">RANKING</div>
                    <div style="font-size:22px;font-weight:800;color:${corPos};">#${pos}</div>
                </div>`;
            }
        }

        header.innerHTML = `${logoHtml}
            <div style="flex:1">
                <div style="font-size:11px;letter-spacing:3px;color:#ffd700;font-weight:700;">MURAL DE PREMIAÇÃO</div>
                <div style="font-size:20px;font-weight:700;color:#e0e0e0;margin-top:2px;">${empresaNome}</div>
            </div>
            ${posicaoHtml}
            <a href="empresa_local.html?empresa=${encodeURIComponent(empresaNome)}" style="padding:8px 16px;background:#1a1a22;border:1px solid #333;border-radius:6px;color:#888;font-size:11px;text-decoration:none;font-weight:600;">← EMPRESA</a>`;
    }
    frame.appendChild(header);
}

function renderDriverStats(frame) {
    const s = premiacaoData.stats || {};
    const section = document.createElement('div');
    section.innerHTML = `<div class="prem-section-title">📊 ESTATÍSTICAS DO MOTORISTA</div>`;
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:24px;';

    const items = [
        { label: 'VIAGENS', value: s.viagens || 0 },
        { label: 'KM', value: (s.km || 0).toLocaleString() },
        { label: 'PONTOS', value: (s.pontuacao || 0).toLocaleString() },
        { label: 'CIDADES', value: s.cidades || 0 },
        { label: 'KM/MÊS', value: (s.kmMes || 0).toLocaleString() },
        { label: 'KM/MÉDIA', value: (s.kmMedio || 0).toLocaleString() },
        { label: 'LITORAL', value: s.cidadesLitoral || 0 },
        { label: 'SEMANA', value: s.viagensSemana || 0 },
        { label: 'CONQUISTAS', value: `${s.conquistas || 0}/${s.totalConquistas || 0}` },
        { label: 'DESAFIOS', value: s.cidadesDesafio || 0 }
    ];

    items.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:#0d0d12;border:1px solid #1a1a22;border-radius:8px;text-align:center;';
        card.innerHTML = `
            <div style="font-size:16px;font-weight:800;color:#e0e0e0;">${item.value}</div>
            <div style="font-size:9px;color:#666;letter-spacing:1px;margin-top:4px;">${item.label}</div>`;
        grid.appendChild(card);
    });

    section.appendChild(grid);
    frame.appendChild(section);
}

function renderTierGrid(frame, categorias, tipo) {
    const section = document.createElement('div');
    section.className = 'section';

    const titleLabel = tipo === 'motorista' ? '🏆 PRÊMIOS POR TIER' : '🏆 PRÊMIOS DA EMPRESA POR TIER';
    section.innerHTML = `<div class="section-title">${titleLabel}</div>`;

    const legend = document.createElement('div');
    legend.className = 'prem-legend';
    const tiers = [
        { nome: 'Bronze', cor: '#cd7f32' },
        { nome: 'Prata', cor: '#c0c0c0' },
        { nome: 'Ouro', cor: '#ffd700' },
        { nome: 'Diamante', cor: '#00e5ff' },
        { nome: 'Lendário', cor: '#ff0000' }
    ];
    tiers.forEach(t => {
        const item = document.createElement('div');
        item.className = 'prem-legend-item';
        item.innerHTML = `<span class="prem-legend-dot" style="background:${t.cor};"></span> ${t.nome}`;
        legend.appendChild(item);
    });
    section.appendChild(legend);

    const grid = document.createElement('div');
    grid.className = 'prem-tier-grid';

    categorias.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'prem-tier-card';

        const tierAtual = cat.tierAtual;
        const corAtual = cat.tierCor || '#555';

        const stepsHtml = cat.tiers.map((t, i) => {
            let cls = 'prem-tier-step';
            if (t.desbloqueado) cls += ' unlocked';
            if (i === tierAtual) cls += ' current';
            return `<div class="${cls}" style="${i <= tierAtual ? `--tier-cor:${t.cor};border-color:${t.cor}40;` : ''}">
                <span class="step-icon">${t.icone}</span>
                <span class="step-label">${t.nome}</span>
            </div>`;
        }).join('');

        const proximo = cat.proximaMeta;
        const pct = cat.progressoProximo || 0;
        const isPosicao = cat.unidade === 'posição';
        const isForaRanking = isPosicao && cat.progresso >= 999;

        let progressHtml;
        const precisaProgresso = isForaRanking
            ? proximo !== null
            : isPosicao
                ? (proximo !== null && cat.progresso > proximo)
                : (proximo !== null && cat.progresso < proximo);

        if (precisaProgresso) {
            const labelProximo = isForaRanking
                ? `${proximo}º lugar`
                : isPosicao
                    ? `${proximo}º lugar`
                    : `${proximo.toLocaleString()} ${cat.unidade}`;
            const labelAtual = isForaRanking
                ? '—'
                : isPosicao
                    ? `${(cat.progresso || 0)}º`
                    : `${(cat.progresso || 0).toLocaleString()}`;
            const nomeProximo = isPosicao
                ? `${tiers[tierAtual + 1]?.nome || 'Lendário'}`
                : `${tiers[tierAtual + 1]?.nome || 'Lendário'}`;
            progressHtml = `
                <div class="prem-tier-bar-container">
                    <div class="prem-tier-bar-fill" style="width:${pct}%;background:${corAtual};"></div>
                </div>
                <div class="prem-tier-bar-label">
                    <span>Progresso para <strong style="color:${corAtual};">${nomeProximo}</strong></span>
                    <span class="prem-tier-next-meta" style="--tier-cor:${corAtual};">${labelAtual} / ${labelProximo}</span>
                </div>`;
        } else {
            progressHtml = `
                <div class="prem-tier-bar-container">
                    <div class="prem-tier-bar-fill" style="width:100%;background:${corAtual};"></div>
                </div>
                <div class="prem-tier-bar-label">
                    <span style="color:${corAtual};font-weight:700;">✓ TIER MÁXIMO ATINGIDO</span>
                </div>`;
        }

        const unidadeLabel = cat.unidade === '%' ? '%' : ` ${cat.unidade}`;

        card.innerHTML = `
            <div class="prem-tier-header">
                <div class="prem-tier-icon">${cat.icone}</div>
                <div>
                    <div class="prem-tier-title">${cat.titulo}</div>
                    <div class="prem-tier-desc">${cat.descricao}</div>
                </div>
            </div>
            <div class="prem-tier-progress-val">
                ${(cat.progresso || 0).toLocaleString()}${unidadeLabel}
                <small>· ${cat.tierNome}</small>
            </div>
            <div class="prem-tier-steps">${stepsHtml}</div>
            ${progressHtml}`;

        grid.appendChild(card);
    });

    section.appendChild(grid);
    frame.appendChild(section);
}

function renderPodio(frame) {
    const { podio } = premiacaoData;
    if (!podio || podio.length === 0) return;

    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<div class="section-title">🏆 PÓDIO DE HONRA</div>`;

    const grid = document.createElement('div');
    grid.className = 'premiacao-podio-grid';

    const medals = [
        { pos: 1, label: '1º Lugar', icon: '🥇', cls: 'prem-gold', color: '#ffd700', shadow: 'rgba(255,215,0,0.15)' },
        { pos: 2, label: '2º Lugar', icon: '🥈', cls: 'prem-silver', color: '#c0c0c0', shadow: 'rgba(192,192,192,0.10)' },
        { pos: 3, label: '3º Lugar', icon: '🥉', cls: 'prem-bronze', color: '#cd7f32', shadow: 'rgba(205,127,50,0.10)' }
    ];

    medals.forEach((m, i) => {
        const d = podio[i];
        if (!d) return;
        const nivel = getNivel(d.pontos || 0);
        const card = document.createElement('div');
        card.className = `premiacao-trofeu-card ${m.cls}`;
        card.style.cssText = `border-color:${m.color}30;background:${m.shadow};position:relative;overflow:hidden;`;
        card.innerHTML = `
            <div style="position:absolute;top:-20px;right:-20px;font-size:80px;opacity:0.05;pointer-events:none;">${m.icon}</div>
            <div class="prem-pos-number" style="color:${m.color};">${m.icon}</div>
            <div class="prem-trofeu-label">${m.label}</div>
            <div class="prem-nome" style="color:${m.color};">${d.nome}</div>
            <div class="prem-nivel-badge" style="background:${nivel.color}15;border:1px solid ${nivel.color}40;color:${nivel.color};">${nivel.icon} ${nivel.nome}</div>
            <div class="prem-stats-row">
                <div class="prem-stat"><div class="prem-stat-val" style="color:${m.color};">${(d.pontos || 0).toLocaleString()}</div><div class="prem-stat-lbl">PONTOS</div></div>
                <div class="prem-stat"><div class="prem-stat-val">${d.viagens || 0}</div><div class="prem-stat-lbl">VIAGENS</div></div>
                <div class="prem-stat"><div class="prem-stat-val">${(d.km || 0).toLocaleString()}</div><div class="prem-stat-lbl">KM</div></div>
            </div>`;
        grid.appendChild(card);
    });

    section.appendChild(grid);
    frame.appendChild(section);
}

function renderMedalhas(frame) {
    const { medalhas } = premiacaoData;
    if (!medalhas || medalhas.length === 0) return;

    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<div class="section-title">🎖️ MEDALHAS POR CATEGORIA</div>`;

    const grid = document.createElement('div');
    grid.className = 'premiacao-medalhas-grid';

    const tierCores = { '—': '#555', 'Calouro': '#4CAF50', 'Bronze': '#cd7f32', 'Prata': '#c0c0c0', 'Ouro': '#ffd700', 'Diamante': '#00e5ff', 'Elite': '#ff6b35', 'Lendário': '#ff0000' };

    medalhas.forEach(med => {
        const card = document.createElement('div');
        const isLocked = !med.motorista || med.tier === '—';
        card.className = `premiacao-medalha-card ${isLocked ? 'prem-locked' : 'prem-unlocked'}`;
        const glowColor = tierCores[med.tier] || '#ffd700';
        if (!isLocked) card.style.cssText = `border-color:${glowColor}40;box-shadow:0 0 25px ${glowColor}12;`;

        const atual = med.progressoAtual || 0;
        const metaProximo = med.metaProximo;
        let progressoHtml = '';
        if (metaProximo && atual < metaProximo) {
            const pct = Math.min(Math.round((atual / metaProximo) * 100), 100);
            progressoHtml = `<div class="prem-medalha-progresso">
                <div class="prem-medalha-bar"><div class="prem-medalha-bar-fill" style="width:${pct}%;background:${glowColor};"></div></div>
                <div class="prem-medalha-bar-text">${atual.toLocaleString()} / ${metaProximo.toLocaleString()}</div>
            </div>`;
        } else if (metaProximo && atual >= metaProximo) {
            progressoHtml = `<div class="prem-medalha-progresso"><div class="prem-medalha-bar-text" style="color:${glowColor};">✓ MÁXIMO ATINGIDO</div></div>`;
        }

        card.innerHTML = `
            <div class="prem-medalha-icon" style="${!isLocked ? `background:${glowColor}15;color:${glowColor};box-shadow:0 0 20px ${glowColor}20;border-color:${glowColor}40;` : ''}">${med.icone}</div>
            <div class="prem-medalha-titulo">${med.titulo}</div>
            <div class="prem-medalha-valor">${med.valor}</div>
            <div class="prem-medalha-tier" style="color:${glowColor};">${med.tier || '—'}</div>
            <div class="prem-medalha-motorista">${med.motorista || '— Aguardando —'}</div>
            ${progressoHtml}`;
        grid.appendChild(card);
    });

    section.appendChild(grid);
    frame.appendChild(section);
}

function renderTrofeusEspeciais(frame) {
    const { trofeus } = premiacaoData;
    if (!trofeus || trofeus.length === 0) return;

    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<div class="section-title">✨ TROFÉUS ESPECIAIS</div>`;

    const grid = document.createElement('div');
    grid.className = 'premiacao-trofeus-especiais';

    trofeus.forEach(t => {
        const card = document.createElement('div');
        const isLocked = !t.motorista;
        card.className = `prem-trofeu-especial ${isLocked ? 'prem-locked' : 'prem-unlocked'}`;
        const c = t.cor || '#ffd700';
        if (!isLocked) card.style.cssText = `border-color:${c}40;box-shadow:0 0 30px ${c}10;`;

        const requisitos = t.requisitos || '';
        card.innerHTML = `
            <div class="prem-trofeu-icone" style="${!isLocked ? `color:${c};text-shadow:0 0 20px ${c}50;` : ''}">${t.icone}</div>
            <div class="prem-trofeu-info">
                <div class="prem-trofeu-titulo">${t.titulo}</div>
                <div class="prem-trofeu-motorista" style="${!isLocked ? `color:${c};` : ''}">${t.motorista || 'Nenhum motorista'}</div>
                ${requisitos ? `<div class="prem-trofeu-req">${requisitos}</div>` : ''}
            </div>`;
        grid.appendChild(card);
    });

    section.appendChild(grid);
    frame.appendChild(section);
}

function renderTodasMedalhasDetalhadas(frame) {
    const { todasMedalhas } = premiacaoData;
    if (!todasMedalhas || todasMedalhas.length === 0) return;

    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<div class="section-title">🏅 TODAS AS CONQUISTAS</div>
        <div style="font-size:11px;color:#666;margin-bottom:12px;">Requisitos avançados — cada medalha exige dedicação excepcional</div>`;

    const grid = document.createElement('div');
    grid.className = 'premiacao-todas-grid';

    todasMedalhas.forEach(cat => {
        const catDiv = document.createElement('div');
        catDiv.className = 'premiacao-cat-section';

        const catHeader = document.createElement('div');
        catHeader.className = 'premiacao-cat-header';
        catHeader.innerHTML = `<span style="font-size:16px;">${cat.icone}</span> <span>${cat.nome}</span>
            <span class="premiacao-cat-count">${cat.conquistas.filter(c => c.desbloqueada).length}/${cat.conquistas.length}</span>`;
        catDiv.appendChild(catHeader);

        const conquistasGrid = document.createElement('div');
        conquistasGrid.className = 'premiacao-conquistas-grid';

        cat.conquistas.forEach(c => {
            const card = document.createElement('div');
            card.className = `premiacao-conquista-mini ${c.desbloqueada ? 'prem-conq-unlocked' : 'prem-conq-locked'}`;
            if (c.desbloqueada) {
                const rc = c.raridade === 'lendario' ? '#ffd700' : c.raridade === 'raro' ? '#9C27B0' : '#00ff88';
                card.style.borderColor = rc + '30';
            }
            card.innerHTML = `
                <div class="prem-conq-icone">${c.icone}</div>
                <div class="prem-conq-titulo">${c.titulo}</div>
                <div class="prem-conq-desc">${c.descricao}</div>
                <div class="prem-conq-progresso">
                    <div class="prem-conq-bar"><div class="prem-conq-bar-fill" style="width:${c.progressoPercent || 0}%;background:${c.desbloqueada ? '#00ff88' : '#333'};"></div></div>
                    <div class="prem-conq-bar-text">${c.progressoAtual || 0}/${c.metaFormatada || c.meta}</div>
                </div>
                <div class="prem-conq-raridade" style="color:${c.raridade === 'lendario' ? '#ffd700' : c.raridade === 'raro' ? '#9C27B0' : '#888'};">${(c.raridade || 'comum').toUpperCase()}</div>
                ${c.desbloqueada ? '<div class="prem-conq-check">✓</div>' : '<div class="prem-conq-lock">🔒</div>'}`;
            conquistasGrid.appendChild(card);
        });

        catDiv.appendChild(conquistasGrid);
        grid.appendChild(catDiv);
    });

    section.appendChild(grid);
    frame.appendChild(section);
}

function renderHallOfFame(frame) {
    const { hallOfFame } = premiacaoData;
    if (!hallOfFame || hallOfFame.length === 0) return;

    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<div class="section-title">📋 HALL OF FAME</div>`;

    const table = document.createElement('div');
    table.className = 'admin-table';

    let html = `<table class="data-table"><thead><tr>
        <th>#</th><th>Motorista</th><th>Nível</th><th>Conquistas</th><th>Pontos</th><th>Viagens</th><th>KM</th>
    </tr></thead><tbody>`;

    hallOfFame.forEach((m, i) => {
        const nivel = getNivel(m.pontos || 0);
        const rowBg = i === 0 ? 'rgba(255,215,0,0.04)' : i === 1 ? 'rgba(192,192,192,0.02)' : i === 2 ? 'rgba(205,127,50,0.02)' : '';
        html += `<tr style="${rowBg ? `background:${rowBg};` : ''}">
            <td style="font-weight:700;color:${i < 3 ? ['#ffd700','#c0c0c0','#cd7f32'][i] : '#555'};">${i + 1}º</td>
            <td><a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(m.nome)}">${m.nome}</a></td>
            <td><span class="nivel-badge" style="border-color:${nivel.color};color:${nivel.color};font-size:9px;">${nivel.icon} ${nivel.nome}</span></td>
            <td><span style="color:${m.conquistas >= 20 ? '#ffd700' : m.conquistas >= 10 ? '#9C27B0' : '#00ff88'};">${m.conquistas}</span> / ${m.totalConquistas || 48}</td>
            <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${(m.pontos || 0).toLocaleString()}</td>
            <td>${m.viagens || 0}</td>
            <td>${(m.km || 0).toLocaleString()}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    table.innerHTML = html;
    section.appendChild(table);
    frame.appendChild(section);
}

function renderFooter(frame) {
    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `<div class="footer-line">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);
}

(async function init() {
    try {
        const ok = await loadData();
        if (ok) renderPage();
    } catch(e) {
        console.error('Erro ao carregar premiação:', e);
        document.getElementById('status').innerText = 'Erro ao carregar dados da premiação';
        document.getElementById('status').className = 'status-bar error';
    }
})();
