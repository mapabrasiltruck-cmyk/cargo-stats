// ========== XSS SANITIZATION ==========
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NIVEIS = [
    { nome: 'Calouro',  min: 0,        max: 999,     icon: '🔰', color: '#4CAF50' },
    { nome: 'Bronze',   min: 1000,     max: 99999,   icon: '🥉', color: '#cd7f32' },
    { nome: 'Prata',    min: 100000,   max: 499999,  icon: '🥈', color: '#c0c0c0' },
    { nome: 'Ouro',     min: 500000,   max: 999999,  icon: '🥇', color: '#ffd700' },
    { nome: 'Diamante', min: 1000000,  max: 1999999, icon: '💎', color: '#00e5ff' },
    { nome: 'Elite',    min: 2000000,  max: 4999999, icon: '🌟', color: '#ff6b35' },
    { nome: 'Lendário', min: 5000000,  max: Infinity, icon: '👑', color: '#ff0000' }
];

const CARGOS = {
    'Aprendiz': '#FF9800',
    'Em treinamento': '#FF5722',
    'Trainee': '#607D8B',
    'Pleno': '#4CAF50',
    'Senior': '#2196F3',
    'Master': '#9C27B0',
    'Elite': '#FFD700',
    'Motorista': '#888'
};

function getNivel(pontuacao) {
    let nivel = NIVEIS[0];
    for (let i = NIVEIS.length - 1; i >= 0; i--) {
        if (pontuacao >= NIVEIS[i].min) {
            nivel = NIVEIS[i];
            break;
        }
    }
    return nivel;
}

function getNivelBadge(pontuacao) {
    const n = getNivel(pontuacao);
    return `<span class="nivel-badge" style="border-color:${n.color};color:${n.color}">${n.icon} ${n.nome}</span>`;
}

function getPlanoBadgeHTML(plano) {
    const map = {
        bronze: { icon: '🥉', label: 'Bronze', color: '#cd7f32' },
        gold: { icon: '🥇', label: 'Gold', color: '#ffd700' },
        vip: { icon: '💎', label: 'VIP', color: '#b366ff' }
    };
    const p = map[plano] || map.bronze;
    if (plano === 'bronze' || !plano) return '';
    return `<span class="plano-badge" style="color:${p.color};border-color:${p.color};">${p.icon} ${p.label}</span>`;
}

function getNivelInfo(pontuacao) {
    let nivelAtual = NIVEIS[0];
    let nivelProximo = NIVEIS[1];

    for (let i = NIVEIS.length - 1; i >= 0; i--) {
        if (pontuacao >= NIVEIS[i].min) {
            nivelAtual = NIVEIS[i];
            nivelProximo = NIVEIS[i + 1] || null;
            break;
        }
    }

    const progresso = nivelProximo
        ? Math.min(((pontuacao - nivelAtual.min) / (nivelProximo.min - nivelAtual.min)) * 100, 100)
        : 100;

    return { nivelAtual, nivelProximo, progresso };
}

function getMesAtual() {
    const now = new Date();
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return {
        mes: now.getMonth() + 1,
        ano: now.getFullYear(),
        label: monthNames[now.getMonth()] + ' ' + now.getFullYear()
    };
}

function getViagensDoMes(viagens, mes, ano) {
    const prefix = `${ano}-${String(mes).padStart(2, '0')}`;
    return viagens.filter(v => v.data && v.data.startsWith(prefix));
}

function getWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { inicio: monday, fim: sunday };
}

function getViagensDaSemana(viagens) {
    const { inicio, fim } = getWeekRange();
    return viagens.filter(v => {
        const d = new Date(v.data);
        return d >= inicio && d <= fim;
    });
}

function agruparPorEmpresa(viagens) {
    const map = {};
    viagens.forEach(v => {
        if (!map[v.empresa]) {
            map[v.empresa] = { nome: v.empresa, viagens: 0, km: 0, pontuacao: 0 };
        }
        map[v.empresa].viagens++;
        map[v.empresa].km += v.km;
        map[v.empresa].pontuacao += v.pontuacao;
    });
    return Object.values(map).sort((a, b) => b.pontuacao - a.pontuacao);
}

function agruparPorMotorista(viagens) {
    const map = {};
    viagens.forEach(v => {
        if (!map[v.motorista]) {
            map[v.motorista] = { nome: v.motorista, empresa: v.empresa, viagens: 0, km: 0, pontuacao: 0 };
        }
        map[v.motorista].viagens++;
        map[v.motorista].km += v.km;
        map[v.motorista].pontuacao += v.pontuacao;
    });
    return Object.values(map).sort((a, b) => b.pontuacao - a.pontuacao);
}

