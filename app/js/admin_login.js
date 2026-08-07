async function init() {
    if (isLoggedIn()) {
        const user = getAuthUser();
        if (user && user.tipo === 'admin' && user.email === 'admin@cargostats.com') {
            window.location.href = 'admin_local.html';
            return;
        }
    }

    const app = document.getElementById('app');

    const frame = document.createElement('div');
    frame.className = 'auth-frame';
    frame.innerHTML = `
        <div class="auth-card">
            <div class="auth-title">ADMIN</div>
            <div id="login-error" class="auth-error"></div>
            <form id="admin-login-form" class="auth-form">
                <div class="auth-field">
                    <label>EMAIL</label>
                    <input type="email" id="email" placeholder="admin@cargostats.com" required autocomplete="email">
                </div>
                <div class="auth-field">
                    <label>SENHA</label>
                    <input type="password" id="senha" placeholder="Sua senha" required autocomplete="current-password">
                </div>
                <button type="submit" class="auth-btn" id="btn-login">ENTRAR</button>
            </form>
            <div class="auth-footer">
                <a href="login_local.html">Voltar ao login</a>
            </div>
        </div>`;
    app.appendChild(frame);

    const form = document.getElementById('admin-login-form');
    const errorDiv = document.getElementById('login-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const btn = document.getElementById('btn-login');

        errorDiv.textContent = '';
        btn.disabled = true;
        btn.textContent = 'ENTRANDO...';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });
            const data = await response.json();

            if (!response.ok) {
                errorDiv.textContent = data.error || 'Credenciais invalidas';
                btn.disabled = false;
                btn.textContent = 'ENTRAR';
                return;
            }

            if (!data.user || data.user.tipo !== 'admin' || data.user.email !== 'admin@cargostats.com') {
                errorDiv.textContent = 'Acesso restrito a administradores';
                btn.disabled = false;
                btn.textContent = 'ENTRAR';
                return;
            }

            setAuth(data.token, data.user);
            if (window.cargoStats && window.cargoStats.saveCredentials) {
                window.cargoStats.saveCredentials({ email: data.user.email, token: data.token, user: data.user });
            }
            window.location.href = 'admin_local.html';
        } catch (err) {
            errorDiv.textContent = 'Erro de conexao com o servidor';
            btn.disabled = false;
            btn.textContent = 'ENTRAR';
        }
    });
}

init();
