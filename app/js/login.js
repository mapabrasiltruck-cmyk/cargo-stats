async function init() {
    if (isLoggedIn()) {
        const user = getAuthUser();
        if (user.tipo === 'admin' && user.email === 'admin@cargostats.com') {
            window.location.href = 'admin_local.html';
        } else if (user.empresa) {
            window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(user.empresa);
        } else {
            window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(user.nome);
        }
        return;
    }

    const app = document.getElementById('app');
    const nav = renderNav('login_local.html');
    app.appendChild(nav);

    const frame = document.createElement('div');
    frame.className = 'auth-frame';
    frame.innerHTML = `
        <div class="auth-card">
            <div class="auth-title">ENTRAR</div>
            <form id="login-form" class="auth-form">
                <div class="auth-field">
                    <label>E-MAIL</label>
                    <input type="email" id="email" placeholder="seu@email.com" required>
                </div>
                <div class="auth-field">
                    <label>SENHA</label>
                    <input type="password" id="senha" placeholder="Sua senha" required>
                </div>
                <div class="auth-field auth-remember">
                    <label>
                        <input type="checkbox" id="lembrar">
                        Lembrar meus dados
                    </label>
                    <button type="button" id="limpar-dados" class="auth-btn-clean" style="display:none">Limpar dados salvos</button>
                </div>
                <div id="login-error" class="auth-error"></div>
                <button type="submit" class="auth-btn">ENTRAR</button>
            </form>
            <div class="auth-footer">
                Nao tem conta? <a href="cadastro_local.html">Cadastre-se</a>
            </div>
        </div>`;
    app.appendChild(frame);

    const savedEmail = localStorage.getItem('cargo_login_email') || '';
    const savedSenha = localStorage.getItem('cargo_login_senha') || '';

    if (savedEmail) {
        document.getElementById('email').value = savedEmail;
    }
    if (savedSenha) {
        document.getElementById('senha').value = savedSenha;
        document.getElementById('lembrar').checked = true;
        document.getElementById('limpar-dados').style.display = 'inline-block';
    }

    document.getElementById('limpar-dados').addEventListener('click', () => {
        localStorage.removeItem('cargo_login_email');
        localStorage.removeItem('cargo_login_senha');
        document.getElementById('email').value = '';
        document.getElementById('senha').value = '';
        document.getElementById('lembrar').checked = false;
        document.getElementById('limpar-dados').style.display = 'none';
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const lembrar = document.getElementById('lembrar').checked;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';

        if (!email || !senha) {
            errorDiv.textContent = 'Preencha todos os campos';
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });
            const data = await response.json();

            if (!response.ok) {
                errorDiv.textContent = data.error || 'Erro ao fazer login';
                return;
            }

            if (lembrar) {
                localStorage.setItem('cargo_login_email', email);
                localStorage.setItem('cargo_login_senha', senha);
                document.getElementById('limpar-dados').style.display = 'inline-block';
            } else {
                localStorage.removeItem('cargo_login_email');
                localStorage.removeItem('cargo_login_senha');
                document.getElementById('limpar-dados').style.display = 'none';
            }

            setAuth(data.token, data.user);

            if (data.user.tipo === 'admin' && data.user.email === 'admin@cargostats.com') {
                window.location.href = 'admin_local.html';
            } else if (data.user.empresa) {
                window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(data.user.empresa);
            } else {
                window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(data.user.nome);
            }
        } catch(err) {
            errorDiv.textContent = 'Erro de conexao com o servidor';
        }
    });
}

init();