function formatValue(rawValue, w) {
    let numericValue = parseFloat(rawValue);
    if (w.format) {
        try {
            return w.format.replace(/\{value(:[^}]+)?\}/g, (match, fmt) => {
                const divisor = w.unit === 'km' ? 1000 : 1;
                if (fmt) {
                    if (fmt === ':.0f') return Math.round(numericValue / divisor);
                    if (fmt === ':.1f') return (numericValue / divisor).toFixed(1);
                    if (fmt === ':.2f') return (numericValue / divisor).toFixed(2);
                }
                return rawValue;
            });
        } catch(e) { return rawValue; }
    }
    if (w.unit === '%' && !isNaN(numericValue)) {
        if (w.max && w.max <= 1) return (numericValue * 100).toFixed(0) + '%';
        return numericValue.toFixed(0) + '%';
    }
    if (w.unit === 'km/h' && !isNaN(numericValue)) return Math.round(numericValue) + ' km/h';
    if (w.unit === 'rpm' && !isNaN(numericValue)) return Math.round(numericValue) + ' rpm';
    if (w.unit === 'L' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' L';
    if (w.unit === '°C' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' °C';
    if (w.unit === 'bar' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' bar';
    if (w.unit === 'V' && !isNaN(numericValue)) return numericValue.toFixed(1) + ' V';
    if (w.unit === 'km' && !isNaN(numericValue)) return (numericValue / 1000).toFixed(1) + ' km';
    if (w.unit === 'min' && !isNaN(numericValue)) return Math.round(numericValue) + ' min';
    if (w.unit === '€' && !isNaN(numericValue)) return '\u20AC' + numericValue.toLocaleString();
    if (!isNaN(numericValue)) return numericValue.toFixed(1);
    return rawValue;
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
}

// ========== AUTH FUNCTIONS ==========

async function initAuth() {
    if (!window.cargoStats) return;
    try {
        const localToken = localStorage.getItem('cargo_token');
        const saved = await window.cargoStats.loadCredentials();
        if (saved && saved.token) {
            if (!localToken) {
                localStorage.setItem('cargo_token', saved.token);
                if (saved.user) localStorage.setItem('cargo_user', JSON.stringify(saved.user));
                if (saved.email) localStorage.setItem('cargo_login_email', saved.email);
            }
        } else if (localToken && saved === null) {
            const user = localStorage.getItem('cargo_user');
            const email = localStorage.getItem('cargo_login_email');
            await window.cargoStats.saveCredentials({
                token: localToken,
                user: user ? JSON.parse(user) : null,
                email: email || ''
            });
        }
    } catch (e) {}
}

function getAuthToken() {
    return localStorage.getItem('cargo_token');
}

function getAuthUser() {
    const data = localStorage.getItem('cargo_user');
    if (!data) return null;
    try { return JSON.parse(data); } catch(e) { return null; }
}

function setAuth(token, user) {
    localStorage.setItem('cargo_token', token);
    localStorage.setItem('cargo_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('cargo_token');
    localStorage.removeItem('cargo_user');
}

function isLoggedIn() {
    return !!getAuthToken();
}

function isAdmin() {
    const user = getAuthUser();
    return user && user.tipo === 'admin' && user.email === 'admin@cargostats.com';
}

async function authFetch(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = getAuthToken();
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, options);
    if (response.status === 401) {
        clearAuth();
        window.location.href = 'login_local.html';
        return null;
    }
    return response;
}

// ========== NAVIGATION ==========

function renderNav(activePage) {
    const nav = document.createElement('nav');
    nav.className = 'nav-bar';

    const brand = document.createElement('span');
    brand.className = 'nav-brand';
    brand.innerHTML = '<img src="images/logo.png" alt="CS" style="height:18px;vertical-align:middle;margin-right:6px;">CARGO STATS';
    nav.appendChild(brand);

    const links = document.createElement('div');
    links.className = 'nav-links';

    const user = getAuthUser();

    const pages = [
        { name: 'Dashboard', file: 'dashboard_local.html', icon: '&#9632;' },
        { name: 'Ranking', file: 'empresas_local.html', icon: '&#9733;' },
        { name: 'Comunidade', file: 'comunidade_local.html', icon: '&#9783;' }
    ];

    if (user && user.tipo !== 'admin') {
        if (user.empresa && user.empresa !== 'Lobo Solitário') {
            pages.splice(1, 0, { name: 'Minha Empresa', file: 'empresa_local.html?empresa=' + encodeURIComponent(user.empresa), icon: '&#9733;' });
            pages.splice(2, 0, { name: 'Premiação', file: 'premiacao_local.html?empresa=' + encodeURIComponent(user.empresa), icon: '&#127942;' });
            pages.splice(3, 0, { name: 'Vagas', file: 'vagas_local.html', icon: '&#128203;' });
        } else {
            pages.splice(1, 0, { name: 'Meu Perfil', file: 'perfil_local.html?motorista=' + encodeURIComponent(user.nome), icon: '&#128100;' });
            pages.splice(2, 0, { name: 'Premiação', file: 'premiacao_local.html?motorista=' + encodeURIComponent(user.nome), icon: '&#127942;' });
            pages.splice(3, 0, { name: 'Encontrar Empresa', file: 'lobo_local.html', icon: '&#128269;' });
            pages.splice(4, 0, { name: 'Vagas', file: 'vagas_local.html', icon: '&#128203;' });
        }
    }
    if (user && user.tipo === 'admin') {
        pages.splice(1, 0, { name: 'Premiação', file: 'premiacao_local.html?motorista=' + encodeURIComponent(user.nome), icon: '&#127942;' });
    }

    if (user) {
        pages.push({ name: 'Loja', file: 'loja_local.html', icon: '&#128722;' });
        pages.push({ name: 'Hall da Fama', file: 'hfama_local.html', icon: '&#127942;' });
    }

    if (user && user.tipo === 'admin') {
        pages.push({ name: 'Admin', file: 'admin_local.html', icon: '&#9881;' });
    }

    pages.forEach(p => {
        const a = document.createElement('a');
        a.className = 'nav-link' + (p.file.split('?')[0] === activePage ? ' active' : '');
        a.href = p.file;
        a.innerHTML = (p.icon ? `<span style="margin-right:4px;">${p.icon}</span>` : '') + p.name;
        links.appendChild(a);
    });

    nav.appendChild(links);

    const userDiv = document.createElement('div');
    userDiv.className = 'nav-user';

    // Notification bell
    const notifWrap = document.createElement('div');
    notifWrap.style.cssText = 'position:relative;display:flex;align-items:center;margin-right:8px;';
    const notifBtn = document.createElement('span');
    notifBtn.className = 'notif-bell';
    notifBtn.textContent = '🔔';
    notifBtn.id = 'notif-bell-btn';
    const notifBadge = document.createElement('span');
    notifBadge.className = 'notif-badge';
    notifBadge.style.display = 'none';
    notifBadge.textContent = '0';
    notifBtn.appendChild(notifBadge);
    notifWrap.appendChild(notifBtn);
    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = document.getElementById('notif-dropdown');
        if (existing) { existing.remove(); return; }
        const dd = renderNotifDropdown();
        dd.id = 'notif-dropdown';
        notifWrap.appendChild(dd);
        atualizarNotifBadge();
    });
    document.addEventListener('click', () => {
        const dd = document.getElementById('notif-dropdown');
        if (dd) dd.remove();
    }, { capture: true });
    // Update badge on notification changes
    onNotifChange(() => atualizarNotifBadge());
    setTimeout(atualizarNotifBadge, 100);
    userDiv.appendChild(notifWrap);

    if (user) {
        const perfilUrl = `perfil_local.html?motorista=${encodeURIComponent(user.nome)}`;
        userDiv.insertAdjacentHTML('beforeend', `
            <a href="${perfilUrl}" style="text-decoration:none;color:#e0e0e0;">
                <span class="nav-user-name">${escapeHTML(user.nome)}</span>
            </a>
            <span class="nav-user-tipo">${escapeHTML(user.empresa ? user.empresa : (user.tipo === 'admin' ? 'Admin' : 'Lobo Solit\u00e1rio'))}</span>
            <button class="nav-btn-logout" id="btn-logout">Sair</button>`);
        setTimeout(() => {
            const btn = document.getElementById('btn-logout');
            if (btn) btn.addEventListener('click', fazerLogout);
        }, 0);
    } else {
        userDiv.insertAdjacentHTML('beforeend', `
            <a class="nav-link" href="login_local.html">Entrar</a>`);
    }
    nav.appendChild(userDiv);

    return nav;
}

async function fazerLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getAuthToken() }
        });
    } catch(e) {}
    clearAuth();
    localStorage.removeItem('cargo_login_email');
    if (window.cargoStats && window.cargoStats.clearCredentials) {
        window.cargoStats.clearCredentials();
    }
    window.location.href = window.location.origin + '/login_local.html';
}

async function fetchJSON(url) {
    try {
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(url + separator + '_=' + Date.now());
        if (!response.ok) throw new Error('Servidor offline');
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return { data, error: null };
    } catch(e) {
        return { data: null, error: e.message };
    }
}

// ========== ERROR BOUNDARY ==========
function withErrorBoundary(fn, fallbackMsg) {
    return async function(...args) {
        try {
            const result = await fn.apply(this, args);
            return result;
        } catch (e) {
            console.error('[ErrorBoundary]', fallbackMsg || fn.name, e);
            showToast(fallbackMsg || 'Ocorreu um erro inesperado', 'error', 5000);
            return null;
        }
    };
}

// ========== NOTIFICATION SYSTEM ==========
let notifications = [];
let notifListeners = [];

function loadNotifications() {
    try {
        const saved = localStorage.getItem('cargo_notifications');
        if (saved) notifications = JSON.parse(saved);
    } catch (e) { notifications = []; }
}

function saveNotifications() {
    try {
        localStorage.setItem('cargo_notifications', JSON.stringify(notifications));
    } catch (e) {}
}

function addNotification(title, icon, type) {
    const notif = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: title,
        icon: icon || '🔔',
        type: type || 'info',
        time: new Date().toISOString(),
        read: false
    };
    notifications.unshift(notif);
    if (notifications.length > 50) notifications = notifications.slice(0, 50);
    saveNotifications();
    notifListeners.forEach(fn => fn(notifications));
    return notif;
}

function markNotifRead(id) {
    const n = notifications.find(x => x.id === id);
    if (n) n.read = true;
    saveNotifications();
    notifListeners.forEach(fn => fn(notifications));
}

function markAllNotifRead() {
    notifications.forEach(n => n.read = true);
    saveNotifications();
    notifListeners.forEach(fn => fn(notifications));
}

function getUnreadNotifCount() {
    return notifications.filter(n => !n.read).length;
}

function clearAllNotif() {
    notifications = [];
    saveNotifications();
    notifListeners.forEach(fn => fn(notifications));
}

function removeNotif(id) {
    notifications = notifications.filter(n => n.id !== id);
    saveNotifications();
    notifListeners.forEach(fn => fn(notifications));
}

function onNotifChange(fn) {
    notifListeners.push(fn);
    return () => { notifListeners = notifListeners.filter(f => f !== fn); };
}

function renderNotifDropdown() {
    const container = document.createElement('div');
    container.className = 'notif-dropdown';
    container.innerHTML = `
        <div class="notif-dropdown-header">
            <span>NOTIFICAÇÕES</span>
            <div style="display:flex;gap:8px;">
                <button class="notif-btn-clear" onclick="clearAllNotif(); this.closest('.notif-dropdown').remove(); atualizarNotifBadge()">Apagar todas</button>
                <button onclick="markAllNotifRead(); this.closest('.notif-dropdown').remove(); atualizarNotifBadge()">Marcar lidas</button>
            </div>
        </div>
        <div class="notif-list"></div>`;
    const list = container.querySelector('.notif-list');
    if (notifications.length === 0) {
        list.innerHTML = '<div class="notif-empty">Nenhuma notificação</div>';
    } else {
        notifications.forEach(n => {
            const item = document.createElement('div');
            item.className = 'notif-item' + (n.read ? '' : ' unread');
            item.innerHTML = `
                <span class="notif-icon">${n.icon}</span>
                <div class="notif-body">
                    <div class="notif-title">${escapeHTML(n.title)}</div>
                    <div class="notif-time">${timeAgo(new Date(n.time))}</div>
                </div>
                <span class="notif-btn-del" data-id="${n.id}">✕</span>`;
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('notif-btn-del')) return;
                markNotifRead(n.id);
                item.classList.remove('unread');
                atualizarNotifBadge();
            });
            const delBtn = item.querySelector('.notif-btn-del');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeNotif(n.id);
                item.remove();
                if (notifications.length === 0) {
                    list.innerHTML = '<div class="notif-empty">Nenhuma notificação</div>';
                }
                atualizarNotifBadge();
            });
            list.appendChild(item);
        });
    }
    return container;
}

