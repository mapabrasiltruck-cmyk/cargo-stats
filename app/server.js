require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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
    criarUsuario, buscarUsuarioPorEmail, buscarUsuarioPorId, criarSessao, buscarSessao, deletarSessao,
    limparSessoesExpiradas,
    listarUsuarios, deletarUsuario, atualizarUsuario,
    criarEmpresa, atualizarEmpresa, deletarEmpresa, getEmpresaWebhook, setEmpresaWebhook,
    getTodasEmpresasAdmin, getEmpresasPendentes,
    criarMotorista, atualizarMotorista, deletarMotorista, criarViagemCompleta, limparDadosAntigos,
    getEstatisticasCargas, getEstatisticasCargasEmpresa,
    getEmpresasPorCategoria, getMotoristasPorCategoria,
    sincronizarRankingCargas, getRankingCargasWeb,
    getCargasPendentes, adicionarCargaPendente, classificarCargaPendente, deletarCargaPendente, migrarClassificacoesParaMapping, backfillCargasPendentes,
    getPremiacaoEmpresa, getPremiacaoMotorista,
    criarSolicitacao, getSolicitacoesPorEmpresa, getSolicitacoesPorEmpresaFuzzy, getSolicitacoesPendentesCount, responderSolicitacao, getSolicitacaoPendente,
    getEventoAtivo, getEventoPorId, criarEvento, encerrarEvento, finalizarEventosExpirados,
    atualizarProgressoEvento, getProgressoEmpresa, getProgressoMotorista,
    getHistoricoEventos, gerarEventoAleatorio, adicionarBonusViagem, deletarEvento,
    buscarUsuarioPorSteamId, criarUsuarioSteam, atualizarAvatar,
    getLojaTitulos, getCsGold, getLojaInventario, getTituloEquipado, comprarTitulo, equiparTitulo, isDoador,
    getPlanoInfo, getSlotsPorPlano, setPlanoAdmin, listarPlanos, verificarPlanosExpirados,
    registrarPenalidade, processarPenalidadesPendentes,
    processarAutoEvolucaoMotoristas,
    getStatsEmpresa, getConquistasEmpresa,
    criarVaga, getVagas, getVagaPorId, getVagasPorEmpresa, atualizarVaga, deletarVaga,
    criarCandidatura, getCandidaturasPorVaga, getCandidaturasPorMotorista, responderCandidatura, getCandidaturaPorId,
    criarConvite, getConvitesPorMotorista,
    normKey, repararDuplicatas
} = require('./database');
const { classificarCarga, getCategoriasCores, getCategoriasNomes, invalidarCacheMapping } = require('./classificador');
const { parseMultipart } = require('./upload');
const { rateLimit, isRateLimited } = require('./rateLimiter');
const syncHostinger = require('./sync_hostinger');

const PORT = process.env.PORT || 3000;
const ETS2_SERVER = 'http://localhost:25555';

let _telemetryBridge = null;
function setTelemetryBridge(bridge) { _telemetryBridge = bridge; }
function getTelemetryBridge() { return _telemetryBridge; }

