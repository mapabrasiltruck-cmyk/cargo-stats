let empresas = [];
let empresasPendentes = [];
let motoristas = [];
let usuarios = [];
let cargasPendentes = [];
let eventoAtivo = null;
let historicoEventos = [];
let syncStatus = null;

const CARGOS_MOTORISTA = ['Aprendiz', 'Em treinamento', 'Trainee', 'Pleno', 'Senior', 'Master', 'Elite'];

const CATEGORIAS_LISTA = [
    { slug: 'geral', nome: 'Geral' },
    { slug: 'quimicos', nome: 'Quimicos' },
    { slug: 'construcao', nome: 'Construcao Civil' },
    { slug: 'veiculos', nome: 'Veiculos e Pecas' },
    { slug: 'carga_viva', nome: 'Carga Viva e Derivados' },
    { slug: 'maquinas', nome: 'Maquinas e Tratores' },
    { slug: 'granel', nome: 'Granel' }
];

async function init() {
    if (!isLoggedIn()) {
        window.location.href = 'login_local.html';
        return;
    }
    const user = getAuthUser();
    if (!user || user.tipo !== 'admin' || user.email !== 'admin@cargostats.com') {
        window.location.href = 'dashboard_local.html';
        return;
    }

    const app = document.getElementById('app');
    const nav = renderNav('admin_local.html');
    app.appendChild(nav);

    await carregarDados();
    renderAdmin();
}

async function carregarDados() {
    const [resEmp, resPend, resMot, resUsr, resCargas] = await Promise.all([
        authFetch('/api/admin/empresas/todas'),
        authFetch('/api/admin/empresas/pendentes'),
        authFetch('/api/motoristas'),
        authFetch('/api/admin/usuarios'),
        authFetch('/api/admin/cargas-pendentes')
    ]);

    if (resEmp) {
        const data = await resEmp.json();
        empresas = data.empresas || [];
    }
    if (resPend) {
        const data = await resPend.json();
        empresasPendentes = data.empresas || [];
    }
    if (resMot) {
        const data = await resMot.json();
        motoristas = data.motoristas || [];
    }
    if (resUsr) {
        const data = await resUsr.json();
        usuarios = data.usuarios || [];
    }
    if (resCargas) {
        const data = await resCargas.json();
        cargasPendentes = Array.isArray(data) ? data : [];
    }

    const resEvento = await fetchJSON('/api/eventos/ativo');
    eventoAtivo = resEvento.data ? resEvento.data.evento : null;

    const resHist = await fetchJSON('/api/eventos/historico');
    historicoEventos = resHist.data ? resHist.data.historico : [];

    const resSync = await authFetch('/api/sync/status');
    if (resSync) {
        const sdata = await resSync.json();
        syncStatus = sdata;
    }
}

function renderAdmin() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    const nav = renderNav('admin_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'dashboard-frame';

    const title = document.createElement('div');
    title.className = 'dashboard-title';
    title.textContent = 'PAINEL ADMIN';
    frame.appendChild(title);

    const tabs = document.createElement('div');
    tabs.className = 'admin-tabs';
    const pendCount = empresasPendentes.length;
    const cargasCount = cargasPendentes.length;
    const syncIcon = syncStatus && syncStatus.enabled ? '🟢' : '⚪';
    tabs.innerHTML = `
        <button class="admin-tab active" data-tab="empresas">Empresas</button>
        <button class="admin-tab" data-tab="pendentes">Pendentes${pendCount > 0 ? ` (${pendCount})` : ''}</button>
        <button class="admin-tab" data-tab="cargas">Cargas${cargasCount > 0 ? ` (${cargasCount})` : ''}</button>
        <button class="admin-tab" data-tab="eventos">Eventos${eventoAtivo ? ' 🔥' : ''}</button>
        <button class="admin-tab" data-tab="motoristas">Motoristas</button>
        <button class="admin-tab" data-tab="usuarios">Usuarios</button>
        <button class="admin-tab" data-tab="sync">${syncIcon} Sync</button>`;
    frame.appendChild(tabs);

    const content = document.createElement('div');
    content.id = 'admin-content';
    content.className = 'admin-content';
    frame.appendChild(content);

    tabs.querySelectorAll('.admin-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTab(btn.dataset.tab);
        });
    });

    app.appendChild(frame);
    renderTab('empresas');
}

function renderTab(tab) {
    const content = document.getElementById('admin-content');
    content.innerHTML = '';

    switch(tab) {
        case 'empresas': renderEmpresasTab(content); break;
        case 'pendentes': renderPendentesTab(content); break;
        case 'cargas': renderCargasTab(content); break;
        case 'eventos': renderEventosTab(content); break;
        case 'motoristas': renderMotoristasTab(content); break;
        case 'usuarios': renderUsuariosTab(content); break;
        case 'sync': renderSyncTab(content); break;
    }
}

