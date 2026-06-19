let empresasData = [];
let viagensData = [];
let periodoAtual = 'geral';

async function loadData() {
    const [resEmp, resViagens] = await Promise.all([
        fetchJSON('/api/empresas'),
        fetchJSON('/api/viagens')
    ]);

    if (resEmp.error || !resEmp.data) {
        document.getElementById('status').innerText = 'Erro: API nao disponivel';
        document.getElementById('status').className = 'status-bar error';
        return false;
    }

    empresasData = resEmp.data.empresas || [];
    viagensData = (resViagens.data && resViagens.data.viagens) || [];

    document.getElementById('status').innerText = `● ${empresasData.length} empresas | ${viagensData.length} viagens`;
    document.getElementById('status').className = 'status-bar connected';
    return true;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('empresas_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const title = document.createElement('div');
    title.className = 'dashboard-title';
    title.textContent = 'RANKING GERAL';
    frame.appendChild(title);

    const user = getAuthUser();
    if (user && user.empresa) {
        const link = document.createElement('div');
        link.style.cssText = 'text-align:center;padding:8px;margin-bottom:16px;';
        link.innerHTML = `<a href="empresa_local.html?empresa=${encodeURIComponent(user.empresa)}" style="color:#00ff88;font-size:13px;font-weight:700;">VER MINHA EMPRESA: ${user.empresa.toUpperCase()}</a>`;
        frame.appendChild(link);
    } else if (user && !user.empresa) {
        const link = document.createElement('div');
        link.style.cssText = 'text-align:center;padding:8px;margin-bottom:16px;';
        link.innerHTML = `<a href="perfil_local.html?motorista=${encodeURIComponent(user.nome)}" style="color:#ffaa00;font-size:13px;font-weight:700;">VER MEU PERFIL: ${user.nome.toUpperCase()}</a>`;
        frame.appendChild(link);
    }

    const periodBar = document.createElement('div');
    periodBar.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;justify-content:center;';
    periodBar.innerHTML = `
        <button class="period-btn ${periodoAtual === 'geral' ? 'active' : ''}" onclick="setPeriodo('geral')">GERAL</button>
        <button class="period-btn ${periodoAtual === 'mes' ? 'active' : ''}" onclick="setPeriodo('mes')">MES ATUAL</button>`;
    frame.appendChild(periodBar);

    const mes = getMesAtual();
    let empresasMostrar = empresasData;
    let motData = {};
    let viagensMostrar = viagensData;

    if (periodoAtual === 'mes') {
        viagensMostrar = viagensData.filter(v => {
            const d = new Date(v.data);
            return d.getMonth() + 1 === mes.mes && d.getFullYear() === mes.ano;
        });
        const empMap = {};
        viagensMostrar.forEach(v => {
            if (!empMap[v.empresa]) empMap[v.empresa] = { nome: v.empresa, viagens: 0, km: 0, pontuacao: 0 };
            empMap[v.empresa].viagens++;
            empMap[v.empresa].km += v.km;
            empMap[v.empresa].pontuacao += v.pontuacao;
        });
        empresasMostrar = Object.values(empMap).sort((a, b) => b.pontuacao - a.pontuacao);
    }

    empresasMostrar = empresasMostrar.filter(e => e.nome !== 'Lobo Solitário');
    viagensMostrar = viagensMostrar.filter(v => v.empresa !== 'Lobo Solitário');

    viagensMostrar.forEach(v => {
        if (!motData[v.motorista]) motData[v.motorista] = { nome: v.motorista, empresa: v.empresa, viagens: 0, km: 0, pontuacao: 0 };
        motData[v.motorista].viagens++;
        motData[v.motorista].km += v.km;
        motData[v.motorista].pontuacao += v.pontuacao;
    });
    const motoristasRanked = Object.values(motData).sort((a, b) => b.pontuacao - a.pontuacao);

    const grid = document.createElement('div');
    grid.className = 'dashboard-grid';

    const leftCol = document.createElement('div');
    leftCol.className = 'dashboard-left';

    const rightCol = document.createElement('div');
    rightCol.className = 'dashboard-right';

    // Ranking Empresas
    const empSection = document.createElement('div');
    empSection.className = 'section';
    empSection.innerHTML = `<div class="section-title">RANKING EMPRESAS (${periodoAtual === 'mes' ? mes.label : 'GERAL'})</div>`;
    if (empresasMostrar.length > 0) {
        let empHtml = `<div class="admin-table"><table class="data-table"><thead><tr>
            <th>#</th><th>Empresa</th><th>Viagens</th><th>KM</th><th>Pontos</th>
        </tr></thead><tbody>`;
        empresasMostrar.forEach((e, i) => {
            const empInfo = empresasData.find(x => x.nome === e.nome);
            const logoHtml = empInfo && empInfo.logo ? `<img src="${empInfo.logo}" style="height:16px;vertical-align:middle;margin-right:4px;">` : '';
            empHtml += `<tr>
                <td style="color:#00ff88;font-weight:700">${i + 1}°</td>
                <td>${logoHtml}<a class="table-link" href="empresa_local.html?empresa=${encodeURIComponent(e.nome)}">🏢 ${e.nome}</a></td>
                <td>${e.viagens}</td>
                <td>${e.km.toLocaleString()}</td>
                <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${e.pontuacao.toLocaleString()}</td>
            </tr>`;
        });
        empHtml += `</tbody></table></div>`;
        empSection.innerHTML += empHtml;
    } else {
        empSection.innerHTML += `<div style="text-align:center;color:#555;padding:20px;">Nenhuma empresa com viagens</div>`;
    }
    leftCol.appendChild(empSection);

    // Ranking Motoristas
    const motSection = document.createElement('div');
    motSection.className = 'section';
    motSection.innerHTML = `<div class="section-title">RANKING MOTORISTAS</div>`;
    if (motoristasRanked.length > 0) {
        let motHtml = `<div class="admin-table"><table class="data-table"><thead><tr>
            <th>#</th><th>Motorista</th><th>Empresa</th><th>Viagens</th><th>KM</th><th>Pontos</th>
        </tr></thead><tbody>`;
        motoristasRanked.slice(0, 20).forEach((m, i) => {
            const isLobo = !m.empresa || m.empresa === 'Lobo Solitário';
            motHtml += `<tr>
                <td style="color:#ffaa00;font-weight:700">${i + 1}°</td>
                <td><a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(m.nome)}">${m.nome}</a></td>
                <td>${isLobo ? '<span style="color:#ffaa00">🐺 Lobo Solitário</span>' : `<a class="table-link" href="empresa_local.html?empresa=${encodeURIComponent(m.empresa)}" style="color:#00ff88">🏢 ${m.empresa}</a>`}</td>
                <td>${m.viagens}</td>
                <td>${m.km.toLocaleString()}</td>
                <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${m.pontuacao.toLocaleString()}</td>
            </tr>`;
        });
        motHtml += `</tbody></table></div>`;
        motSection.innerHTML += motHtml;
    } else {
        motSection.innerHTML += `<div style="text-align:center;color:#555;padding:20px;">Nenhum motorista com viagens</div>`;
    }
    rightCol.appendChild(motSection);

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    frame.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `<div class="footer-line">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);
}

function setPeriodo(p) {
    periodoAtual = p;
    renderPage();
}

(async function init() {
    const ok = await loadData();
    if (ok) renderPage();
})();

window.addEventListener('cargo-trip-recorded', async () => {
    console.log('[RANKING] Nova viagem registrada, atualizando dados...');
    const ok = await loadData();
    if (ok) renderPage();
});
