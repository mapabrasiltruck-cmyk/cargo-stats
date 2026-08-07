(function() {
const RECORDS_KEY = 'cargo_hall_records';
const RECORDS_CACHE_MS = 60000;
const NOTIF_KEY = 'cargo_hall_notified';

let records = [];
let campeoesMensais = [];
let empresasRanking = [];
let loading = false;
let currentUser = null;
let activeTab = 'hall';
let searchQuery = '';

function getMedalEmoji(i) {
    return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
}
function getMedalColor(i) {
    return i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#555';
}

function loadCache() {
    try {
        const raw = localStorage.getItem(RECORDS_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (Date.now() - data.timestamp < RECORDS_CACHE_MS) {
                records = data.records || [];
                campeoesMensais = data.campeoesMensais || [];
                empresasRanking = data.empresasRanking || [];
                return true;
            }
        }
    } catch (e) {}
    return false;
}
function saveCache() {
    try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify({ records, campeoesMensais, empresasRanking, timestamp: Date.now() }));
    } catch (e) {}
}

function checkNewRecords(oldRecords, newRecords) {
    if (!oldRecords || !newRecords) return [];
    const notified = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    const changes = [];
    newRecords.forEach(nr => {
        if (!nr.nome) return;
        const old = oldRecords.find(r => r.id === nr.id);
        if (old) {
            if (old.nome !== nr.nome) {
                changes.push({ type: 'new_holder', record: nr, oldHolder: old.nome });
            } else if (old.valor !== nr.valor) {
                changes.push({ type: 'improved', record: nr });
            }
        }
    });
    return changes.filter(c => !notified[c.record.id + '_' + c.type + '_' + (c.oldHolder || '')]);
}

function showNotification(change) {
    const toast = document.createElement('div');
    toast.className = 'hall-toast';
    if (change.type === 'new_holder') {
        toast.innerHTML = '🏆 NOVO RECORDE! <strong>' + escapeHTML(change.record.nome) + '</strong> assumiu <strong>' + escapeHTML(change.record.label) + '</strong>!';
    } else if (change.type === 'improved') {
        toast.innerHTML = '📈 RECORDE SUPERADO! <strong>' + escapeHTML(change.record.nome) + '</strong> melhorou em <strong>' + escapeHTML(change.record.label) + '</strong>!';
    }
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('hall-toast-show'), 50);
    setTimeout(() => { toast.classList.remove('hall-toast-show'); setTimeout(() => toast.remove(), 400); }, 4000);
}

function dismissNotification(change) {
    const notified = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    notified[change.record.id + '_' + change.type + '_' + (c.oldHolder || '')] = true;
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notified));
}

function shareRecord(text) {
    if (navigator.share) {
        navigator.share({ text });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            const el = document.createElement('div');
            el.className = 'hall-toast hall-toast-share';
            el.textContent = '✅ Link copiado!';
            document.body.appendChild(el);
            setTimeout(() => el.classList.add('hall-toast-show'), 50);
            setTimeout(() => { el.classList.remove('hall-toast-show'); setTimeout(() => el.remove(), 400); }, 2000);
        }).catch(() => {});
    }
}

async function fetchData() {
    loading = true;
    try {
        const [hallRes, empresasRes] = await Promise.all([
            fetch('/api/hall'),
            fetch('/api/hall/empresas')
        ]);
        const hallJson = await hallRes.json();
        const empresasJson = await empresasRes.json();

        const oldRecords = records;
        if (hallJson.records) {
            records = hallJson.records;
            campeoesMensais = hallJson.campeoesMensais || [];
        }
        if (empresasJson.ranking) {
            empresasRanking = empresasJson.ranking;
        }

        saveCache();

        if (oldRecords && oldRecords.length > 0) {
            const changes = checkNewRecords(oldRecords, records);
            changes.forEach(c => {
                showNotification(c);
                dismissNotification(c);
            });
        }
    } catch (e) {
        if (!loadCache()) { records = []; campeoesMensais = []; empresasRanking = []; }
    }
    loading = false;
}

