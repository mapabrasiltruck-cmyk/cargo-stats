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
            <div class="auth-divider" id="steam-divider">
                <span>ou</span>
            </div>
            <button id="btn-steam-login" class="auth-btn-steam">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/>
                </svg>
                Entrar com Steam
            </button>
            <div class="auth-footer">
                Nao tem conta? <a href="cadastro_local.html">Cadastre-se</a>
            </div>
        </div>`;
    app.appendChild(frame);

    (async () => {
        const saved = window.cargoStats ? await window.cargoStats.loadCredentials() : null;
        const savedEmail = (saved && saved.email) || localStorage.getItem('cargo_login_email') || '';

        if (savedEmail) {
            document.getElementById('email').value = savedEmail;
            document.getElementById('lembrar').checked = true;
            document.getElementById('limpar-dados').style.display = 'inline-block';
        }
    })();

    document.getElementById('limpar-dados').addEventListener('click', () => {
        localStorage.removeItem('cargo_login_email');
        if (window.cargoStats) window.cargoStats.clearCredentials();
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
                if (window.cargoStats) {
                    window.cargoStats.saveCredentials({ email, token: data.token, user: data.user });
                }
                document.getElementById('limpar-dados').style.display = 'inline-block';
            } else {
                localStorage.removeItem('cargo_login_email');
                if (window.cargoStats) window.cargoStats.clearCredentials();
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

    // Steam Login Button
    const btnSteam = document.getElementById('btn-steam-login');
    const steamDivider = document.getElementById('steam-divider');
    if (btnSteam && window.cargoStats && window.cargoStats.steamLogin) {
        btnSteam.addEventListener('click', async () => {
            const errorDiv = document.getElementById('login-error');
            errorDiv.textContent = '';
            btnSteam.disabled = true;
            btnSteam.textContent = 'Abrindo Steam...';

            try {
                const result = await window.cargoStats.steamLogin();
                if (!result.success) {
                    if (result.error && result.error.includes('fechada')) {
                        btnSteam.disabled = false;
                        btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Entrar com Steam';
                        return;
                    }
                    errorDiv.textContent = result.error || 'Erro ao autenticar com Steam';
                    btnSteam.disabled = false;
                    btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Entrar com Steam';
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
                    btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Entrar com Steam';
                    return;
                }

                setAuth(data.token, data.user);
                if (window.cargoStats) {
                    window.cargoStats.saveCredentials({ email: data.user.email, token: data.token, user: data.user });
                }

                if (data.user.empresa) {
                    window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(data.user.empresa);
                } else {
                    window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(data.user.nome);
                }
            } catch (err) {
                errorDiv.textContent = 'Erro de conexao com o servidor';
                btnSteam.disabled = false;
                btnSteam.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> Entrar com Steam';
            }
        });
    } else if (btnSteam) {
        btnSteam.style.display = 'none';
        if (steamDivider) steamDivider.style.display = 'none';
    }
}

init();
