async function carregarLoja() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    const nav = renderNav('loja_local.html');
    app.appendChild(nav);

    const container = document.createElement('div');
    container.className = 'loja-container';
    app.appendChild(container);

    const user = getAuthUser();
    if (!user || !user.nome) {
        container.innerHTML = `
            <div class="loja-header">
                <h1>LOJA CS GOLD</h1>
                <p style="color:#888;">Faca login para acessar a loja</p>
            </div>`;
        return;
    }

    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Carregando loja...</div>';

    try {
        const [titulosResp, saldoResp, inventarioResp, tituloEquipadoResp, planoResp] = await Promise.all([
            authFetch('/api/loja/titulos'),
            authFetch('/api/loja/saldo'),
            authFetch('/api/loja/inventario'),
            authFetch('/api/loja/titulo-equipado?motorista=' + encodeURIComponent(user.nome)),
            authFetch('/api/loja/plano-info', { method: 'POST' })
        ]);

        if (!titulosResp || !saldoResp || !inventarioResp || !tituloEquipadoResp) {
            container.innerHTML = `
                <div class="loja-header">
                    <h1>LOJA CS GOLD</h1>
                    <p style="color:#ff4444;">Sessao expirada. <a href="login_local.html" style="color:#ff8800;">Faca login novamente</a></p>
                </div>`;
            return;
        }

        if (!titulosResp.ok || !saldoResp.ok || !inventarioResp.ok) {
            let detalhes = '';
            try { const d = await titulosResp.json(); detalhes += 'titulos: ' + (d.error || titulosResp.status) + ' | '; } catch(e) { detalhes += 'titulos: ' + titulosResp.status + ' | '; }
            try { const d = await saldoResp.json(); detalhes += 'saldo: ' + (d.error || saldoResp.status) + ' | '; } catch(e) { detalhes += 'saldo: ' + saldoResp.status + ' | '; }
            try { const d = await inventarioResp.json(); detalhes += 'inventario: ' + (d.error || inventarioResp.status); } catch(e) { detalhes += 'inventario: ' + inventarioResp.status; }
            container.innerHTML = `<div class="loja-header"><h1>LOJA CS GOLD</h1><p style="color:#ff4444;">Erro ao carregar dados</p><p style="color:#888;font-size:11px;">${detalhes}</p></div>`;
            return;
        }

        const titulosData = await titulosResp.json();
        const saldoData = await saldoResp.json();
        const inventarioData = await inventarioResp.json();
        let tituloEquipadoData = null;
        try { tituloEquipadoData = await tituloEquipadoResp.json(); } catch(e) {}
        let planoData = null;
        try { const p = await planoResp.json(); if (p.ok) planoData = p; } catch(e) {}

        if (titulosData.error || saldoData.error) {
            container.innerHTML = `<div class="loja-header"><h1>LOJA CS GOLD</h1><p style="color:#ff4444;">Erro: ${titulosData.error || saldoData.error}</p></div>`;
            return;
        }

        const titulos = titulosData.titulos || [];
        const saldo = saldoData.saldo || 0;
        const doador = saldoData.doador || false;
        const inventario = inventarioData.inventario || [];
        const titulosComprados = inventario.map(i => i.titulo_id || i.id);
        const titulosEquipados = tituloEquipadoData ? tituloEquipadoData.titulos || [] : [];
        const plano = planoData || { plano: 'bronze', slots: 0, doador: false, isGold: false, isVip: false };

        renderizarLoja(container, titulos, saldo, doador, inventario, user.nome, titulosComprados, titulosEquipados, plano);
    } catch (e) {
        console.error('Erro ao carregar loja:', e);
        let debugInfo = '';
        try {
            const debugResp = await fetch('/api/loja/debug?_=' + Date.now());
            if (debugResp.ok) {
                const debug = await debugResp.json();
                debugInfo = `\n\n[DEBUG] Tabelas: ${(debug.tables || []).join(', ') || 'nenhuma'}\nTitulos: ${debug.titulosCount || 0}\nSessao: ${debug.sessionNome || 'nenhuma'}`;
            }
        } catch (e2) {}
        const detalhes = e.message || e.toString() || 'Desconhecido';
        container.innerHTML = `<div class="loja-header"><h1>LOJA CS GOLD</h1><p style="color:#ff4444;">Erro de conexao</p><p style="color:#888;font-size:11px;margin-top:8px;">${detalhes}${debugInfo}</p><p style="color:#666;font-size:10px;margin-top:4px;">Verifique se o servidor esta rodando. Abra o console (F12) para mais detalhes.</p></div>`;
    }
}

