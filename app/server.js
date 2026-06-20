const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const {
    initDB, getDB, getEmpresas, getMotoristas, getViagens,
    getRankingEmpresas, getRankingMotoristas, getStatsGerais,
    getStatsGeraisMes, getStatsMotorista, getConquistasMotorista,
    getRankingConquistas, recalcEmpresas, recalcularEmpresa,
    verificarViagemDuplicada,
    criarUsuario, buscarUsuarioPorEmail, buscarUsuarioPorId, criarSessao, buscarSessao, deletarSessao,
    limparSessoesExpiradas,
    listarUsuarios, deletarUsuario, atualizarUsuario,
    criarEmpresa, atualizarEmpresa, deletarEmpresa,
    getTodasEmpresasAdmin, getEmpresasPendentes,
    criarMotorista, atualizarMotorista, deletarMotorista, inserirViagem, adicionarViagemComCategoria, criarViagemCompleta, limparDadosAntigos,
    getEstatisticasCargas, getEstatisticasCargasEmpresa,
    getEmpresasPorCategoria, getMotoristasPorCategoria,
    sincronizarRankingCargas, getRankingCargasWeb,
    getCargasPendentes, adicionarCargaPendente, classificarCargaPendente, deletarCargaPendente, migrarClassificacoesParaMapping,
    getPremiacaoEmpresa,
    criarSolicitacao, getSolicitacoesPorEmpresa, getSolicitacoesPendentesCount, responderSolicitacao, getSolicitacaoPendente,
    getEventoAtivo, getEventoPorId, criarEvento, encerrarEvento,
    atualizarProgressoEvento, getProgressoEmpresa, getProgressoMotorista,
    getHistoricoEventos, gerarEventoAleatorio, adicionarBonusViagem, deletarEvento
} = require('./database');
const { classificarCarga, getCategoriasCores, getCategoriasNomes, invalidarCacheMapping } = require('./classificador');
const { parseMultipart } = require('./upload');

const PORT = process.env.PORT || 3000;
const ETS2_SERVER = 'http://localhost:25555';

