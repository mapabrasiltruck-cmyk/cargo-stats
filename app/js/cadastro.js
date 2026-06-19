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

init();