function renderPlanoBadge(plano) {
    const map = {
        bronze: { icon: '🥉', label: 'Bronze', color: '#cd7f32' },
        gold: { icon: '🥇', label: 'Gold', color: '#ffd700' },
        vip: { icon: '💎', label: 'VIP', color: '#b366ff' }
    };
    const p = map[plano] || map.bronze;
    return `<span class="plano-badge" style="color:${p.color};border-color:${p.color};">${p.icon} ${p.label}</span>`;
}

function renderizarLoja(container, titulos, saldo, doador, inventario, motorista, titulosComprados, titulosEquipados, plano) {
    container.innerHTML = '';

    const equipadosIds = titulosEquipados.map(t => t.id);

    // Header
    const header = document.createElement('div');
    header.className = 'loja-header';
    header.innerHTML = `
        <h1>LOJA CS GOLD</h1>
        <div class="loja-saldo">
            <img src="images/LogoMoeda.png" class="cs-gold-icon-lg" alt="CS Gold">
            <span class="loja-saldo-valor">${saldo.toLocaleString('pt-BR')}</span>
            <span class="loja-saldo-label">pontos disponiveis</span>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;">
            ${renderPlanoBadge(plano.plano)}
            <span style="font-size:11px;color:#888;">${plano.slots} slot(s) de titulo</span>
            ${doador ? '<span class="loja-doador-badge" style="margin:0;">TROFEU DOADOR</span>' : ''}
        </div>
    `;
    container.appendChild(header);

    // Planos section
    const planosSection = document.createElement('div');
    planosSection.className = 'loja-planos-section';
    planosSection.innerHTML = `
        <h2 class="loja-section-title">PLANOS</h2>
        <div class="loja-planos-grid">
            ${renderPlanoCard('bronze', 'Gratis', ['0 slots de titulo', 'Acesso a loja', 'Nivel Bronze'], plano.plano === 'bronze', true)}
            ${renderPlanoCard('gold', 'R$ 14,90/mes', ['3 slots de titulo', 'Tag dourada no ranking', 'Titulo Gold exclusivo', 'Destaque no perfil'], plano.plano === 'gold', false)}
            ${renderPlanoCard('vip', 'R$ 29,90/mes', ['5 slots de titulo', 'Tag VIP no ranking', 'Titulo VIP exclusivo', 'Destaque no perfil', 'Titulos exclusivos VIP'], plano.plano === 'vip', false)}
            ${renderPlanoCard('doador', 'Qualquer valor', ['Titulo Tofeu Doador', 'Tag dourada especial', 'Apoiador oficial'], doador, false)}
        </div>
    `;
    container.appendChild(planosSection);

    // PIX info / call to action
    if (plano.plano === 'bronze' || !doador) {
        const pixSection = document.createElement('div');
        pixSection.className = 'loja-donate-section';
        pixSection.innerHTML = `
            <div class="loja-donate-card">
                <div class="loja-donate-title">APOIE O CARGO STATS</div>
                <div class="loja-donate-desc">
                    Faca um PIX e desbloqueie Gold, VIP ou o Tofeu Doador!
                    <br>Apos o pagamento, o admin ativa manualmente.
                </div>
                <div class="loja-donate-pix">
                    <div class="loja-donate-pix-label">CHAVE PIX</div>
                    <div class="loja-donate-pix-key">lf7artes@gmail.com</div>
                    <button class="loja-donate-copy-btn" onclick="copiarPix()">Copiar</button>
                </div>
                <div id="loja-donate-status" style="font-size:11px;margin-top:6px;"></div>
                <div style="font-size:11px;color:#ffaa00;margin-top:8px;">
                    Apos pagar, envie o comprovante no Discord para o admin ativar seu plano!
                </div>
            </div>
        `;
        container.appendChild(pixSection);
    }

    // Inventory - Meus Titulos
    if (inventario.length > 0) {
        const invSection = document.createElement('div');
        invSection.className = 'loja-section';
        invSection.innerHTML = `<h2 class="loja-section-title">Meus Titulos (${inventario.length}) <span style="color:#888;font-size:10px;">| ${equipadosIds.length}/${plano.slots} equipados</span></h2>`;

        const invGrid = document.createElement('div');
        invGrid.className = 'loja-inventario-grid';

        inventario.forEach(item => {
            const isEquipado = equipadosIds.includes(item.titulo_id || item.id);
            const isMapa = item.tipo === 'mapa';
            const card = document.createElement('div');
            card.className = `loja-item-card loja-item-comprado ${isEquipado ? 'loja-item-equipado' : ''} ${isMapa ? 'loja-item-mapa' : ''}`;
            card.innerHTML = isMapa ? `
                <div class="loja-item-icone">
                    <img src="${item.imagem_url}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;" alt="${item.nome}">
                </div>
                <div class="loja-item-nome">${item.nome}</div>
                <div class="loja-item-desc">${item.descricao}</div>
                <div class="loja-item-status" style="color:#00ff88;">ADQUIRIDO</div>
            ` : `
                <div class="loja-item-icone">${item.icone}</div>
                <div class="loja-item-nome">${item.nome}</div>
                <div class="loja-item-desc">${item.descricao}</div>
                ${isEquipado
                    ? '<div class="loja-item-status loja-equipado-label">EQUIPADO</div>'
                    : `<button class="loja-equipar-btn" onclick="equiparTitulo(${item.titulo_id || item.id})">EQUIPAR</button>`
                }
            `;
            invGrid.appendChild(card);
        });

        if (equipadosIds.length > 0 && plano.slots > 1) {
            const deseqDiv = document.createElement('div');
            deseqDiv.style.cssText = 'grid-column:1/-1;text-align:center;margin-top:6px;';
            deseqDiv.innerHTML = `<button class="loja-equipar-btn" onclick="desequiparTitulo()" style="width:auto;padding:6px 20px;">DESEQUIPAR TUDO</button>`;
            invGrid.appendChild(deseqDiv);
        }

        invSection.appendChild(invGrid);
        container.appendChild(invSection);
    }

    // Shop - Titulos Disponiveis
    const shopSection = document.createElement('div');
    shopSection.className = 'loja-section';

    const isGold = plano.isGold || false;
    const isVip = plano.isVip || false;

    const titulosDisponiveis = titulos.filter(t => !titulosComprados.includes(t.id) && t.tipo !== 'plano');

    // Separate by requirement
    const titulosLivres = titulosDisponiveis.filter(t => !t.requer_plano || t.requer_plano === '');
    const titulosGold = titulosDisponiveis.filter(t => t.requer_plano === 'gold');
    const titulosVip = titulosDisponiveis.filter(t => t.requer_plano === 'vip');

    const podeComprarGold = isGold || isVip;
    const podeComprarVip = isVip;

    // ── Normal titles (anyone) ──
    if (titulosLivres.length > 0) {
        const normalSection = document.createElement('div');
        normalSection.className = 'loja-subsection';
        normalSection.innerHTML = `<h2 class="loja-section-title">Titulos Disponiveis</h2>`;
        const grid = document.createElement('div');
        grid.className = 'loja-shop-grid';
        titulosLivres.forEach(titulo => {
            const podeComprar = saldo >= titulo.preco_pontos;
            const isMapa = titulo.tipo === 'mapa';
            const card = document.createElement('div');
            card.className = `loja-item-card ${podeComprar ? 'loja-item-compravel' : 'loja-item-sem-saldo'} ${isMapa ? 'loja-item-mapa' : ''}`;
            card.innerHTML = `
                <div class="loja-item-icone">${isMapa
                    ? `<img src="${titulo.imagem_url}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;" alt="${titulo.nome}">`
                    : titulo.icone}
                </div>
                <div class="loja-item-nome">${titulo.nome}</div>
                <div class="loja-item-desc">${titulo.descricao}</div>
                <div class="loja-item-preco">
                    <img src="images/LogoMoeda.png" class="cs-gold-icon"> ${titulo.preco_pontos.toLocaleString('pt-BR')} pts
                </div>
                ${podeComprar
                    ? `<button class="loja-comprar-btn" onclick="comprarTitulo(${titulo.id})">COMPRAR</button>`
                    : `<div class="loja-sem-saldo">Faltam ${(titulo.preco_pontos - saldo).toLocaleString('pt-BR')} pts</div>`
                }
            `;
            grid.appendChild(card);
        });
        normalSection.appendChild(grid);
        shopSection.appendChild(normalSection);
    }

    // ── Gold titles ──
    if (titulosGold.length > 0) {
        const goldSection = document.createElement('div');
        goldSection.className = 'loja-subsection';
        const goldLabel = podeComprarGold
            ? `<h2 class="loja-section-title" style="color:#ffd700;">EXCLUSIVO GOLD <span style="font-size:11px;color:#888;">&#128081;</span></h2>`
            : `<h2 class="loja-section-title" style="color:#ffd700;">EXCLUSIVO GOLD <span style="font-size:11px;color:#888;">— Desbloqueie com Gold ou VIP</span></h2>`;
        goldSection.innerHTML = goldLabel;
        const grid = document.createElement('div');
        grid.className = 'loja-shop-grid';
        titulosGold.forEach(titulo => {
            const card = document.createElement('div');
            if (podeComprarGold) {
                const podeComprar = saldo >= titulo.preco_pontos;
                card.className = `loja-item-card ${podeComprar ? 'loja-item-compravel' : 'loja-item-sem-saldo'}`;
                card.innerHTML = `
                    <div class="loja-item-icone">${titulo.icone}</div>
                    <div class="loja-item-nome">${titulo.nome}</div>
                    <div class="loja-item-desc">${titulo.descricao}</div>
                    <div class="loja-item-preco">
                        <img src="images/LogoMoeda.png" class="cs-gold-icon"> ${titulo.preco_pontos.toLocaleString('pt-BR')} pts
                    </div>
                    ${podeComprar
                        ? `<button class="loja-comprar-btn" onclick="comprarTitulo(${titulo.id})">COMPRAR</button>`
                        : `<div class="loja-sem-saldo">Faltam ${(titulo.preco_pontos - saldo).toLocaleString('pt-BR')} pts</div>`
                    }
                `;
            } else {
                card.className = 'loja-item-card loja-item-bloqueado';
                card.innerHTML = `
                    <div class="loja-item-icone">${titulo.icone}</div>
                    <div class="loja-item-nome">${titulo.nome}</div>
                    <div class="loja-item-desc">${titulo.descricao}</div>
                    <div class="loja-item-preco loja-item-exclusivo">GOLD</div>
                `;
            }
            grid.appendChild(card);
        });
        goldSection.appendChild(grid);
        shopSection.appendChild(goldSection);
    }

    // ── VIP titles ──
    if (titulosVip.length > 0) {
        const vipSection = document.createElement('div');
        vipSection.className = 'loja-subsection';
        if (podeComprarVip) {
            vipSection.innerHTML = `<h2 class="loja-section-title" style="color:#b366ff;">EXCLUSIVO VIP <span style="font-size:11px;color:#888;">&#128142;</span></h2>`;
        } else if (podeComprarGold) {
            vipSection.innerHTML = `<h2 class="loja-section-title" style="color:#b366ff;">EXCLUSIVO VIP <span style="font-size:11px;color:#888;">— Desbloqueie com VIP</span></h2>`;
        } else {
            vipSection.innerHTML = `<h2 class="loja-section-title" style="color:#b366ff;">EXCLUSIVO VIP <span style="font-size:11px;color:#888;">— Apenas para assinantes VIP</span></h2>`;
        }
        const grid = document.createElement('div');
        grid.className = 'loja-shop-grid';
        titulosVip.forEach(titulo => {
            const card = document.createElement('div');
            if (podeComprarVip) {
                const podeComprar = saldo >= titulo.preco_pontos;
                card.className = `loja-item-card ${podeComprar ? 'loja-item-compravel' : 'loja-item-sem-saldo'}`;
                card.innerHTML = `
                    <div class="loja-item-icone">${titulo.icone}</div>
                    <div class="loja-item-nome">${titulo.nome}</div>
                    <div class="loja-item-desc">${titulo.descricao}</div>
                    <div class="loja-item-preco">
                        <img src="images/LogoMoeda.png" class="cs-gold-icon"> ${titulo.preco_pontos.toLocaleString('pt-BR')} pts
                    </div>
                    ${podeComprar
                        ? `<button class="loja-comprar-btn" onclick="comprarTitulo(${titulo.id})">COMPRAR</button>`
                        : `<div class="loja-sem-saldo">Faltam ${(titulo.preco_pontos - saldo).toLocaleString('pt-BR')} pts</div>`
                    }
                `;
            } else {
                card.className = 'loja-item-card loja-item-bloqueado';
                card.innerHTML = `
                    <div class="loja-item-icone">${titulo.icone}</div>
                    <div class="loja-item-nome">${titulo.nome}</div>
                    <div class="loja-item-desc">${titulo.descricao}</div>
                    <div class="loja-item-preco loja-item-exclusivo">VIP</div>
                `;
            }
            grid.appendChild(card);
        });
        vipSection.appendChild(grid);
        shopSection.appendChild(vipSection);
    }

    container.appendChild(shopSection);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'loja-footer';
    footer.innerHTML = `
        <div class="loja-footer-content">
            <p><b>Como ganhar pontos?</b> Complete viagens no ETS2/ATS! A cada entrega, voce ganha CS Gold.</p>
            <p><b>Quer Gold ou VIP?</b> Faca um PIX para <b>lf7artes@gmail.com</b> e avise o admin no Discord.</p>
            <p>Quanto mais pontos, maior seu nivel e posicao no ranking.</p>
        </div>
    `;
    container.appendChild(footer);
}