function renderRecordCard(rec, index) {
    const isUser = currentUser && rec.nome && rec.nome === currentUser.nome;
    const medal = getMedalEmoji(index);
    const medalColor = getMedalColor(index);

    const card = document.createElement('div');
    card.className = 'hall-card' + (isUser ? ' hall-card-user' : '');
    card.style.setProperty('--card-delay', (index * 0.06) + 's');
    card.style.setProperty('--medal-color', medalColor);

    let html = '';
    if (medal) html += '<div class="hall-card-medal">' + medal + '</div>';
    html += '<div class="hall-card-icon">' + rec.icon + '</div>';
    html += '<div class="hall-card-label">' + escapeHTML(rec.label) + '</div>';
    html += '<div class="hall-card-value" style="color:' + (index < 3 ? medalColor : 'var(--accent-gold)') + '">' + escapeHTML(rec.formatado) + '</div>';

    if (rec.nome) {
        html += '<div class="hall-card-holder"><a href="perfil_local.html?motorista=' + encodeURIComponent(rec.nome) + '" class="hall-card-link">👤 ' + escapeHTML(rec.nome) + '</a>';
        if (rec.empresa) html += ' <a href="empresa_local.html?empresa=' + encodeURIComponent(rec.empresa) + '" class="hall-card-empresa">🏢 ' + escapeHTML(rec.empresa) + '</a>';
        html += '</div>';
    }

    if (isUser) html += '<div class="hall-card-you-badge">⚡ VOCÊ</div>';

    const shareText = rec.nome ? '🏆 ' + rec.label + ': ' + rec.formatado + ' por ' + rec.nome + ' (' + rec.empresa + ')' : '';
    if (rec.nome) html += '<button class="hall-card-share" data-share="' + escapeHTML(shareText) + '">📤</button>';

    card.innerHTML = html;

    const shareBtn = card.querySelector('.hall-card-share');
    if (shareBtn) {
        shareBtn.onclick = (e) => {
            e.stopPropagation();
            shareRecord(shareBtn.getAttribute('data-share'));
        };
    }

    return card;
}

function renderEmpresasTab() {
    const container = document.createElement('div');
    container.className = 'hall-empresas';

    const title = document.createElement('div');
    title.className = 'hall-title';
    title.innerHTML = '🏢 HALL DAS EMPRESAS';
    container.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'hall-subtitle';
    subtitle.textContent = 'Ranking completo de empresas';
    container.appendChild(subtitle);

    if (!empresasRanking || empresasRanking.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="empty-icon">🏢</div><div class="empty-title">Nenhuma empresa cadastrada</div>';
        container.appendChild(empty);
        return container;
    }

    const table = document.createElement('table');
    table.className = 'hall-empresas-table';
    table.innerHTML = '<thead><tr><th>#</th><th>Empresa</th><th>Motoristas</th><th>Viagens</th><th>KM</th><th>Pontos</th></tr></thead><tbody></tbody>';

    const tbody = table.querySelector('tbody');
    empresasRanking.forEach((emp, i) => {
        const medal = getMedalEmoji(i);
        const tr = document.createElement('tr');
        tr.className = i < 3 ? 'hall-empresa-row-' + ['gold','silver','bronze'][i] : '';
        tr.innerHTML = '<td class="hall-empresa-rank">' + (medal || '#' + (i + 1)) + '</td>' +
            '<td class="hall-empresa-name"><a href="empresa_local.html?empresa=' + encodeURIComponent(emp.nome) + '">' + escapeHTML(emp.nome) + '</a></td>' +
            '<td>' + emp.motoristas + '</td>' +
            '<td>' + emp.viagens + '</td>' +
            '<td>' + (emp.km || 0).toLocaleString() + '</td>' +
            '<td><strong>' + (emp.pontuacao || 0).toLocaleString() + '</strong></td>';
        tbody.appendChild(tr);
    });

    container.appendChild(table);
    return container;
}