function atualizarNotifBadge() {
    const badges = document.querySelectorAll('.notif-badge');
    const count = getUnreadNotifCount();
    badges.forEach(b => {
        b.textContent = count > 99 ? '99+' : count;
        b.style.display = count > 0 ? 'flex' : 'none';
    });
}

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date) / 1000);
    if (seconds < 60) return 'agora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return 'há ' + minutes + 'min';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return 'há ' + hours + 'h';
    const days = Math.floor(hours / 24);
    if (days < 30) return 'há ' + days + 'd';
    return date.toLocaleDateString('pt-BR');
}

// Notifications about trip records
window.addEventListener('cargo-trip-recorded', (e) => {
    const d = e.detail || {};
    addNotification(`Viagem registrada: ${d.km || 0}km — ${d.pontuacao || 0}pts`, '🚛', 'success');
});

loadNotifications();

// ========== DAILY MISSIONS ==========
const MISSIONS_KEY = 'cargo_missions';
const MISSIONS_RESET_HOUR = 6; // reset at 6 AM

function getMissionResetTime() {
    const now = new Date();
    const reset = new Date(now);
    reset.setHours(MISSIONS_RESET_HOUR, 0, 0, 0);
    if (now >= reset) reset.setDate(reset.getDate() + 1);
    return reset;
}

function getDaysSinceEpoch() {
    return Math.floor(Date.now() / 86400000);
}

function loadMissions() {
    try {
        const saved = localStorage.getItem(MISSIONS_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.day === getDaysSinceEpoch()) return data.missions;
        }
    } catch (e) {}
    return null;
}

function saveMissions(missions) {
    try {
        localStorage.setItem(MISSIONS_KEY, JSON.stringify({ day: getDaysSinceEpoch(), missions: missions }));
    } catch (e) {}
}

function generateDailyMissions(stats) {
    const pool = [
        { id: 'km', icon: '🛣️', title: 'Rodar KM', desc: 'Percorra {target}km hoje', field: 'km', targetBase: 500, reward: 50, unit: 'km' },
        { id: 'trips', icon: '📦', title: 'Entregas', desc: 'Faça {target} entregas hoje', field: 'trips', targetBase: 3, reward: 30, unit: '' },
        { id: 'points', icon: '⭐', title: 'Ganhe Pontos', desc: 'Acumule {target} pontos hoje', field: 'points', targetBase: 1000, reward: 75, unit: 'pts' },
        { id: 'fuel', icon: '⛽', title: 'Economize Combustível', desc: 'Gaste menos de {target}L de combustível', field: 'fuel', targetBase: 200, reward: 40, unit: 'L' },
        { id: 'cargo', icon: '🚛', title: 'Carga Especial', desc: 'Entregue {target} cargas', field: 'special', targetBase: 1, reward: 60, unit: '' },
        { id: 'streak', icon: '🔥', title: 'Streak', desc: 'Mantenha a sequência de {target} dias', field: 'streak', targetBase: 3, reward: 100, unit: 'dias' }
    ];
    // Pick 3 random missions
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);
    const day = getDaysSinceEpoch();
    const seed = day % selected.length;
    return selected.map((m, i) => {
        const target = m.targetBase + ((day + i * 7) % (m.targetBase * 3));
        return {
            ...m,
            target: target,
            progress: 0,
            claimed: false,
            completed: false,
            reward: m.reward + Math.floor((day % 10) * 5)
        };
    });
}

function updateMissionProgress(field, amount) {
    const missions = loadMissions();
    if (!missions) return;
    let changed = false;
    missions.forEach(m => {
        if (m.field === field && !m.completed) {
            m.progress = Math.min(m.progress + amount, m.target);
            if (m.progress >= m.target) {
                m.completed = true;
                addNotification(`Missão concluída: ${m.title}! Recompensa: ${m.reward} gold`, '🎯', 'success');
            }
            changed = true;
        }
    });
    if (changed) saveMissions(missions);
    return missions;
}

function claimMissionReward(missionId) {
    const missions = loadMissions();
    if (!missions) return false;
    const mission = missions.find(m => m.id === missionId);
    if (!mission || !mission.completed || mission.claimed) return false;
    mission.claimed = true;
    saveMissions(missions);
    addNotification(`Recompensa recebida: ${mission.reward} gold por "${mission.title}"`, '💰', 'success');
    // Fire event for gold update
    window.dispatchEvent(new CustomEvent('cargo-gold-earned', { detail: { amount: mission.reward } }));
    return true;
}

function getMissionsEligible() {
    const missions = loadMissions();
    if (missions) return missions;
    const newMissions = generateDailyMissions({});
    saveMissions(newMissions);
    return newMissions;
}

// Listen for trip recording to update missions
window.addEventListener('cargo-trip-recorded', (e) => {
    const d = e.detail || {};
    if (d.km) updateMissionProgress('km', Math.round(d.km));
    if (d.pontuacao) updateMissionProgress('points', d.pontuacao);
    updateMissionProgress('trips', 1);
});

// ========== COMPARE PROFILES ==========
async function compararPerfis(nome1, nome2) {
    if (!nome1 || !nome2) { showToast('Selecione dois motoristas para comparar', 'warning'); return; }
    showToast('Carregando comparação...', 'info', 2000);
    try {
        const [r1, r2] = await Promise.all([
            fetchJSON(`/api/motoristas/estatisticas?motorista=${encodeURIComponent(nome1)}`),
            fetchJSON(`/api/motoristas/estatisticas?motorista=${encodeURIComponent(nome2)}`)
        ]);
        const s1 = r1.data && r1.data.stats;
        const s2 = r2.data && r2.data.stats;
        if (!s1 || !s2) { showToast('Erro ao carregar dados para comparação', 'error'); return; }

        const fields = [
            { label: 'Viagens', get: s => s.viagens || 0, fmt: v => v },
            { label: 'KM', get: s => s.km || 0, fmt: v => (v / 1000).toFixed(1) + 'k' },
            { label: 'Pontos', get: s => s.pontuacao || 0, fmt: v => v.toLocaleString() },
            { label: 'Nível', get: s => getNivel(s.pontuacao || 0).nome, fmt: v => v },
        ];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.classList.add('closing'); overlay.querySelector('.modal-content').classList.add('closing'); setTimeout(() => overlay.remove(), 200); } };
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:600px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="font-size:14px;color:var(--accent-gold);letter-spacing:2px;text-transform:uppercase;">⚖️ Comparação</h2>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;color:#555;font-size:20px;cursor:pointer;">&times;</button>
                </div>
                <table style="width:100%;font-size:12px;border-collapse:collapse;">
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:8px;text-align:left;color:#555;font-size:10px;letter-spacing:1px;">Métrica</th>
                        <th style="padding:8px;text-align:center;color:var(--accent-green);">${escapeHTML(nome1)}</th>
                        <th style="padding:8px;text-align:center;color:#555;width:40px;"></th>
                        <th style="padding:8px;text-align:center;color:var(--accent-gold);">${escapeHTML(nome2)}</th>
                    </tr>
                    ${fields.map(f => {
                        const v1 = f.get(s1);
                        const v2 = f.get(s2);
                        let winner = '';
                        if (typeof v1 === 'number' && typeof v2 === 'number') {
                            winner = v1 > v2 ? '←' : v2 > v1 ? '→' : '=';
                        }
                        return `<tr style="border-bottom:1px solid var(--border-subtle);">
                            <td style="padding:8px;color:#888;font-size:11px;">${f.label}</td>
                            <td style="padding:8px;text-align:center;font-weight:700;color:${winner === '←' ? 'var(--accent-green)' : '#888'}">${f.fmt(v1)}</td>
                            <td style="padding:8px;text-align:center;font-size:14px;color:#555;">${winner}</td>
                            <td style="padding:8px;text-align:center;font-weight:700;color:${winner === '→' ? 'var(--accent-gold)' : '#888'}">${f.fmt(v2)}</td>
                        </tr>`;
                    }).join('')}
                </table>
                <div style="margin-top:16px;font-size:10px;color:#555;text-align:center;">Dados atualizados em tempo real</div>
            </div>`;
        document.body.appendChild(overlay);
    } catch (e) {
        showToast('Erro ao comparar perfis', 'error');
    }
}

async function compararPerfisAleatorio() {
    const user = getAuthUser();
    if (!user || !user.nome) { showToast('Faça login primeiro', 'warning'); return; }
    const { data } = await fetchJSON('/api/ranking/motoristas');
    if (!data || !data.ranking || data.ranking.length < 2) {
        showToast('Sem dados suficientes para comparação', 'error');
        return;
    }
    const others = data.ranking.filter(r => r.nome !== user.nome);
    if (others.length === 0) return;
    const pick = others[Math.floor(Math.random() * others.length)];
    compararPerfis(user.nome, pick.nome);
}

// ========== EVENTOS ==========

async function getEventoAtivo() {
    const { data } = await fetchJSON('/api/eventos/ativo');
    return data ? data.evento : null;
}

async function getProgressoEvento(params) {
    const q = new URLSearchParams(params).toString();
    const res = await authFetch('/api/eventos/progresso?' + q + '&_=' + Date.now());
    if (!res.ok) return null;
    return res.json();
}

function formatCountdown(targetDate) {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return 'ENCERRADO';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// ========== TOAST NOTIFICATION SYSTEM ==========

const TOAST_MAX_VISIBLE = 3;

function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Limit visible toasts
    const visibleToasts = container.querySelectorAll('.toast.show');
    if (visibleToasts.length >= TOAST_MAX_VISIBLE) {
        dismissToast(visibleToasts[0]);
    }

    const icons = {
        success: '&#10003;',
        error: '&#10007;',
        warning: '&#9888;',
        info: '&#9432;'
    };

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg"></span>
        <button class="toast-close">&times;</button>
    `;

    // Safe text assignment for message
    toast.querySelector('.toast-msg').textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    toast.querySelector('.toast-close').addEventListener('click', () => {
        dismissToast(toast);
    });

    if (duration > 0) {
        setTimeout(() => dismissToast(toast), duration);
    }
}

function dismissToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 350);
}

// ========== LOADING STATE HELPERS ==========

function showLoading(container, text) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return;
    text = text || 'Carregando...';
    container.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">${text}</div>
        </div>`;
}

function showSkeleton(container, type) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return;
    type = type || 'card';

    let html = '';
    if (type === 'card') {
        html = '<div class="skeleton skeleton-card"></div>'.repeat(3);
    } else if (type === 'profile') {
        html = `
            <div style="display:flex;align-items:center;gap:16px;padding:20px;">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-text short"></div>
                    <div class="skeleton skeleton-text tiny"></div>
                    <div class="skeleton skeleton-text tiny"></div>
                </div>
            </div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>`;
    } else {
        html = '<div class="skeleton skeleton-text"></div>'.repeat(5);
    }
    container.innerHTML = html;
}

// ========== SHARE PROFILE ==========

function shareProfileUrl(motoristaNome) {
    const baseUrl = window.location.origin;
    const url = baseUrl + '/perfil_local.html?motorista=' + encodeURIComponent(motoristaNome);

    if (navigator.share) {
        navigator.share({
            title: 'Cargo Stats - ' + motoristaNome,
            text: 'Veja o perfil de ' + motoristaNome + ' no Cargo Stats!',
            url: url
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link do perfil copiado!', 'success');
        }).catch(() => {
            showToast('Erro ao copiar link', 'error');
        });
    }
}

// ========== TELEMETRY AUTO-RECORD (runs on all pages) ==========

function getJobHash(cargo, origem, destino) {
    const raw = (cargo || '') + '|' + (origem || '') + '|' + (destino || '');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    return 'job_' + Math.abs(hash).toString(36);
}

function getTelemetryCargoName(data) {
    return getNestedValue(data, 'trailer.name')
        || getNestedValue(data, 'job.cargo.name')
        || getNestedValue(data, 'job.cargo.id')
        || getNestedValue(data, 'trailer.accessoryId')
        || '';
}

function isBusKeywords(model, make) {
    const terms = ['bus', 'coach', 'onibus', 'ônibus', 'marcopolo', 'volare', 'micro', 'viagem', 'passageiro', 'urbano', 'rodoviario', 'executivo', 'comil', 'ciferal', 'neobus', 'caio', 'busscar', 'irizar', 'escolar', 'lotacao', 'fretamento', 'turismo', 'circular'];
    const check = (model + ' ' + make).toLowerCase();
    return terms.some(t => check.includes(t));
}

function clearJobState() {
    autoRecorder.lastCargo = '';
    autoRecorder.lastCargoId = '';
    autoRecorder.lastOrigin = '';
    autoRecorder.lastDestination = '';
    autoRecorder.lastTotalDistance = 0;
    autoRecorder.lastRemainingDistance = 0;
    autoRecorder.lastIncome = 0;
    autoRecorder.lastJobActive = false;
    autoRecorder.inactivePolls = 0;
    autoRecorder.zeroKmPolls = 0;
    autoRecorder.detectedJobType = '';
    autoRecorder.trailerEverAttached = false;
    autoRecorder.cargoNameUpdated = false;
    autoRecorder.maxOdometer = 0;
    autoRecorder.jobStartTime = 0;
    autoRecorder.hasPositiveRemaining = false;
}

let autoRecorder = {
    lastJobActive: false,
    lastCargo: '',
    lastOrigin: '',
    lastDestination: '',
    lastTotalDistance: 0,
    lastRemainingDistance: 0,
    lastIncome: 0,
    lastCargoId: '',
    tripCount: 0,
    isRecording: false,
    processing: false,
    inactivePolls: 0,
    zeroKmPolls: 0,
    lastTrailerAttached: false,
    trailerAttachedBeforeJob: false,
    trailerEverAttached: false,
    initialTruckOdometer: 0,
    maxOdometer: 0,
    jobStartTime: 0,
    lastIdleOdometer: 0,
    detectedJobType: '',
    cargoNameUpdated: false,
    truckModel: '',
    truckMake: '',
    hasPositiveRemaining: false,
    _firstPollPending: true
};

try {
    const saved = localStorage.getItem('cargo_auto_recorder');
    if (saved) {
        const parsed = JSON.parse(saved);
        autoRecorder.tripCount = parsed.tripCount || 0;
        autoRecorder.lastJobActive = parsed.lastJobActive || false;
        autoRecorder.lastCargo = parsed.lastCargo || '';
        autoRecorder.lastOrigin = parsed.lastOrigin || '';
        autoRecorder.lastDestination = parsed.lastDestination || '';
        autoRecorder.lastCargoId = parsed.lastCargoId || '';
        autoRecorder.lastTotalDistance = parsed.lastTotalDistance || 0;
        autoRecorder.lastRemainingDistance = parsed.lastRemainingDistance || 0;
        autoRecorder.lastIncome = parsed.lastIncome || 0;
        autoRecorder.lastTrailerAttached = parsed.lastTrailerAttached || false;
        autoRecorder.trailerAttachedBeforeJob = parsed.trailerAttachedBeforeJob || false;
        autoRecorder.trailerEverAttached = parsed.trailerEverAttached || false;
        autoRecorder.initialTruckOdometer = parsed.initialTruckOdometer || 0;
        autoRecorder.maxOdometer = parsed.maxOdometer || 0;
        autoRecorder.lastIdleOdometer = parsed.lastIdleOdometer || 0;
        autoRecorder.detectedJobType = parsed.detectedJobType || '';
    }
} catch (e) {}

function saveAutoRecorderState() {
    try {
        localStorage.setItem('cargo_auto_recorder', JSON.stringify({
            tripCount: autoRecorder.tripCount,
            lastJobActive: autoRecorder.lastJobActive,
            lastCargo: autoRecorder.lastCargo,
            lastOrigin: autoRecorder.lastOrigin,
            lastDestination: autoRecorder.lastDestination,
            lastCargoId: autoRecorder.lastCargoId,
            lastTotalDistance: autoRecorder.lastTotalDistance,
            lastRemainingDistance: autoRecorder.lastRemainingDistance,
            lastIncome: autoRecorder.lastIncome,
            lastTrailerAttached: autoRecorder.lastTrailerAttached,
            trailerAttachedBeforeJob: autoRecorder.trailerAttachedBeforeJob,
            trailerEverAttached: autoRecorder.trailerEverAttached,
            initialTruckOdometer: autoRecorder.initialTruckOdometer,
            maxOdometer: autoRecorder.maxOdometer,
            lastIdleOdometer: autoRecorder.lastIdleOdometer,
            detectedJobType: autoRecorder.detectedJobType
        }));
    } catch (e) {}
}

function getTelemetryField(data, ...paths) {
    for (const p of paths) {
        const val = getNestedValue(data, p);
        if (val !== undefined && val !== null && val > 0) return val;
    }
    return 0;
}

function isJobActive(data) {
    if (!data || !data.job) return false;
    return data.job.cargoLoaded === true || (data.job.income > 0) || !!(data.job.sourceCity || data.job.destinationCity);
}

function getTelemetryDistanceKm(data) {
    const total = getNestedValue(data, 'job.distance');
    const navDist = getNestedValue(data, 'navigation.estimatedDistance');
    const remaining = getTelemetryField(data, 'job.distance.remaining', 'job.destination.distance');

    let totalKm = total && total > 0 ? Math.round(total / 1000) : 0;

    let remainingKm = 0;
    if (remaining && remaining > 0) {
        remainingKm = Math.round(remaining / 1000);
    } else if (navDist && navDist > 0) {
        remainingKm = Math.round(navDist / 1000);
    }

    // Sanity check: se totalKm e muito maior que remainingKm, o campo
    // job.distance pode estar vindo em unidade errada (hodometro).
    // Usa remainingKm (ou navDist) como fallback confiavel.
    if (totalKm > 0 && remainingKm > 0 && totalKm > remainingKm * 5) {
        if (navDist && navDist > 0) {
            totalKm = Math.round(navDist / 1000);
        } else {
            totalKm = remainingKm;
        }
    }

    return { totalKm, remainingKm };
}

let _processAutoRecordStart = 0;
function processAutoRecord(data) {
    if (autoRecorder.processing) {
        if (_processAutoRecordStart > 0 && Date.now() - _processAutoRecordStart > 5000) {
            autoRecorder.processing = false;
            console.warn('[AUTO-REC] processing stuck — reset after 5s');
        } else {
            return;
        }
    }
    autoRecorder.processing = true;
    _processAutoRecordStart = Date.now();
    try {
    const jobActive = isJobActive(data);
    const trailerAttached = getNestedValue(data, 'trailer.attached') || false;
    const dist = getTelemetryDistanceKm(data);

    // ---- STARTUP RECONCILIATION: first poll after page load ----
    if (autoRecorder._firstPollPending) {
        autoRecorder._firstPollPending = false;
        if (autoRecorder.lastJobActive && !jobActive) {
            console.log('[AUTO-REC] Startup: estado obsoleto detectado (lastJobActive=true mas jobActive=false), limpando...');
            clearJobState();
            saveAutoRecorderState();
            autoRecorder.processing = false;
            return;
        }
    }

    // Track idle odometer (when no job) for quick job detection later
    if (!jobActive) {
        const odometer = getNestedValue(data, 'truck.odometer') || 0;
        if (odometer > 0) autoRecorder.lastIdleOdometer = odometer;
    }

    // Helper: check if this job was already recorded
    function isJobAlreadyRecorded(cargo, origem, destino) {
        const hash = getJobHash(cargo, origem, destino);
        return localStorage.getItem('cargo_last_job_hash') === hash;
    }

    // ---- EARLY DELIVERY: trailer detached + km near 0 ----
    if (jobActive && autoRecorder.lastTrailerAttached && !trailerAttached
        && dist.remainingKm === 0 && autoRecorder.lastCargo && !autoRecorder.isRecording
        && autoRecorder.hasPositiveRemaining
        && !isJobAlreadyRecorded(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination)
        && Date.now() - autoRecorder.jobStartTime > 60000) {
        autoRecorder.isRecording = true;
        saveAutoRecorderState();
        refineJobType();
        const odomKm = Math.max(0, Math.round((autoRecorder.maxOdometer - autoRecorder.initialTruckOdometer) / 1000));
        const recordKm = Math.max(autoRecorder.lastTotalDistance || dist.totalKm, odomKm);
        const msg = getJobTypeLabel(autoRecorder.detectedJobType) + ' Entregue! ' + recordKm + 'km';
        showAutoNotif(msg, '#00ff88');
        autoRecordTrip(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination,
            recordKm, autoRecorder.lastIncome,
            autoRecorder.lastCargoId, getJobHash(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination),
            'completa', 0, autoRecorder.detectedJobType);
        clearJobState();
        saveAutoRecorderState();
        autoRecorder.processing = false;
        return;
    }

    // ---- EARLY DELIVERY: remainingKm = 0 for 5+ sec (ferry fallback) ----
    if (jobActive && dist.remainingKm === 0 && autoRecorder.lastTotalDistance > 0
        && !autoRecorder.isRecording && autoRecorder.lastCargo
        && autoRecorder.hasPositiveRemaining
        && !isJobAlreadyRecorded(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination)
        && Date.now() - autoRecorder.jobStartTime > 60000) {
        autoRecorder.zeroKmPolls++;
        if (autoRecorder.zeroKmPolls >= 20) {
            autoRecorder.isRecording = true;
            saveAutoRecorderState();
            refineJobType();
            const odomKm = Math.max(0, Math.round((autoRecorder.maxOdometer - autoRecorder.initialTruckOdometer) / 1000));
            const recordKm = Math.max(autoRecorder.lastTotalDistance, odomKm);
            const msg = getJobTypeLabel(autoRecorder.detectedJobType) + ' Entregue! ' + recordKm + 'km';
            showAutoNotif(msg, '#00ff88');
            autoRecordTrip(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination,
                recordKm, autoRecorder.lastIncome,
                autoRecorder.lastCargoId, getJobHash(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination),
                'completa', 0, autoRecorder.detectedJobType);
            clearJobState();
            saveAutoRecorderState();
            autoRecorder.processing = false;
            return;
        }
    } else {
        autoRecorder.zeroKmPolls = 0;
    }

    // ---- DEBOUNCED JOB END (3s / 12 polls + 30s time guard) ----
    if (!autoRecorder.isRecording && autoRecorder.lastJobActive && !jobActive && autoRecorder.lastCargo
        && autoRecorder.hasPositiveRemaining
        && Date.now() - autoRecorder.jobStartTime > 30000) {
        autoRecorder.inactivePolls++;
        if (autoRecorder.inactivePolls >= 12) {
            const cargo = autoRecorder.lastCargo;
            const cargoId = autoRecorder.lastCargoId;
            const origin = autoRecorder.lastOrigin;
            const destination = autoRecorder.lastDestination;
            const totalKm = autoRecorder.lastTotalDistance;
            const remainingKm = autoRecorder.lastRemainingDistance;
            const income = autoRecorder.lastIncome;

            const hasBoth = totalKm > 0 && remainingKm > 0;
            const actualKm = hasBoth && totalKm >= remainingKm ? totalKm - remainingKm : (totalKm > 0 ? totalKm : remainingKm);
            // Use odometer difference as fallback (routeDistance may not update in some plugins)
            const odomKm = Math.max(0, Math.round((autoRecorder.maxOdometer - autoRecorder.initialTruckOdometer) / 1000));
            const drivenKm = Math.max(actualKm, odomKm);
            const isComplete = !hasBoth || remainingKm <= 5 || drivenKm >= totalKm * 0.85;

            let penalidade = 0;
            if (!isComplete) {
                const pctCompleto = totalKm > 0 ? actualKm / totalKm : 0;
                penalidade = -(Math.max(25, Math.min(500, Math.round(50 + (1 - pctCompleto) * 200))));
                showAutoNotif('Job abandonado/cancelado (' + actualKm + 'km percorridos de ' + totalKm + 'km totais) — penalidade: ' + penalidade + ' cs_gold', '#ff6600');
            }

            const hash = getJobHash(cargo, origin, destination);
            const recordedHash = localStorage.getItem('cargo_last_job_hash');
            if (recordedHash === hash) {
                clearJobState();
                saveAutoRecorderState();
                autoRecorder.processing = false;
                return;
            }

            autoRecorder.isRecording = true;
            saveAutoRecorderState();
            refineJobType();
            const recordKm = isComplete ? Math.max(totalKm, odomKm) : (actualKm || totalKm);
            autoRecordTrip(cargo, origin, destination, recordKm, income, cargoId, hash, isComplete ? 'completa' : 'abandonada', penalidade, autoRecorder.detectedJobType);
        }
        autoRecorder.lastTrailerAttached = trailerAttached;
        autoRecorder.lastJobActive = jobActive;
        saveAutoRecorderState();
        autoRecorder.processing = false;
        return;
    } else {
        autoRecorder.inactivePolls = 0;
    }

    // ---- JOB START DETECTION ----
    if (jobActive && !autoRecorder.lastJobActive) {
        const income = getNestedValue(data, 'job.income') || 0;
        const cargo = getTelemetryCargoName(data);

        if (income > 0 || cargo || (data.job && (data.job.sourceCity || data.job.destinationCity))) {
            localStorage.removeItem('cargo_last_job_hash');
            autoRecorder.trailerAttachedBeforeJob = trailerAttached;
            autoRecorder.trailerEverAttached = trailerAttached;
            autoRecorder.initialTruckOdometer = getNestedValue(data, 'truck.odometer') || 0;
            autoRecorder.jobStartTime = Date.now();
            autoRecorder.zeroKmPolls = 0;
            autoRecorder.inactivePolls = 0;
            autoRecorder.cargoNameUpdated = false;
            // Reset metricas do job anterior para nao vazarem para o novo job
            autoRecorder.lastTotalDistance = 0;
            autoRecorder.lastRemainingDistance = 0;
            autoRecorder.hasPositiveRemaining = false;
            autoRecorder.maxOdometer = autoRecorder.initialTruckOdometer;

            // Detect job type (initial guess, refined at record time)
            const truckModel = (getNestedValue(data, 'truck.model') || '').toLowerCase();
            const truckMake = (getNestedValue(data, 'truck.make') || '').toLowerCase();
            autoRecorder.truckModel = truckModel;
            autoRecorder.truckMake = truckMake;

            if (!trailerAttached && isBusKeywords(truckModel, truckMake)) {
                autoRecorder.detectedJobType = 'onibus';
            } else if (trailerAttached && autoRecorder.lastIdleOdometer > 0) {
                const odomDiff = Math.abs(autoRecorder.initialTruckOdometer - autoRecorder.lastIdleOdometer);
                autoRecorder.detectedJobType = odomDiff > 1000 ? 'trabalho_rapido' : 'reboque_proprio';
            } else if (!trailerAttached) {
                autoRecorder.detectedJobType = 'mercado_frete';
            } else {
                autoRecorder.detectedJobType = 'reboque_proprio';
            }

            const d = getTelemetryDistanceKm(data);
            let totalKm = d.totalKm;
            if (totalKm > 0 && d.remainingKm > 0 && totalKm > d.remainingKm * 5) {
                totalKm = d.remainingKm;
            }
            if (totalKm > 0) {
                autoRecorder.lastTotalDistance = totalKm;
                autoRecorder.lastRemainingDistance = d.remainingKm > 0 ? d.remainingKm : totalKm;
            } else if (d.remainingKm > 0) {
                autoRecorder.lastTotalDistance = d.remainingKm;
                autoRecorder.lastRemainingDistance = d.remainingKm;
            }
        }
    }

    // ---- UPDATE STATE DURING JOB ----
    if (jobActive) {
        const cargo = getTelemetryCargoName(data) || 'Carga Desconhecida';
        if (cargo !== 'Carga Desconhecida' && autoRecorder.lastCargo === 'Carga Desconhecida') {
            autoRecorder.lastCargo = cargo;
            autoRecorder.cargoNameUpdated = true;
        } else if (autoRecorder.lastCargo === '' && cargo !== '') {
            autoRecorder.lastCargo = cargo;
        } else if (autoRecorder.lastCargo === '' && cargo === 'Carga Desconhecida' && !autoRecorder.lastCargo) {
            autoRecorder.lastCargo = 'Carga Desconhecida';
        }
        const cargoId = getNestedValue(data, 'trailer.id') || getNestedValue(data, 'job.cargo.id') || '';
        const origem = getNestedValue(data, 'job.sourceCity') || getNestedValue(data, 'job.source.city') || '';
        const destino = getNestedValue(data, 'job.destinationCity') || getNestedValue(data, 'job.destination.city') || '';
        autoRecorder.lastCargoId = cargoId || autoRecorder.lastCargoId;
        autoRecorder.lastOrigin = origem || autoRecorder.lastOrigin;
        autoRecorder.lastDestination = destino || autoRecorder.lastDestination;
        autoRecorder.lastIncome = getNestedValue(data, 'job.income') || 0;
        if (trailerAttached) autoRecorder.trailerEverAttached = true;

        const d = getTelemetryDistanceKm(data);
        if (d.totalKm > 0 && d.totalKm !== autoRecorder.lastTotalDistance) {
            if (d.remainingKm <= 0 || d.totalKm <= d.remainingKm * 5) {
                autoRecorder.lastTotalDistance = d.totalKm;
            }
        }
        if (autoRecorder.lastTotalDistance === 0 && d.remainingKm > 0) {
            autoRecorder.lastTotalDistance = d.remainingKm;
        }
        if (d.remainingKm > 0 || autoRecorder.lastRemainingDistance > 0) {
            autoRecorder.lastRemainingDistance = d.remainingKm;
        }
        // So consideramos o job como realmente iniciado quando a distancia
        // restante ja foi reportada como positiva (evita falso "completo" no inicio)
        if (d.remainingKm > 0) {
            autoRecorder.hasPositiveRemaining = true;
        }
        // Track max odometer seen during job (fallback for stuck routeDistance)
        const currentOdo = getNestedValue(data, 'truck.odometer') || 0;
        if (currentOdo > autoRecorder.maxOdometer) {
            autoRecorder.maxOdometer = currentOdo;
        }
    }

    autoRecorder.lastTrailerAttached = trailerAttached;
    autoRecorder.lastJobActive = jobActive;
    saveAutoRecorderState();
    } finally {
        autoRecorder.processing = false;
        _processAutoRecordStart = 0;
    }
}

async function autoRecordTrip(cargo, origem, destino, km, income, cargoId, jobHash, status, penalidade, jobType) {
    const user = getAuthUser();
    if (!user) {
        showToast('Faça login para registrar viagens automaticamente', 'warning');
        autoRecorder.isRecording = false;
        saveAutoRecorderState();
        return;
    }
    const empresa = user.empresa || 'Lobo Solitário';
    autoRecorder.tripCount++;
    const viagemStatus = status || 'completa';
    const isComplete = viagemStatus === 'completa';
    const pontos = isComplete ? Math.round(km * 2 + (income / 100)) : 0;

    if (jobHash) {
        localStorage.setItem('cargo_last_job_hash', jobHash);
    }

    try {
        const bodyPayload = {
            motorista: user.nome,
            empresa: empresa,
            origem: origem || '',
            destino: destino || '',
            km: km || 0,
            pontuacao: pontos || 0,
            carga_nome: cargo || '',
            cargo_id: cargoId || '',
            status: viagemStatus,
            job_type: jobType || autoRecorder.detectedJobType || ''
        };
        if (!isComplete && penalidade < 0) {
            bodyPayload.penalidade = penalidade;
        }
        const res = await authFetch('/api/viagens/auto', {
            method: 'POST',
            body: JSON.stringify(bodyPayload)
        });
        if (res) {
            const result = await res.json();
            if (result && result.ok) {
                const jobLabel = getJobTypeLabel(jobType || autoRecorder.detectedJobType);
                const catIcon = getCategoriaIcone(result.categoria_carga);
                const msg = result.status === 'abandonada'
                    ? `Viagem abandonada (${km}km percorridos) - 0 pontos | multa: ${penalidade} cs_gold`
                    : jobLabel + ' ' + km + 'km - ' + pontos + 'pts ' + catIcon + ' ' + (result.categoria_carga || 'geral');
                showToast(msg, result.status === 'abandonada' ? 'warning' : 'success');
                if (isComplete) {
                    window.dispatchEvent(new CustomEvent('cargo-trip-recorded', { detail: { km, pontuacao: pontos, categoria: result.categoria_carga, job_type: jobType || '' } }));
                }
                autoRecorder.isRecording = false;
                clearJobState();
                saveAutoRecorderState();
            } else if (result && result.duplicate) {
                showToast('Viagem ' + km + 'km ja registrada (duplicata ignorada)', 'warning');
                autoRecorder.isRecording = false;
                clearJobState();
                saveAutoRecorderState();
            } else {
                showToast('Erro: ' + ((result && result.error) || 'resposta invalida'), 'error');
                autoRecorder.isRecording = false;
                saveAutoRecorderState();
            }
        } else {
            showToast('Sessão expirada. Faça login novamente.', 'error');
            autoRecorder.isRecording = false;
            saveAutoRecorderState();
        }
    } catch (e) {
        showToast('Erro ao registrar viagem automatica', 'error');
        autoRecorder.isRecording = false;
        saveAutoRecorderState();
    }
}

function refineJobType() {
    const t = autoRecorder.detectedJobType;
    const isBus = isBusKeywords(autoRecorder.truckModel, autoRecorder.truckMake);
    if (isBus && t !== 'onibus') {
        autoRecorder.detectedJobType = 'onibus';
    } else if ((t === 'mercado_frete' || t === 'reboque_proprio') && !autoRecorder.trailerEverAttached) {
        autoRecorder.detectedJobType = 'onibus';
    } else if (t === 'onibus' && autoRecorder.trailerEverAttached) {
        autoRecorder.detectedJobType = autoRecorder.trailerAttachedBeforeJob ? 'reboque_proprio' : 'mercado_frete';
    }
}

function getJobTypeLabel(type) {
    const labels = {
        'onibus': '🚌 Ônibus',
        'reboque_proprio': '🔒 Próprio',
        'mercado_frete': '📦 Mercado',
        'trabalho_rapido': '⚡ Rápido'
    };
    return labels[type] || '';
}

function getCategoriaIcone(slug) {
    const icones = {
        'geral': '📦',
        'quimicos': '🧪',
        'construcao': '🏗️',
        'veiculos': '🚗',
        'carga_viva': '🐄',
        'maquinas': '🚜',
        'granel': '🌾',
        'passageiros': '🚌',
        'a_classificar': '❓'
    };
    return icones[slug] || '📦';
}

function showAutoNotif(texto, cor) {
    let container = document.getElementById('auto-recorder-notifs');
    if (!container) {
        container = document.createElement('div');
        container.id = 'auto-recorder-notifs';
        container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }

    const notif = document.createElement('div');
    notif.style.cssText = `
        background: #0d1117; border: 1px solid ${cor}; border-left: 4px solid ${cor};
        color: #e0e0e0; padding: 12px 16px; border-radius: 8px; font-size: 12px;
        font-family: Consolas, monospace; max-width: 380px; opacity: 0;
        transition: opacity 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.5);`;
    const label = document.createElement('span');
    label.style.cssText = `color:${cor};font-weight:700`;
    label.textContent = 'AUTO-REC';
    notif.appendChild(label);
    notif.appendChild(document.createTextNode(' ' + texto));
    container.appendChild(notif);

    requestAnimationFrame(() => notif.style.opacity = '1');
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 300);
    }, 5000);
}

// Auto-start telemetry monitoring on every page
let telemetryPollCount = 0;
setInterval(async () => {
    const { data, error } = await fetchJSON('/api/telemetry');
    telemetryPollCount++;
    if (error && telemetryPollCount <= 3) {
        updateFloatingStatus(false, false);
    }
    if (data) {
        processAutoRecord(data);
        const jobActive = isJobActive(data);
        updateFloatingStatus(true, jobActive);
    }
}, 250);

// Detect job transitions while tab is in background
let lastVisibleJobActive = false;
let visibilityTimeout = null;
document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
        if (visibilityTimeout) {
            clearTimeout(visibilityTimeout);
            visibilityTimeout = null;
        }
        lastVisibleJobActive = autoRecorder.lastJobActive;
        if (lastVisibleJobActive) {
            try {
                const { data } = await fetchJSON('/api/telemetry');
                if (data && isJobActive(data)) {
                    const dist = getTelemetryDistanceKm(data);
                    if (dist.totalKm > 0 && dist.totalKm !== autoRecorder.lastTotalDistance) {
                        if (dist.remainingKm <= 0 || dist.totalKm <= dist.remainingKm * 5) {
                            autoRecorder.lastTotalDistance = dist.totalKm;
                        }
                    }
                    if (autoRecorder.lastTotalDistance === 0 && dist.remainingKm > 0) {
                        autoRecorder.lastTotalDistance = dist.remainingKm;
                    }
                    if (dist.remainingKm > 0) {
                        autoRecorder.lastRemainingDistance = Math.max(autoRecorder.lastRemainingDistance, dist.remainingKm);
                    }
                }
            } catch (e) {}
        }
    } else {
        if (visibilityTimeout) clearTimeout(visibilityTimeout);

        // Check for pending trip data from the background poll (Electron main process)
        if (window.cargoStats) {
            try {
                const bgData = await window.cargoStats.getBGTripData();
                if (bgData && bgData.cargo && !autoRecorder.isRecording) {
                    const recordedHash = localStorage.getItem('cargo_last_job_hash');
                    if (!recordedHash || recordedHash !== bgData.hash) {
                        autoRecorder.isRecording = true;
                        autoRecordTrip(bgData.cargo, bgData.origem, bgData.destino, bgData.km, bgData.income, bgData.cargoId, bgData.hash, bgData.status, bgData.penalidade || 0, bgData.jobType || '');
                        return;
                    }
                }
            } catch (e) {}
        }

        visibilityTimeout = setTimeout(async () => {
            visibilityTimeout = null;
            const { data } = await fetchJSON('/api/telemetry');
            if (!data) return;
            const jobActive = isJobActive(data);
            if (!autoRecorder.isRecording && lastVisibleJobActive && !jobActive && autoRecorder.lastCargo
                && autoRecorder.hasPositiveRemaining) {
                const totalKm = autoRecorder.lastTotalDistance;
                const remainingKm = autoRecorder.lastRemainingDistance;
                const hasBoth = totalKm > 0 && remainingKm > 0;
                const actualKm = hasBoth && totalKm >= remainingKm ? totalKm - remainingKm : (totalKm > 0 ? totalKm : remainingKm);
                const isComplete = !hasBoth || remainingKm <= 5 || actualKm >= totalKm * 0.85;

                if (!isComplete) {
                    showAutoNotif('Job abandonado/cancelado (' + actualKm + 'km percorridos de ' + totalKm + 'km totais)', '#ff6600');
                }

                const hash = getJobHash(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination);
                const recordedHash = localStorage.getItem('cargo_last_job_hash');
                if (recordedHash === hash) {
                    localStorage.removeItem('cargo_last_job_hash');
                    clearJobState();
                    saveAutoRecorderState();
                    return;
                }
                autoRecorder.isRecording = true;
                refineJobType();
                autoRecordTrip(autoRecorder.lastCargo, autoRecorder.lastOrigin, autoRecorder.lastDestination, isComplete ? totalKm : (actualKm || totalKm), autoRecorder.lastIncome, autoRecorder.lastCargoId, hash, isComplete ? 'completa' : 'abandonada', 0, autoRecorder.detectedJobType);
            } else {
                processAutoRecord(data);
            }
        }, 2000);
    }
});

// ========== AUTO-UPDATE BANNER ==========

function initUpdateBanner() {
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:99999;background:#0d1117;border-bottom:2px solid #58a6ff;padding:12px 20px;font-family:Consolas,monospace;font-size:13px;color:#e0e0e0;box-shadow:0 4px 20px rgba(0,0,0,0.8);align-items:center;justify-content:space-between;';
    banner.innerHTML = `
        <div id="update-info" style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:18px;">&#9889;</span>
            <span id="update-text">Verificando atualizacoes...</span>
        </div>
        <div id="update-actions" style="display:flex;align-items:center;gap:8px;">
            <div id="update-progress-bar" style="display:none;width:120px;height:6px;background:#1a1a22;border-radius:3px;overflow:hidden;">
                <div id="update-progress-fill" style="width:0%;height:100%;background:#58a6ff;border-radius:3px;transition:width 0.3s;"></div>
            </div>
            <button id="update-btn-download" style="display:none;padding:6px 16px;background:#1f6feb;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:700;">Baixar</button>
            <button id="update-btn-restart" style="display:none;padding:6px 16px;background:#238636;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:700;">Reiniciar</button>
            <button id="update-btn-close" style="padding:4px 10px;background:transparent;border:1px solid #555;border-radius:4px;color:#888;cursor:pointer;font-size:12px;">X</button>
        </div>`;
    document.body.appendChild(banner);

    if (window.cargoStats) {
        window.cargoStats.onUpdateAvailable((version) => {
            showUpdateBanner('Nova versao ' + version + ' disponivel.', 'available');
            document.getElementById('update-btn-download').style.display = 'inline-block';
        });
        window.cargoStats.onUpdateProgress((percent) => {
            const bar = document.getElementById('update-progress-bar');
            const fill = document.getElementById('update-progress-fill');
            if (bar && fill) {
                bar.style.display = 'block';
                fill.style.width = Math.round(percent) + '%';
            }
            document.getElementById('update-text').textContent = 'Baixando... ' + Math.round(percent) + '%';
        });
        window.cargoStats.onUpdateDownloaded(() => {
            document.getElementById('update-text').textContent = 'Atualizacao baixada! Reiniciar agora?';
            document.getElementById('update-progress-bar').style.display = 'none';
            document.getElementById('update-btn-restart').style.display = 'inline-block';
        });
        window.cargoStats.onUpdateNotAvailable(() => {
            document.getElementById('update-text').textContent = 'App atualizado! Nenhuma nova versao disponivel.';
            document.getElementById('update-btn-download').style.display = 'none';
            setTimeout(() => {
                document.getElementById('update-banner').style.display = 'none';
            }, 3000);
        });
        window.cargoStats.onUpdateError((msg) => {
            document.getElementById('update-text').textContent = 'Erro ao verificar atualizacoes: ' + (msg || 'desconhecido');
            setTimeout(() => {
                document.getElementById('update-banner').style.display = 'none';
            }, 5000);
        });
    }

    document.getElementById('update-btn-download').addEventListener('click', () => {
        if (window.cargoStats && window.cargoStats.downloadUpdate) {
            document.getElementById('update-btn-download').style.display = 'none';
            window.cargoStats.downloadUpdate();
        }
    });
    document.getElementById('update-btn-restart').addEventListener('click', () => {
        if (window.cargoStats && window.cargoStats.restartAndUpdate) {
            window.cargoStats.restartAndUpdate();
        }
    });
    document.getElementById('update-btn-close').addEventListener('click', () => {
        document.getElementById('update-banner').style.display = 'none';
    });
}

function showUpdateBanner(text, state) {
    const banner = document.getElementById('update-banner');
    const textEl = document.getElementById('update-text');
    if (banner && textEl) {
        textEl.textContent = text;
        banner.style.display = 'flex';
        banner.style.borderBottomColor = state === 'downloading' ? '#58a6ff' : '#238636';
    }
}

// ========== FLOATING STATUS BUTTON ==========

let floatingStatusConnected = false;

function initFloatingStatus() {
    const btn = document.createElement('div');
    btn.id = 'floating-status';
    btn.innerHTML = '<div class="fs-dot"></div><div class="fs-tooltip"><div class="fs-label">Status</div><div class="fs-value fs-disconnected">Aguardando telemetria...</div></div>';
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        showDiagnosticModal();
    });
}

async function showDiagnosticModal() {
    let info = { plugins: { dllExists: false }, telemetry: { sharedMemoryAvailable: false, sdkActive: false, addonLoaded: false }, version: 'N/A' };
    if (window.cargoStats && window.cargoStats.getDiagnostics) {
        try { info = await window.cargoStats.getDiagnostics(); } catch (e) {}
    }
    const tel = info.telemetry || {};
    const dllOk = info.plugins && info.plugins.dllExists;
    const shmOk = tel.sharedMemoryAvailable;
    const sdkOk = tel.sdkActive;
    const addonOk = tel.addonLoaded;

    const pluginPath = info.plugins ? info.plugins.path : 'N/A';

    const overlay = document.createElement('div');
    overlay.id = 'diagnostic-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:Consolas,monospace;';
    overlay.innerHTML = `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:24px;max-width:500px;width:90%;color:#e0e0e0;">
            <h2 style="margin:0 0 16px;font-size:16px;color:#ff8800;">Diagnostico de Telemetria</h2>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <tr><td style="padding:6px 8px;color:#888;">Plugin do Jogo:</td><td style="padding:6px 8px;">${dllOk ? '<span style="color:#3fb950;">Sim</span>' : '<span style="color:#f85149;">Nao</span>'}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Addon Nativo:</td><td style="padding:6px 8px;">${addonOk ? '<span style="color:#3fb950;">Carregado</span>' : '<span style="color:#f85149;">Nao carregado</span>'}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Shared Memory:</td><td style="padding:6px 8px;">${shmOk ? '<span style="color:#3fb950;">Disponivel</span>' : '<span style="color:#f85149;">Indisponivel</span>'}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">SDK Ativo:</td><td style="padding:6px 8px;">${sdkOk ? '<span style="color:#3fb950;">Sim</span>' : '<span style="color:#f85149;">Nao</span>'}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Polls (sucesso/total):</td><td style="padding:6px 8px;">${tel.pollsSucceeded || 0} / ${tel.pollsAttempted || 0}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Ultimo erro:</td><td style="padding:6px 8px;word-break:break-all;font-size:11px;color:#f85149;">${tel.lastError || '<span style="color:#3fb950;">Nenhum</span>'}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Versao:</td><td style="padding:6px 8px;">${info.version || 'N/A'}${info.isDev ? ' (dev)' : ''}</td></tr>
                <tr><td style="padding:6px 8px;color:#888;">Iniciar com o Windows:</td><td style="padding:6px 8px;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="startup-toggle" style="width:16px;height:16px;accent-color:#58a6ff;"><span id="startup-toggle-label" style="font-size:12px;">...</span></label></td></tr>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#888;">
                O novo sistema usa shared memory (Local\\SCSTelemetry). Nao requer .NET Framework.<br>
                Plugin do jogo = DLL instalada na pasta plugins do ETS2/ATS.<br>
                Shared Memory = Plugin do jogo esta rodando e criou a memoria compartilhada.<br>
                SDK Ativo = Jogo esta rodando e enviando dados de telemetria.
            </p>
            <div style="display:flex;gap:8px;margin-top:12px;">
            <button onclick="this.closest('#diagnostic-overlay').remove()" style="padding:8px 20px;background:#30363d;border:1px solid #58a6ff;border-radius:6px;color:#58a6ff;cursor:pointer;">Fechar</button>
            <button id="diag-btn-update" onclick="(async()=>{if(window.cargoStats&&window.cargoStats.checkForUpdates){window.cargoStats.checkForUpdates();this.textContent='Verificando...';this.disabled=true;setTimeout(()=>{this.textContent='Verificar atualizacoes';this.disabled=false},5000)};document.getElementById('update-banner').style.display='flex'})()" style="padding:8px 16px;background:#1f6feb;border:none;border-radius:6px;color:#fff;cursor:pointer;">Verificar atualizacoes</button>
        </div>`;
    document.body.appendChild(overlay);

    const startupToggle = document.getElementById('startup-toggle');
    const startupLabel = document.getElementById('startup-toggle-label');
    if (startupToggle && window.cargoStats && window.cargoStats.getStartupSettings) {
        window.cargoStats.getStartupSettings().then((enabled) => {
            startupToggle.checked = !!enabled;
            startupLabel.textContent = enabled ? 'Ativo' : 'Desativado';
        }).catch(() => { startupLabel.textContent = 'Indisponivel'; });
        startupToggle.addEventListener('change', async () => {
            const enabled = startupToggle.checked;
            startupLabel.textContent = '...';
            try {
                const result = await window.cargoStats.setStartupSettings(enabled);
                startupToggle.checked = !!result;
                startupLabel.textContent = result ? 'Ativo' : 'Desativado';
            } catch (e) {
                startupToggle.checked = !enabled;
                startupLabel.textContent = 'Desativado';
            }
        });
    } else if (startupLabel) {
        startupLabel.textContent = 'Indisponivel (browser)';
    }
}

function updateFloatingStatus(connected, jobActive) {
    const btn = document.getElementById('floating-status');
    if (!btn) return;

    const tooltipValue = btn.querySelector('.fs-value');
    btn.classList.remove('connected', 'disconnected', 'job-active');

    if (jobActive) {
        btn.classList.add('job-active');
        if (tooltipValue) {
            tooltipValue.className = 'fs-value fs-job-active';
            const label = getJobTypeLabel(autoRecorder.detectedJobType);
            tooltipValue.textContent = label ? label + ' Ativo' : 'Job Ativo!';
        }
    } else if (connected) {
        btn.classList.add('connected');
        if (tooltipValue) {
            tooltipValue.className = 'fs-value fs-connected';
            tooltipValue.textContent = 'Aguardando Job';
        }
    } else {
        btn.classList.add('disconnected');
        if (tooltipValue) {
            tooltipValue.className = 'fs-value fs-disconnected';
            tooltipValue.textContent = 'Desconectado';
        }
    }
}

// Register IPC listener for bg auto-record events (Electron main process)
if (window.cargoStats && window.cargoStats.onBgAutoRecord) {
    window.cargoStats.onBgAutoRecord(async (bgData) => {
        if (!bgData || !bgData.cargo || autoRecorder.isRecording) return;
        const recordedHash = localStorage.getItem('cargo_last_job_hash');
        if (recordedHash && bgData.hash && recordedHash === bgData.hash) return;
        autoRecorder.isRecording = true;
        await autoRecordTrip(bgData.cargo, bgData.origem, bgData.destino, bgData.km, bgData.income, bgData.cargoId, bgData.hash, bgData.status, bgData.penalidade || 0, bgData.jobType || '');
    });
}

initUpdateBanner();
initFloatingStatus();
initAuth();