function renderPlanoCard(tipo, preco, beneficios, ativo, gratuito) {
    const config = {
        bronze: { icon: '🥉', label: 'Bronze', color: '#cd7f32', bg: '#1a1500' },
        gold: { icon: '🥇', label: 'Gold', color: '#ffd700', bg: '#1a1a00' },
        vip: { icon: '💎', label: 'VIP', color: '#b366ff', bg: '#10001a' },
        doador: { icon: '🏆', label: 'Doador', color: '#ff6600', bg: '#1a0d00' }
    };
    const c = config[tipo] || config.bronze;

    let statusHtml = '';
    if (ativo) {
        statusHtml = `<div class="plano-card-status ativo" style="color:${c.color};">ATIVO</div>`;
    } else if (gratuito) {
        statusHtml = `<div class="plano-card-status" style="color:#888;">Gratuito</div>`;
    } else {
        statusHtml = `<button class="plano-card-btn" onclick="mostrarModalPix('${tipo}')" style="background:${c.color};">QUERO ${c.label.toUpperCase()}</button>`;
    }

    const beneficiosHtml = beneficios.map(b => `<li>${b}</li>`).join('');

    return `
        <div class="plano-card" style="border-color:${c.color}30;${ativo ? 'box-shadow:0 0 20px ' + c.color + '20;' : ''}">
            <div class="plano-card-header">
                <div class="plano-card-icon">${c.icon}</div>
                <div class="plano-card-nome" style="color:${c.color};">${c.label}</div>
                <div class="plano-card-preco">${preco}</div>
            </div>
            <ul class="plano-card-beneficios">${beneficiosHtml}</ul>
            ${statusHtml}
        </div>
    `;
}