function renderEmpresasTab(container) {
    let html = `
        <div class="admin-form">
            <div class="admin-form-title">NOVA EMPRESA</div>
            <div class="admin-form-row">
                <input type="text" id="nova-empresa-nome" placeholder="Nome da empresa" class="admin-input">
            </div>
            <div class="admin-form-row">
                <label style="font-size:10px;color:#888">Logo da empresa (opcional, max 2MB)</label>
                <input type="file" id="nova-empresa-logo" accept="image/*" class="admin-input" style="padding:6px">
            </div>
            <div class="admin-form-row">
                <label style="font-size:10px;color:#888">Banner da empresa (opcional, max 2MB)</label>
                <input type="file" id="nova-empresa-banner" accept="image/*" class="admin-input" style="padding:6px">
            </div>
            <div class="admin-form-row">
                <textarea id="nova-empresa-desc" placeholder="Descricao da empresa (opcional)" class="admin-input" rows="2"></textarea>
            </div>
            <div class="admin-form-row">
                <button class="admin-btn" onclick="criarEmpresa()">Criar Empresa</button>
            </div>
        </div>
        <div class="admin-table">
            <table class="data-table">
                <thead><tr>
                    <th>Empresa</th><th>Status</th><th>Motoristas</th><th>Viagens</th><th>KM</th><th>Pontos</th><th>Acoes</th>
                </tr></thead>
                <tbody>`;

    empresas.forEach(e => {
        const statusColor = e.status === 'aprovada' ? '#00ff88' : '#ffaa00';
        html += `<tr>
            <td>${e.logo ? '<img src="' + e.logo + '" style="height:16px;vertical-align:middle;margin-right:4px;">' : ''}${e.nome}</td>
            <td style="color:${statusColor}">${e.status}</td>
            <td>${e.motoristas || 0}</td>
            <td>${e.viagens || 0}</td>
            <td>${e.km || 0}</td>
            <td><img src="images/LogoMoeda.png" class="cs-gold-icon"> ${e.pontuacao || 0}</td>
            <td>
                <button class="admin-btn-edit" onclick="editarEmpresa('${e.nome}')">Editar</button>
                <button class="admin-btn-delete" onclick="excluirEmpresa('${e.nome}')">Excluir</button>
            </td>
        </tr>`;
    });

    if (empresas.length === 0) {
        html += `<tr><td colspan="7" style="text-align:center;color:#555">Nenhuma empresa cadastrada</td></tr>`;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderPendentesTab(container) {
    let html = `
        <div class="admin-form" style="border-color: #ffaa0040">
            <div class="admin-form-title" style="color: #ffaa00">EMPRESAS PENDENTES</div>
            <p style="font-size:11px;color:#888;margin-bottom:12px">Empresas criadas por motoristas que precisam de aprovacao.</p>
        </div>
        <div class="admin-table">
            <table class="data-table">
                <thead><tr>
                    <th>Empresa</th><th>Descricao</th><th>Criada por</th><th>Acoes</th>
                </tr></thead>
                <tbody>`;

    empresasPendentes.forEach(e => {
        html += `<tr>
            <td>${e.nome}</td>
            <td>${e.descricao || '-'}</td>
            <td>${e.criada_por || '-'}</td>
            <td>
                <button class="admin-btn" onclick="aprovarEmpresa('${e.nome}')" style="padding:4px 10px;font-size:10px">Aprovar</button>
                <button class="admin-btn-delete" onclick="rejeitarEmpresa('${e.nome}')" style="padding:4px 10px;font-size:10px">Rejeitar</button>
            </td>
        </tr>`;
    });

    if (empresasPendentes.length === 0) {
        html += `<tr><td colspan="4" style="text-align:center;color:#555">Nenhuma empresa pendente</td></tr>`;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderCargasTab(container) {
    let html = `
        <div class="admin-form" style="border-color: #607D8B40">
            <div class="admin-form-title" style="color: #607D8B">CARGAS A CLASSIFICAR</div>
            <p style="font-size:11px;color:#888;margin-bottom:12px">Cargas que o sistema nao conseguiu classificar automaticamente. Classifique-as para que sejam categorizadas corretamente.</p>
            <div class="admin-form-row">
                <button class="admin-btn" onclick="sincronizarCargas()" style="background:#4CAF50">Sincronizar Classificacoes</button>
            </div>
        </div>
        <div class="admin-table">
            <table class="data-table">
                <thead><tr>
                    <th>Carga</th><th>ID</th><th>Ocorrencias</th><th>Categoria Atual</th><th>Nova Categoria</th><th>Acoes</th>
                </tr></thead>
                <tbody>`;

    if (cargasPendentes.length === 0) {
        html += `<tr><td colspan="6" style="text-align:center;color:#555">Nenhuma carga pendente</td></tr>`;
    } else {
        cargasPendentes.forEach(c => {
            html += `<tr>
                <td>${c.nome_original}</td>
                <td style="color:#888;font-size:10px">${c.cargo_id || '-'}</td>
                <td>${c.ocorrencias || 1}</td>
                <td style="color:#607D8B">${c.categoria_sugerida === 'a_classificar' ? 'Não Classificada' : c.categoria_sugerida || 'Não Classificada'}</td>
                <td>
                    <select class="admin-select" id="cat-${c.id}" style="padding:2px 6px;font-size:10px;background:#0d1117;border:1px solid #444;color:#fff">`;

            CATEGORIAS_LISTA.forEach(cat => {
                html += `<option value="${cat.slug}">${cat.nome}</option>`;
            });

            html += `</select>
                </td>
                <td>
                    <button class="admin-btn" onclick="classificarCarga(${c.id})" style="padding:4px 10px;font-size:10px;background:#4CAF50">Classificar</button>
                    <button class="admin-btn-delete" onclick="excluirCargaPendente(${c.id})" style="padding:4px 10px;font-size:10px">Excluir</button>
                </td>
            </tr>`;
        });
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderMotoristasTab(container) {
    let html = `
        <div class="admin-form">
            <div class="admin-form-title">NOVO MOTORISTA</div>
            <div class="admin-form-row">
                <input type="text" id="novo-motorista-nome" placeholder="Nome do motorista" class="admin-input">
                <select id="novo-motorista-empresa" class="admin-select">
                    <option value="">Selecione a empresa</option>`;

    empresas.filter(e => e.status === 'aprovada').forEach(e => {
        html += `<option value="${e.nome}">${e.nome}</option>`;
    });

    html += `</select>
                <button class="admin-btn" onclick="criarMotorista()">Contratar</button>
            </div>
        </div>
        <div class="admin-table">
            <table class="data-table">
                <thead><tr>
                    <th>Motorista</th><th>Empresa</th><th>Funcao</th><th>Cargo</th><th>Status</th><th>Acoes</th>
                </tr></thead>
                <tbody>`;

    motoristas.forEach(m => {
        const cargoColor = CARGOS[m.cargo] || '#888';
        const funcaoCores = { 'dono': '#FFD700', 'diretor': '#00ff88', 'chefe_rh': '#E91E63', 'motorista': '#888' };
        const funcaoNomes = { 'dono': 'Dono', 'diretor': 'Diretor', 'chefe_rh': 'Chefe de RH', 'motorista': 'Motorista' };
        const funcao = m.funcao || 'motorista';
        const fc = funcaoCores[funcao] || '#888';
        const fn = funcaoNomes[funcao] || 'Motorista';
        html += `<tr>
            <td><a class="table-link" href="perfil_local.html?motorista=${encodeURIComponent(m.nome)}">${m.nome}</a></td>
            <td>${m.empresa}</td>
            <td>
                <span class="categoria-badge" style="border-color:${fc};color:${fc};background:${fc}20;font-size:9px;padding:2px 6px;">${fn}</span>
            </td>
            <td>
                <select class="admin-select" style="padding:2px 6px;font-size:10px;background:#0d1117;border:1px solid ${cargoColor};color:${cargoColor}" onchange="alterarCargo('${m.nome}', this.value)">`;

        CARGOS_MOTORISTA.forEach(c => {
            html += `<option value="${c}" ${m.cargo === c ? 'selected' : ''}>${c}</option>`;
        });

        html += `</select>
            </td>
            <td style="color: ${m.status === 'Ativo' ? '#00ff88' : '#ffaa00'}">${m.status}</td>
            <td>
                <button class="admin-btn-delete" onclick="excluirMotorista('${m.nome}')">Excluir</button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderUsuariosTab(container) {
    let html = `
        <div class="admin-form" style="border-color: #ff444440">
            <div class="admin-form-title" style="color: #ff4444">ZONA DE PERIGO</div>
            <p style="font-size:11px;color:#888;margin-bottom:12px">Apaga todas as empresas, motoristas e viagens. Os usuarios continuam intactos.</p>
            <button class="admin-btn-delete" style="padding:8px 16px;font-size:11px" onclick="limparDadosAntigos()">LIMPAR DADOS ANTIGOS</button>
            <p style="font-size:11px;color:#888;margin:12px 0 8px">Para resetar TUDO (incluindo usuarios):</p>
            <button class="admin-btn-delete" style="padding:8px 16px;font-size:11px;background:#ff000020" onclick="apagarTudo()">APAGAR TUDO</button>
        </div>
        <div class="admin-table">
            <table class="data-table">
                <thead><tr>
                    <th>ID</th><th>Nome</th><th>Email</th><th>Tipo</th><th>Empresa</th><th>Criado em</th><th>Acoes</th>
                </tr></thead>
                <tbody>`;

    usuarios.forEach(u => {
        const safeNome = u.nome.replace(/'/g, "\\'");
        html += `<tr>
            <td>${u.id}</td>
            <td>${u.nome}</td>
            <td>${u.email}</td>
            <td style="color: ${u.tipo === 'admin' ? '#ff4444' : '#00ff88'}">${u.tipo}</td>
            <td>${u.empresa || '-'}</td>
            <td>${u.criado_em || '-'}</td>
            <td><button class="admin-btn-delete" onclick="excluirUsuario(${u.id}, '${safeNome}')">Excluir</button></td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

async function criarEmpresa() {
    const nome = document.getElementById('nova-empresa-nome').value.trim();
    const logoFile = document.getElementById('nova-empresa-logo').files[0];
    const bannerFile = document.getElementById('nova-empresa-banner').files[0];
    const descricao = document.getElementById('nova-empresa-desc').value.trim();
    if (!nome) return alert('Digite o nome da empresa');

    const formData = new FormData();
    formData.append('nome', nome);
    formData.append('descricao', descricao);
    if (logoFile) formData.append('logo', logoFile);
    if (bannerFile) formData.append('banner', bannerFile);

    const res = await authFetch('/api/admin/empresas', {
        method: 'POST',
        headers: {},
        body: formData
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('empresas');
    }
}

async function editarEmpresa(nome) {
    const emp = empresas.find(e => e.nome === nome);
    if (!emp) return;

    const novaDesc = prompt('Descricao:', emp.descricao || '');

    const formData = new FormData();
    formData.append('nome', nome);
    formData.append('descricao', novaDesc || '');

    const logoInput = document.createElement('input');
    logoInput.type = 'file';
    logoInput.accept = 'image/*';
    logoInput.style.display = 'none';
    document.body.appendChild(logoInput);

    const bannerInput = document.createElement('input');
    bannerInput.type = 'file';
    bannerInput.accept = 'image/*';
    bannerInput.style.display = 'none';
    document.body.appendChild(bannerInput);

    const useNewLogo = confirm('Deseja trocar o logo?');
    if (useNewLogo) {
        logoInput.click();
        await new Promise(r => logoInput.onchange = r);
        if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);
    }

    const useNewBanner = confirm('Deseja trocar o banner?');
    if (useNewBanner) {
        bannerInput.click();
        await new Promise(r => bannerInput.onchange = r);
        if (bannerInput.files[0]) formData.append('banner', bannerInput.files[0]);
    }

    logoInput.remove();
    bannerInput.remove();

    const res = await authFetch('/api/admin/empresas', {
        method: 'PUT',
        headers: {},
        body: formData
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('empresas');
    }
}

async function aprovarEmpresa(nome) {
    const res = await authFetch('/api/admin/empresas', {
        method: 'PUT',
        body: JSON.stringify({ nome, status: 'aprovada' })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('pendentes');
    }
}

async function rejeitarEmpresa(nome) {
    if (!confirm(`Rejeitar a empresa "${nome}"?`)) return;
    const res = await authFetch('/api/admin/empresas', {
        method: 'DELETE',
        body: JSON.stringify({ nome })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('pendentes');
    }
}

async function excluirEmpresa(nome) {
    if (!confirm(`Excluir a empresa "${nome}"? Isso apagara todas as viagens e motoristas dela.`)) return;
    const res = await authFetch('/api/admin/empresas', {
        method: 'DELETE',
        body: JSON.stringify({ nome })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('empresas');
    }
}

async function criarMotorista() {
    const nome = document.getElementById('novo-motorista-nome').value.trim();
    const empresa = document.getElementById('novo-motorista-empresa').value;
    if (!nome || !empresa) return alert('Preencha nome e selecione a empresa');

    const res = await authFetch('/api/admin/motoristas', {
        method: 'POST',
        body: JSON.stringify({ nome, empresa })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('motoristas');
    }
}

async function alterarCargo(nome, cargo) {
    const res = await authFetch('/api/admin/motoristas', {
        method: 'PUT',
        body: JSON.stringify({ nome, cargo })
    });
    if (res && res.ok) {
        await carregarDados();
    }
}

async function excluirMotorista(nome) {
    if (!confirm(`Excluir o motorista "${nome}"?`)) return;
    const res = await authFetch('/api/admin/motoristas', {
        method: 'DELETE',
        body: JSON.stringify({ nome })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('motoristas');
    }
}

async function excluirUsuario(id, nome) {
    if (!confirm(`Excluir o usuario "${nome}"?`)) return;
    const res = await authFetch('/api/admin/usuarios', {
        method: 'DELETE',
        body: JSON.stringify({ id })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('usuarios');
    }
}

async function apagarTudo() {
    if (!confirm('ATENCAO TOTAL: Isso vai apagar TODAS as empresas, motoristas, viagens E todos os usuarios (exceto voce). Continuar?')) return;
    if (!confirm('ULTIMA CHANCE: Confirmar exclusao completa de tudo?')) return;
    const res = await authFetch('/api/admin/limpar-dados', { method: 'DELETE' });
    if (res && res.ok) {
        const usuariosAtuais = [...usuarios].filter(u => u.tipo !== 'admin');
        for (const u of usuariosAtuais) {
            await authFetch('/api/admin/usuarios', {
                method: 'DELETE',
                body: JSON.stringify({ id: u.id })
            });
        }
        await carregarDados();
        renderTab('usuarios');
    }
}

async function limparDadosAntigos() {
    if (!confirm('ATENCAO: Isso vai apagar TODAS as empresas, motoristas e viagens. Tem certeza?')) return;
    if (!confirm('ULTIMA CHANCE: Confirmar limpeza total dos dados?')) return;
    const res = await authFetch('/api/admin/limpar-dados', { method: 'DELETE' });
    if (res && res.ok) {
        await carregarDados();
        renderTab('usuarios');
    }
}

async function classificarCarga(id) {
    const select = document.getElementById(`cat-${id}`);
    if (!select) return;
    const categoria = select.value;
    const res = await authFetch('/api/admin/cargas-pendentes', {
        method: 'PUT',
        body: JSON.stringify({ id, categoria })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('cargas');
    }
}

async function excluirCargaPendente(id) {
    if (!confirm('Excluir esta carga pendente?')) return;
    const res = await authFetch('/api/admin/cargas-pendentes', {
        method: 'DELETE',
        body: JSON.stringify({ id })
    });
    if (res && res.ok) {
        await carregarDados();
        renderTab('cargas');
    }
}

async function sincronizarCargas() {
    const res = await authFetch('/api/admin/cargas-pendentes/sincronizar', { method: 'POST' });
    if (res && res.ok) {
        const data = await res.json();
        alert(`${data.sincronizadas} cargas sincronizadas para o mapping!`);
        await carregarDados();
        renderTab('cargas');
    }
}

// ========== EVENTOS TAB ==========

const CONFIG_TIPOS_EVENTO = {
    maratona_viagens: { label: 'Maratona de Viagens', placeholder: 'Complete 5 entregas em 24h', extra: [], metaLabel: 'conta VIAGENS (cada entrega = +1)' },
    desafio_km: {
        label: 'Desafio de KM',
        placeholder: 'Percorra 1500km em 24h',
        extra: [
            { id: 'evento-bonus-km', label: 'Bonus KM', type: 'number', placeholder: '500', default: 500 }
        ],
        metaLabel: 'acumula KM (distância percorrida)'
    },
    foco_carga: {
        label: 'Foco em Carga',
        placeholder: 'Transporte 3 cargas de Combustíveis',
        extra: [
            { id: 'evento-categoria', label: 'Categoria', type: 'select', default: 'combustiveis',
              options: [
                  { value: 'combustiveis', text: 'Combustíveis' },
                  { value: 'construcao', text: 'Construção Civil' },
                  { value: 'granel', text: 'Granel' },
                  { value: 'maquinas', text: 'Máquinas' },
                  { value: 'veiculos', text: 'Veículos' },
                  { value: 'carga_viva', text: 'Carga Viva' }
              ]
            }
        ],
        metaLabel: 'conta CARGAS do tipo selecionado'
    },
    caixa_pontos: { label: 'Caça aos Pontos', placeholder: 'Acumule 10000 pontos em 24h', extra: [], metaLabel: 'acumula PONTOS' },
    explorador_cidades: { label: 'Explorador de Cidades', placeholder: 'Entregue em 4 cidades diferentes', extra: [], metaLabel: 'conta CIDADES diferentes' }
};

function renderExtraFields(tipo) {
    const config = CONFIG_TIPOS_EVENTO[tipo];
    if (!config || !config.extra || config.extra.length === 0) return '';
    return config.extra.map(f => {
        if (f.type === 'select') {
            const opts = f.options.map(o =>
                `<option value="${o.value}" ${o.value === f.default ? 'selected' : ''}>${o.text}</option>`
            ).join('');
            return `<label style="font-size:10px;color:#888;margin-right:4px;white-space:nowrap;">${f.label}</label>
                <select id="${f.id}" class="admin-select" style="width:140px">${opts}</select>`;
        }
        return `<input type="${f.type}" id="${f.id}" placeholder="${f.placeholder || ''}" value="${f.default || ''}" class="admin-input" style="width:80px">`;
    }).join('');
}

function atualizarCamposEvento() {
    const tipo = document.getElementById('evento-tipo').value;
    const container = document.getElementById('evento-extras');
    container.innerHTML = renderExtraFields(tipo);
    const config = CONFIG_TIPOS_EVENTO[tipo];
    const desc = document.getElementById('evento-desc');
    if (desc && !desc.dataset.userEdited) {
        desc.placeholder = config ? config.placeholder + ' — personalize aqui' : 'Descricao do evento';
    }
    const metaInfo = document.getElementById('evento-meta-info');
    if (metaInfo) {
        metaInfo.textContent = config && config.metaLabel ? '↳ ' + config.metaLabel : '';
    }
}

function renderEventosTab(container) {
    let html = `
        <div class="admin-form" style="border-color:#ff660040">
            <div class="admin-form-title" style="color:#ff8800">🔥 CRIAR EVENTO</div>
            <div class="admin-form-row">
                <select id="evento-tipo" class="admin-select" style="flex:1" onchange="atualizarCamposEvento()">
                    ${Object.entries(CONFIG_TIPOS_EVENTO).map(([v, c]) =>
                        `<option value="${v}">${c.label}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="admin-form-row">
                <input type="text" id="evento-titulo" placeholder="Titulo do evento" class="admin-input" style="flex:1">
                <input type="number" id="evento-meta" placeholder="Meta" class="admin-input" style="width:70px">
                <input type="number" id="evento-bonus" placeholder="Bonus pts" class="admin-input" style="width:80px">
            </div>
            <div class="admin-form-row" id="evento-extras">
            </div>
            <div id="evento-meta-info" style="font-size:10px;color:#ff8800;padding:0 0 4px 4px;"></div>
            <div class="admin-form-row">
                <input type="text" id="evento-desc" placeholder="Descricao" class="admin-input" style="flex:1">
            </div>
            <div class="admin-form-row">
                <button class="admin-btn" onclick="criarEventoAdmin()" style="background:#ff8800;color:#000;">🔥 Criar Evento (24h)</button>
                ${eventoAtivo ? `<button class="admin-btn-delete" onclick="encerrarEventoAdmin()" style="margin-left:8px;">Encerrar Evento Atual</button>` : ''}
            </div>
        </div>`;

    if (eventoAtivo) {
        const params = eventoAtivo.parametros || {};
        const inicio = new Date(eventoAtivo.data_inicio).toLocaleString('pt-BR');
        const fim = new Date(eventoAtivo.data_fim).toLocaleString('pt-BR');
        html += `<div class="admin-form" style="border-color:#00ff8840;background:#001a00;">
            <div class="admin-form-title" style="color:#00ff88;">✅ EVENTO ATIVO</div>
            <div style="font-size:12px;color:#ccc;">
                <strong style="color:#ff8800;">${eventoAtivo.titulo}</strong><br>
                <span style="color:#888;">${eventoAtivo.descricao}</span><br><br>
                <span style="font-size:10px;color:#666;">Inicio: ${inicio}</span><br>
                <span style="font-size:10px;color:#666;">Fim: ${fim}</span><br>
                <span style="font-size:10px;color:#888;">Tipo: ${eventoAtivo.tipo} | Meta: ${params.meta || '?'} | Bonus: ${params.bonus_pontos || 0}pts</span>
            </div>
        </div>`;
    } else {
        html += `<div class="admin-form" style="border-color:#ff444440">
            <div class="admin-form-title" style="color:#ff4444;">❌ NENHUM EVENTO ATIVO</div>
            <p style="font-size:11px;color:#888;">O sistema gera eventos aleatorios automaticamente. Use o formulario acima para criar um manualmente.</p>
        </div>`;
    }

    if (historicoEventos.length > 0) {
        html += `<div class="admin-table" style="margin-top:12px;">
            <div style="font-size:10px;font-weight:700;color:#666;letter-spacing:2px;margin-bottom:8px;">ULTIMOS EVENTOS</div>
            <table class="data-table"><thead><tr><th>Titulo</th><th>Tipo</th><th>Inicio</th><th>Fim</th><th>Acoes</th></tr></thead><tbody>`;
        historicoEventos.slice(0, 10).forEach(e => {
            const inicio = new Date(e.data_inicio).toLocaleString('pt-BR');
            const fim = new Date(e.data_fim).toLocaleString('pt-BR');
            html += `<tr>
                <td style="color:#ff8800;">${e.titulo}</td>
                <td>${e.tipo}</td>
                <td style="font-size:10px;">${inicio}</td>
                <td style="font-size:10px;">${fim}</td>
                <td><button class="admin-btn-delete" onclick="limparEventoAdmin(${e.id})" style="padding:2px 8px;font-size:9px">Limpar</button></td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
}

async function criarEventoAdmin() {
    const tipo = document.getElementById('evento-tipo').value;
    const titulo = document.getElementById('evento-titulo').value.trim();
    const meta = parseInt(document.getElementById('evento-meta').value) || 5;
    const bonus = parseInt(document.getElementById('evento-bonus').value) || 2000;
    const desc = document.getElementById('evento-desc').value.trim() || `Complete ${meta} entregas em 24h e ganhe ${bonus} pontos!`;

    if (!titulo) return alert('Digite um titulo para o evento');

    const TIPO_META_MAP = { maratona_viagens: 'viagens', desafio_km: 'km', foco_carga: 'carga', caixa_pontos: 'pontos', explorador_cidades: 'cidades' };
    const payload = { tipo, titulo, descricao: desc, meta, bonus_pontos: bonus, tipo_meta: TIPO_META_MAP[tipo] || 'viagens' };

    const config = CONFIG_TIPOS_EVENTO[tipo];
    if (config && config.extra) {
        for (const f of config.extra) {
            const el = document.getElementById(f.id);
            if (el) {
                if (f.type === 'select') {
                    payload.categoria = el.value;
                    const nomes = { combustiveis: 'Combustíveis', construcao: 'Construção Civil', granel: 'Granel', maquinas: 'Máquinas', veiculos: 'Veículos', carga_viva: 'Carga Viva' };
                    payload.categoria_nome = nomes[el.value] || el.value;
                } else {
                    payload[f.id.replace('evento-', '')] = parseInt(el.value) || 0;
                }
            }
        }
    }

    const res = await authFetch('/api/admin/eventos/criar', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    if (res && res.ok) {
        await carregarDados();
        renderAdmin();
    } else if (res) {
        const data = await res.json();
        alert(data.error || 'Erro ao criar evento');
    }
}

async function limparEventoAdmin(id) {
    if (!confirm(`Limpar evento #${id} do historico?`)) return;
    const res = await authFetch('/api/admin/eventos/limpar', {
        method: 'DELETE',
        body: JSON.stringify({ id })
    });
    if (res && res.ok) {
        await carregarDados();
        renderAdmin();
    }
}

async function encerrarEventoAdmin() {
    if (!confirm('Encerrar o evento ativo agora?')) return;
    const res = await authFetch('/api/admin/eventos/encerrar', {
        method: 'POST',
        body: JSON.stringify({})
    });
    if (res && res.ok) {
        await carregarDados();
        renderAdmin();
    }
}

// ========== SYNC HOSTINGER TAB ==========

function renderSyncTab(container) {
    const s = syncStatus || {};
    const configured = s.configured || false;
    const enabled = s.enabled || false;
    const lastSync = s.lastSync ? new Date(s.lastSync).toLocaleString('pt-BR') : 'Nunca';
    const lastError = s.lastError || null;
    const interval = s.intervalMs ? (s.intervalMs / 60000) : 5;
    const url = s.hostingerUrl || '';

    let statusColor = '#ff4444';
    let statusText = 'Desconfigurado';
    if (configured && enabled) { statusColor = '#00ff88'; statusText = 'Ativo'; }
    else if (configured && !enabled) { statusColor = '#ffaa00'; statusText = 'Configurado (desativado)'; }

    let html = `
        <div class="admin-form" style="border-color:${statusColor}40">
            <div class="admin-form-title" style="color:${statusColor}">☁️ SYNC HOSTINGER</div>
            <p style="font-size:11px;color:#888;margin-bottom:12px">
                Envia ranking consolidado para o site publico na Hostinger periodicamente.
            </p>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <div style="background:#0d1117;border:1px solid #333;border-radius:8px;padding:12px;">
                    <div style="font-size:9px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Status</div>
                    <div style="font-size:14px;font-weight:700;color:${statusColor}">${statusText}</div>
                </div>
                <div style="background:#0d1117;border:1px solid #333;border-radius:8px;padding:12px;">
                    <div style="font-size:9px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Ultimo Sync</div>
                    <div style="font-size:14px;font-weight:700;color:#f5c842">${lastSync}</div>
                </div>
            </div>

            ${lastError ? `<div style="background:#ff000010;border:1px solid #ff444440;border-radius:8px;padding:10px;margin-bottom:12px;">
                <div style="font-size:9px;color:#ff4444;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Ultimo Erro</div>
                <div style="font-size:11px;color:#ff8888;word-break:break-all;">${lastError}</div>
            </div>` : ''}

            <div class="admin-form-row">
                <label style="font-size:10px;color:#888;width:100%;">URL do sync.php (Hostinger)</label>
                <input type="text" id="sync-url" placeholder="https://seudominio.com/api/sync.php" value="${url}" class="admin-input" style="width:100%;margin-top:4px;">
            </div>
            <div class="admin-form-row">
                <label style="font-size:10px;color:#888;width:100%;">Chave Secreta (mesma do config.php)</label>
                <input type="password" id="sync-secret" placeholder="Sua chave secreta" class="admin-input" style="width:100%;margin-top:4px;">
            </div>
            <div class="admin-form-row">
                <label style="font-size:10px;color:#888;width:100%;">Intervalo (minutos)</label>
                <input type="number" id="sync-interval" value="${interval}" min="1" max="60" class="admin-input" style="width:100px;margin-top:4px;">
            </div>
            <div class="admin-form-row" style="flex-wrap:wrap;gap:8px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:#ccc;">
                    <input type="checkbox" id="sync-enabled" ${enabled ? 'checked' : ''} style="accent-color:#00ff88;width:16px;height:16px;">
                    Ativar sync automatico
                </label>
            </div>
            <div class="admin-form-row" style="gap:8px;flex-wrap:wrap;">
                <button class="admin-btn" onclick="salvarSyncConfig()" style="background:#00ff88;color:#000;">💾 Salvar Configuracao</button>
                <button class="admin-btn" onclick="forcarSync()" style="background:#f5c842;color:#000;">🔄 Sincronizar Agora</button>
                <button class="admin-btn" onclick="verificarDadosSync()" style="background:#58a6ff;color:#000;">👁️ Ver Dados</button>
            </div>
        </div>

        <div id="sync-preview" style="margin-top:12px;"></div>`;

    container.innerHTML = html;
}

async function salvarSyncConfig() {
    const url = document.getElementById('sync-url').value.trim();
    const secret = document.getElementById('sync-secret').value.trim();
    const interval = parseInt(document.getElementById('sync-interval').value) || 5;
    const enabled = document.getElementById('sync-enabled').checked;

    if (!url) return alert('Digite a URL do sync.php');
    if (!secret) return alert('Digite a chave secreta');

    const res = await authFetch('/api/sync/config', {
        method: 'POST',
        body: JSON.stringify({
            hostingerUrl: url,
            syncSecret: secret,
            intervalMs: interval * 60000,
            enabled: enabled
        })
    });

    if (res && res.ok) {
        const data = await res.json();
        syncStatus = data.status;
        alert('Configuracao salva com sucesso!');
        renderAdmin();
    }
}

async function forcarSync() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Sincronizando...';

    try {
        const res = await authFetch('/api/sync/now', { method: 'POST' });
        if (res) {
            const data = await res.json();
            if (data.ok) {
                alert(`Sync concluido! ${data.empresas} empresas, ${data.motoristas} motoristas enviados.`);
            } else {
                alert('Erro: ' + (data.reason || 'desconhecido'));
            }
        }
    } catch(e) {
        alert('Erro ao sincronizar: ' + e.message);
    }

    const statusRes = await authFetch('/api/sync/status');
    if (statusRes) syncStatus = await statusRes.json();

    btn.disabled = false;
    btn.textContent = '🔄 Sincronizar Agora';
    renderAdmin();
}

async function verificarDadosSync() {
    const preview = document.getElementById('sync-preview');
    preview.innerHTML = '<div style="color:#888;padding:1rem;">Carregando...</div>';

    try {
        const res = await authFetch('/api/sync/dados');
        if (!res) return;
        const data = await res.json();

        let html = `<div style="background:#0d1117;border:1px solid #333;border-radius:8px;padding:16px;">
            <div style="font-size:10px;color:#f5c842;font-weight:700;letter-spacing:1px;margin-bottom:12px;">DADOS QUE SERAO ENVIADOS</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
                <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#f5c842;">${data.empresas?.length || 0}</div><div style="font-size:9px;color:#888;">Empresas</div></div>
                <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#f5c842;">${data.motoristas?.length || 0}</div><div style="font-size:9px;color:#888;">Motoristas</div></div>
                <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#f5c842;">${data.stats?.totalViagens || 0}</div><div style="font-size:9px;color:#888;">Viagens</div></div>
                <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#f5c842;">${data.stats?.totalKm || 0}</div><div style="font-size:9px;color:#888;">KM Total</div></div>
            </div>`;

        if (data.empresas && data.empresas.length > 0) {
            html += `<div style="font-size:9px;color:#666;letter-spacing:1px;margin-bottom:6px;">TOP 5 EMPRESAS</div>`;
            data.empresas.slice(0, 5).forEach((e, i) => {
                html += `<div style="font-size:11px;color:#ccc;padding:2px 0;">${i+1}º ${e.nome} — ${e.pontuacao} pts</div>`;
            });
        }

        if (data.motoristas && data.motoristas.length > 0) {
            html += `<div style="font-size:9px;color:#666;letter-spacing:1px;margin:12px 0 6px;">TOP 5 MOTORISTAS</div>`;
            data.motoristas.slice(0, 5).forEach((m, i) => {
                html += `<div style="font-size:11px;color:#ccc;padding:2px 0;">${i+1}º ${m.nome} (${m.empresa}) — ${m.pontuacao} pts</div>`;
            });
        }

        html += `<div style="font-size:9px;color:#555;margin-top:12px;">Timestamp: ${data.timestamp}</div></div>`;
        preview.innerHTML = html;

    } catch(e) {
        preview.innerHTML = '<div style="color:#ff4444;padding:1rem;">Erro ao carregar dados: ' + e.message + '</div>';
    }
}

init();
