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

    const criarSection = document.createElement('div');
    criarSection.style.cssText = 'text-align:center;margin-top:32px;padding:24px;border:1px solid rgba(0,255,136,0.15);border-radius:12px;background:rgba(0,255,136,0.02);';
    criarSection.innerHTML = `
        <div style="font-size:28px;margin-bottom:8px;">🚀</div>
        <div style="color:#f5c842;font-size:13px;font-weight:700;letter-spacing:1px;margin-bottom:6px;">CRIAR MINHA EMPRESA</div>
        <div style="color:#666;font-size:11px;margin-bottom:14px;">Nao encontrou uma empresa? Crie a sua propria!</div>
        <button id="btn-criar-empresa" class="lobo-btn-pedido" style="background:#f5c842;color:#000;padding:10px 24px;">CRIAR EMPRESA</button>
    `;
    frame.appendChild(criarSection);

    const footer = document.createElement('div');
    footer.className = 'dashboard-footer';
    footer.innerHTML = `
        <div class="footer-line">App desktop para Windows 10+ | Telemetria ETS2/ATS em tempo real</div>
        <div class="footer-line footer-copy">&copy; 2026 Cargo Stats - Mapa Brasil Truck. Todos os direitos reservados.</div>`;
    frame.appendChild(footer);

    app.appendChild(frame);

    document.getElementById('btn-criar-empresa').addEventListener('click', () => abrirModalCriarEmpresa());
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

function abrirModalCriarEmpresa() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999;display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML = `
        <div style="background:#0d1117;border:1px solid #f5c84240;border-radius:12px;padding:24px;width:90%;max-width:400px;max-height:90vh;overflow-y:auto;">
            <div style="color:#f5c842;font-size:14px;font-weight:700;letter-spacing:1px;margin-bottom:16px;text-align:center;">CRIAR EMPRESA</div>
            <div style="margin-bottom:12px;">
                <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">NOME DA EMPRESA *</label>
                <input type="text" id="criar-emp-nome" placeholder="Ex: Minha Transportadora" maxlength="100" style="width:100%;padding:10px;background:#050508;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">DESCRICAO (opcional)</label>
                <textarea id="criar-emp-desc" placeholder="Sua empresa em poucas palavras" rows="2" maxlength="200" style="width:100%;padding:10px;background:#050508;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;resize:none;"></textarea>
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">LOGO DA EMPRESA (opcional)</label>
                <div id="criar-emp-logo-preview" style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <div id="criar-emp-logo-thumb" style="width:56px;height:56px;border-radius:10px;background:#111;border:1px dashed #333;display:flex;align-items:center;justify-content:center;font-size:24px;color:#555;overflow:hidden;flex-shrink:0;">🏢</div>
                    <div>
                        <label for="criar-emp-logo" style="display:inline-block;padding:6px 14px;background:#1a2a1a;border:1px solid #00ff8840;border-radius:6px;color:#00ff88;font-size:11px;cursor:pointer;">Escolher arquivo</label>
                        <div style="font-size:9px;color:#555;margin-top:4px;">PNG ou JPG, max 2MB</div>
                    </div>
                </div>
                <input type="file" id="criar-emp-logo" accept="image/*" style="display:none;">
            </div>
            <div style="margin-bottom:16px;">
                <label style="font-size:10px;color:#888;letter-spacing:1px;display:block;margin-bottom:4px;">BANNER DA EMPRESA (opcional)</label>
                <div id="criar-emp-banner-preview" style="margin-bottom:6px;">
                    <div id="criar-emp-banner-thumb" style="width:100%;height:80px;border-radius:8px;background:#111;border:1px dashed #333;display:flex;align-items:center;justify-content:center;font-size:11px;color:#555;overflow:hidden;">Clique para selecionar banner</div>
                </div>
                <input type="file" id="criar-emp-banner" accept="image/*" style="display:none;">
            </div>
            <div id="criar-emp-error" style="color:#ff4444;font-size:11px;text-align:center;margin-bottom:10px;"></div>
            <div style="display:flex;gap:10px;">
                <button id="criar-emp-cancelar" style="flex:1;padding:10px;background:#222;border:1px solid #333;border-radius:6px;color:#888;font-size:12px;cursor:pointer;">CANCELAR</button>
                <button id="criar-emp-confirmar" style="flex:1;padding:10px;background:#f5c842;border:none;border-radius:6px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">CRIAR</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.getElementById('criar-emp-cancelar').addEventListener('click', () => overlay.remove());

    const logoInput = document.getElementById('criar-emp-logo');
    const logoThumb = document.getElementById('criar-emp-logo-thumb');
    logoInput.addEventListener('change', () => {
        const file = logoInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                logoThumb.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;">';
            };
            reader.readAsDataURL(file);
        }
    });
    logoThumb.style.cursor = 'pointer';
    logoThumb.addEventListener('click', () => logoInput.click());

    const bannerInput = document.getElementById('criar-emp-banner');
    const bannerThumb = document.getElementById('criar-emp-banner-thumb');
    bannerInput.addEventListener('change', () => {
        const file = bannerInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                bannerThumb.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;">';
            };
            reader.readAsDataURL(file);
        }
    });
    bannerThumb.style.cursor = 'pointer';
    bannerThumb.addEventListener('click', () => bannerInput.click());

    document.getElementById('criar-emp-confirmar').addEventListener('click', async () => {
        const nome = document.getElementById('criar-emp-nome').value.trim();
        const descricao = document.getElementById('criar-emp-desc').value.trim();
        const errorDiv = document.getElementById('criar-emp-error');
        const btn = document.getElementById('criar-emp-confirmar');

        if (!nome) {
            errorDiv.textContent = 'Digite o nome da empresa';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'CRIANDO...';

        const formData = new FormData();
        formData.append('nome', nome);
        formData.append('descricao', descricao);
        if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);
        if (bannerInput.files[0]) formData.append('banner', bannerInput.files[0]);

        const token = getAuthToken();
        const res = await fetch('/api/empresas/solicitar', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });

        if (res) {
            const data = await res.json();
            if (data.ok) {
                overlay.remove();
                const user = getAuthUser();
                if (user) {
                    user.empresa = data.empresa;
                    setAuth(getAuthToken(), user);
                }
                window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(data.empresa);
            } else {
                errorDiv.textContent = data.error || 'Erro ao criar empresa';
                btn.disabled = false;
                btn.textContent = 'CRIAR';
            }
        } else {
            errorDiv.textContent = 'Erro de conexao';
            btn.disabled = false;
            btn.textContent = 'CRIAR';
        }
    });

    document.getElementById('criar-emp-nome').focus();
}

(async function init() {
    const ok = await loadData();
    if (ok) renderPage();
})();