function mostrarModalPix(plano) {
    const valores = { gold: 'R$ 14,90', vip: 'R$ 29,90' };
    const labels = { gold: 'Gold', vip: 'VIP' };
    const valor = valores[plano] || '';
    const label = labels[plano] || plano;

    const overlay = document.createElement('div');
    overlay.className = 'plano-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="plano-modal">
            <div class="plano-modal-title">PLANO ${label}</div>
            <div class="plano-modal-valor">${valor}</div>
            <div class="plano-modal-desc">
                Para ativar o plano <b>${label}</b>, faca um PIX de <b>${valor}</b> para a chave abaixo
                e envie o comprovante no Discord.
            </div>
            <div class="plano-modal-pix">
                <div class="plano-modal-pix-label">CHAVE PIX</div>
                <div class="plano-modal-pix-key">lf7artes@gmail.com</div>
                <button class="plano-modal-copy-btn" onclick="copiarPixModal(this)">COPIAR CHAVE</button>
            </div>
            <div class="plano-modal-aviso">
                Apos o pagamento, procure o admin no Discord e envie o comprovante.
                Seu plano sera ativado em ate 24h.
            </div>
            <button class="plano-modal-fechar" onclick="this.closest('.plano-modal-overlay').remove()">FECHAR</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function copiarPixModal(btn) {
    navigator.clipboard.writeText('lf7artes@gmail.com').then(() => {
        btn.textContent = 'COPIADO!';
        btn.style.background = '#00cc6a';
        setTimeout(() => {
            btn.textContent = 'COPIAR CHAVE';
            btn.style.background = '#00ff88';
        }, 2000);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = 'lf7artes@gmail.com';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = 'COPIADO!';
    });
}

async function comprarTitulo(tituloId) {
    if (!confirm('Tem certeza que deseja comprar este titulo?')) return;

    try {
        const resp = await authFetch('/api/loja/comprar', {
            method: 'POST',
            body: JSON.stringify({ titulo_id: tituloId })
        });
        if (!resp) {
            showToast('Sessao expirada. Faca login novamente.', 'error');
            return;
        }
        const data = await resp.json();

        if (data.error) {
            showToast('Erro: ' + data.error, 'error');
            return;
        }

        showToast('Titulo "' + data.titulo + '" adquirido! Saldo: ' + data.saldo_restante.toLocaleString('pt-BR') + ' pts', 'success');
        carregarLoja();
    } catch (e) {
        showToast('Erro ao comprar titulo. Tente novamente.', 'error');
    }
}

async function equiparTitulo(tituloId) {
    try {
        const resp = await authFetch('/api/loja/equipar', {
            method: 'POST',
            body: JSON.stringify({ titulo_id: tituloId })
        });
        if (!resp) {
            showToast('Sessao expirada. Faca login novamente.', 'error');
            return;
        }
        const data = await resp.json();
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }
        showToast('Titulo equipado!', 'success');
        carregarLoja();
    } catch (e) {
        showToast('Erro ao equipar titulo. Tente novamente.', 'error');
    }
}