function startServer(port) {
    initDB();

    const db = getDB();
    const adminExists = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get('admin@cargostats.com');
    if (!adminExists) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo) VALUES (?, ?, ?, ?)`).run('admin@cargostats.com', hash, 'Administrador', 'admin');
        console.log('[SEED] Admin criado: admin@cargostats.com / admin123');
    }

    const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

function parseQuery(url) {
    const idx = url.indexOf('?');
    if (idx === -1) return {};
    const params = new URLSearchParams(url.slice(idx + 1));
    const result = {};
    for (const [k, v] of params) result[k] = v;
    return result;
}

function sendJSON(res, data, status) {
    res.writeHead(status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch(e) { resolve({}); }
        });
        req.on('error', reject);
    });
}

function getSession(req) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    return buscarSessao(token);
}

function requireAdmin(session, res) {
    if (!session || session.tipo !== 'admin') {
        sendJSON(res, { error: 'Acesso negado' }, 403);
        return false;
    }
    return true;
}

function createSessionToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    criarSessao(token, userId, expires);
    return token;
}

function sendDiscordNotification(userId, tripData) {
    const user = buscarUsuarioPorId(userId);
    if (!user || !user.discord_webhook) return;

    const webhookUrl = user.discord_webhook.trim();
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) return;

    const colorMap = {
        combustiveis: 0xff6600, construcao: 0xffcc00, granel: 0x44aa88,
        maquinas: 0x8866cc, veiculos: 0x4488ff, carga_viva: 0xff4488,
        alimentos: 0x44cc44, florestal: 0x228833, mineracao: 0xcc8844,
        frigorificada: 0x66ccff, perigosos: 0xff2222, geral: 0x888888
    };
    const cor = colorMap[tripData.categoria] || 0x00ff88;

    const embed = {
        title: '🚛 NOVA VIAGEM REGISTRADA',
        color: cor,
        fields: [
            { name: '👤 Motorista', value: tripData.motorista, inline: true },
            { name: '🏢 Empresa', value: tripData.empresa || 'Lobo Solitário', inline: true },
            { name: '📍 Rota', value: `${tripData.origem || '?'} → ${tripData.destino || '?'}`, inline: false }
        ],
        footer: {
            text: 'Cargo Stats — Monitoramento ETS2/ATS'
        },
        timestamp: new Date().toISOString()
    };

    if (tripData.categoria) {
        embed.fields.push({ name: '📦 Categoria', value: tripData.categoria, inline: true });
    }
    embed.fields.push({ name: '📏 Distância', value: `${tripData.km} km`, inline: true });
    embed.fields.push({ name: '⭐ Pontuação', value: `+${tripData.pontuacao} pts`, inline: true });

    if (tripData.bonus_pontos) {
        embed.fields.push({ name: '🔥 Bônus Evento', value: `+${tripData.bonus_pontos} pts${tripData.bonus_km ? ` / +${tripData.bonus_km} km` : ''}`, inline: false });
    }

    const payload = JSON.stringify({ embeds: [embed] });

    try {
        const urlObj = new URL(webhookUrl);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        const req = https.request(options);
        req.on('error', () => {});
        req.write(payload);
        req.end();
    } catch (e) {}
}

const server = http.createServer(async (req, res) => {
    try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const urlPath = req.url.split('?')[0];
    const query = parseQuery(req.url);

    if (urlPath === '/api/telemetry') {
        const proxyReq = http.get(`${ETS2_SERVER}/api/ets2/telemetry`, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        });
        proxyReq.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ETS2 Telemetry Server não encontrado' }));
        });
        proxyReq.setTimeout(3000, () => {
            proxyReq.destroy();
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ETS2 Telemetry Server timeout' }));
        });
        return;
    }

    if (urlPath === '/api/telemetry/status') {
        const probeReq = http.get(`${ETS2_SERVER}/api/ets2/telemetry`, (probeRes) => {
            let data = '';
            probeRes.on('data', chunk => data += chunk);
            probeRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const gameConnected = parsed && parsed.game && parsed.game.connected === true;
                    if (gameConnected) {
                        sendJSON(res, { status: 'connected', message: 'Jogo detectado e telemetria ativa' });
                    } else {
                        sendJSON(res, { status: 'no_game', message: 'Servidor de telemetria rodando, mas jogo nao detectado. Inicie o ETS2/ATS.' });
                    }
                } catch (e) {
                    sendJSON(res, { status: 'no_game', message: 'Servidor de telemetria respondeu, mas dados invalidos' });
                }
            });
        });
        probeReq.on('error', () => {
            sendJSON(res, { status: 'offline', message: 'ETS2 Telemetry Server nao encontrado na porta 25555' }, 502);
        });
        probeReq.setTimeout(3000, () => {
            probeReq.destroy();
            sendJSON(res, { status: 'offline', message: 'ETS2 Telemetry Server nao respondeu (timeout)' }, 502);
        });
        return;
    }

    // ========== AUTH ROUTES ==========

    if (urlPath === '/api/auth/register' && req.method === 'POST') {
        const body = await readBody(req);
        const { email, senha, nome, tipo, empresa } = body;
        if (!email || !senha || !nome) {
            return sendJSON(res, { error: 'Email, senha e nome sao obrigatorios' }, 400);
        }
        if (buscarUsuarioPorEmail(email)) {
            return sendJSON(res, { error: 'Email ja cadastrado' }, 409);
        }
        const hash = bcrypt.hashSync(senha, 10);
        const userTipo = tipo || 'motorista';
        const userEmpresa = (userTipo === 'motorista' && !empresa) ? 'Lobo Solitário' : (empresa || null);
        criarUsuario(email, hash, nome, userTipo, userEmpresa);
        const user = buscarUsuarioPorEmail(email);
        const token = createSessionToken(user.id);

        if (userTipo === 'motorista' && empresa) {
            criarMotorista(nome, empresa, user.id, 'Motorista', 'dono');
        } else if (userTipo === 'motorista') {
            criarMotorista(nome, 'Lobo Solitário', user.id, 'Motorista');
        }

        return sendJSON(res, { token, user: { id: user.id, email: user.email, nome: user.nome, tipo: user.tipo, empresa: user.empresa } });
    }

    if (urlPath === '/api/auth/login' && req.method === 'POST') {
        const body = await readBody(req);
        const { email, senha } = body;
        if (!email || !senha) {
            return sendJSON(res, { error: 'Email e senha sao obrigatorios' }, 400);
        }
        const user = buscarUsuarioPorEmail(email);
        if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
            return sendJSON(res, { error: 'Email ou senha incorretos' }, 401);
        }
        const token = createSessionToken(user.id);
        return sendJSON(res, { token, user: { id: user.id, email: user.email, nome: user.nome, tipo: user.tipo, empresa: user.empresa } });
    }

    if (urlPath === '/api/auth/logout' && req.method === 'POST') {
        const session = getSession(req);
        if (session) deletarSessao(session.token);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/auth/me' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Não autenticado' }, 401);
        const user = buscarUsuarioPorId(session.user_id);
        return sendJSON(res, { user: { id: session.user_id, email: session.email, nome: session.nome, tipo: session.tipo, empresa: session.empresa, discord_webhook: user ? user.discord_webhook : '' } });
    }

    if (urlPath === '/api/auth/webhook' && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Não autenticado' }, 401);
        const body = await readBody(req);
        const { discord_webhook } = body;
        if (!discord_webhook) {
            return sendJSON(res, { error: 'URL do webhook é obrigatória' }, 400);
        }
        if (!discord_webhook.startsWith('https://discord.com/api/webhooks/')) {
            return sendJSON(res, { error: 'URL inválida. Use o link de webhook do Discord' }, 400);
        }
        atualizarUsuario(session.user_id, undefined, undefined, undefined, discord_webhook);
        return sendJSON(res, { ok: true });
    }

    // ========== PERFIL FOTO ==========

    if (urlPath === '/api/perfil/foto' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);

        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            return sendJSON(res, { error: 'Formato invalido' }, 400);
        }

        try {
            const parsed = await parseMultipart(req);
            const fotoPath = parsed.files.foto;
            if (!fotoPath) {
                return sendJSON(res, { error: 'Nenhuma imagem enviada' }, 400);
            }
            atualizarMotorista(session.nome, session.empresa || '', { foto: fotoPath });
            return sendJSON(res, { ok: true, foto: fotoPath });
        } catch (e) {
            return sendJSON(res, { error: e.message }, 400);
        }
    }

    // ========== ADMIN ROUTES ==========

    if (urlPath === '/api/admin/usuarios' && req.method === 'GET') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        return sendJSON(res, { usuarios: listarUsuarios() });
    }

    if (urlPath === '/api/admin/usuarios' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.id) return sendJSON(res, { error: 'ID obrigatório' }, 400);
        deletarUsuario(body.id);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/usuarios' && req.method === 'PUT') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.id) return sendJSON(res, { error: 'ID obrigatório' }, 400);
        atualizarUsuario(body.id, body.nome, body.tipo, body.empresa);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/empresas' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;

        const contentType = req.headers['content-type'] || '';
        let nome, logo = '', banner = '', descricao = '';

        if (contentType.includes('multipart/form-data')) {
            try {
                const result = await parseMultipart(req);
                nome = result.fields.nome;
                descricao = result.fields.descricao || '';
                logo = result.files.logo || '';
                banner = result.files.banner || '';
            } catch (e) {
                return sendJSON(res, { error: e.message }, 400);
            }
        } else {
            const body = await readBody(req);
            nome = body.nome;
            logo = body.logo || '';
            banner = body.banner || '';
            descricao = body.descricao || '';
        }

        if (!nome) return sendJSON(res, { error: 'Nome da empresa obrigatorio' }, 400);
        criarEmpresa(nome, logo, banner, descricao, session.user_id);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/empresas' && req.method === 'PUT') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;

        const contentType = req.headers['content-type'] || '';
        let dados = {};

        if (contentType.includes('multipart/form-data')) {
            try {
                const result = await parseMultipart(req);
                dados.nome = result.fields.nome;
                dados.descricao = result.fields.descricao;
                dados.status = result.fields.status;
                if (result.files.logo) dados.logo = result.files.logo;
                if (result.files.banner) dados.banner = result.files.banner;
            } catch (e) {
                return sendJSON(res, { error: e.message }, 400);
            }
        } else {
            dados = await readBody(req);
        }

        if (!dados.nome) return sendJSON(res, { error: 'Nome obrigatorio' }, 400);
        atualizarEmpresa(dados.nome, dados);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/empresas/pendentes' && req.method === 'GET') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        return sendJSON(res, { empresas: getEmpresasPendentes() });
    }

    if (urlPath === '/api/admin/empresas/todas' && req.method === 'GET') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        return sendJSON(res, { empresas: getTodasEmpresasAdmin() });
    }

    if (urlPath === '/api/admin/empresas' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.nome) return sendJSON(res, { error: 'Nome obrigatório' }, 400);
        deletarEmpresa(body.nome);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/motoristas' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.nome || !body.empresa) return sendJSON(res, { error: 'Nome e empresa são obrigatórios' }, 400);
        criarMotorista(body.nome, body.empresa, body.usuario_id || null, body.cargo || 'Motorista');
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/motoristas' && req.method === 'PUT') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.nome) return sendJSON(res, { error: 'Nome obrigatório' }, 400);
        atualizarMotorista(body.nome, body.empresa, body);
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/motoristas' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.nome) return sendJSON(res, { error: 'Nome obrigatório' }, 400);
        deletarMotorista(body.nome);
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/limpar-dados' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        limparDadosAntigos();
        return sendJSON(res, { ok: true, message: 'Todos os dados antigos foram apagados' });
    }

    // ========== CARGAS PENDENTES (ADMIN) ==========

    if (urlPath === '/api/admin/cargas-pendentes' && req.method === 'GET') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const cargas = getCargasPendentes();
        return sendJSON(res, cargas);
    }

    if (urlPath === '/api/admin/cargas-pendentes' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        const { nome_original, cargo_id, categoria } = body;
        if (!nome_original) return sendJSON(res, { error: 'Nome original obrigatório' }, 400);
        adicionarCargaPendente(nome_original, cargo_id, categoria);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/cargas-pendentes' && req.method === 'PUT') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        const { id, categoria } = body;
        if (!id || !categoria) return sendJSON(res, { error: 'ID e categoria obrigatorios' }, 400);
        classificarCargaPendente(id, categoria);
        migrarClassificacoesParaMapping();
        invalidarCacheMapping();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/cargas-pendentes' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        const { id } = body;
        if (!id) return sendJSON(res, { error: 'ID obrigatorio' }, 400);
        deletarCargaPendente(id);
        migrarClassificacoesParaMapping();
        invalidarCacheMapping();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/cargas-pendentes/sincronizar' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const count = migrarClassificacoesParaMapping();
        return sendJSON(res, { ok: true, sincronizadas: count });
    }

    // ========== COMPANY OWNER - MANAGE DRIVERS ==========

    if (urlPath === '/api/empresa/motoristas/funcao' && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { motorista, funcao, cargo } = body;
        if (!motorista || !funcao) return sendJSON(res, { error: 'Motorista e funcao sao obrigatorios' }, 400);

        const funcoesValidas = ['dono', 'diretor', 'chefe_rh', 'motorista'];
        if (!funcoesValidas.includes(funcao)) {
            return sendJSON(res, { error: 'Funcao invalida. Use: dono, diretor, chefe_rh ou motorista' }, 400);
        }

        const empresaDoDono = session.empresa;
        if (!empresaDoDono) return sendJSON(res, { error: 'Voce nao pertence a nenhuma empresa' }, 400);

        const dbConn = getDB();
        const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresaDoDono);
        if (!donoCheck || !['dono', 'diretor', 'chefe_rh'].includes(donoCheck.funcao)) {
            return sendJSON(res, { error: 'Apenas dono, diretor ou chefe de RH podem alterar funcoes' }, 403);
        }

        if (funcao === 'dono' && donoCheck.funcao !== 'dono') {
            return sendJSON(res, { error: 'Apenas o dono pode atribuir funcao de dono' }, 403);
        }

        const dadosUpdate = { funcao };
        if (cargo) dadosUpdate.cargo = cargo;

        const targetMot = dbConn.prepare(`SELECT * FROM motoristas WHERE nome = ? AND empresa = ?`).get(motorista, empresaDoDono);
        if (!targetMot) return sendJSON(res, { error: 'Motorista nao encontrado na empresa' }, 404);

        atualizarMotorista(motorista, empresaDoDono, dadosUpdate);
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/empresa/motoristas/adicionar' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { motorista, cargo } = body;
        if (!motorista) return sendJSON(res, { error: 'Nome do motorista obrigatorio' }, 400);

        const empresaDoDono = session.empresa;
        if (!empresaDoDono) return sendJSON(res, { error: 'Voce nao pertence a nenhuma empresa' }, 400);

        const dbConn = getDB();
        const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresaDoDono);
        if (!donoCheck || !['dono', 'diretor', 'chefe_rh'].includes(donoCheck.funcao)) {
            return sendJSON(res, { error: 'Apenas dono, diretor ou chefe de RH podem adicionar motoristas' }, 403);
        }

        const usuarioAlvo = dbConn.prepare(`SELECT id FROM usuarios WHERE nome = ?`).get(motorista);
        const result = criarMotorista(motorista, empresaDoDono, usuarioAlvo ? usuarioAlvo.id : null, cargo || 'Motorista', 'motorista');
        if (result && result.duplicate) {
            return sendJSON(res, { error: 'Motorista ja esta na empresa' }, 409);
        }
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/empresa/motoristas/remover' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { motorista } = body;
        if (!motorista) return sendJSON(res, { error: 'Nome do motorista obrigatorio' }, 400);

        const empresaDoDono = session.empresa;
        if (!empresaDoDono) return sendJSON(res, { error: 'Voce nao pertence a nenhuma empresa' }, 400);

        const dbConn = getDB();
        const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresaDoDono);
        if (!donoCheck || !['dono', 'diretor', 'chefe_rh'].includes(donoCheck.funcao)) {
            return sendJSON(res, { error: 'Apenas dono, diretor ou chefe de RH podem remover motoristas' }, 403);
        }

        if (motorista === session.nome) {
            return sendJSON(res, { error: 'Voce nao pode remover a si mesmo' }, 400);
        }

        dbConn.prepare(`DELETE FROM motoristas WHERE nome = ? AND empresa = ?`).run(motorista, empresaDoDono);
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/empresas/solicitar' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);

        const contentType = req.headers['content-type'] || '';
        let nome, logo = '', banner = '', descricao = '';

        if (contentType.includes('multipart/form-data')) {
            try {
                const parsed = await parseMultipart(req);
                nome = parsed.fields.nome;
                descricao = parsed.fields.descricao || '';
                logo = parsed.files.logo || '';
                banner = parsed.files.banner || '';
            } catch (e) {
                return sendJSON(res, { error: e.message }, 400);
            }
        } else {
            const body = await readBody(req);
            nome = body.nome;
            descricao = body.descricao || '';
        }

        if (!nome) return sendJSON(res, { error: 'Nome da empresa obrigatorio' }, 400);
        const result = criarEmpresa(nome, logo, banner, descricao, session.user_id);
        if (result && result.error) return sendJSON(res, { error: result.error }, 409);

        atualizarUsuario(session.user_id, session.nome, session.tipo, nome);

        return sendJSON(res, { ok: true, empresa: nome });
    }

    // ========== VIAGEM (MOTORISTA LOGADO) ==========

    if (urlPath === '/api/viagens' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Não autenticado' }, 401);
        const body = await readBody(req);
        const { motorista, empresa, data, origem, destino, km, pontuacao, categoria_carga, cargo_id, carga_nome } = body;

        const nomeMotorista = motorista || session.nome;
        const empresaMotorista = empresa || session.empresa || 'Lobo Solitário';

        if (!nomeMotorista || !data) {
            return sendJSON(res, { error: 'Motorista e data são obrigatórios' }, 400);
        }

        if (session.tipo !== 'admin' && nomeMotorista !== session.nome) {
            return sendJSON(res, { error: 'Só pode cadastrar viagens para si mesmo' }, 403);
        }

        let cat = categoria_carga;
        if (!cat) {
            const classificacao = classificarCarga(carga_nome || destino || origem || '', cargo_id || '');
            cat = classificacao.slug || 'geral';
            if (classificacao.confianca === 'nenhuma' && (carga_nome || destino || origem)) {
                adicionarCargaPendente(carga_nome || destino || origem, cargo_id || '', 'a_classificar');
            }
        }

        const evento = getEventoAtivo();
        const eventoInfo = evento ? {
            id: evento.id,
            km: km || 0,
            pontuacao: pontuacao || 0,
            categoria_carga: cat,
            destino: destino || ''
        } : null;

        const tripResult = criarViagemCompleta(nomeMotorista, empresaMotorista, data, origem || '', destino || '', km || 0, pontuacao || 0, cat, eventoInfo);
        const bonusInfo = tripResult && tripResult.bonusInfo ? tripResult.bonusInfo : null;

        sendDiscordNotification(session.user_id, {
            motorista: nomeMotorista, empresa: empresaMotorista,
            origem: origem || '', destino: destino || '',
            km: km || 0, pontuacao: pontuacao || 0,
            categoria: cat,
            bonus_pontos: bonusInfo ? bonusInfo.bonus_pontos : 0,
            bonus_km: bonusInfo ? bonusInfo.bonus_km : 0
        });
        return sendJSON(res, { ok: true, categoria_carga: cat, evento: bonusInfo ? { bonus: bonusInfo } : undefined });
    }

    // ========== AUTO-RECORD (TELEMETRY) ==========

    if (urlPath === '/api/viagens/auto' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { motorista, empresa, origem, destino, km, pontuacao, carga_nome, cargo_id } = body;

        if (!motorista) {
            return sendJSON(res, { error: 'Motorista obrigatorio' }, 400);
        }
        const empresaAuto = empresa || 'Lobo Solitário';

        const hoje = new Date().toISOString().split('T')[0];

        if (verificarViagemDuplicada(motorista, origem, destino, km)) {
            console.log(`[AUTO-RECORD] DUPLICATA IGNORADA: ${motorista} ${origem||'?'} → ${destino||'?'} ${km}km`);
            return sendJSON(res, { ok: true, duplicate: true, data: hoje });
        }

        const classificacao = classificarCarga(carga_nome || '', cargo_id || '');
        const cat = classificacao.slug || 'geral';

        if (classificacao.confianca === 'nenhuma' && carga_nome) {
            adicionarCargaPendente(carga_nome, cargo_id || '', 'a_classificar');
        }

        const evento = getEventoAtivo();
        const eventoInfo = evento ? {
            id: evento.id,
            km: km || 0,
            pontuacao: pontuacao || 0,
            categoria_carga: cat,
            destino: destino || ''
        } : null;

        const tripResult = criarViagemCompleta(motorista, empresaAuto, hoje, origem || '', destino || '', km || 0, pontuacao || 0, cat, eventoInfo);
        const bonusInfo = tripResult && tripResult.bonusInfo ? tripResult.bonusInfo : null;

        console.log(`[AUTO-RECORD] ${motorista} (${empresaAuto}): ${origem||'?'} → ${destino||'?'} | ${km}km | ${pontuacao}pts | ${cat}${bonusInfo ? ` | BONUS: +${bonusInfo.bonus_pontos}pts` : ''}`);
        sendDiscordNotification(session.user_id, {
            motorista, empresa: empresaAuto,
            origem: origem || '', destino: destino || '',
            km: km || 0, pontuacao: pontuacao || 0,
            categoria: cat,
            bonus_pontos: bonusInfo ? bonusInfo.bonus_pontos : 0,
            bonus_km: bonusInfo ? bonusInfo.bonus_km : 0
        });
        return sendJSON(res, { ok: true, categoria_carga: cat, data: hoje, evento: bonusInfo ? { bonus: bonusInfo } : undefined });
    }

    // ========== PUBLIC READ ROUTES ==========

    if (urlPath === '/api/empresas' && req.method === 'GET') {
        const mes = query.mes ? parseInt(query.mes) : null;
        const ano = query.ano ? parseInt(query.ano) : null;
        const empresas = getEmpresas(mes, ano);
        const stats = mes && ano ? getStatsGeraisMes(mes, ano) : getStatsGerais();
        return sendJSON(res, { ...stats, empresas });
    }

    if (urlPath === '/api/motoristas' && req.method === 'GET') {
        const empresa = query.empresa || null;
        const mes = query.mes ? parseInt(query.mes) : null;
        const ano = query.ano ? parseInt(query.ano) : null;
        const motoristas = getMotoristas(empresa, mes, ano);
        return sendJSON(res, { motoristas });
    }

    if (urlPath === '/api/viagens' && req.method === 'GET') {
        const filtros = {};
        if (query.mes) filtros.mes = parseInt(query.mes);
        if (query.ano) filtros.ano = parseInt(query.ano);
        if (query.empresa) filtros.empresa = query.empresa;
        if (query.motorista) filtros.motorista = query.motorista;
        if (query.dataInicio) filtros.dataInicio = query.dataInicio;
        if (query.dataFim) filtros.dataFim = query.dataFim;
        const viagens = getViagens(filtros);
        console.log(`[DEBUG] GET /api/viagens | filtros:`, JSON.stringify(filtros), `| retornou ${viagens.length} viagens | ids:`, viagens.map(v => v.id).slice(0, 5));
        return sendJSON(res, { viagens });
    }

    if (urlPath === '/api/ranking/empresas') {
        const periodo = query.periodo || 'geral';
        const mes = query.mes ? parseInt(query.mes) : null;
        const ano = query.ano ? parseInt(query.ano) : null;
        const ranking = getRankingEmpresas(periodo, mes, ano);
        return sendJSON(res, { ranking });
    }

    if (urlPath === '/api/ranking/motoristas') {
        const periodo = query.periodo || 'geral';
        const mes = query.mes ? parseInt(query.mes) : null;
        const ano = query.ano ? parseInt(query.ano) : null;
        const empresa = query.empresa || null;
        const ranking = getRankingMotoristas(periodo, mes, ano, empresa);
        return sendJSON(res, { ranking });
    }

    if (urlPath === '/api/stats') {
        const mes = query.mes ? parseInt(query.mes) : null;
        const ano = query.ano ? parseInt(query.ano) : null;
        const stats = mes && ano ? getStatsGeraisMes(mes, ano) : getStatsGerais();
        return sendJSON(res, stats);
    }

    if (urlPath === '/api/conquistas') {
        const conquistasConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'conquistas_config.json'), 'utf8'));
        const conquistasDef = conquistasConfig.conquistas || [];

        if (query.motorista) {
            const result = getConquistasMotorista(query.motorista, conquistasDef);
            const stats = getStatsMotorista(query.motorista);
            return sendJSON(res, { motorista: stats, conquistas: result });
        }

        const ranking = getRankingConquistas(conquistasDef);
        return sendJSON(res, { ranking });
    }

    if (urlPath === '/api/premiacao') {
        const empresa = query.empresa;
        if (!empresa) return sendJSON(res, { error: 'Empresa obrigatoria' }, 400);
        const premiacao = getPremiacaoEmpresa(empresa);
        if (!premiacao) return sendJSON(res, { error: 'Empresa sem dados para premiacao' }, 404);
        return sendJSON(res, { premiacao });
    }

    // ========== NETWORK / QRCODE ==========

    if (urlPath === '/api/network/ip' && req.method === 'GET') {
        const nets = os.networkInterfaces();
        let localIP = '127.0.0.1';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    localIP = net.address;
                    break;
                }
            }
            if (localIP !== '127.0.0.1') break;
        }
        return sendJSON(res, { ip: localIP, porta: PORT, url: `http://${localIP}:${PORT}/mobile` });
    }

    if (urlPath === '/api/network/qrcode' && req.method === 'GET') {
        const nets = os.networkInterfaces();
        let localIP = '127.0.0.1';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    localIP = net.address;
                    break;
                }
            }
            if (localIP !== '127.0.0.1') break;
        }
        const mobileUrl = `http://${localIP}:${PORT}/mobile`;
        QRCode.toString(mobileUrl, { type: 'svg', width: 400, margin: 2 }, (err, svg) => {
            if (err) {
                return sendJSON(res, { error: 'Erro ao gerar QR Code' }, 500);
            }
            res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
            res.end(svg);
        });
        return;
    }

    if (urlPath === '/api/health') {
        return sendJSON(res, { status: 'ok', uptime: process.uptime() });
    }

    // ========== CARGAS / CLASSIFICACAO ==========

    if (urlPath === '/api/cargas/classificar' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.nome) return sendJSON(res, { error: 'Nome da carga obrigatorio' }, 400);
        const resultado = classificarCarga(body.nome);
        return sendJSON(res, resultado);
    }

    if (urlPath === '/api/cargas/categorias' && req.method === 'GET') {
        return sendJSON(res, { cores: getCategoriasCores(), nomes: getCategoriasNomes() });
    }

    if (urlPath === '/api/cargas/estatisticas' && req.method === 'GET') {
        const motorista = query.motorista || null;
        const empresa = query.empresa || null;
        if (motorista) {
            return sendJSON(res, { cargas: getEstatisticasCargas(motorista) });
        }
        if (empresa) {
            return sendJSON(res, { cargas: getEstatisticasCargasEmpresa(empresa) });
        }
        return sendJSON(res, { cargas: getEstatisticasCargas() });
    }

    if (urlPath === '/api/ranking/cargas' && req.method === 'GET') {
        const categoria = query.categoria || null;
        const empresa = query.empresa || null;
        const mes = query.mes ? parseInt(query.mes) : null;
        const ano = query.ano ? parseInt(query.ano) : null;
        const periodo = query.periodo || 'geral';

        if (categoria) {
            if (empresa) {
                const ranking = getMotoristasPorCategoria(categoria, empresa, periodo === 'mes' ? mes : null, periodo === 'mes' ? ano : null);
                return sendJSON(res, { ranking, categoria });
            }
            const ranking = getEmpresasPorCategoria(categoria, periodo === 'mes' ? mes : null, periodo === 'mes' ? ano : null);
            return sendJSON(res, { ranking, categoria });
        }

        const ranking = getRankingCargasWeb(null, mes, ano);
        return sendJSON(res, { ranking });
    }

    // ========== SYNC (WEB RECEBE DO EXE) ==========

    if (urlPath === '/api/sync/receber' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.dados || !Array.isArray(body.dados)) {
            return sendJSON(res, { error: 'Formato invalido: esperado { dados: [...] }' }, 400);
        }
        try {
            sincronizarRankingCargas(body.dados);
            return sendJSON(res, { ok: true, atualizacoes: body.dados.length });
        } catch (e) {
            return sendJSON(res, { error: e.message }, 500);
        }
    }

    // ========== SOLICITACOES ==========

    if (urlPath === '/api/solicitacoes' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { empresa, mensagem } = body;
        if (!empresa) return sendJSON(res, { error: 'Nome da empresa obrigatorio' }, 400);
        const user = session;
        if (user.empresa && user.empresa !== 'Lobo Solitário') {
            return sendJSON(res, { error: 'Voce ja pertence a uma empresa' }, 400);
        }
        const result = criarSolicitacao(session.nome, empresa, mensagem);
        if (result && result.duplicate) {
            return sendJSON(res, { error: 'Voce ja enviou um pedido para esta empresa' }, 409);
        }
        return sendJSON(res, { ok: true });
    }

    if (urlPath.startsWith('/api/solicitacoes') && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const query = parseQuery(req.url);

        if (query.count === 'true' && query.empresa) {
            const count = getSolicitacoesPendentesCount(query.empresa);
            return sendJSON(res, { ok: true, count });
        }

        if (query.empresa) {
            const dbConn = getDB();
            const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, query.empresa);
            const empresaRow = dbConn.prepare(`SELECT criada_por FROM empresas WHERE nome = ?`).get(query.empresa);
            const isDonoOuCriador = (donoCheck && (donoCheck.funcao === 'dono' || donoCheck.funcao === 'diretor' || donoCheck.funcao === 'chefe_rh'))
                                 || (empresaRow && empresaRow.criada_por === session.user_id);
            if (!isDonoOuCriador) {
                return sendJSON(res, { error: 'Acesso negado' }, 403);
            }
            const solicitacoes = getSolicitacoesPorEmpresa(query.empresa);
            return sendJSON(res, { ok: true, solicitacoes });
        }

        const dbConn2 = getDB();
        const minhas = dbConn2.prepare(`SELECT * FROM solicitacoes WHERE motorista = ? ORDER BY criada_em DESC`).all(session.nome);
        return sendJSON(res, { ok: true, solicitacoes: minhas });
    }

    if (urlPath === '/api/solicitacoes/aceitar' && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { id } = body;
        if (!id) return sendJSON(res, { error: 'ID da solicitacao obrigatorio' }, 400);

        const dbConn = getDB();
        const sol = dbConn.prepare(`SELECT * FROM solicitacoes WHERE id = ?`).get(id);
        if (!sol) return sendJSON(res, { error: 'Solicitacao nao encontrada' }, 404);

        const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, sol.empresa);
        if (!donoCheck || (donoCheck.funcao !== 'dono' && donoCheck.funcao !== 'diretor' && donoCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Apenas o dono/diretor pode aceitar pedidos' }, 403);
        }

        responderSolicitacao(id, 'aceita');

        const usuarioAlvo = dbConn.prepare(`SELECT id FROM usuarios WHERE nome = ?`).get(sol.motorista);
        criarMotorista(sol.motorista, sol.empresa, usuarioAlvo ? usuarioAlvo.id : null, 'Motorista', 'motorista');

        if (usuarioAlvo) {
            dbConn.prepare(`UPDATE usuarios SET empresa = ? WHERE id = ?`).run(sol.empresa, usuarioAlvo.id);
        }

        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/solicitacoes/recusar' && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { id } = body;
        if (!id) return sendJSON(res, { error: 'ID da solicitacao obrigatorio' }, 400);

        const dbConn = getDB();
        const sol = dbConn.prepare(`SELECT * FROM solicitacoes WHERE id = ?`).get(id);
        if (!sol) return sendJSON(res, { error: 'Solicitacao nao encontrada' }, 404);

        const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, sol.empresa);
        if (!donoCheck || (donoCheck.funcao !== 'dono' && donoCheck.funcao !== 'diretor' && donoCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Apenas o dono/diretor pode recusar pedidos' }, 403);
        }

        responderSolicitacao(id, 'recusada');
        return sendJSON(res, { ok: true });
    }

    // ========== EVENTOS ==========

    if (urlPath === '/api/eventos/ativo' && req.method === 'GET') {
        const evento = getEventoAtivo();
        if (!evento) return sendJSON(res, { evento: null });
        const params = JSON.parse(evento.parametros || '{}');
        return sendJSON(res, { evento: { ...evento, parametros: params } });
    }

    if (urlPath === '/api/eventos/progresso' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const evento = getEventoAtivo();
        if (!evento) return sendJSON(res, { progresso: null });

        if (query.empresa) {
            const data = getProgressoEmpresa(evento.id, query.empresa);
            return sendJSON(res, { progresso: data, evento: { ...evento, parametros: JSON.parse(evento.parametros || '{}') } });
        }

        if (query.motorista) {
            const data = getProgressoMotorista(evento.id, query.motorista);
            return sendJSON(res, { progresso: data, evento: { ...evento, parametros: JSON.parse(evento.parametros || '{}') } });
        }

        return sendJSON(res, { error: 'Informe empresa ou motorista' }, 400);
    }

    if (urlPath === '/api/eventos/historico' && req.method === 'GET') {
        const historico = getHistoricoEventos(20);
        return sendJSON(res, { historico });
    }

    // ========== ADMIN EVENTOS ==========

    if (urlPath === '/api/admin/eventos/criar' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        const { tipo, titulo, descricao, meta, bonus_pontos, bonus_km, tipo_meta, categoria, categoria_nome } = body;
        if (!tipo || !titulo || !descricao) {
            return sendJSON(res, { error: 'Tipo, titulo e descricao obrigatorios' }, 400);
        }
        const TIPO_META_MAP = { maratona_viagens: 'viagens', desafio_km: 'km', foco_carga: 'carga', caixa_pontos: 'pontos', explorador_cidades: 'cidades' };
        const params = {
            tipo_meta: tipo_meta || TIPO_META_MAP[tipo] || 'viagens',
            meta: meta || 5,
            bonus_pontos: bonus_pontos || 2000,
            bonus_km: bonus_km || 0
        };
        if (categoria) params.categoria = categoria;
        if (categoria_nome) params.categoria_nome = categoria_nome;
        const result = criarEvento(tipo, titulo, descricao, params, 'admin');
        return sendJSON(res, { ok: true, id: result.lastInsertRowid });
    }

    if (urlPath === '/api/admin/eventos/encerrar' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        const id = body.id;
        if (!id) {
            const ativo = getEventoAtivo();
            if (!ativo) return sendJSON(res, { error: 'Nenhum evento ativo' }, 400);
            encerrarEvento(ativo.id);
            return sendJSON(res, { ok: true });
        }
        encerrarEvento(id);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/eventos/limpar' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (body.id) {
            deletarEvento(body.id);
            return sendJSON(res, { ok: true });
        }
        return sendJSON(res, { error: 'ID do evento obrigatorio' }, 400);
    }

    // ========== STATIC FILES ==========

    // --- Site pages (public) ---
    const SITE_PAGES = {
        '/':         '/site/index.html',
        '/rank':     '/site/rank.html',
        '/download': '/site/download.html',
        '/regras':   '/site/regras.html',
        '/contato':  '/site/contato.html',
    };
    if (SITE_PAGES[urlPath]) {
        const sitePath = path.join(__dirname, SITE_PAGES[urlPath]);
        const ext = path.extname(sitePath);
        fs.readFile(sitePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Erro interno');
            } else {
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/html' });
                res.end(content);
            }
        });
        return;
    }

    // --- Uploads (from userData dir or local dir) ---
    if (urlPath.startsWith('/uploads/')) {
        const uploadsDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
        const uploadPath = path.join(uploadsDir, urlPath.replace('/uploads/', ''));
        const ext = path.extname(uploadPath);
        fs.readFile(uploadPath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('Arquivo não encontrado');
            } else {
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                res.end(content);
            }
        });
        return;
    }

    // --- Site assets (/site/cs/, /site/js/, /site/images/) ---
    if (urlPath.startsWith('/site/')) {
        const siteAssetPath = path.join(__dirname, urlPath);
        const ext = path.extname(siteAssetPath);
        fs.readFile(siteAssetPath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('Arquivo não encontrado');
            } else {
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                res.end(content);
            }
        });
        return;
    }

    // --- App route: redirects to the dashboard ---
    if (urlPath === '/app') {
        const appPath = path.join(__dirname, '/dashboard_local.html');
        fs.readFile(appPath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Erro interno');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
        return;
    }

    // --- Legacy app pages ---
    let filePath = urlPath === '/' ? '/dashboard_local.html' : urlPath;
    if (urlPath === '/mobile') filePath = '/dashboard_mobile.html';

    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Arquivo não encontrado');
            } else {
                res.writeHead(500);
                res.end('Erro interno');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
    } catch (e) {
        console.error('[SERVER] Erro nao tratado:', e.message, e.stack);
        try { sendJSON(res, { error: 'Erro interno do servidor' }, 500); } catch (e2) {}
    }
});

    process.on('SIGINT', () => {
        console.log('\nEncerrando servidor...');
        process.exit(0);
    });

    server.listen(port, () => {
        console.log(`CARGO STATS rodando em http://localhost:${port}`);
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`Acesso mobile: http://${net.address}:${port}/mobile`);
                }
            }
        }
        console.log('Pressione Ctrl+C para parar');
        setInterval(() => limparSessoesExpiradas(), 30 * 60 * 1000);
        setInterval(() => {
            try {
                const criado = gerarEventoAleatorio();
                if (criado) console.log(`[EVENTOS] Novo evento gerado!`);
            } catch (e) {
                console.error('[EVENTOS] Erro ao gerar:', e.message);
            }
        }, 5 * 60 * 1000);
    });

    return server;
}

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    startServer(PORT);
} else {
    module.exports = { startServer };
}
