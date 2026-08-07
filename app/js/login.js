async function init() {
    if (isLoggedIn()) {
        const user = getAuthUser();
        if (user.tipo === 'admin' && user.email === 'admin@cargostats.com') {
            window.location.href = 'admin_local.html';
        } else if (user.empresa && user.empresa !== 'Lobo Solitário') {
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

    const isDesktop = !!(window.cargoStats && window.cargoStats.steamLogin);

    if (!isDesktop) {
        frame.innerHTML = `
            <div class="auth-card">
                <div style="text-align:center;margin-bottom:16px;"><img src="images/logo.png" alt="CS" style="height:40px;"></div>
                <div style="color:#888;font-size:13px;text-align:center;line-height:1.6;padding:10px;">
                    O login no navegador esta disponivel apenas para administradores.<br><br>
                    Para acessar o Cargo Stats, baixe o aplicativo para Windows:
                </div>
                <a href="/download" style="display:block;margin-top:16px;padding:12px 24px;background:#00ff88;color:#000;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:1px;text-align:center;">
                    BAIXAR CARGO STATS
                </a>
                <div style="margin-top:16px;font-size:11px;color:#555;text-align:center;">
                    <a href="admin_login.html" style="color:#00ff88;display:block;padding:8px;border:1px solid #00ff8840;border-radius:6px;margin-bottom:6px;">🔐 Login Administrador (local)</a>
                    <a href="https://cargo.brasiltruck.online/admin" style="color:#888;">🌐 Admin Web (hospedagem)</a>
                </div>
            </div>`;
    } else {
        frame.innerHTML = `
            <div class="auth-card">
                <div style="text-align:center;margin-bottom:16px;"><img src="images/logo.png" alt="CS" style="height:40px;"></div>
                <div class="auth-title" style="margin-bottom:8px;">ENTRAR</div>
                <div style="color:#888;font-size:12px;text-align:center;margin-bottom:20px;line-height:1.4;">
                    Conecte-se com sua conta Steam<br>
                    <span style="color:#666;font-size:11px;">Novo? Sua conta começa como Lobo Solitário 🐺</span>
                </div>
                <div id="login-error" class="auth-error"></div>
                <button id="btn-steam-login" class="auth-btn-steam">
                    <svg width="24" height="24" viewBox="0 0 496 512" fill="currentColor" style="margin-right:8px;vertical-align:middle;">
                        <path d="M496 256c0 137-111.2 248-248.4 248-113.8 0-209.6-76.3-239-180.4l95.2 39.3c6.4 32.1 34.9 56.4 68.9 56.4 39.2 0 71.9-32.4 70.2-73.5l84.5-60.2c52.1 1.3 95.8-40.9 95.8-93.5 0-51.6-42-93.5-93.7-93.5s-93.7 42-93.7 93.5v1.2L176.6 279c-15.5-.9-30.7 3.4-43.5 12.1L0 236.1C10.2 108.4 117.1 8 247.6 8 384.8 8 496 119 496 256zM155.7 384.3l-30.5-12.6a52.79 52.79 0 0 0 27.2 25.8c26.9 11.2 57.8-1.6 69-28.4 5.4-13 5.5-27.3.1-40.3-5.4-13-15.5-23.2-28.5-28.6-12.9-5.4-26.7-5.2-38.9-.6l31.5 13c19.8 8.2 29.2 30.9 20.9 50.7-8.3 19.9-31 29.2-50.8 21zm173.8-129.9c-34.4 0-62.4-28-62.4-62.3s28-62.3 62.4-62.3 62.4 28 62.4 62.3-27.9 62.3-62.4 62.3zm.1-15.6c25.9 0 46.9-21 46.9-46.8 0-25.9-21-46.8-46.9-46.8s-46.9 21-46.9 46.8c.1 25.8 21.1 46.8 46.9 46.8z"/></svg>
                    Entrar com Steam
                </button>
            </div>`;
    }

    app.appendChild(frame);

    if (isDesktop) {
        document.getElementById('btn-steam-login').addEventListener('click', onClickSteamLogin);
    }
}

async function onClickSteamLogin() {
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('btn-steam-login');
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Abrindo Steam...';

    try {
        const result = await window.cargoStats.steamLogin();
        if (!result.success) {
            if (result.error && result.error.includes('fechada')) {
                resetSteamBtn(btn);
                return;
            }
            showToast(result.error || 'Erro ao autenticar com Steam', 'error');
            resetSteamBtn(btn);
            return;
        }

        btn.textContent = 'Conectando...';

        // Check if user exists or create as Lobo Solitário
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
            showToast(data.error || 'Erro ao fazer login', 'error');
            resetSteamBtn(btn);
            return;
        }

        setAuth(data.token, data.user);
        if (window.cargoStats) {
            window.cargoStats.saveCredentials({ email: data.user.email, token: data.token, user: data.user });
        }

        if (data.user.empresa && data.user.empresa !== 'Lobo Solitário') {
            window.location.href = 'empresa_local.html?empresa=' + encodeURIComponent(data.user.empresa);
        } else {
            window.location.href = 'perfil_local.html?motorista=' + encodeURIComponent(data.user.nome);
        }
    } catch (err) {
        showToast('Erro de conexao com o servidor', 'error');
        resetSteamBtn(btn);
    }
}

function resetSteamBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 496 512" fill="currentColor" style="margin-right:8px;vertical-align:middle;"><path d="M496 256c0 137-111.2 248-248.4 248-113.8 0-209.6-76.3-239-180.4l95.2 39.3c6.4 32.1 34.9 56.4 68.9 56.4 39.2 0 71.9-32.4 70.2-73.5l84.5-60.2c52.1 1.3 95.8-40.9 95.8-93.5 0-51.6-42-93.5-93.7-93.5s-93.7 42-93.7 93.5v1.2L176.6 279c-15.5-.9-30.7 3.4-43.5 12.1L0 236.1C10.2 108.4 117.1 8 247.6 8 384.8 8 496 119 496 256zM155.7 384.3l-30.5-12.6a52.79 52.79 0 0 0 27.2 25.8c26.9 11.2 57.8-1.6 69-28.4 5.4-13 5.5-27.3.1-40.3-5.4-13-15.5-23.2-28.5-28.6-12.9-5.4-26.7-5.2-38.9-.6l31.5 13c19.8 8.2 29.2 30.9 20.9 50.7-8.3 19.9-31 29.2-50.8 21zm173.8-129.9c-34.4 0-62.4-28-62.4-62.3s28-62.3 62.4-62.3 62.4 28 62.4 62.3-27.9 62.3-62.4 62.3zm.1-15.6c25.9 0 46.9-21 46.9-46.8 0-25.9-21-46.8-46.9-46.8s-46.9 21-46.9 46.8c.1 25.8 21.1 46.8 46.9 46.8z"/></svg> Entrar com Steam';
}

init();