async function desequiparTitulo() {
    try {
        const resp = await authFetch('/api/loja/equipar', {
            method: 'POST',
            body: JSON.stringify({ titulo_id: null })
        });
        if (!resp) {
            showToast('Sessao expirada. Faca login novamente.', 'error');
            return;
        }
        showToast('Titulo desequipado!', 'info');
        carregarLoja();
    } catch (e) {
        showToast('Erro ao desequipar titulo. Tente novamente.', 'error');
    }
}

function copiarPix() {
    navigator.clipboard.writeText('lf7artes@gmail.com').then(() => {
        const status = document.getElementById('loja-donate-status');
        if (status) {
            status.style.color = '#00ff88';
            status.textContent = 'Chave PIX copiada! Cole no app do banco.';
        }
        const btn = document.querySelector('.loja-donate-copy-btn');
        if (btn) {
            btn.textContent = 'Copiado!';
            btn.style.background = '#00cc6a';
            setTimeout(() => {
                btn.textContent = 'Copiar';
                btn.style.background = '#00ff88';
            }, 2000);
        }
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = 'lf7artes@gmail.com';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const status = document.getElementById('loja-donate-status');
        if (status) {
            status.style.color = '#00ff88';
            status.textContent = 'Chave PIX copiada!';
        }
    });
}

carregarLoja();