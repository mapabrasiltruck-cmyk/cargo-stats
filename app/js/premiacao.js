let empresaNome = '';
let empresaInfo = null;
let premiacaoData = null;
let viagensEmpresa = [];

function getEmpresaFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('empresa');
}

async function loadData() {
    empresaNome = getEmpresaFromURL();
    if (!empresaNome) {
        document.getElementById('app').innerHTML = `
            <div style="text-align:center;padding:60px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">🏆</div>
                <div style="color:#888;font-size:14px;">Nenhuma empresa selecionada</div>
                <a href="empresas_local.html" style="color:#00ff88;font-size:13px;margin-top:12px;display:inline-block;">Ver ranking de empresas</a>
            </div>`;
        document.getElementById('status').innerText = 'Empresa não especificada';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    const [resPrem, resEmp, resViagens] = await Promise.all([
        fetchJSON(`/api/premiacao?empresa=${encodeURIComponent(empresaNome)}`),
        fetchJSON('/api/empresas'),
        fetchJSON(`/api/viagens?empresa=${encodeURIComponent(empresaNome)}`)
    ]);

    if (resEmp.data && resEmp.data.empresas) {
        empresaInfo = resEmp.data.empresas.find(e => e.nome === empresaNome) || null;
    }
    if (!empresaInfo) {
        empresaInfo = { nome: empresaNome, logo: '', banner: '', descricao: '', motoristas: 0, viagens: 0, km: 0, pontuacao: 0 };
    }

    viagensEmpresa = (resViagens.data && resViagens.data.viagens) || [];

    if (resPrem.error || !resPrem.data || !resPrem.data.premiacao) {
        document.getElementById('app').innerHTML = `
            <div style="text-align:center;padding:60px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">🏆</div>
                <div style="color:#888;font-size:14px;">Empresa "${empresaNome}" sem dados suficientes para premiação</div>
                <a href="empresa_local.html?empresa=${encodeURIComponent(empresaNome)}" style="color:#00ff88;font-size:13px;margin-top:12px;display:inline-block;">Voltar para empresa</a>
            </div>`;
        document.getElementById('status').innerText = 'Sem dados para premiação';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    premiacaoData = resPrem.data.premiacao;

    document.title = `CARGO STATS - Premiação - ${empresaNome}`;
    return true;
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
    renderPodio(frame);
    renderMedalhas(frame);
    renderTrofeusEspeciais(frame);
    renderTodasMedalhasDetalhadas(frame);
    renderHallOfFame(frame);
    renderFooter(frame);

    app.appendChild(frame);

    document.getElementById('status').innerText = `● ${empresaNome} - Premiação carregada`;
    document.getElementById('status').className = 'status-bar connected';
    if (typeof updateFloatingStatus === 'function') updateFloatingStatus(true, false);
}

function renderBanner(frame) {
    const banner = document.createElement('div');
    banner.className = 'empresa-banner';
    if (empresaInfo.banner) {
        banner.innerHTML = `<img src="${empresaInfo.banner}" alt="${empresaNome}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;">`;
    } else {
        banner.style.cssText = 'height:140px;background:linear-gradient(135deg,#1a1200 0%,#2a1a00 30%,#1a1200 70%,#0d0d12 100%);border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;';
        banner.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, rgba(255,215,0,0.08) 0%, transparent 70%);"></div>
            <span style="font-size:56px;opacity:0.5;filter:drop-shadow(0 0 20px rgba(255,215,0,0.3));">🏆</span>`;
    }
    frame.appendChild(banner);
}

function renderHeader(frame) {
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:16px;padding:20px 0;border-bottom:1px solid #1a1a22;margin-bottom:24px;';

    let logoHtml = empresaInfo.logo
        ? `<img src="${empresaInfo.logo}" style="width:56px;height:56px;border-radius:12px;object-fit:cover;border:2px solid #ffd700;">`
        : `<div style="width:56px;height:56px;border-radius:12px;background:#1a1200;border:2px solid #ffd700;display:flex;align-items:center;justify-content:center;font-size:24px;">🏢</div>`;

    header.innerHTML = `${logoHtml}
        <div style="flex:1">
            <div style="font-size:11px;letter-spacing:3px;color:#ffd700;font-weight:700;">MURAL DE PREMIAÇÃO</div>
            <div style="font-size:20px;font-weight:700;color:#e0e0e0;margin-top:2px;">${empresaNome}</div>
        </div>
        <a href="empresa_local.html?empresa=${encodeURIComponent(empresaNome)}" style="padding:8px 16px;background:#1a1a22;border:1px solid #333;border-radius:6px;color:#888;font-size:11px;text-decoration:none;font-weight:600;">← VOLTAR</a>`;
    frame.appendChild(header);
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

    const tierCores = { '—': '#555', 'Bronze': '#cd7f32', 'Prata': '#c0c0c0', 'Ouro': '#ffd700', 'Lendário': '#ff0000' };
    const tierOrdem = { '—': 0, 'Bronze': 1, 'Prata': 2, 'Ouro': 3, 'Lendário': 4 };

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