function renderHallTab() {
    const frame = document.createElement('div');
    frame.className = 'hall-frame';

    if (records.some(r => r.nome)) {
        const searchBar = document.createElement('div');
        searchBar.className = 'hall-search';
        searchBar.innerHTML = '<input type="text" class="hall-search-input" placeholder="🔍 Buscar motorista, empresa ou recorde..." value="' + escapeHTML(searchQuery) + '">';
        const input = searchBar.querySelector('.hall-search-input');
        input.oninput = () => {
            searchQuery = input.value;
            const cards = frame.querySelectorAll('.hall-card');
            const q = searchQuery.toLowerCase();
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = (!q || text.includes(q)) ? '' : 'none';
            });
        };
        frame.appendChild(searchBar);
    }

    const title = document.createElement('div');
    title.className = 'hall-title';
    title.innerHTML = '🏛️ HALL DA FAMA';
    frame.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'hall-subtitle';
    subtitle.textContent = 'Recordes individuais dos motoristas';
    frame.appendChild(subtitle);

    if (records.length === 0 && !loading) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="empty-icon">🏛️</div><div class="empty-title">Nenhum recorde ainda</div><div class="empty-desc">Os recordes aparecerão aqui quando motoristas começarem a fazer viagens</div>';
        frame.appendChild(empty);
    } else {
        const grid = document.createElement('div');
        grid.className = 'hall-grid';
        records.forEach((rec, i) => {
            const card = renderRecordCard(rec, i);
            grid.appendChild(card);
        });
        frame.appendChild(grid);
    }

    if (campeoesMensais && campeoesMensais.length > 0) {
        const mcSection = document.createElement('div');
        mcSection.className = 'hall-mc-section';

        const mcTitle = document.createElement('div');
        mcTitle.className = 'hall-mc-title';
        mcTitle.innerHTML = '📅 CAMPEÕES MENSAIS';
        mcSection.appendChild(mcTitle);

        const mcGrid = document.createElement('div');
        mcGrid.className = 'hall-mc-grid';

        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        [...campeoesMensais].reverse().forEach((mc, i) => {
            const mcCard = document.createElement('div');
            mcCard.className = 'hall-mc-card';
            mcCard.style.setProperty('--delay', (i * 0.08) + 's');
            mcCard.innerHTML = '<div class="hall-mc-medal">🥇</div>' +
                '<div class="hall-mc-month">' + meses[mc.mes - 1] + ' ' + mc.ano + '</div>' +
                '<div class="hall-mc-name"><a href="perfil_local.html?motorista=' + encodeURIComponent(mc.motorista) + '">👤 ' + escapeHTML(mc.motorista) + '</a></div>' +
                '<div class="hall-mc-empresa"><a href="empresa_local.html?empresa=' + encodeURIComponent(mc.empresa) + '">🏢 ' + escapeHTML(mc.empresa) + '</a></div>' +
                '<div class="hall-mc-stats"><span>⭐ ' + (mc.pontos || 0).toLocaleString() + '</span><span>📦 ' + (mc.viagens || 0) + '</span><span>🛣️ ' + (mc.km || 0).toLocaleString() + ' km</span></div>';
            mcGrid.appendChild(mcCard);
        });

        mcSection.appendChild(mcGrid);
        frame.appendChild(mcSection);
    }

    return frame;
}

function renderPage() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.className = 'page-enter';

    const nav = renderNav('hfama_local.html');
    app.appendChild(nav);

    const tabBar = document.createElement('div');
    tabBar.className = 'hall-tabs';
    const tabs = [
        { id: 'hall', label: '🏛️ Recordes' },
        { id: 'empresas', label: '🏢 Empresas' }
    ];
    tabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'hall-tab' + (activeTab === t.id ? ' hall-tab-active' : '');
        btn.textContent = t.label;
        btn.onclick = () => { activeTab = t.id; renderPage(); };
        tabBar.appendChild(btn);
    });
    app.appendChild(tabBar);

    let content;
    if (activeTab === 'hall') {
        content = renderHallTab();
    } else if (activeTab === 'empresas') {
        content = renderEmpresasTab();
    }
    if (content) app.appendChild(content);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText = '● Hall da Fama | ' + records.length + ' recordes | ' + empresasRanking.length + ' empresas';
        statusEl.className = 'status-bar connected';
    }
}

async function init() {
    currentUser = getAuthUser();
    showLoading('app', 'Carregando Hall da Fama...');
    if (!loadCache()) await fetchData();
    renderPage();
    setInterval(async () => { await fetchData(); renderPage(); }, 120000);
}

init();
})();
