let vagasData = [];
let minhasCandidaturas = {};
let filtroCategoria = '';

async function loadData() {
    const user = getAuthUser();
    if (!user) { window.location.href = 'login_local.html'; return false; }

    const [resVagas, resCand] = await Promise.all([
        fetchJSON('/api/vagas'),
        authFetch('/api/candidaturas')
    ]);

    if (resVagas.data) vagasData = resVagas.data.vagas || [];

    if (resCand) {
        const cData = await resCand.json();
        if (cData.ok && cData.candidaturas) {
            cData.candidaturas.forEach(c => { minhasCandidaturas[c.vaga_id] = c.status; });
        }
    }

    document.getElementById('status').innerText = `● ${vagasData.length} vagas disponiveis`;
    document.getElementById('status').className = 'status-bar connected';
    return true;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('vagas_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const title = document.createElement('div');
    title.className = 'dashboard-title';
    title.textContent = 'VAGAS ABERTAS';
    frame.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'text-align:center;color:#888;font-size:12px;margin-bottom:24px;';
    subtitle.textContent = 'Encontre uma empresa e candidate-se a uma vaga';
    frame.appendChild(subtitle);

    const categorias = [
        { slug: '', label: 'Todas', icon: '📦' },
        { slug: 'geral', label: 'Geral', icon: '📦' },
        { slug: 'quimicos', label: 'Quimicos', icon: '🧪' },
        { slug: 'construcao', label: 'Construcao', icon: '🏗️' },
        { slug: 'veiculos', label: 'Veiculos', icon: '🚗' },
        { slug: 'carga_viva', label: 'Carga Viva', icon: '🐄' },
        { slug: 'maquinas', label: 'Maquinas', icon: '🚜' },
        { slug: 'granel', label: 'Granel', icon: '🌾' },
        { slug: 'passageiros', label: 'Passageiros', icon: '🚌' }
    ];

    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:20px;';
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.icon + ' ' + cat.label;
        btn.style.cssText = `padding:6px 12px;border-radius:6px;border:1px solid ${filtroCategoria === cat.slug ? '#00ff88' : '#1e1e28'};background:${filtroCategoria === cat.slug ? '#00ff8815' : '#0d1117'};color:${filtroCategoria === cat.slug ? '#00ff88' : '#888'};cursor:pointer;font-size:11px;font-family:Consolas,monospace;transition:all 0.2s;`;
        btn.onclick = () => { filtroCategoria = cat.slug; renderPage(); };
        filterBar.appendChild(btn);
    });
    frame.appendChild(filterBar);

    const filtered = filtroCategoria ? vagasData.filter(v => v.categoria === filtroCategoria) : vagasData;

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:60px 20px;';
        empty.innerHTML = `
            <div style="font-size:48px;margin-bottom:16px;">📋</div>
            <div style="color:#888;font-size:14px;">Nenhuma vaga disponivel</div>
            <div style="color:#555;font-size:11px;margin-top:8px;">Empresas podem publicar vagas na pagina da empresa</div>`;
        frame.appendChild(empty);
    } else {
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;padding:0 4px;';

        filtered.forEach(vaga => {
            const catIcons = { 'geral':'📦','quimicos':'🧪','construcao':'🏗️','veiculos':'🚗','carga_viva':'🐄','maquinas':' tractor','granel':'🌾','passageiros':'🚌' };
            const cardStatus = minhasCandidaturas[vaga.id] || '';
            let statusBtn = '';
            if (cardStatus === 'pendente') {
                statusBtn = `<button disabled style="padding:8px 16px;background:#ffaa0020;color:#ffaa00;border:1px solid #ffaa0040;border-radius:6px;font-size:11px;font-weight:700;cursor:default;">CANDIDATURA ENVIADA</button>`;
            } else if (cardStatus === 'aceita') {
                statusBtn = `<button disabled style="padding:8px 16px;background:#00ff8820;color:#00ff88;border:1px solid #00ff8840;border-radius:6px;font-size:11px;font-weight:700;cursor:default;">ACEITO ✓</button>`;
            } else {
                statusBtn = `<button onclick="candidatarVaga(${vaga.id})" style="padding:8px 16px;background:#00ff88;color:#000;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">CANDIDATAR-SE</button>`;
            }

            card = document.createElement('div');
            card.style.cssText = 'background:#0d1117;border:1px solid #1e1e28;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;';
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;border-radius:8px;background:#1a2a1a;border:1px solid #00ff8830;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${catIcons[vaga.categoria] || '📦'}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="color:#e0e0e0;font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(vaga.titulo)}</div>
                        <a href="empresa_local.html?empresa=${encodeURIComponent(vaga.empresa)}" style="color:#00ff88;font-size:11px;text-decoration:none;">${escapeHTML(vaga.empresa)}</a>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="color:#00ff88;font-size:16px;font-weight:700;">${vaga.qtd_vagas}</div>
                        <div style="color:#666;font-size:9px;">vagas</div>
                    </div>
                </div>
                ${vaga.descricao ? `<div style="color:#aaa;font-size:11px;line-height:1.5;">${escapeHTML(vaga.descricao)}</div>` : ''}
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;">
                    <div style="display:flex;gap:8px;">
                        <span style="padding:3px 8px;background:#1a1a22;border-radius:4px;color:#888;font-size:10px;">${vaga.categoria || 'geral'}</span>
                        <span style="padding:3px 8px;background:#1a1a22;border-radius:4px;color:#888;font-size:10px;">${vaga.candidaturas_pendentes || 0} candidatos</span>
                    </div>
                    ${statusBtn}
                </div>`;
            grid.appendChild(card);
        });
        frame.appendChild(grid);
    }

    app.appendChild(frame);
}

async function candidatarVaga(vagaId) {
    const msg = prompt('Mensagem para a empresa (opcional):');
    if (msg === null) return;
    showToast('Enviando candidatura...', 'info', 2000);
    const res = await authFetch('/api/candidaturas', {
        method: 'POST',
        body: JSON.stringify({ vaga_id: vagaId, mensagem: msg })
    });
    if (res) {
        const data = await res.json();
        if (data.ok) {
            showToast('Candidatura enviada com sucesso!', 'success');
            minhasCandidaturas[vagaId] = 'pendente';
            renderPage();
        } else if (data.duplicate) {
            showToast('Voce ja tem uma candidatura pendente nesta vaga', 'warning');
        } else {
            showToast(data.error || 'Erro ao enviar candidatura', 'error');
        }
    }
}

loadData().then(ok => { if (ok) renderPage(); });
