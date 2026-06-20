let empresasData = [];
let solicitacoesEnviadas = {};

async function loadData() {
    const user = getAuthUser();
    if (!user) {
        window.location.href = 'login_local.html';
        return false;
    }
    if (user.empresa && user.empresa !== 'Lobo Solitário') {
        window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(user.empresa);
        return false;
    }

    const [resEmp, resSol] = await Promise.all([
        fetchJSON('/api/empresas'),
        authFetch('/api/solicitacoes')
    ]);

    if (resEmp.data) {
        empresasData = (resEmp.data.empresas || []).filter(e => e.nome !== 'Lobo Solitário');
    }

    if (resSol) {
        const solData = await resSol.json();
        if (solData.ok && solData.solicitacoes) {
            solData.solicitacoes.forEach(s => {
                solicitacoesEnviadas[s.empresa] = s.status;
            });
        }
    }

    document.getElementById('status').innerText = `● ${empresasData.length} empresas disponiveis`;
    document.getElementById('status').className = 'status-bar connected';
    return true;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('lobo_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const title = document.createElement('div');
    title.className = 'dashboard-title';
    title.textContent = 'ENCONTRAR EMPRESA';
    frame.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'text-align:center;color:#888;font-size:12px;margin-bottom:24px;';
    subtitle.textContent = 'Escolha uma empresa e envie seu pedido de vaga';
    frame.appendChild(subtitle);

    const user = getAuthUser();
    if (user && user.empresa && user.empresa !== 'Lobo Solitário') {
        const link = document.createElement('div');
        link.style.cssText = 'text-align:center;padding:8px;margin-bottom:16px;';
        link.innerHTML = `<a href="empresa_local.html?empresa=${encodeURIComponent(user.empresa)}" style="color:#00ff88;font-size:13px;font-weight:700;">VER MINHA EMPRESA: ${user.empresa.toUpperCase()}</a>`;
        frame.appendChild(link);
    }

    if (empresasData.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:60px 20px;';
        empty.innerHTML = `
            <div style="font-size:48px;margin-bottom:16px;">🏢</div>
            <div style="color:#888;font-size:14px;">Nenhuma empresa disponivel</div>`;
        frame.appendChild(empty);
    } else {
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:0 4px;';

        empresasData.forEach(emp => {
            const card = document.createElement('div');
            card.className = 'lobo-empresa-card';

            const statusSol = solicitacoesEnviadas[emp.nome];
            let btnHtml = '';
            if (statusSol === 'pendente') {
                btnHtml = `<button class="lobo-btn-pedido" disabled style="background:#333;color:#888;cursor:default;">PEDIDO ENVIADO</button>`;
            } else if (statusSol === 'aceita') {
                btnHtml = `<a href="empresa_local.html?empresa=${encodeURIComponent(emp.nome)}" class="lobo-btn-pedido" style="background:#00ff88;color:#000;text-decoration:none;display:inline-block;">VER MINHA EMPRESA</a>`;
            } else {
                btnHtml = `<button class="lobo-btn-pedido" onclick="pedirVaga('${emp.nome.replace(/'/g, "\\'")}')">PEDIR VAGA</button>`;
            }

            const logoHtml = emp.logo
                ? `<img src="${emp.logo}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:2px solid #00ff88;">`
                : `<div style="width:48px;height:48px;border-radius:10px;background:#1a2a1a;border:2px solid #00ff88;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🏢</div>`;

            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                    ${logoHtml}
                    <div style="flex:1;min-width:0;">
                        <a href="empresa_local.html?empresa=${encodeURIComponent(emp.nome)}" style="color:#00ff88;font-size:15px;font-weight:700;letter-spacing:1px;text-decoration:none;">${emp.nome}</a>
                        ${emp.descricao ? `<div style="color:#888;font-size:11px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${emp.descricao}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:12px;margin-bottom:14px;">
                    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:10px 6px;">
                        <div style="color:#00ff88;font-size:18px;font-weight:700;">${emp.motoristas || 0}</div>
                        <div style="color:#666;font-size:9px;letter-spacing:1px;">MOTORISTAS</div>
                    </div>
                    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:10px 6px;">
                        <div style="color:#00ff88;font-size:18px;font-weight:700;">${emp.viagens || 0}</div>
                        <div style="color:#666;font-size:9px;letter-spacing:1px;">VIAGENS</div>
                    </div>
                    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:10px 6px;">
                        <div style="color:#00ff88;font-size:18px;font-weight:700;">${(emp.km || 0).toLocaleString()}</div>
                        <div style="color:#666;font-size:9px;letter-spacing:1px;">KM</div>
                    </div>
                    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:10px 6px;">
                        <div style="color:#ffd700;font-size:18px;font-weight:700;">${(emp.pontuacao || 0).toLocaleString()}</div>
                        <div style="color:#666;font-size:9px;letter-spacing:1px;">PONTOS</div>
                    </div>
                </div>
                <div style="text-align:center;">
                    ${btnHtml}
                </div>`;

            grid.appendChild(card);
        });

        frame.appendChild(grid);
    }

    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `
        <div class="footer-line">App desktop para Windows 10+ | Telemetria ETS2/ATS em tempo real</div>
        <div class="footer-line footer-copy">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);
}

async function pedirVaga(empresaNome) {
    const user = getAuthUser();
    if (!user) {
        window.location.href = 'login_local.html';
        return;
    }

    if (!confirm(`Enviar pedido de vaga para ${empresaNome}?`)) return;

    const res = await authFetch('/api/solicitacoes', {
        method: 'POST',
        body: JSON.stringify({ empresa: empresaNome })
    });

    if (res) {
        const result = await res.json();
        if (result.ok) {
            solicitacoesEnviadas[empresaNome] = 'pendente';
            renderPage();
        } else {
            alert(result.error || 'Erro ao enviar pedido');
        }
    }
}

(async function init() {
    const ok = await loadData();
    if (ok) renderPage();
})();