function startServer(port, telemetryBridge) {
    if (telemetryBridge) setTelemetryBridge(telemetryBridge);
    initDB();

    // Repara duplicatas de empresa/motorista por variacao de caixa/espaco
    // (comum apos formatar o PC + re-sync). Idempotente e seguro.
    try {
        const reparo = repararDuplicatas();
        const total = (reparo.empresas || []).length + (reparo.motoristas || []).length;
        if (total > 0) {
            console.log(`[DB] Reparo: ${reparo.empresas.length} empresas e ${reparo.motoristas.length} motoristas mesclados por normalizacao.`);
        }
    } catch (e) {
        console.error('[DB] Erro no reparo de duplicatas:', e.message);
    }

    const db = getDB();
    const adminExists = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get('admin@cargostats.com');
    if (!adminExists) {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@cargostats.com';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
        const hash = bcrypt.hashSync(adminPass, 10);
        db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo) VALUES (?, ?, ?, ?)`).run(adminEmail, hash, 'Administrador', 'admin');
        console.log('[SEED] Admin criado: ' + adminEmail + ' / ' + adminPass);
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

const MAX_BODY_SIZE = 1 * 1024 * 1024;

function safeInt(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
}

function safeJsonParse(str, fallback) {
    try { return JSON.parse(str || '{}'); }
    catch(e) { return fallback || {}; }
}

function fetchHostinger(path) {
    const BASE = 'https://cargo.brasiltruck.online';
    return new Promise((resolve, reject) => {
        const sep = path.includes('?') ? '&' : '?';
        const noCachePath = `${path}${sep}_=${Date.now()}`;
        const url = `${BASE}/api/${noCachePath}`;
        const urlObj = new URL(url);
        const transport = urlObj.protocol === 'https:' ? https : http;
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 10000
        };
        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    reject(new Error('Resposta invalida do Hostinger'));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

function postHostinger(path, payload) {
    const BASE = 'https://cargo.brasiltruck.online';
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const urlObj = new URL(`${BASE}/api/${path}`);
        const transport = urlObj.protocol === 'https:' ? https : http;
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 10000
        };
        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    reject(new Error('Resposta invalida do Hostinger'));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
    });
}

function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let totalSize = 0;
        const chunks = [];
        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > MAX_BODY_SIZE) {
                req.destroy();
                reject(new Error('PayloadTooLarge'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (!body) return resolve({});
            try { resolve(JSON.parse(body)); }
            catch(e) { resolve({}); }
        });
        req.on('error', reject);
    });
}

function sanitizePath(requestedPath, baseDir) {
    const resolved = path.resolve(baseDir, requestedPath.replace(/^\/+/, ''));
    const baseResolved = path.resolve(baseDir);
    if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
        return null;
    }
    return resolved;
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
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    criarSessao(token, userId, expires);
    return token;
}

function resolverEmpresa(session, empresaBody) {
    if (session.empresa && session.empresa !== 'Lobo Solitário') return session.empresa;
    try {
        const r = getDB().prepare(`SELECT empresa FROM motoristas WHERE user_id = ? AND empresa IS NOT NULL AND empresa != '' AND empresa != 'Lobo Solitário' LIMIT 1`).get(session.user_id);
        if (r && r.empresa) return r.empresa;
    } catch(e) {
        console.error('[resolverEmpresa] Erro ao consultar empresa:', e.message);
    }
    if (empresaBody && empresaBody !== 'Lobo Solitário') return empresaBody;
    return 'Lobo Solitário';
}

function enviarWebhook(empresaName, tripData) {
    const webhookUrl = getEmpresaWebhook(empresaName);
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        console.error('[WEBHOOK] Nenhum webhook configurado para "' + empresaName + '"');
        return { enviado: false, motivo: 'sem_webhook' };
    }

    const colorMap = {
        combustiveis: 0xff6600, construcao: 0xffcc00, granel: 0x44aa88,
        maquinas: 0x8866cc, veiculos: 0x4488ff, carga_viva: 0xff4488,
        alimentos: 0x44cc44, florestal: 0x228833, mineracao: 0xcc8844,
        frigorificada: 0x66ccff, perigosos: 0xff2222, geral: 0x888888,
        passageiros: 0x00bcd4
    };
    const cor = colorMap[tripData.categoria] || 0x00ff88;

    // Carrega foto do motorista — como attachment se for local, ou URL direta
    let fotoUrl = '';
    let fotoBuffer = null;
    let fotoNome = '';
    const extMime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', ico:'image/x-icon' };

    if (!tripData._no_thumbnail) {
        try {
            const mot = getDB().prepare(`SELECT foto FROM motoristas WHERE nome = ? AND empresa = ?`).get(tripData.motorista, empresaName);
            if (mot && mot.foto) {
                if (mot.foto.startsWith('http://') || mot.foto.startsWith('https://')) {
                    fotoUrl = mot.foto;
                } else if (mot.foto.startsWith('/uploads/')) {
                    let upDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
                    if (upDir && !path.isAbsolute(upDir)) {
                        upDir = path.resolve(__dirname, upDir);
                    }
                    const nomeArq = mot.foto.replace('/uploads/', '');
                    const cam = path.join(upDir, nomeArq);
                    if (fs.existsSync(cam)) {
                        fotoBuffer = fs.readFileSync(cam);
                        fotoNome = nomeArq;
                        fotoUrl = 'attachment://' + nomeArq;
                    }
                }
            }
        } catch (e) {
            console.error('[webhook] Erro ao carregar foto:', e.message);
        }
    }

    const embed = {
        title: '🚛 NOVA VIAGEM REGISTRADA',
        color: cor,
        fields: [
            { name: '👤 Motorista', value: String(tripData.motorista || ''), inline: true },
            { name: '🏢 Empresa', value: String(empresaName || ''), inline: true },
            { name: '📍 Rota', value: String(tripData.origem || '?') + ' → ' + String(tripData.destino || '?'), inline: false }
        ],
        footer: { text: 'Cargo Stats — Monitoramento ETS2/ATS' },
        timestamp: new Date().toISOString()
    };
    if (fotoUrl) embed.thumbnail = { url: fotoUrl };
    if (tripData.categoria) {
        const nomes = getCategoriasNomes();
        embed.fields.push({ name: '📦 Categoria', value: nomes[tripData.categoria] || String(tripData.categoria), inline: true });
    }
    embed.fields.push({ name: '📏 Distância', value: String(tripData.km || 0) + ' km', inline: true });
    embed.fields.push({ name: '⭐ Pontuação', value: '+' + String(tripData.pontuacao || 0) + ' pts', inline: true });
    if (tripData.bonus_pontos) {
        embed.fields.push({ name: '🔥 Bônus Evento', value: '+' + String(tripData.bonus_pontos) + ' pts' + (tripData.bonus_km ? ' / +' + String(tripData.bonus_km) + ' km' : ''), inline: false });
    }

    const payloadObj = { embeds: [embed] };

    return new Promise((resolve) => {
        try {
            const urlObj = new URL(webhookUrl);
            let body;
            const headers = {};

            if (fotoBuffer) {
                const boundary = '----' + crypto.randomBytes(16).toString('hex');
                const ext = (path.extname(fotoNome) || '.png').replace('.', '').toLowerCase();
                const mime = extMime[ext] || 'image/png';
                const pd = [
                    '--' + boundary,
                    'Content-Disposition: form-data; name="payload_json"',
                    'Content-Type: application/json',
                    '',
                    JSON.stringify(payloadObj)
                ].join('\r\n');
                const fd = [
                    '--' + boundary,
                    'Content-Disposition: form-data; name="file"; filename="' + fotoNome + '"',
                    'Content-Type: ' + mime,
                    '',
                    ''
                ].join('\r\n');
                const ft = '\r\n--' + boundary + '--\r\n';
                body = Buffer.concat([Buffer.from(pd + '\r\n' + fd, 'utf-8'), fotoBuffer, Buffer.from(ft, 'utf-8')]);
                headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
            } else {
                body = JSON.stringify(payloadObj);
                headers['Content-Type'] = 'application/json';
            }
            headers['Content-Length'] = Buffer.byteLength(body);

            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + (urlObj.search || ''),
                method: 'POST',
                headers
            };
            const req = https.request(options, (discordRes) => {
                let data = '';
                discordRes.on('data', chunk => data += chunk);
                discordRes.on('end', () => {
                    if (discordRes.statusCode >= 200 && discordRes.statusCode < 300) {
                        resolve({ enviado: true });
                    } else {
                        console.error('[WEBHOOK] Discord retornou ' + discordRes.statusCode + ': ' + data);
                        resolve({ enviado: false, motivo: 'http_' + discordRes.statusCode, resposta: (data || '').substring(0, 500) });
                    }
                });
            });
            req.on('error', (e) => {
                console.error('[WEBHOOK] Erro de conexao: ' + e.message);
                resolve({ enviado: false, motivo: 'erro_conexao', erro: e.message });
            });
            req.write(body);
            req.end();
        } catch (e) {
            resolve({ enviado: false, motivo: 'erro_interno', erro: e.message });
        }
    });
}

const server = http.createServer(async (req, res) => {
    try {
    server.timeout = 30000;
    server.headersTimeout = 8000;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const urlPath = req.url.split('?')[0];
    const query = parseQuery(req.url);
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    const ipKey = (extra) => `ip:${clientIp}:${extra}`;

    if (urlPath === '/api/telemetry') {
        const bridge = getTelemetryBridge();
        if (bridge && bridge.getLatestTelemetry) {
            const data = bridge.getLatestTelemetry();
            if (data && !data.error) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            } else {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Telemetria indisponivel - jogo ou plugin nao ativo' }));
            }
        } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Addon de telemetria nao carregado' }));
        }
        return;
    }

    if (urlPath === '/api/telemetry/status') {
        const bridge = getTelemetryBridge();
        if (bridge && bridge.getStatus) {
            const status = bridge.getStatus();
            const latestData = bridge.getLatestData ? bridge.getLatestData() : {};
            if (status.available && status.sdkActive) {
                sendJSON(res, {
                    status: 'connected',
                    message: 'Jogo detectado e telemetria ativa via shared memory',
                    source: 'shared_memory',
                    sdkActive: true,
                    pollsSucceeded: latestData.pollsSucceeded || 0
                });
            } else if (status.available) {
                sendJSON(res, {
                    status: 'no_game',
                    message: 'Plugin carregado mas jogo em pausa ou nao conectado',
                    source: 'shared_memory',
                    sdkActive: false,
                    paused: status.paused
                });
            } else {
                sendJSON(res, {
                    status: 'offline',
                    message: 'Shared memory indisponivel - jogo ou plugin nao ativo',
                    source: 'shared_memory',
                    error: latestData.lastError || null
                }, 502);
            }
        } else {
            sendJSON(res, { status: 'offline', message: 'Addon de telemetria nao carregado' }, 503);
        }
        return;
    }

    // ========== AUTH ROUTES ==========

    // NOTE: Registro por email removido. Apenas login via Steam.
    // Apenas admin pode fazer login local via /api/auth/login.

    if (urlPath === '/api/auth/login' && req.method === 'POST') {
        if (isRateLimited(ipKey('login'), 10, 60 * 1000)) {
            return sendJSON(res, { error: 'Muitas tentativas de login. Tente novamente em 1 minuto.' }, 429);
        }
        const body = await readBody(req);
        const { email, senha } = body;
        if (!email || !senha) {
            return sendJSON(res, { error: 'Email e senha sao obrigatorios' }, 400);
        }
        const user = buscarUsuarioPorEmail(email);
        const hashFake = '$2a$10$00000000000000000000000000000000000000000000000000'; // dummy bcrypt hash (60 chars)
        const senhaValida = user ? bcrypt.compareSync(senha, user.senha_hash) : bcrypt.compareSync(senha, hashFake);
        if (!user || !senhaValida) {
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

    // ========== STEAM AUTH ==========

    if (urlPath === '/api/auth/steam' && req.method === 'POST') {
        if (isRateLimited(ipKey('steam_auth'), 10, 60 * 1000)) {
            return sendJSON(res, { error: 'Muitas tentativas. Tente novamente em 1 minuto.' }, 429);
        }
        const body = await readBody(req);
        const { steam_id, nome, avatar } = body;
        if (!steam_id || !nome) {
            return sendJSON(res, { error: 'steam_id e nome sao obrigatorios' }, 400);
        }
        if (typeof steam_id !== 'string' || !/^\d{17}$/.test(steam_id)) {
            return sendJSON(res, { error: 'steam_id invalido' }, 400);
        }

        let user = buscarUsuarioPorSteamId(steam_id);
        if (!user) {
            criarUsuarioSteam(steam_id, nome, avatar || '');
            user = buscarUsuarioPorSteamId(steam_id);
            if (user) {
                criarMotorista(nome, 'Lobo Solitário', user.id, 'Motorista');
                if (avatar) {
                    const motDb = getDB().prepare(`SELECT empresa FROM motoristas WHERE nome = ?`).get(nome);
                    const empresaMot = motDb ? motDb.empresa : 'Lobo Solitário';
                    atualizarMotorista(nome, empresaMot, { foto: avatar });
                }
            }
        } else if (avatar && avatar !== user.avatar) {
            atualizarAvatar(user.id, avatar);
            const motDb = getDB().prepare(`SELECT empresa FROM motoristas WHERE nome = ?`).get(nome);
            if (motDb) {
                atualizarMotorista(nome, motDb.empresa, { foto: avatar });
            }
            user.avatar = avatar;
            user = buscarUsuarioPorSteamId(steam_id);
        }

        if (!user) {
            return sendJSON(res, { error: 'Erro ao criar usuario Steam' }, 500);
        }

        const token = createSessionToken(user.id);
        return sendJSON(res, {
            token,
            user: {
                id: user.id,
                email: user.email,
                nome: user.nome,
                tipo: user.tipo,
                empresa: user.empresa,
                steam_id: user.steam_id,
                avatar: user.avatar
            }
        });
    }

    if (urlPath === '/api/auth/steam/check' && req.method === 'GET') {
        const query2 = parseQuery(req.url);
        if (!query2.steam_id) {
            return sendJSON(res, { error: 'steam_id obrigatorio' }, 400);
        }
        const user = buscarUsuarioPorSteamId(query2.steam_id);
        return sendJSON(res, { exists: !!user });
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
            let fotoPath = parsed.files.foto;
            if (!fotoPath) {
                return sendJSON(res, { error: 'Nenhuma imagem enviada' }, 400);
            }
            const empresa = session.empresa || 'Lobo Solitário';
            console.log(`[UPLOAD] Enviando foto de ${session.nome} (empresa: ${empresa})`);
            fotoPath = await syncHostinger.uploadLocalImageToHostinger(fotoPath, empresa, 'foto', session.nome);
            atualizarMotorista(session.nome, empresa, { foto: fotoPath });
            return sendJSON(res, { ok: true, foto: fotoPath });
        } catch (e) {
            return sendJSON(res, { error: e.message }, 400);
        }
    }

    // ========== LOJA CS GOLD ==========

    if (urlPath === '/api/loja/titulos' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const titulos = getLojaTitulos();
        return sendJSON(res, { ok: true, titulos });
    }

    if (urlPath === '/api/loja/saldo' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const saldo = getCsGold(session.nome);
        const doador = isDoador(session.nome);
        return sendJSON(res, { ok: true, saldo, doador });
    }

    if (urlPath === '/api/loja/inventario' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const inventario = getLojaInventario(session.nome);
        return sendJSON(res, { ok: true, inventario });
    }

    if (urlPath === '/api/loja/titulo-equipado' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const motorista = query.motorista || session.nome;
        const titulos = getTituloEquipado(motorista);
        return sendJSON(res, { ok: true, titulos });
    }

    if (urlPath === '/api/loja/comprar' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        if (!body.titulo_id) return sendJSON(res, { error: 'ID do titulo obrigatorio' }, 400);
        const result = comprarTitulo(session.nome, body.titulo_id);
        if (result.error) return sendJSON(res, { error: result.error }, 400);
        return sendJSON(res, { ok: true, ...result });
    }

    if (urlPath === '/api/loja/equipar' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const result = equiparTitulo(session.nome, body.titulo_id || null);
        if (result.error) return sendJSON(res, { error: result.error }, 400);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/loja/debug' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const db = getDB();
        const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map(r => r.name);
        const titulosCount = db.prepare(`SELECT COUNT(*) AS c FROM loja_titulos`).get().c;
        return sendJSON(res, { ok: true, tables, titulosCount, sessionNome: session.nome });
    }

    if (urlPath === '/api/loja/plano-info' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const info = getPlanoInfo(session.nome);
        info.slots = getSlotsPorPlano(info.plano);
        info.titulosEquipados = getTituloEquipado(session.nome);
        info.doador = isDoador(session.nome);
        return sendJSON(res, { ok: true, ...info });
    }

    // ========== ADMIN ROUTES ==========

    if (urlPath === '/api/admin/reparar' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        try {
            const reparo = repararDuplicatas();
            return sendJSON(res, { ok: true, ...reparo });
        } catch (e) {
            return sendJSON(res, { error: e.message }, 500);
        }
    }

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
                const parsed = await parseMultipart(req);
                nome = parsed.fields.nome;
                descricao = parsed.fields.descricao || '';
                logo = parsed.files.logo || '';
                banner = parsed.files.banner || '';
                console.log(`[UPLOAD] Admin criando empresa "${nome}": logo=${logo ? 'sim' : 'nao'}, banner=${banner ? 'sim' : 'nao'}`);
                try {
                    if (logo) {
                        const uploadedLogo = await syncHostinger.uploadLocalImageToHostinger(logo, nome, 'logo');
                        if (uploadedLogo) logo = uploadedLogo;
                    }
                } catch (logoErr) {
                    console.warn(`[UPLOAD] Erro ao enviar logo (continuando): ${logoErr.message}`);
                }
                try {
                    if (banner) {
                        const uploadedBanner = await syncHostinger.uploadLocalImageToHostinger(banner, nome, 'banner');
                        if (uploadedBanner) banner = uploadedBanner;
                    }
                } catch (bannerErr) {
                    console.warn(`[UPLOAD] Erro ao enviar banner (continuando): ${bannerErr.message}`);
                }
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
                try {
                    if (result.files.logo) { const url = await syncHostinger.uploadLocalImageToHostinger(result.files.logo, dados.nome, 'logo'); if (url) dados.logo = url; }
                } catch (logoErr) {
                    console.warn(`[UPLOAD] Erro ao enviar logo admin (continuando): ${logoErr.message}`);
                }
                try {
                    if (result.files.banner) { const url = await syncHostinger.uploadLocalImageToHostinger(result.files.banner, dados.nome, 'banner'); if (url) dados.banner = url; }
                } catch (bannerErr) {
                    console.warn(`[UPLOAD] Erro ao enviar banner admin (continuando): ${bannerErr.message}`);
                }
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

    if (urlPath === '/api/admin/empresas/re-sync-imagens' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        try {
            // 1. Pull remote image URLs to local DB
            await syncHostinger.processRemoteData(getDB);
            // 2. Push local images to remote
            const result = await syncHostinger.uploadEmpresaImages(getDB);
            return sendJSON(res, { ok: true, enviados: result.enviados });
        } catch (e) {
            return sendJSON(res, { error: e.message }, 500);
        }
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
        if (body.usuario_id) {
            atualizarUsuario(body.usuario_id, undefined, undefined, body.empresa);
        }
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
        deletarMotorista(body.nome, body.empresa);
        recalcEmpresas();
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/admin/limpar-dados' && req.method === 'DELETE') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        // Stop sync to prevent re-import from remote
        const dataDir = process.env.CARGOSTATS_DB_PATH
            ? require('path').dirname(process.env.CARGOSTATS_DB_PATH)
            : __dirname;
        syncHostinger.updateConfig(dataDir, { enabled: false });
        limparDadosAntigos();
        return sendJSON(res, { ok: true, message: 'Todos os dados antigos foram apagados' });
    }

    // --- Limpar dados remotos (hostinger) ---
    if (urlPath === '/api/admin/limpar-remoto' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        try {
            const body = await readBody(req);

            // Support per-PC delete or orphan cleanup
            if (body && (body.pc_id || body.limpar_orfaos)) {
                if (body.pc_id) {
                    const result = await syncHostinger.clearRemoteData(body.pc_id);
                    return sendJSON(res, result);
                }
                if (body.limpar_orfaos) {
                    // Call reset.php to clear orphans
                    const { updateConfig } = syncHostinger;
                    const dataDir = process.env.CARGOSTATS_DB_PATH
                        ? require('path').dirname(process.env.CARGOSTATS_DB_PATH)
                        : __dirname;
                    // Use the clearRemoteData without pcId to do full reset, then re-sync would fix it
                    const result = await syncHostinger.clearRemoteData();
                    if (result.ok) {
                        syncHostinger.setResetInProgress(true);
                        return sendJSON(res, { ok: true, message: 'Dados remotos limpos. Re-sincronize para recriar.' });
                    }
                    return sendJSON(res, result);
                }
            }

            // Stop sync and disable to prevent re-import
            const dataDir = process.env.CARGOSTATS_DB_PATH
                ? require('path').dirname(process.env.CARGOSTATS_DB_PATH)
                : __dirname;
            syncHostinger.updateConfig(dataDir, { enabled: false });
            syncHostinger.setResetInProgress(true);
            // Full local reset + clear remote
            const { dropAllTables, resetDatabase } = require('./database.js');
            dropAllTables();
            resetDatabase();
            let remoteCleared = false;
            let lastError = '';
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const result = await syncHostinger.clearRemoteData();
                    if (result.ok) {
                        remoteCleared = true;
                        break;
                    }
                    lastError = result.error || 'desconhecido';
                } catch (e) {
                    lastError = e.message;
                }
                if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
            }
            if (remoteCleared) {
                syncHostinger.setResetInProgress(false);
                return sendJSON(res, { ok: true, message: 'Dados locais e remotos limpos com sucesso!', remoteCleared: true });
            }
            return sendJSON(res, { ok: true, warning: 'Dados locais limpos, mas falha ao limpar remoto apos 3 tentativas: ' + lastError, remoteCleared: false });
        } catch (e) {
            return sendJSON(res, { error: 'Erro: ' + e.message }, 500);
        }
    }

    if (urlPath === '/api/admin/testar-sync' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        try {
            const result = await syncHostinger.testConnection();
            return sendJSON(res, { ok: result.ok, message: result.message || result.error || 'Falha na conexao' });
        } catch (e) {
            return sendJSON(res, { error: 'Erro: ' + e.message }, 500);
        }
    }

    // --- Full reset: drops all tables, deletes uploads, resets to factory ---
    if (urlPath === '/api/admin/reset-completo' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const dbLog = getDB();
        console.log('[DIAG] ========== INICIANDO RESET ==========');
        console.log('[DIAG] CARGOSTATS_DB_PATH:', process.env.CARGOSTATS_DB_PATH || '(não definido)');
        console.log('[DIAG] __dirname:', __dirname);
        try {
            // Count data BEFORE reset
            const empresasBefore = dbLog.prepare(`SELECT COUNT(*) as c FROM empresas`).get()?.c || 0;
            const viagensBefore = dbLog.prepare(`SELECT COUNT(*) as c FROM viagens`).get()?.c || 0;
            const motoristasBefore = dbLog.prepare(`SELECT COUNT(*) as c FROM motoristas`).get()?.c || 0;
            console.log('[DIAG] ANTES do reset: empresas=' + empresasBefore + ' viagens=' + viagensBefore + ' motoristas=' + motoristasBefore);

            // Stop sync and disable to prevent re-import from remote
            const dataDir = process.env.CARGOSTATS_DB_PATH
                ? require('path').dirname(process.env.CARGOSTATS_DB_PATH)
                : __dirname;
            console.log('[DIAG] dataDir:', dataDir);
            syncHostinger.updateConfig(dataDir, { enabled: false });

            // Block re-import from remote while reset is in progress
            syncHostinger.setResetInProgress(true);

            let remoteCleared = false;
            let lastClearError = '';
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`[DIAG] clearRemoteData tentativa ${attempt}...`);
                    const clearResult = await syncHostinger.clearRemoteData();
                    console.log(`[DIAG] clearRemoteData tentativa ${attempt} resultado:`, JSON.stringify(clearResult));
                    if (clearResult && clearResult.ok === true) {
                        remoteCleared = true;
                        break;
                    }
                    lastClearError = clearResult?.error || 'falha desconhecida';
                    console.warn(`[RESET] Tentativa ${attempt} falhou: ${lastClearError}`);
                } catch (e) {
                    lastClearError = e.message;
                    console.warn(`[RESET] Tentativa ${attempt} exception: ${e.message}`);
                }
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
            if (!remoteCleared) {
                console.warn('[RESET] Aviso: falha ao limpar remoto apos 3 tentativas:', lastClearError);
            }

            console.log('[DIAG] syncStatus apos updateConfig:', JSON.stringify(syncHostinger.getStatus()));

            const { dropAllTables, resetDatabase } = require('./database.js');

            console.log('[DIAG] Executando dropAllTables...');
            dropAllTables();
            console.log('[DIAG] dropAllTables OK');

            console.log('[DIAG] Executando resetDatabase...');
            resetDatabase();
            console.log('[DIAG] resetDatabase OK');

            // Delete uploads
            const uploadsDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
            if (fs.existsSync(uploadsDir)) {
                const files = fs.readdirSync(uploadsDir);
                for (const f of files) {
                    fs.rmSync(path.join(uploadsDir, f), { force: true });
                }
                console.log('[DIAG] Uploads deletados:', files.length);
            }

            // Delete nao_classificadas.json
            const naoClassPath = path.join(__dirname, 'cargas', 'nao_classificadas.json');
            if (fs.existsSync(naoClassPath)) {
                fs.rmSync(naoClassPath, { force: true });
                console.log('[DIAG] nao_classificadas.json deletado');
            }

            // Delete log files
            const logs = fs.readdirSync(__dirname).filter(f => f.endsWith('.log'));
            for (const log of logs) {
                fs.rmSync(path.join(__dirname, log), { force: true });
            }
            if (logs.length > 0) console.log('[DIAG] Logs deletados:', logs.length);

            // Count data AFTER reset
            const empresasAfter = dbLog.prepare(`SELECT COUNT(*) as c FROM empresas`).get()?.c || 0;
            const viagensAfter = dbLog.prepare(`SELECT COUNT(*) as c FROM viagens`).get()?.c || 0;
            const motoristasAfter = dbLog.prepare(`SELECT COUNT(*) as c FROM motoristas`).get()?.c || 0;
            console.log('[DIAG] DEPOIS do reset: empresas=' + empresasAfter + ' viagens=' + viagensAfter + ' motoristas=' + motoristasAfter);

            // Keep import lock active after reset - first sync will upload empty
            // data but skip pulling. Next sync (after lock is cleared) will pull fresh.
            // This prevents "old data" reappearing from other PCs that synced between
            // the server clear and this PC's first pull.
            if (remoteCleared) {
                console.log('[DIAG] Bloqueio de import mantido ate primeiro sync pos-reset');
            } else {
                console.log('[DIAG] Mantendo bloqueio de import remoto — use "Limpar Remoto" manualmente');
            }

            const msg = remoteCleared
                ? 'Reset completo realizado com sucesso! (local + remoto limpos)'
                : 'Reset local realizado, mas falha ao limpar dados remotos apos 3 tentativas. Verifique se o servidor Hostinger esta online e use "Limpar Remoto" manualmente.';
            console.log('[DIAG] ========== RESET FINALIZADO ==========');
            return sendJSON(res, { ok: true, message: msg, remoteCleared: remoteCleared, aviso: !remoteCleared ? 'Dados remotos podem nao ter sido limpos. Va em "Limpar Remoto" para tentar novamente.' : undefined });
        } catch (e) {
            console.error('[DIAG] RESET ERRO:', e);
            console.error('[DIAG] Stack:', e.stack);
            return sendJSON(res, { error: 'Erro ao resetar: ' + e.message }, 500);
        }
    }

    // --- Diagnostic: check data counts in database ---
    if (urlPath === '/api/admin/verificar-dados' && req.method === 'GET') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        try {
            const db = getDB();
            const empresas = db.prepare(`SELECT COUNT(*) as c FROM empresas`).get()?.c || 0;
            const viagens = db.prepare(`SELECT COUNT(*) as c FROM viagens`).get()?.c || 0;
            const motoristas = db.prepare(`SELECT COUNT(*) as c FROM motoristas`).get()?.c || 0;
            const usuarios = db.prepare(`SELECT COUNT(*) as c FROM usuarios`).get()?.c || 0;
            const empresasNomes = db.prepare(`SELECT nome, status, pontuacao FROM empresas ORDER BY nome`).all();
            const syncStatus = syncHostinger.getStatus();
            return sendJSON(res, {
                ok: true,
                dbPath: process.env.CARGOSTATS_DB_PATH || '(usando __dirname)',
                contagem: { empresas, viagens, motoristas, usuarios },
                empresasDetalhe: empresasNomes,
                sync: syncStatus
            });
        } catch (e) {
            return sendJSON(res, { error: 'Erro: ' + e.message }, 500);
        }
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

    if (urlPath === '/api/admin/cargas-pendentes/backfill' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const result = backfillCargasPendentes();
        return sendJSON(res, { ok: true, ...result });
    }

    if (urlPath === '/api/admin/evolucao/processar' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const promocoes = processarAutoEvolucaoMotoristas();
        return sendJSON(res, { ok: true, promocoes });
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
        if (usuarioAlvo) {
            atualizarUsuario(usuarioAlvo.id, undefined, undefined, empresaDoDono);
        }
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

    // ========== WEBHOOK DISCORD ==========

    if (urlPath === '/api/empresa/webhook' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const empresa = resolverEmpresa(session);
        if (empresa === 'Lobo Solitário') return sendJSON(res, { error: 'Voce nao pertence a nenhuma empresa' }, 400);
        const d = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresa);
        if (!d || d.funcao !== 'dono') return sendJSON(res, { error: 'Apenas o dono' }, 403);
        return sendJSON(res, { ok: true, webhook_url: getEmpresaWebhook(empresa) });
    }

    if (urlPath === '/api/empresa/webhook' && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const empresa = resolverEmpresa(session);
        if (empresa === 'Lobo Solitário') return sendJSON(res, { error: 'Voce nao pertence a nenhuma empresa' }, 400);
        const d = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresa);
        if (!d || d.funcao !== 'dono') return sendJSON(res, { error: 'Apenas o dono' }, 403);
        const body = await readBody(req);
        const { webhook_url } = body;
        if (!webhook_url || !webhook_url.startsWith('https://discord.com/api/webhooks/')) {
            return sendJSON(res, { error: 'URL invalida' }, 400);
        }
        setEmpresaWebhook(empresa, webhook_url);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/empresa/webhook/test' && req.method === 'POST') {
        try {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { webhook_url } = body;
        if (!webhook_url || !webhook_url.startsWith('https://discord.com/api/webhooks/')) {
            return sendJSON(res, { error: 'URL invalida' }, 400);
        }

        // Salva automaticamente se for dono
        const empresa = resolverEmpresa(session);
        if (empresa !== 'Lobo Solitário') {
            const d = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresa);
            if (d && d.funcao === 'dono') setEmpresaWebhook(empresa, webhook_url);
        }

        // Teste simples sem foto/thumbnail para evitar rejeicao do Discord
        const envio = await enviarWebhook(empresa, {
            motorista: session.nome,
            origem: 'Teste', destino: 'Discord',
            km: 0, pontuacao: 0, categoria: 'geral',
            bonus_pontos: 0, bonus_km: 0,
            _no_thumbnail: true
        });
        const urlNoBanco = getEmpresaWebhook(empresa);
        return sendJSON(res, {
            ok: envio.enviado,
            error: envio.enviado ? undefined : (envio.motivo || 'falha'),
            debug: {
                empresa_nome: empresa,
                motorista_nome: session.nome,
                tipo: session.tipo,
                webhook_no_banco: !!urlNoBanco,
                envio: envio.enviado ? 'ok' : envio.motivo,
                resposta_discord: envio.resposta || null
            }
        });
        } catch (e) {
            console.error('[TEST-WEBHOOK] Erro:', e.message, e.stack);
            return sendJSON(res, { error: 'Erro: ' + e.message }, 500);
        }
    }

    if (urlPath === '/api/empresa/webhook/debug' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const empresa = resolverEmpresa(session);
        const urlNoBanco = getEmpresaWebhook(empresa);
        return sendJSON(res, {
            ok: true,
            debug: {
                empresa_nome: empresa,
                motorista_nome: session.nome,
                tipo: session.tipo,
                webhook_no_banco: !!urlNoBanco,
                webhook_url: urlNoBanco ? urlNoBanco.substring(0, 50) + '...' : null,
                webhook_valido: urlNoBanco ? urlNoBanco.startsWith('https://discord.com/api/webhooks/') : false
            }
        });
    }

    if (urlPath === '/api/empresa/atualizar' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);

        const empresaNome = session.empresa;
        if (!empresaNome || empresaNome === 'Lobo Solitário') {
            return sendJSON(res, { error: 'Voce nao pertence a nenhuma empresa' }, 400);
        }

        const dbConn = getDB();
        const donoCheck = dbConn.prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresaNome);
        if (!donoCheck || !['dono', 'diretor'].includes(donoCheck.funcao)) {
            return sendJSON(res, { error: 'Apenas dono ou diretor podem editar a empresa' }, 403);
        }

        const contentType = req.headers['content-type'] || '';
        let dados = {};

        if (contentType.includes('multipart/form-data')) {
            try {
                const parsed = await parseMultipart(req);
                if (parsed.fields.descricao !== undefined) dados.descricao = parsed.fields.descricao;
                console.log(`[UPLOAD] Editando empresa "${empresaNome}": logo=${parsed.files.logo ? 'sim' : 'nao'}, banner=${parsed.files.banner ? 'sim' : 'nao'}`);
                try {
                    if (parsed.files.logo) {
                        const uploadedLogo = await syncHostinger.uploadLocalImageToHostinger(parsed.files.logo, empresaNome, 'logo');
                        if (uploadedLogo) dados.logo = uploadedLogo;
                    }
                } catch (logoErr) {
                    console.warn(`[UPLOAD] Erro ao enviar logo edit (continuando): ${logoErr.message}`);
                }
                try {
                    if (parsed.files.banner) {
                        const uploadedBanner = await syncHostinger.uploadLocalImageToHostinger(parsed.files.banner, empresaNome, 'banner');
                        if (uploadedBanner) dados.banner = uploadedBanner;
                    }
                } catch (bannerErr) {
                    console.warn(`[UPLOAD] Erro ao enviar banner edit (continuando): ${bannerErr.message}`);
                }
            } catch (e) {
                return sendJSON(res, { error: e.message }, 400);
            }
        } else {
            const body = await readBody(req);
            if (body.descricao !== undefined) dados.descricao = body.descricao;
            if (body.logo !== undefined) dados.logo = body.logo;
            if (body.banner !== undefined) dados.banner = body.banner;
        }

        if (Object.keys(dados).length === 0) {
            return sendJSON(res, { error: 'Nenhum dado para atualizar' }, 400);
        }

        atualizarEmpresa(empresaNome, dados);
        return sendJSON(res, { ok: true });
    }

    if (urlPath === '/api/empresa/conquistas' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const url = new URL(req.url, 'http://localhost');
        const empresaNome = url.searchParams.get('empresa') || session.empresa;
        if (!empresaNome || empresaNome === 'Lobo Solitário') {
            return sendJSON(res, { error: 'Sem empresa' }, 400);
        }
        try {
            const conquistas = getConquistasEmpresa(empresaNome);
            const stats = getStatsEmpresa(empresaNome);
            return sendJSON(res, { conquistas, stats });
        } catch (e) {
            return sendJSON(res, { error: e.message }, 500);
        }
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
                console.log(`[UPLOAD] Criando empresa "${nome}": logo=${logo ? 'sim' : 'nao'}, banner=${banner ? 'sim' : 'nao'}`);
                // Try upload but don't block if it fails — empresa is created regardless
                try {
                    if (logo) {
                        const uploadedLogo = await syncHostinger.uploadLocalImageToHostinger(logo, nome, 'logo');
                        if (uploadedLogo) logo = uploadedLogo;
                    }
                } catch (logoErr) {
                    console.warn(`[UPLOAD] Erro ao enviar logo (continuando): ${logoErr.message}`);
                }
                try {
                    if (banner) {
                        const uploadedBanner = await syncHostinger.uploadLocalImageToHostinger(banner, nome, 'banner');
                        if (uploadedBanner) banner = uploadedBanner;
                    }
                } catch (bannerErr) {
                    console.warn(`[UPLOAD] Erro ao enviar banner (continuando): ${bannerErr.message}`);
                }
            } catch (e) {
                return sendJSON(res, { error: e.message }, 400);
            }
        } else {
            const body = await readBody(req);
            nome = body.nome;
            descricao = body.descricao || '';
        }

        if (!nome) return sendJSON(res, { error: 'Nome da empresa obrigatorio' }, 400);
        nome = nome.trim();

        // Determinar se as imagens sao URLs web ou paths locais
        let logoStatus = logo && (logo.startsWith('http://') || logo.startsWith('https://')) ? 'uploaded' : (logo ? 'local' : 'none');
        let bannerStatus = banner && (banner.startsWith('http://') || banner.startsWith('https://')) ? 'uploaded' : (banner ? 'local' : 'none');

        const syncStatus = syncHostinger.getStatus();
        const result = criarEmpresa(nome, logo, banner, descricao, session.user_id);
        if (result && result.error) return sendJSON(res, { error: result.error }, 409);

        atualizarUsuario(session.user_id, session.nome, session.tipo, nome);
        criarMotorista(session.nome, nome, session.user_id, 'Motorista', 'dono');
        // Remove qualquer registro residual do Lobo Solitário para evitar duplicatas
        getDB().prepare(`DELETE FROM motoristas WHERE (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario') AND usuario_id = ?`).run(session.user_id);
        recalcularEmpresa(nome);

        // Trigger sync to make company available across devices
        let syncResult = null;
        try {
            syncResult = await syncHostinger.syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdmin);
        } catch (e) {
            console.warn('[SYNC] Aviso ao sincronizar apos criar empresa:', e.message);
            syncResult = { ok: false, reason: e.message };
        }

        return sendJSON(res, {
            ok: true,
            empresa: nome,
            upload: { logo: logoStatus, banner: bannerStatus },
            sync: {
                configured: syncStatus.configured,
                url: !!syncStatus.hostingerUrl,
                result: syncResult ? { ok: syncResult.ok, reason: syncResult.reason || null } : null
            }
        });
    }

    // ========== VIAGEM (MOTORISTA LOGADO) ==========

    if (urlPath === '/api/viagens' && req.method === 'POST') {
        if (isRateLimited(ipKey('viagens'), 20, 60 * 1000)) {
            return sendJSON(res, { error: 'Muitas requisicoes. Aguarde um momento.' }, 429);
        }
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Não autenticado' }, 401);
        const body = await readBody(req);
        const { motorista, empresa, data, origem, destino, km, pontuacao, categoria_carga, cargo_id, carga_nome, status, job_type } = body;

        const nomeMotorista = motorista || session.nome;
        const empresaMotorista = resolverEmpresa(session, empresa);

        if (!nomeMotorista || !data) {
            return sendJSON(res, { error: 'Motorista e data são obrigatórios' }, 400);
        }

        if (session.tipo !== 'admin' && nomeMotorista !== session.nome) {
            return sendJSON(res, { error: 'Só pode cadastrar viagens para si mesmo' }, 403);
        }

        const kmNum = Math.max(0, parseInt(km, 10) || 0);
        const ptsNum = Math.max(0, parseInt(pontuacao, 10) || 0);

        const dbConn = getDB();
        const motExist = dbConn.prepare(`SELECT nome FROM motoristas WHERE nome = ? AND empresa = ?`).get(nomeMotorista, empresaMotorista);
        if (!motExist) {
            criarMotorista(nomeMotorista, empresaMotorista, session.user_id, 'Motorista');
        }

        let cat = categoria_carga;
        if (!cat) {
            const classificacao = classificarCarga(carga_nome || destino || origem || '', cargo_id || '');
            cat = classificacao.slug || 'geral';
            if (classificacao.confianca === 'nenhuma') {
                const nomeExibicao = carga_nome || destino || origem || cargo_id || '(carga desconhecida)';
                adicionarCargaPendente(nomeExibicao, cargo_id || '', 'a_classificar');
            }
        }
        if (job_type === 'onibus' || /onibus|bus|coach|passageiro|passenger|volare|marcopolo/.test((carga_nome || cargo_id || '') .toLowerCase())) {
            cat = 'passageiros';
        }

        const evento = getEventoAtivo();
        const eventoInfo = evento ? {
            id: evento.id, km: kmNum, pontuacao: ptsNum, categoria_carga: cat, destino: destino || ''
        } : null;

        const viagemStatus = status === 'abandonada' || status === 'cancelada' ? status : 'completa';
        const tripResult = criarViagemCompleta(nomeMotorista, empresaMotorista, data, origem || '', destino || '', kmNum, ptsNum, cat, eventoInfo, viagemStatus, job_type);

        if (tripResult && tripResult.duplicate) {
            return sendJSON(res, { ok: true, duplicate: true, message: 'Viagem duplicada detectada' });
        }

        const bonusInfo = tripResult && tripResult.bonusInfo ? tripResult.bonusInfo : null;

        if (viagemStatus !== 'completa' && tripResult && tripResult.lastInsertRowid) {
            const valorPenalidade = Math.max(-500, Math.min(-25, -(Math.floor((kmNum || 0) / 5) + 25)));
            registrarPenalidade(tripResult.lastInsertRowid, nomeMotorista, empresaMotorista, valorPenalidade, viagemStatus);
        }

        if (viagemStatus === 'completa') {
            enviarWebhook(empresaMotorista, {
                motorista: nomeMotorista, origem: origem || '', destino: destino || '',
                km: kmNum, pontuacao: ptsNum, categoria: cat,
                bonus_pontos: bonusInfo ? bonusInfo.bonus_pontos : 0,
                bonus_km: bonusInfo ? bonusInfo.bonus_km : 0,
                status: viagemStatus
            });
        }
        return sendJSON(res, { ok: true, categoria_carga: cat, status: viagemStatus, evento: bonusInfo ? { bonus: bonusInfo } : undefined });
    }

    // ========== AUTO-RECORD (TELEMETRY) ==========

    if (urlPath === '/api/viagens/auto' && req.method === 'POST') {
        if (isRateLimited(ipKey('auto'), 30, 60 * 1000)) {
            return sendJSON(res, { error: 'Muitas requisicoes. Aguarde um momento.' }, 429);
        }
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { motorista, empresa, origem, destino, km, pontuacao, carga_nome, cargo_id, status, job_type } = body;

        if (!motorista) {
            return sendJSON(res, { error: 'Motorista obrigatorio' }, 400);
        }
        const empresaAuto = resolverEmpresa(session, empresa);

        const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const kmNum = Math.max(0, parseInt(km, 10) || 0);
        const ptsNum = Math.max(0, parseInt(pontuacao, 10) || 0);

        // Auto-create motorista record if missing
        const dbConn = getDB();
        const motExist = dbConn.prepare(`SELECT nome FROM motoristas WHERE nome = ? AND empresa = ?`).get(motorista, empresaAuto);
        if (!motExist) {
            criarMotorista(motorista, empresaAuto, session.user_id, 'Motorista');
            console.log(`[AUTO] Motorista "${motorista}" criado automaticamente na empresa "${empresaAuto}"`);
        }

        const classificacao = classificarCarga(carga_nome || '', cargo_id || '');
        let cat = classificacao.slug || 'geral';

        if (job_type === 'onibus' || /onibus|bus|coach|passageiro|passenger|volare|marcopolo/.test((carga_nome || cargo_id || '').toLowerCase())) {
            cat = 'passageiros';
        }

        if (classificacao.confianca === 'nenhuma') {
            const nomeExibicao = carga_nome || cargo_id || '(carga desconhecida)';
            adicionarCargaPendente(nomeExibicao, cargo_id || '', 'a_classificar');
        }

        const evento = getEventoAtivo();
        const eventoInfo = evento ? {
            id: evento.id,
            km: kmNum,
            pontuacao: ptsNum,
            categoria_carga: cat,
            destino: destino || ''
        } : null;

        const viagemStatus = status === 'abandonada' || status === 'cancelada' ? status : 'completa';
        const tripResult = criarViagemCompleta(motorista, empresaAuto, hoje, origem || '', destino || '', kmNum, ptsNum, cat, eventoInfo, viagemStatus, job_type);

        if (tripResult && tripResult.duplicate) {
            return sendJSON(res, { ok: true, duplicate: true, data: hoje });
        }

        const bonusInfo = tripResult && tripResult.bonusInfo ? tripResult.bonusInfo : null;

        if (viagemStatus !== 'completa' && tripResult && tripResult.lastInsertRowid) {
            const valorPenalidade = Math.max(-500, Math.min(-25, -(Math.floor((kmNum || 0) / 5) + 25)));
            registrarPenalidade(tripResult.lastInsertRowid, motorista, empresaAuto, valorPenalidade, viagemStatus);
        }

        if (viagemStatus === 'completa') {
            enviarWebhook(empresaAuto, {
                motorista,
                origem: origem || '', destino: destino || '',
                km: kmNum, pontuacao: ptsNum,
                categoria: cat,
                bonus_pontos: bonusInfo ? bonusInfo.bonus_pontos : 0,
                bonus_km: bonusInfo ? bonusInfo.bonus_km : 0,
                status: viagemStatus
            });
        }
        return sendJSON(res, { ok: true, categoria_carga: cat, data: hoje, status: viagemStatus, evento: bonusInfo ? { bonus: bonusInfo } : undefined });
    }

    // ========== PUBLIC READ ROUTES ==========

    if (urlPath === '/api/empresas' && req.method === 'GET') {
        const mes = safeInt(query.mes);
        const ano = safeInt(query.ano);
        const empresas = getEmpresas(mes, ano);
        const stats = mes && ano ? getStatsGeraisMes(mes, ano) : getStatsGerais();
        return sendJSON(res, { ...stats, empresas });
    }

    if (urlPath === '/api/motoristas' && req.method === 'GET') {
        const empresa = query.empresa || null;
        const mes = safeInt(query.mes);
        const ano = safeInt(query.ano);
        const motoristas = getMotoristas(empresa, mes, ano);
        return sendJSON(res, { motoristas });
    }

    if (urlPath === '/api/motoristas/estatisticas' && req.method === 'GET') {
        const nome = query.motorista;
        if (!nome) return sendJSON(res, { error: 'Motorista obrigatorio' }, 400);
        const stats = getStatsMotorista(nome);
        return sendJSON(res, { stats });
    }

    if (urlPath === '/api/viagens' && req.method === 'GET') {
        const filtros = {};
        if (query.mes) filtros.mes = safeInt(query.mes);
        if (query.ano) filtros.ano = safeInt(query.ano);
        if (query.empresa) filtros.empresa = query.empresa;
        if (query.motorista) filtros.motorista = query.motorista;
        if (query.dataInicio) filtros.dataInicio = query.dataInicio;
        if (query.dataFim) filtros.dataFim = query.dataFim;
        if (query.status) filtros.status = query.status;
        const viagens = getViagens(filtros);
        return sendJSON(res, { viagens });
    }

    if (urlPath === '/api/ranking/empresas') {
        const periodo = query.periodo || 'geral';
        const mes = query.mes ? safeInt(query.mes) : null;
        const ano = query.ano ? safeInt(query.ano) : null;
        const ranking = getRankingEmpresas(periodo, mes, ano);
        return sendJSON(res, { ranking });
    }

    if (urlPath === '/api/hall/empresas') {
        try {
            const ranking = getRankingEmpresas('geral');
            if (!ranking || ranking.length === 0) {
                return sendJSON(res, { ranking: [] });
            }
            const empresas = ranking.map(e => ({
                nome: e.nome || '',
                logo: e.logo || '',
                banner: e.banner || '',
                motoristas: e.motoristas || 0,
                viagens: e.viagens || 0,
                km: e.km || 0,
                pontuacao: e.pontuacao || 0
            }));
            return sendJSON(res, { ranking: empresas });
        } catch (e) {
            return sendJSON(res, { ranking: [], error: e.message });
        }
    }

    if (urlPath === '/api/hall') {
        try {
            const ranking = getRankingMotoristas('geral', null, null, null);
            if (!ranking || ranking.length === 0) {
                return sendJSON(res, { records: [], campeoes_mensais: [] });
            }
            const best = (field) => {
                const sorted = [...ranking].sort((a, b) => (b[field] || 0) - (a[field] || 0));
                return sorted[0] || null;
            };
            const bestKm = best('km');
            const bestViagens = best('viagens');
            const bestPts = best('pontuacao');

            // Conquistas: count unlocked achievements per motorista
            const dbHall = getDB();
            const conquistasConfig = safeJsonParse(fs.readFileSync(path.join(__dirname, 'conquistas_config.json'), 'utf8'));
            const conquistasDef = (conquistasConfig && conquistasConfig.conquistas) || [];
            let bestConq = null;
            ranking.forEach(m => {
                try {
                    const c = getConquistasMotorista(m.nome, conquistasDef);
                    const desbloq = c.filter(x => x.desbloqueada).length;
                    if (!bestConq || desbloq > bestConq.valor) {
                        bestConq = { nome: m.nome, empresa: m.empresa, valor: desbloq };
                    }
                } catch (e) {
                    console.error('[Hall] Erro conquistas para', m.nome, e.message);
                }
            });

            const records = [
                { id: 'maior_km', icon: '🛣️', label: 'Maior distância em uma viagem', nome: bestKm ? bestKm.nome : null, empresa: bestKm ? bestKm.empresa : null, valor: bestKm ? bestKm.km : 0, formatado: (bestKm ? (bestKm.km || 0) : 0).toLocaleString() + ' km' },
                { id: 'mais_viagens', icon: '📦', label: 'Mais entregas realizadas', nome: bestViagens ? bestViagens.nome : null, empresa: bestViagens ? bestViagens.empresa : null, valor: bestViagens ? bestViagens.viagens : 0, formatado: (bestViagens ? (bestViagens.viagens || 0) : 0).toLocaleString() + ' entregas' },
                { id: 'mais_pontos', icon: '⭐', label: 'Maior pontuação total', nome: bestPts ? bestPts.nome : null, empresa: bestPts ? bestPts.empresa : null, valor: bestPts ? bestPts.pontuacao : 0, formatado: (bestPts ? (bestPts.pontuacao || 0) : 0).toLocaleString() + ' pts' },
                { id: 'mais_conquistas', icon: '🏆', label: 'Mais conquistas desbloqueadas', nome: bestConq ? bestConq.nome : null, empresa: bestConq ? bestConq.empresa : null, valor: bestConq ? bestConq.valor : 0, formatado: bestConq ? bestConq.valor + ' conquistas' : '0 conquistas' },
            ];

            // Monthly champions (last 6 months)
            const campeoesMensais = [];
            const now = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mes = d.getMonth() + 1;
                const ano = d.getFullYear();
                const monthlyRanking = getRankingMotoristas('mes', mes, ano, null);
                if (monthlyRanking && monthlyRanking.length > 0) {
                    campeoesMensais.push({
                        mes,
                        ano,
                        motorista: monthlyRanking[0].nome,
                        empresa: monthlyRanking[0].empresa,
                        pontos: monthlyRanking[0].pontuacao || 0,
                        viagens: monthlyRanking[0].viagens || 0,
                        km: monthlyRanking[0].km || 0
                    });
                }
            }

            return sendJSON(res, { records, campeoesMensais });
        } catch (e) {
            console.error('[HALL] Erro:', e.message, e.stack);
            return sendJSON(res, { records: [], campeoesMensais: [], error: e.message });
        }
    }

    if (urlPath === '/api/ranking/motoristas') {
        const periodo = query.periodo || 'geral';
        const mes = query.mes ? safeInt(query.mes) : null;
        const ano = query.ano ? safeInt(query.ano) : null;
        const empresa = query.empresa || null;
        const ranking = getRankingMotoristas(periodo, mes, ano, empresa);
        return sendJSON(res, { ranking });
    }

    if (urlPath === '/api/stats') {
        const mes = query.mes ? safeInt(query.mes) : null;
        const ano = query.ano ? safeInt(query.ano) : null;
        const stats = mes && ano ? getStatsGeraisMes(mes, ano) : getStatsGerais();
        return sendJSON(res, stats);
    }

    if (urlPath === '/api/conquistas') {
        let conquistasDef;
        try {
            const conquistasConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'conquistas_config.json'), 'utf8'));
            conquistasDef = conquistasConfig.conquistas || [];
        } catch(e) {
            return sendJSON(res, { error: 'Erro ao carregar conquistas' }, 500);
        }

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

    if (urlPath === '/api/premiacao/motorista') {
        const nome = query.motorista;
        if (!nome) return sendJSON(res, { error: 'Motorista obrigatorio' }, 400);
        const premiacao = getPremiacaoMotorista(nome);
        if (!premiacao) return sendJSON(res, { error: 'Motorista nao encontrado' }, 404);
        return sendJSON(res, { premiacao });
    }

    // ========== NETWORK / QRCODE ==========

    if (urlPath === '/api/network/ip' && req.method === 'GET') {
        const localIP = getLocalIP();
        return sendJSON(res, { ip: localIP, porta: PORT, url: `http://${localIP}:${PORT}/mobile` });
    }

    if (urlPath === '/api/network/qrcode' && req.method === 'GET') {
        const localIP = getLocalIP();
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
        let dbStatus = 'ok';
        try { getDB().prepare('SELECT 1').get(); }
        catch(e) { dbStatus = 'error: ' + e.message; }
        const mem = process.memoryUsage();
        return sendJSON(res, {
            status: dbStatus === 'ok' ? 'ok' : 'degraded',
            uptime: Math.floor(process.uptime()),
            db: dbStatus,
            memory: {
                rss: Math.floor(mem.rss / 1024 / 1024) + 'MB',
                heap: Math.floor(mem.heapUsed / 1024 / 1024) + 'MB'
            },
            timestamp: new Date().toISOString()
        });
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
        const mes = query.mes ? safeInt(query.mes) : null;
        const ano = query.ano ? safeInt(query.ano) : null;
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

    // ========== COMUNIDADE PROXY (via servidor local) ==========

    if (urlPath === '/api/comunidade/ranking' && req.method === 'GET') {
        const syncStatus = syncHostinger.getStatus();
        if (!syncStatus.enabled) {
            return sendJSON(res, { error: 'Sync desativado' }, 503);
        }
        const tipo = query.t || 'empresas';
        try {
            const result = await fetchHostinger(`ranking.php?t=${tipo}`);
            if (result.status === 200) {
                return sendJSON(res, result.body);
            }
            return sendJSON(res, { error: 'Hostinger error' }, result.status);
        } catch (e) {
            return sendJSON(res, { error: e.message }, 502);
        }
    }

    if (urlPath === '/api/comunidade/stats' && req.method === 'GET') {
        const syncStatus = syncHostinger.getStatus();
        if (!syncStatus.enabled) {
            return sendJSON(res, { error: 'Sync desativado' }, 503);
        }
        try {
            const result = await fetchHostinger('stats.php');
            if (result.status === 200) {
                return sendJSON(res, result.body);
            }
            return sendJSON(res, { error: 'Hostinger error' }, result.status);
        } catch (e) {
            return sendJSON(res, { error: e.message }, 502);
        }
    }

    if (urlPath === '/api/comunidade/reacoes' && req.method === 'GET') {
        const syncStatus = syncHostinger.getStatus();
        if (!syncStatus.enabled) {
            return sendJSON(res, { error: 'Sync desativado' }, 503);
        }
        try {
            const result = await fetchHostinger('reacoes.php');
            if (result.status === 200) {
                return sendJSON(res, result.body);
            }
            return sendJSON(res, { error: 'Hostinger error' }, result.status);
        } catch (e) {
            return sendJSON(res, { error: e.message }, 502);
        }
    }

    if (urlPath === '/api/comunidade/reagir' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const syncStatus = syncHostinger.getStatus();
        if (!syncStatus.enabled) {
            return sendJSON(res, { error: 'Sync desativado' }, 503);
        }
        try {
            const result = await postHostinger('reacao.php', {
                secret: process.env.SYNC_SECRET || 'cargostats_luiz',
                alvo_nome: body.alvo_nome,
                alvo_tipo: body.alvo_tipo,
                tipo_reacao: body.tipo_reacao,
                usuario: body.usuario
            });
            return sendJSON(res, result.body, result.status);
        } catch (e) {
            return sendJSON(res, { error: e.message }, 502);
        }
    }

    // ========== SYNC (WEB RECEBE DO EXE) ==========

    if (urlPath === '/api/sync/receber' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
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

    // ========== HOSTINGER SYNC ==========

    if (urlPath === '/api/sync/status' && req.method === 'GET') {
        const status = syncHostinger.getStatus();
        // Everyone can see basic sync status (no secrets exposed)
        return sendJSON(res, {
            enabled: status.enabled,
            configured: status.configured,
            lastSync: status.lastSync,
            lastError: status.lastError,
            isSyncing: status.isSyncing,
            resetInProgress: status.resetInProgress,
            hostingerUrl: status.hostingerUrl ? '(configurado)' : ''
        });
    }

    if (urlPath === '/api/sync/config' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        const dataDir = process.env.CARGOSTATS_DB_PATH
            ? require('path').dirname(process.env.CARGOSTATS_DB_PATH)
            : __dirname;
        syncHostinger.updateConfig(dataDir, body, getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdmin);
        return sendJSON(res, { ok: true, status: syncHostinger.getStatus() });
    }

    if (urlPath === '/api/sync/now' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const result = await syncHostinger.syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdmin);
        return sendJSON(res, result);
    }

    if (urlPath === '/api/sync/dados' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
        const empresas = getRankingEmpresas('geral');
        const motoristas = getRankingMotoristas('geral');
        const stats = getStatsGerais();
        return sendJSON(res, {
            empresas: empresas.map(e => ({
                nome: e.nome, logo: e.logo || '', descricao: e.descricao || '',
                motoristas: e.motoristas || 0, viagens: e.viagens || 0,
                km: e.km || 0, pontuacao: e.pontuacao || 0
            })),
            motoristas: motoristas.map(m => ({
                nome: m.nome, empresa: m.empresa,
                viagens: m.viagens || 0, km: m.km || 0, pontuacao: m.pontuacao || 0
            })),
            stats,
            timestamp: new Date().toISOString()
        });
    }

    // ========== MULTI-PC ADMIN ENDPOINTS ==========

    if (urlPath === '/api/sync/dispositivos' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
        const result = await syncHostinger.getRemoteDispositivos();
        return sendJSON(res, result);
    }

    if (urlPath === '/api/sync/ver-remoto' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
        const query = parseQuery(req.url);
        const data = await syncHostinger.getRemoteData(query.pc_id || null);
        return sendJSON(res, data || { ok: false, error: 'Falha ao buscar dados remotos' });
    }

    if (urlPath === '/api/sync/diagnostico' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
        try {
            const remoteData = await syncHostinger.getRemoteData();
            const dispositivos = await syncHostinger.getRemoteDispositivos();
            const status = syncHostinger.getStatus();
            const db = getDB();
            const localEmpresas = db.prepare(`SELECT COUNT(*) as c FROM empresas`).get()?.c || 0;
            const localViagens = db.prepare(`SELECT COUNT(*) as c FROM viagens`).get()?.c || 0;

            let orfaos = 0;
            let totalRemoto = 0;
            if (remoteData && remoteData.empresas) {
                totalRemoto = remoteData.empresas.length;
                orfaos = remoteData.empresas.filter(e => !e.pc_id || e.pc_id === '').length;
            }

            return sendJSON(res, {
                ok: true,
                local: { empresas: localEmpresas, viagens: localViagens, pcId: status.pcId, resetToken: status.resetToken, resetInProgress: status.resetInProgress },
                remoto: {
                    totalEmpresas: totalRemoto,
                    orfaos: orfaos,
                    empresas: remoteData ? remoteData.empresas.map(e => ({ nome: e.nome, pc_id: e.pc_id || '' })) : [],
                    reset_token: remoteData?.reset_token || 0
                },
                dispositivos: dispositivos.dispositivos || []
            });
        } catch (e) {
            return sendJSON(res, { ok: false, error: e.message }, 500);
        }
    }

    if (urlPath === '/api/sync/deletar-remoto' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
        const body = await readBody(req);
        if (!body.nome) return sendJSON(res, { error: 'Nome da empresa obrigatorio' }, 400);
        const result = await syncHostinger.deleteRemoteEmpresa(body.nome, body.pc_id);
        return sendJSON(res, result);
    }

    if (urlPath === '/api/sync/liberar-import' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (session.tipo !== 'admin') return sendJSON(res, { error: 'Acesso negado' }, 403);
        syncHostinger.setResetInProgress(false);
        return sendJSON(res, { ok: true, message: 'Importacao remota liberada' });
    }

    if (urlPath === '/api/admin/reset-all' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        if (!requireAdmin(session, res)) return;
        const result = await syncHostinger.resetAllRemote();
        if (result.ok) {
            // Clear local data too
            try {
                const { dropAllTables, resetDatabase } = require('./database.js');
                dropAllTables();
                resetDatabase();
                const uploadsDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
                if (fs.existsSync(uploadsDir)) {
                    const files = fs.readdirSync(uploadsDir);
                    for (const f of files) fs.rmSync(path.join(uploadsDir, f), { force: true });
                }
            } catch (e) {
                console.error('[RESET-ALL] Erro ao limpar local:', e.message);
            }
            syncHostinger.setResetInProgress(true);
        }
        return sendJSON(res, result);
    }

    // ========== STEAM CALLBACK ==========

    if (urlPath === '/steam-callback') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Steam Login</title>
        <style>body{background:#050508;color:#f5c842;font-family:Consolas,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
        .box{background:#0d1117;border:1px solid #f5c84240;border-radius:12px;padding:3rem}
        h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#888;font-size:0.9rem}</style></head>
        <body><div class="box"><h1>Login com Steam concluido!</h1><p>Pode fechar esta janela.</p></div></body></html>`);
        return;
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

    if (urlPath === '/api/solicitacoes' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const query = parseQuery(req.url);

        if (query.count === 'true' && query.empresa) {
            const solicitacoesAll = getSolicitacoesPorEmpresaFuzzy(query.empresa);
            const count = solicitacoesAll.filter(s => s.status === 'pendente').length;
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
            const solicitacoes = getSolicitacoesPorEmpresaFuzzy(query.empresa);
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

        const tx = dbConn.transaction(() => {
            responderSolicitacao(id, 'aceita');
            const usuarioAlvo = dbConn.prepare(`SELECT id FROM usuarios WHERE nome = ?`).get(sol.motorista);
            criarMotorista(sol.motorista, sol.empresa, usuarioAlvo ? usuarioAlvo.id : null, 'Motorista', 'motorista');
            if (usuarioAlvo) {
                dbConn.prepare(`UPDATE usuarios SET empresa = ? WHERE id = ?`).run(sol.empresa, usuarioAlvo.id);
            }
        });
        tx();
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

    // ========== VAGAS ==========

    if (urlPath === '/api/vagas' && req.method === 'GET') {
        const filtros = {};
        if (query.empresa) filtros.empresa = query.empresa;
        if (query.categoria) filtros.categoria = query.categoria;
        const vagas = getVagas(filtros);
        return sendJSON(res, { ok: true, vagas });
    }

    if (urlPath === '/api/vagas' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { empresa, titulo, descricao, categoria, qtd_vagas } = body;
        if (!empresa || !titulo) return sendJSON(res, { error: 'Empresa e titulo obrigatorios' }, 400);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Apenas dono/diretor/chefe_rh pode criar vagas' }, 403);
        }
        const result = criarVaga(empresa, session.user_id || 0, titulo, descricao || '', categoria || 'geral', qtd_vagas || 1);
        return sendJSON(res, result);
    }

    if (urlPath.match(/^\/api\/vagas\/(\d+)$/) && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const body = await readBody(req);
        const vaga = getVagaPorId(id);
        if (!vaga) return sendJSON(res, { error: 'Vaga nao encontrada' }, 404);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, vaga.empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Sem permissao' }, 403);
        }
        const result = atualizarVaga(id, { status: body.status, titulo: body.titulo, descricao: body.descricao, qtd_vagas: body.qtd_vagas });
        return sendJSON(res, result);
    }

    if (urlPath.match(/^\/api\/vagas\/(\d+)$/) && req.method === 'DELETE') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const vaga = getVagaPorId(id);
        if (!vaga) return sendJSON(res, { error: 'Vaga nao encontrada' }, 404);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, vaga.empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Sem permissao' }, 403);
        }
        deletarVaga(id);
        return sendJSON(res, { ok: true });
    }

    if (urlPath.match(/^\/api\/vagas\/(\d+)\/candidaturas$/) && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const vaga = getVagaPorId(id);
        if (!vaga) return sendJSON(res, { error: 'Vaga nao encontrada' }, 404);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, vaga.empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Sem permissao' }, 403);
        }
        const candidaturas = getCandidaturasPorVaga(id);
        return sendJSON(res, { ok: true, candidaturas });
    }

    // ========== CANDIDATURAS ==========

    if (urlPath === '/api/candidaturas' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { vaga_id, mensagem } = body;
        if (!vaga_id) return sendJSON(res, { error: 'vaga_id obrigatorio' }, 400);
        const userEmpresa = session.empresa || 'Lobo Solitário';
        const result = criarCandidatura(vaga_id, session.nome, userEmpresa, mensagem || '');
        return sendJSON(res, result);
    }

    if (urlPath === '/api/candidaturas' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const candidaturas = getCandidaturasPorMotorista(session.nome);
        return sendJSON(res, { ok: true, candidaturas });
    }

    if (urlPath.match(/^\/api\/candidaturas\/(\d+)\/aceitar$/) && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const cand = getCandidaturaPorId(id);
        if (!cand) return sendJSON(res, { error: 'Candidatura nao encontrada' }, 404);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, cand.vaga_empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Sem permissao' }, 403);
        }
        responderCandidatura(id, 'aceita');
        criarMotorista(cand.motorista, cand.vaga_empresa, null, 'Motorista');
        getDB().prepare(`UPDATE usuarios SET empresa = ? WHERE nome = ?`).run(cand.vaga_empresa, cand.motorista);
        const loboMot = getDB().prepare(`SELECT nome FROM motoristas WHERE nome = ? AND empresa = 'Lobo Solitário'`).get(cand.motorista);
        if (loboMot) {
            getDB().prepare(`DELETE FROM motoristas WHERE nome = ? AND empresa = 'Lobo Solitário'`).run(cand.motorista);
        }
        return sendJSON(res, { ok: true });
    }

    if (urlPath.match(/^\/api\/candidaturas\/(\d+)\/recusar$/) && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const cand = getCandidaturaPorId(id);
        if (!cand) return sendJSON(res, { error: 'Candidatura nao encontrada' }, 404);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, cand.vaga_empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Sem permissao' }, 403);
        }
        responderCandidatura(id, 'recusada');
        return sendJSON(res, { ok: true });
    }

    if (urlPath.match(/^\/api\/candidaturas\/(\d+)\/retirar$/) && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const cand = getCandidaturaPorId(id);
        if (!cand) return sendJSON(res, { error: 'Candidatura nao encontrada' }, 404);
        if (cand.motorista !== session.nome) return sendJSON(res, { error: 'Sem permissao' }, 403);
        responderCandidatura(id, 'retirada');
        return sendJSON(res, { ok: true });
    }

    // ========== CONVITES ==========

    if (urlPath === '/api/convites' && req.method === 'POST') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const body = await readBody(req);
        const { empresa, motorista, motorista_empresa, vaga_id, mensagem } = body;
        if (!empresa || !motorista) return sendJSON(res, { error: 'Empresa e motorista obrigatorios' }, 400);
        const motCheck = getDB().prepare(`SELECT funcao FROM motoristas WHERE nome = ? AND empresa = ?`).get(session.nome, empresa);
        if (!motCheck || (motCheck.funcao !== 'dono' && motCheck.funcao !== 'diretor' && motCheck.funcao !== 'chefe_rh')) {
            return sendJSON(res, { error: 'Apenas dono/diretor/chefe_rh pode enviar convites' }, 403);
        }
        const result = criarConvite(empresa, motorista, motorista_empresa || '', vaga_id || null, mensagem || '');
        return sendJSON(res, result);
    }

    if (urlPath === '/api/convites' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const convites = getConvitesPorMotorista(session.nome);
        return sendJSON(res, { ok: true, convites });
    }

    if (urlPath.match(/^\/api\/convites\/(\d+)\/aceitar$/) && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const sol = getDB().prepare(`SELECT * FROM solicitacoes WHERE id = ? AND motorista = ? AND tipo = 'convite'`).get(id, session.nome);
        if (!sol) return sendJSON(res, { error: 'Convite nao encontrado' }, 404);
        responderSolicitacao(id, 'aceita');
        criarMotorista(session.nome, sol.empresa, session.user_id, 'Motorista');
        getDB().prepare(`UPDATE usuarios SET empresa = ? WHERE nome = ?`).run(sol.empresa, session.nome);
        const loboMot = getDB().prepare(`SELECT nome FROM motoristas WHERE nome = ? AND empresa = 'Lobo Solitário'`).get(session.nome);
        if (loboMot) {
            getDB().prepare(`DELETE FROM motoristas WHERE nome = ? AND empresa = 'Lobo Solitário'`).run(session.nome);
        }
        return sendJSON(res, { ok: true });
    }

    if (urlPath.match(/^\/api\/convites\/(\d+)\/recusar$/) && req.method === 'PUT') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const id = parseInt(urlPath.split('/')[3]);
        const sol = getDB().prepare(`SELECT * FROM solicitacoes WHERE id = ? AND motorista = ? AND tipo = 'convite'`).get(id, session.nome);
        if (!sol) return sendJSON(res, { error: 'Convite nao encontrado' }, 404);
        responderSolicitacao(id, 'recusada');
        return sendJSON(res, { ok: true });
    }

    // ========== EVENTOS ==========

    if (urlPath === '/api/eventos/ativo' && req.method === 'GET') {
        const evento = getEventoAtivo();
        if (!evento) return sendJSON(res, { evento: null });
        const params = safeJsonParse(evento.parametros);
        return sendJSON(res, { evento: { ...evento, parametros: params } });
    }

    if (urlPath === '/api/eventos/progresso' && req.method === 'GET') {
        const session = getSession(req);
        if (!session) return sendJSON(res, { error: 'Nao autenticado' }, 401);
        const evento = getEventoAtivo();
        if (!evento) return sendJSON(res, { progresso: null });

        if (query.empresa) {
            const data = getProgressoEmpresa(evento.id, query.empresa);
            return sendJSON(res, { progresso: data, evento: { ...evento, parametros: safeJsonParse(evento.parametros) } });
        }

        if (query.motorista) {
            const data = getProgressoMotorista(evento.id, query.motorista);
            return sendJSON(res, { progresso: data, evento: { ...evento, parametros: safeJsonParse(evento.parametros) } });
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

    if (urlPath === '/api/eventos/finalizar' && req.method === 'POST') {
        const qtd = finalizarEventosExpirados();
        return sendJSON(res, { ok: true, finalizados: qtd });
    }

    if (urlPath === '/api/admin/planos/lista' && req.method === 'GET') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const planos = listarPlanos();
        return sendJSON(res, { ok: true, planos });
    }

    if (urlPath === '/api/admin/planos/ativar' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const body = await readBody(req);
        if (!body.nome || !body.plano) return sendJSON(res, { error: 'nome e plano obrigatorios' }, 400);
        const dias = body.dias || 30;
        const result = setPlanoAdmin(body.nome, body.plano, dias);
        if (result.error) return sendJSON(res, { error: result.error }, 400);
        return sendJSON(res, { ok: true, ...result });
    }

    if (urlPath === '/api/admin/planos/pull' && req.method === 'POST') {
        const session = getSession(req);
        if (!requireAdmin(session, res)) return;
        const result = await syncHostinger.processPendingPlanos(setPlanoAdmin);
        return sendJSON(res, { ok: true, ...result });
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
        let uploadsDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
        if (uploadsDir && !path.isAbsolute(uploadsDir)) {
            uploadsDir = path.resolve(__dirname, uploadsDir);
        }
        const requested = urlPath.replace('/uploads/', '');
        const uploadPath = sanitizePath(requested, uploadsDir);
        if (!uploadPath) {
            res.writeHead(403);
            res.end('Acesso negado');
            return;
        }
        const ext = path.extname(uploadPath);
        fs.readFile(uploadPath, (err, content) => {
            if (err) {
                res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
                res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#1a1a22" width="200" height="200" rx="8"/><text fill="#555" font-size="40" x="100" y="105" text-anchor="middle" font-family="sans-serif">🖼</text></svg>');
                return;
            } else {
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                res.end(content);
            }
        });
        return;
    }

    // --- Site assets (/site/cs/, /site/js/, /site/images/) ---
    if (urlPath.startsWith('/site/')) {
        const requested = urlPath.replace(/^\/site\//, '');
        const siteAssetPath = sanitizePath(requested, path.join(__dirname, 'site'));
        if (!siteAssetPath) {
            res.writeHead(403);
            res.end('Acesso negado');
            return;
        }
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

    const safePath = sanitizePath(filePath, __dirname);
    if (!safePath) {
        res.writeHead(403);
        res.end('Acesso negado');
        return;
    }

    const ext = path.extname(safePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(safePath, (err, content) => {
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
        server.close(() => {
            try { getDB().close(); } catch(e) {}
            console.log('Servidor encerrado.');
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 5000);
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
        setInterval(() => {
            try {
                const qtd = finalizarEventosExpirados();
                if (qtd > 0) console.log(`[EVENTOS] ${qtd} evento(s) finalizado(s) por expiracao`);
            } catch (e) {
                console.error('[EVENTOS] Erro ao finalizar expirados:', e.message);
            }
        }, 30 * 1000);
        setInterval(() => {
            try {
                const expirados = verificarPlanosExpirados();
                if (expirados > 0) console.log(`[PLANOS] ${expirados} plano(s) expirado(s) rebaixado(s) para Bronze`);
            } catch (e) {
                console.error('[PLANOS] Erro ao verificar expirados:', e.message);
            }
        }, 60 * 60 * 1000);

        setInterval(() => {
            try {
                const processadas = processarPenalidadesPendentes();
                if (processadas > 0) console.log(`[PENALIDADES] ${processadas} penalidade(s) aplicada(s)`);
            } catch (e) {
                console.error('[PENALIDADES] Erro ao processar:', e.message);
            }
        }, 5 * 60 * 1000);

        setInterval(() => {
            try {
                const promocoes = processarAutoEvolucaoMotoristas();
                if (promocoes > 0) console.log(`[EVOLUCAO] ${promocoes} motorista(s) promovido(s) automaticamente`);
            } catch (e) {
                console.error('[EVOLUCAO] Erro ao processar:', e.message);
            }
        }, 10 * 60 * 1000);

        try {
            const promocoes = processarAutoEvolucaoMotoristas();
            if (promocoes > 0) console.log(`[EVOLUCAO] ${promocoes} motorista(s) promovido(s) na inicializacao`);
        } catch (e) {
            console.error('[EVOLUCAO] Erro na inicializacao:', e.message);
        }

        const dataDir = process.env.CARGOSTATS_DB_PATH
            ? require('path').dirname(process.env.CARGOSTATS_DB_PATH)
            : __dirname;
        syncHostinger.loadConfig(dataDir);
        const syncStatus = syncHostinger.getStatus();
        if (syncStatus.configured && syncStatus.enabled) {
            syncHostinger.startSyncTimer(dataDir, getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdmin);
            console.log(`[SYNC] Hostinger sync ativo: ${syncStatus.hostingerUrl}`);
        } else {
            console.log('[SYNC] Hostinger sync nao configurado (configure no painel admin)');
        }
    });

    return server;
}

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    startServer(PORT);
} else {
    module.exports = { startServer };
}
