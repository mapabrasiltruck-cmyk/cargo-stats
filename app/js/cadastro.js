let modoAtual = '';

async function init() {
    if (isLoggedIn()) {
        const user = getAuthUser();
        if (user.tipo === 'admin') { window.location.href = 'admin_local.html'; return; }
        if (user.empresa) { window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(user.empresa); return; }
        window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(user.nome);
        return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="auth-frame">
            <div class="auth-card" style="max-width:600px">
                <div class="auth-title">CRIAR SUA CONTA</div>
                <div id="escolha-modo" style="display:flex;gap:16px;margin:20px 0;flex-wrap:wrap;justify-content:center">
                    <div class="modo-card" onclick="escolherModo('empresa')" style="cursor:pointer;border:2px solid #333;border-radius:12px;padding:24px 20px;text-align:center;flex:1;min-width:200px;transition:border-color 0.3s;background:#0d1117">
                        <div style="font-size:36px;margin-bottom:8px">🏢</div>
                        <div style="color:#00ff88;font-weight:700;font-size:14px;letter-spacing:1px">CRIAR EMPRESA</div>
                        <div style="color:#666;font-size:11px;margin-top:6px">Crie sua empresa com logo e banner</div>
                    </div>
                    <div class="modo-card" onclick="escolherModo('lobo')" style="cursor:pointer;border:2px solid #333;border-radius:12px;padding:24px 20px;text-align:center;flex:1;min-width:200px;transition:border-color 0.3s;background:#0d1117">
                        <div style="font-size:36px;margin-bottom:8px">🐺</div>
                        <div style="color:#ffaa00;font-weight:700;font-size:14px;letter-spacing:1px">LOBO SOLITARIO</div>
                        <div style="color:#666;font-size:11px;margin-top:6px">Motorista independente, sem empresa</div>
                    </div>
                </div>
                <div id="form-area"></div>
                <div id="cadastro-error" class="auth-error"></div>
                <div id="cadastro-success" class="auth-success"></div>
                <div class="auth-divider" id="steam-divider"><span>ou</span></div>
                <button id="btn-steam-login" class="auth-btn-steam">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;">
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/>
                    </svg>
                    Criar conta com Steam
                </button>
                <div class="auth-footer">
                    Ja tem conta? <a href="login_local.html">Entrar</a>
                </div>
            </div>
        </div>`;
}

function escolherModo(modo) {
    modoAtual = modo;
    const cards = document.querySelectorAll('.modo-card');
    cards.forEach(c => { c.style.borderColor = '#333'; c.style.background = '#0d1117'; });

    const formArea = document.getElementById('form-area');
    const errorDiv = document.getElementById('cadastro-error');
    const successDiv = document.getElementById('cadastro-success');
    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (modo === 'empresa') {
        cards[0].style.borderColor = '#00ff88';
        cards[0].style.background = '#0d1117';
        formArea.innerHTML = `
            <form id="cadastro-form" class="auth-form" style="margin-top:16px">
                <div class="auth-field"><label>NOME DA EMPRESA</label><input type="text" id="emp-nome" placeholder="Ex: Brasil Log" required></div>
                <div class="auth-field"><label>SEU NOME</label><input type="text" id="nome" placeholder="Seu nome completo" required></div>
                <div class="auth-field"><label>E-MAIL</label><input type="email" id="email" placeholder="seu@email.com" required></div>
                <div class="auth-field"><label>SENHA</label><input type="password" id="senha" placeholder="Minimo 4 caracteres" required minlength="4"></div>
                <div class="auth-field"><label>LOGO (opcional)</label><input type="file" id="emp-logo" accept="image/*" class="admin-input" style="padding:6px"></div>
                <div class="auth-field"><label>BANNER (opcional)</label><input type="file" id="emp-banner" accept="image/*" class="admin-input" style="padding:6px"></div>
                <div class="auth-field"><label>DESCRICAO (opcional)</label><textarea id="emp-desc" placeholder="Sobre sua empresa" class="admin-input" rows="2"></textarea></div>
                <button type="submit" class="auth-btn" style="background:#00ff88;color:#000">CRIAR EMPRESA E CONTA</button>
            </form>`;
        document.getElementById('cadastro-form').addEventListener('submit', cadastrarEmpresa);
    } else {
        cards[1].style.borderColor = '#ffaa00';
        cards[1].style.background = '#0d1117';
        formArea.innerHTML = `
            <form id="cadastro-form" class="auth-form" style="margin-top:16px">
                <div class="auth-field"><label>SEU NOME</label><input type="text" id="nome" placeholder="Seu nome completo" required></div>
                <div class="auth-field"><label>E-MAIL</label><input type="email" id="email" placeholder="seu@email.com" required></div>
                <div class="auth-field"><label>SENHA</label><input type="password" id="senha" placeholder="Minimo 4 caracteres" required minlength="4"></div>
                <button type="submit" class="auth-btn" style="background:#ffaa00;color:#000">CRIAR CONTA</button>
            </form>`;
        document.getElementById('cadastro-form').addEventListener('submit', cadastrarLobo);
    }
}

async function cadastrarEmpresa(e) {
    e.preventDefault();
    const nomeEmpresa = document.getElementById('emp-nome').value.trim();
    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    const logoFile = document.getElementById('emp-logo').files[0];
    const bannerFile = document.getElementById('emp-banner').files[0];
    const descricao = document.getElementById('emp-desc').value.trim();
    const errorDiv = document.getElementById('cadastro-error');
    const successDiv = document.getElementById('cadastro-success');
    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (!nomeEmpresa || !nome || !email || !senha) { errorDiv.textContent = 'Preencha todos os campos obrigatorios'; return; }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha, tipo: 'motorista', empresa: nomeEmpresa })
        });
        const data = await response.json();
        if (!response.ok) { errorDiv.textContent = data.error || 'Erro ao cadastrar'; return; }

        setAuth(data.token, data.user);

        const formData = new FormData();
        formData.append('nome', nomeEmpresa);
        formData.append('descricao', descricao);
        if (logoFile) formData.append('logo', logoFile);
        if (bannerFile) formData.append('banner', bannerFile);

        const res = await fetch('/api/empresas/solicitar', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + data.token },
            body: formData
        });
        const result = await res.json();
        if (result.ok) {
            const updatedUser = { ...data.user, empresa: nomeEmpresa };
            localStorage.setItem('cargo_user', JSON.stringify(updatedUser));
            successDiv.textContent = 'Conta e empresa criadas! Redirecionando...';
            setTimeout(() => { window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(nomeEmpresa); }, 1500);
        } else {
            errorDiv.textContent = result.error || 'Erro ao criar empresa';
        }
    } catch (err) {
        errorDiv.textContent = 'Erro de conexao com o servidor';
    }
}

async function cadastrarLobo(e) {
    e.preventDefault();
    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    const errorDiv = document.getElementById('cadastro-error');
    const successDiv = document.getElementById('cadastro-success');
    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (!nome || !email || !senha) { errorDiv.textContent = 'Preencha todos os campos'; return; }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha, tipo: 'motorista', empresa: 'Lobo Solitário' })
        });
        const data = await response.json();
        if (!response.ok) { errorDiv.textContent = data.error || 'Erro ao cadastrar'; return; }

        setAuth(data.token, data.user);
        successDiv.textContent = 'Conta criada! Redirecionando...';
        setTimeout(() => { window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(nome); }, 1500);
    } catch (err) {
        errorDiv.textContent = 'Erro de conexao com o servidor';
    }
}

async function handleSteamLogin() {
    const errorDiv = document.getElementById('cadastro-error');
    const successDiv = document.getElementById('cadastro-success');
    errorDiv.textContent = '';
    successDiv.textContent = '';
    const btnSteam = document.getElementById('btn-steam-login');
    btnSteam.disabled = true;
    btnSteam.textContent = 'Abrindo Steam...';

    try {
        const result = await window.cargoStats.steamLogin();
        if (!result.success) {
            if (result.error && result.error.includes('fechada')) {
                btnSteam.disabled = false;
                btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Criar conta com Steam';
                return;
            }
            errorDiv.textContent = result.error || 'Erro ao autenticar com Steam';
            btnSteam.disabled = false;
            btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Criar conta com Steam';
            return;
        }

        btnSteam.textContent = 'Conectando...';

        const response = await fetch('/api/auth/steam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                steam_id: result.steam_id,
                nome: result.nome,
                avatar: result.avatar
            })
        });
        const data = await response.json();

        if (!response.ok) {
            errorDiv.textContent = data.error || 'Erro ao criar conta Steam';
            btnSteam.disabled = false;
            btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Criar conta com Steam';
            return;
        }

        setAuth(data.token, data.user);
        if (window.cargoStats) {
            window.cargoStats.saveCredentials({ email: data.user.email, token: data.token, user: data.user });
        }

        successDiv.textContent = 'Conta criada via Steam! Redirecionando...';
        setTimeout(() => {
            if (data.user.empresa) {
                window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(data.user.empresa);
            } else {
                window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(data.user.nome);
            }
        }, 1500);
    } catch (err) {
        errorDiv.textContent = 'Erro de conexao com o servidor';
        btnSteam.disabled = false;
        btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Criar conta com Steam';
    }
}

// Steam Login Button (only in Electron)
const btnSteamCadastro = document.getElementById('btn-steam-login');
const steamDividerCadastro = document.getElementById('steam-divider');
if (btnSteamCadastro && window.cargoStats && window.cargoStats.steamLogin) {
    btnSteamCadastro.addEventListener('click', handleSteamLogin);
} else if (btnSteamCadastro) {
    btnSteamCadastro.style.display = 'none';
    if (steamDividerCadastro) steamDividerCadastro.style.display = 'none';
}

init();
