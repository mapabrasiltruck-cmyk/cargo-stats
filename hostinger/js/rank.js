const API = window.location.origin;
let currentTab = 'empresas';
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadStats() {
    try {
        const r = await fetch(API + '/api/stats.php?_=' + Date.now());
        const data = await r.json();
        document.getElementById('stat-empresas').textContent = data.totalEmpresas || 0;
        document.getElementById('stat-motoristas').textContent = data.totalMotoristas || 0;
        document.getElementById('stat-viagens').textContent = data.totalViagens || 0;
        const km = (data.totalKm || 0) >= 1000
            ? (data.totalKm / 1000).toFixed(1) + 'k'
            : data.totalKm || 0;
        document.getElementById('stat-km').textContent = km;
    } catch(e) {
        console.error('Erro ao carregar stats:', e);
    }
}

async function loadRanking() {
    const container = document.getElementById('ranking-content');
    const now = Date.now();

    if (cachedData && (now - cacheTime) < CACHE_TTL) {
        renderRanking(cachedData);
        return;
    }

    container.innerHTML = '<div class="loading">Carregando ranking...</div>';

    try {
        const r = await fetch(API + '/api/ranking.php?t=' + currentTab + '&_=' + Date.now());
        const data = await r.json();
        cachedData = data;
        cacheTime = now;
        renderRanking(data);
    } catch(e) {
        container.innerHTML = '<div class="error">Erro ao carregar ranking. Tente novamente.</div>';
    }
}

function renderRanking(data) {
    const container = document.getElementById('ranking-content');
    const list = data.ranking || [];

    if (list.length === 0) {
        container.innerHTML = '<div class="error">Nenhum dado disponivel ainda.</div>';
        return;
    }

    let html = '<table class="rank-table"><thead><tr>' +
        '<th>#</th><th>' + (currentTab === 'empresas' ? 'Empresa' : 'Motorista') + '</th>' +
        '<th>Viagens</th><th>KM</th><th>Pontuacao</th>' +
        (currentTab === 'motoristas' ? '<th>Empresa</th>' : '') +
        '</tr></thead><tbody>';

    list.forEach(function(item, i) {
        const pos = i + 1;
        const posClass = pos <= 3 ? ' rank-' + pos : '';
        const km = (item.km || 0) >= 1000 ? ((item.km / 1000).toFixed(1) + 'k') : (item.km || 0);
        const pts = (item.pontuacao || 0) >= 1000 ? ((item.pontuacao / 1000).toFixed(1) + 'k') : (item.pontuacao || 0);

        html += '<tr><td class="rank-pos' + posClass + '">' + pos + 'o</td>';
        html += '<td class="rank-name' + posClass + '">' + (item.nome || '-') + '</td>';
        html += '<td class="rank-stat">' + (item.viagens || 0) + '</td>';
        html += '<td class="rank-stat">' + km + '</td>';
        html += '<td class="rank-stat" style="color:#f5c842;font-weight:700;">' + pts + '</td>';
        if (currentTab === 'motoristas') {
            html += '<td class="rank-stat">' + (item.empresa || 'Lobo Solitario') + '</td>';
        }
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    var syncInfo = document.getElementById('sync-info');
    if (syncInfo) {
        syncInfo.textContent = 'Atualizado automaticamente a cada 5 minutos';
    }
}

document.querySelectorAll('.tabs button').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        cachedData = null;
        loadRanking();
    });
});

loadStats();
loadRanking();
setInterval(function() { loadStats(); loadRanking(); }, 60000);
