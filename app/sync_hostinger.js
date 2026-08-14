const https = require('https');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30 * 1000;
const DATA_VERSION = 3; // Bumped for sync fixes

let syncConfig = {
    hostingerUrl: '',
    syncSecret: '',
    intervalMs: DEFAULT_INTERVAL_MS,
    enabled: false,
    pcId: '',
    resetToken: 0,
    syncGeneration: 0,
    pcNome: ''
};

let syncTimer = null;
let lastSync = null;
let lastError = null;
let isSyncing = false;
let resetInProgress = false;

// Stored function references for later use (e.g., when enabling sync via updateConfig)
let _getDB = null;
let _getRankingEmpresas = null;
let _getRankingMotoristas = null;
let _getStatsGerais = null;
let _setPlanoAdminFn = null;

function generatePcId() {
    return 'pc-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

function loadConfig(dataDir) {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(dataDir, 'sync_config.json');
    syncConfig._dataDir = dataDir;
    // Default: not in reset
    resetInProgress = false;
    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            const saved = JSON.parse(raw);
            syncConfig.hostingerUrl = saved.hostingerUrl || '';
            syncConfig.syncSecret = process.env.SYNC_SECRET || saved.syncSecret || '';
            syncConfig.intervalMs = saved.intervalMs || DEFAULT_INTERVAL_MS;
            syncConfig.enabled = saved.enabled || false;
            syncConfig.pcId = saved.pcId || generatePcId();
            syncConfig.resetToken = saved.resetToken || 0;
            syncConfig.syncGeneration = saved.syncGeneration || 0;
            syncConfig.pcNome = saved.pcNome || os.hostname();
            // Restore resetInProgress from saved config (persisted across restarts)
            if (saved.resetInProgress) resetInProgress = true;
            console.log(`[${timestamp()}] [SYNC] Config carregada: ${syncConfig.hostingerUrl ? 'URL configurada' : 'URL vazia'}, enabled=${syncConfig.enabled}, pcId=${syncConfig.pcId}, resetInProgress=${resetInProgress}`);
            return true;
        } else {
            // Fallback: try the app directory (where sync_hostinger.js lives)
            const fallbackPaths = [
                path.join(__dirname, 'sync_config.json'),
                path.join(__dirname, 'sync_config.jsonc'),
                path.join(process.env.APPDATA || '', 'cargo-stats', 'sync_config.json'),
                path.join(process.cwd(), 'sync_config.json'),
                path.join(__dirname, '..', 'sync_config.json')
            ];
            for (const fbPath of fallbackPaths) {
                if (fs.existsSync(fbPath)) {
                    const raw = fs.readFileSync(fbPath, 'utf8');
                    const saved = JSON.parse(raw);
                    syncConfig.hostingerUrl = saved.hostingerUrl || '';
                    syncConfig.syncSecret = process.env.SYNC_SECRET || saved.syncSecret || '';
                    syncConfig.intervalMs = saved.intervalMs || DEFAULT_INTERVAL_MS;
                    syncConfig.enabled = saved.enabled || false;
                    syncConfig.pcId = saved.pcId || generatePcId();
                    syncConfig.resetToken = saved.resetToken || 0;
                    syncConfig.syncGeneration = saved.syncGeneration || 0;
                    syncConfig.pcNome = saved.pcNome || os.hostname();
                    if (saved.resetInProgress) resetInProgress = true;
                    // Save a copy to dataDir for future runs
                    try {
                        fs.mkdirSync(dataDir, { recursive: true });
                        fs.copyFileSync(fbPath, configPath);
                    } catch (e) {
                        console.error(`[${timestamp()}] [SYNC] Erro ao copiar config padrao:`, e.message);
                    }
                    console.log(`[${timestamp()}] [SYNC] Config carregada do fallback ${fbPath}: ${syncConfig.hostingerUrl ? 'URL configurada' : 'URL vazia'}, enabled=${syncConfig.enabled}, pcId=${syncConfig.pcId}`);
                    return true;
                }
            }
            console.log(`[${timestamp()}] [SYNC] Nenhum arquivo de config encontrado em ${configPath} nem nos fallbacks`);
            return false;
        }
    } catch (e) {
        console.error(`[${timestamp()}] [SYNC] Erro ao carregar config:`, e.message);
        return false;
    }
}

function saveConfig(dataDir) {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(dataDir, 'sync_config.json');
    try {
        fs.writeFileSync(configPath, JSON.stringify({
            hostingerUrl: syncConfig.hostingerUrl,
            syncSecret: syncConfig.syncSecret,
            intervalMs: syncConfig.intervalMs,
            enabled: syncConfig.enabled,
            pcId: syncConfig.pcId,
            resetToken: syncConfig.resetToken,
            pcNome: syncConfig.pcNome,
            resetInProgress: resetInProgress
        }, null, 2));
    } catch (e) {
        console.error('[SYNC] Erro ao salvar config:', e.message);
    }
}

function updateConfig(dataDir, newConfig, getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdminFn) {
    if (newConfig.hostingerUrl !== undefined) syncConfig.hostingerUrl = newConfig.hostingerUrl;
    if (newConfig.syncSecret !== undefined) syncConfig.syncSecret = newConfig.syncSecret;
    if (newConfig.intervalMs !== undefined) syncConfig.intervalMs = newConfig.intervalMs;
    if (newConfig.enabled !== undefined) syncConfig.enabled = newConfig.enabled;
    saveConfig(dataDir);
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    if (getDB) _getDB = getDB;
    if (getRankingEmpresas) _getRankingEmpresas = getRankingEmpresas;
    if (getRankingMotoristas) _getRankingMotoristas = getRankingMotoristas;
    if (getStatsGerais) _getStatsGerais = getStatsGerais;
    if (setPlanoAdminFn) _setPlanoAdminFn = setPlanoAdminFn;
    if (syncConfig.enabled && syncConfig.hostingerUrl) {
        if (_getDB && _getRankingEmpresas) {
            startSyncTimer(dataDir, _getDB, _getRankingEmpresas, _getRankingMotoristas, _getStatsGerais, _setPlanoAdminFn);
        }
    }
}

function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const urlObj = new URL(url);
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
            timeout: 15000
        };

        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: { raw: data } });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout na comunicacao com Hostinger'));
        });

        req.write(body);
        req.end();
    });
}

async function syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdminFn) {
    if (isSyncing) {
        console.log('[SYNC] Sincronizacao ja em andamento, ignorando...');
        return { ok: false, reason: 'already_syncing' };
    }

    if (!syncConfig.enabled) {
        console.log('[SYNC] Sync desabilitado, ignorando syncNow');
        return { ok: false, reason: 'sync_disabled' };
    }
    if (!syncConfig.hostingerUrl || !syncConfig.syncSecret) {
        return { ok: false, reason: 'not_configured' };
    }

    isSyncing = true;
    const startTime = Date.now();

    try {
        // 1. Upload local images to hostinger FIRST (before pushing data)
        try {
            const imgResult = await uploadEmpresaImages(getDB);
            if (imgResult.enviados > 0) {
                console.log(`[SYNC] ${imgResult.enviados} imagens enviadas ao servidor`);
            }
        } catch (imgErr) {
            console.error('[SYNC] Erro ao enviar imagens ao servidor:', imgErr.message);
        }

        // 2. Upload local data to server FIRST (so remote gets our current state)
        console.log('[SYNC] Coletando dados do SQLite...');
        const empresas = getRankingEmpresas('geral');
        const motoristas = getRankingMotoristas('geral');
        const stats = getStatsGerais();
        const db = getDB();
        const viagens = db.prepare(`SELECT motorista, empresa, data, origem, destino, km, pontuacao FROM viagens WHERE status = 'completa'`).all();
        const vagas = db.prepare(`SELECT id, empresa, titulo, descricao, categoria, qtd_vagas, status, criada_em FROM vagas ORDER BY criada_em DESC`).all();
        const candidaturas = db.prepare(`
            SELECT c.id, c.vaga_id, v.titulo as vaga_titulo, v.empresa as vaga_empresa,
                   c.motorista, c.motorista_empresa, c.mensagem, c.status, c.criada_em
            FROM candidaturas c JOIN vagas v ON c.vaga_id = v.id
        `).all();
        const solicitacoes = db.prepare(`SELECT id, motorista, empresa, status, mensagem, tipo, vaga_id, criada_em FROM solicitacoes WHERE tipo IN ('convite', 'pedido')`).all();

        const payload = {
            secret: syncConfig.syncSecret,
            pc_id: syncConfig.pcId,
            reset_token: syncConfig.resetToken,
            sync_generation: syncConfig.syncGeneration || 0,
            pc_nome: syncConfig.pcNome || os.hostname(),
            pc_versao: '3.0',
            data_version: DATA_VERSION,
            empresas: empresas.map(e => ({
                nome: e.nome || '',
                logo: e.logo || '',
                banner: e.banner || '',
                descricao: e.descricao || '',
                motoristas: e.motoristas || 0,
                viagens: e.viagens || 0,
                km: e.km || 0,
                pontuacao: e.pontuacao || 0
            })),
            motoristas: motoristas.filter(m => {
                if (m.empresa === 'Lobo Solitário' || m.empresa === 'Lobo Solitario') {
                    const hasRealCompany = motoristas.some(other => other.nome === m.nome && other.empresa !== 'Lobo Solitário' && other.empresa !== 'Lobo Solitario');
                    if (hasRealCompany) return false;
                }
                return true;
            }).map(m => ({
                nome: m.nome,
                empresa: m.empresa,
                foto: m.foto || '',
                viagens: m.viagens || 0,
                km: m.km || 0,
                pontuacao: m.pontuacao || 0,
                cs_gold: m.cs_gold || 0,
                plano: m.plano || 'bronze'
            })),
            viagens: viagens.map(v => ({
                motorista: v.motorista,
                empresa: v.empresa,
                data: v.data,
                origem: v.origem || '',
                destino: v.destino || '',
                km: v.km || 0,
                pontuacao: v.pontuacao || 0
            })),
            stats: {
                totalEmpresas: stats.totalEmpresas,
                totalMotoristas: stats.totalMotoristas,
                totalViagens: stats.totalViagens,
                totalKm: stats.totalKm
            },
            vagas: vagas.map(v => ({
                id: v.id,
                empresa: v.empresa || '',
                titulo: v.titulo || '',
                descricao: v.descricao || '',
                categoria: v.categoria || 'geral',
                qtd_vagas: v.qtd_vagas || 1,
                status: v.status || 'aberta',
                criada_em: v.criada_em || ''
            })),
            candidaturas: candidaturas.map(c => ({
                id: c.id,
                vaga_id: c.vaga_id,
                vaga_titulo: c.vaga_titulo || '',
                vaga_empresa: c.vaga_empresa || '',
                motorista: c.motorista || '',
                motorista_empresa: c.motorista_empresa || 'Lobo Solitario',
                mensagem: c.mensagem || '',
                status: c.status || 'pendente',
                criada_em: c.criada_em || ''
            })),
            solicitacoes: solicitacoes.map(s => ({
                id: s.id,
                motorista: s.motorista || '',
                empresa: s.empresa || '',
                status: s.status || 'pendente',
                mensagem: s.mensagem || '',
                tipo: s.tipo || 'pedido',
                vaga_id: s.vaga_id || 0,
                criada_em: s.criada_em || ''
            })),
            timestamp: new Date().toISOString()
        };

        console.log(`[SYNC] Enviando ${empresas.length} empresas, ${motoristas.length} motoristas, ${viagens.length} viagens...`);

        let lastErr = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await postJson(syncConfig.hostingerUrl, payload);
                if (result.status >= 200 && result.status < 300) {
                    const elapsed = Date.now() - startTime;
                    lastSync = new Date().toISOString();
                    lastError = null;
                    console.log(`[SYNC] Sucesso em ${elapsed}ms (tentativa ${attempt})`);

                    // Check for global reset signal
                    if (result.data && result.data.need_reset) {
                        const newToken = result.data.new_reset_token || 0;
                        const newGeneration = result.data.sync_generation || 0;
                        console.log(`[SYNC] SINAL DE RESET GLOBAL detectado! Novo token: ${newToken}, generation: ${newGeneration}`);
                        // Clear local data and save new token
                        try {
                            const { dropAllTables, resetDatabase } = require('./database.js');
                            dropAllTables();
                            resetDatabase();
                            console.log('[SYNC] Dados locais limpos por reset global');
                        } catch (resetErr) {
                            console.error('[SYNC] Erro ao limpar dados locais apos reset global:', resetErr.message);
                        }
                        syncConfig.resetToken = newToken;
                        syncConfig.syncGeneration = newGeneration;
                        if (syncConfig._dataDir) saveConfig(syncConfig._dataDir);
                        // Re-pull remote data right away (banco local ficou vazio).
                        try {
                            const remoteResult = await processRemoteData(getDB);
                            if (remoteResult.empresas > 0 || remoteResult.viagens > 0 || remoteResult.motoristas > 0) {
                                console.log(`[SYNC] ${remoteResult.empresas} empresas, ${remoteResult.motoristas} motoristas, ${remoteResult.viagens} viagens reimportados apos reset`);
                            }
                        } catch (remoteErr) {
                            console.error('[SYNC] Erro ao reimportar dados apos reset:', remoteErr.message);
                        }
                        isSyncing = false;
                        return { ok: true, need_reset: true, new_reset_token: newToken, message: 'Reset global aplicado. Dados locais limpos.' };
                    }

                    // Save reset_token and sync_generation from server
                    if (result.data && result.data.reset_token !== undefined) {
                        syncConfig.resetToken = result.data.reset_token;
                        if (syncConfig._dataDir) saveConfig(syncConfig._dataDir);
                    }
                    if (result.data && result.data.sync_generation !== undefined) {
                        syncConfig.syncGeneration = result.data.sync_generation;
                        if (syncConfig._dataDir) saveConfig(syncConfig._dataDir);
                    }

                    // Process pending planos after successful sync
                    if (setPlanoAdminFn) {
                        try {
                            const planosResult = await processPendingPlanos(setPlanoAdminFn);
                            if (planosResult.processados > 0) {
                                console.log(`[SYNC] ${planosResult.processados} planos ativados via sync`);
                            }
                        } catch (planosErr) {
                            console.error('[SYNC] Erro ao processar planos:', planosErr.message);
                        }
                    }

                    // After successful upload, pull remote data (skip if reset just happened)
                    if (!resetInProgress) {
                        try {
                            const remoteResult = await processRemoteData(getDB);
                            if (remoteResult.empresas > 0 || remoteResult.viagens > 0 || remoteResult.motoristas > 0) {
                                console.log(`[SYNC] ${remoteResult.empresas} empresas, ${remoteResult.motoristas} motoristas, ${remoteResult.viagens} viagens importados do servidor`);
                            }
                        } catch (remoteErr) {
                            console.error('[SYNC] Erro ao baixar dados remotos:', remoteErr.message);
                        }
                    } else {
                        console.log('[SYNC] Pos-reset: upload vazio ok, liberando importacao no proximo ciclo');
                        setResetInProgress(false);
                    }

                    isSyncing = false;
                    return { ok: true, empresas: empresas.length, motoristas: motoristas.length, elapsed };
                }
                lastErr = `HTTP ${result.status}: ${JSON.stringify(result.data)}`;
                console.error(`[SYNC] Tentativa ${attempt} falhou: ${lastErr}`);
            } catch (e) {
                lastErr = e.message;
                console.error(`[SYNC] Tentativa ${attempt} erro: ${e.message}`);
            }
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        }

        lastError = lastErr;
        isSyncing = false;
        return { ok: false, reason: lastErr };

    } catch (e) {
        lastError = e.message;
        isSyncing = false;
        console.error('[SYNC] Erro geral:', e.message);
        return { ok: false, reason: e.message };
    }
}

function timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function startSyncTimer(dataDir, getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdminFn) {
    _getDB = getDB;
    _getRankingEmpresas = getRankingEmpresas;
    _getRankingMotoristas = getRankingMotoristas;
    _getStatsGerais = getStatsGerais;
    _setPlanoAdminFn = setPlanoAdminFn;
    if (syncTimer) clearInterval(syncTimer);
    console.log(`[${timestamp()}] [SYNC] Timer iniciado: a cada ${syncConfig.intervalMs / 1000}s`);

    // Run sync immediately on start (not just after first interval)
    if (syncConfig.enabled && syncConfig.hostingerUrl) {
        console.log(`[${timestamp()}] [SYNC] Executando sync imediato na inicializacao...`);
        setImmediate(async () => {
            await syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdminFn);
        });
    }

    syncTimer = setInterval(async () => {
        if (syncConfig.enabled && syncConfig.hostingerUrl) {
            console.log(`[${timestamp()}] [SYNC] Executando sync automatico...`);
            await syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais, setPlanoAdminFn);
        }
    }, syncConfig.intervalMs);
}

function stopSyncTimer() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
        console.log('[SYNC] Timer parado');
    }
}

function getBaseUrl() {
    if (!syncConfig.hostingerUrl) return '';
    // Derive base URL from sync URL (remove /api/sync.php)
    let base = syncConfig.hostingerUrl;
    base = base.replace(/\/api\/sync\.php.*$/, '');
    base = base.replace(/\/sync\.php.*$/, '');
    return base;
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const transport = urlObj.protocol === 'https:' ? https : http;
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            timeout: 15000
        };
        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: { raw: data } });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

async function getPendingPlanos() {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return [];
    try {
        const result = await getJson(`${baseUrl}/api/pull.php?secret=${syncConfig.syncSecret}`);
        if (result.status === 200 && result.data.ok && result.data.planos_solicitacoes) {
            return result.data.planos_solicitacoes;
        }
        return [];
    } catch (e) {
        console.error(`[SYNC] Erro ao buscar planos pendentes:`, e.message);
        return [];
    }
}

async function confirmPlanoAplicado(id, status) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) return false;
    try {
        const result = await postJson(`${baseUrl}/admin/planos.php`, {
            action: 'confirmar',
            secret: syncConfig.syncSecret,
            id,
            status
        });
        return result.status === 200;
    } catch (e) {
        console.error(`[SYNC] Erro ao confirmar plano #${id}:`, e.message);
        return false;
    }
}

async function processRemoteData(getDB) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return { empresas: 0, viagens: 0 };
    try {
        const result = await getJson(`${baseUrl}/api/pull.php?secret=${syncConfig.syncSecret}`);
        if (result.status !== 200 || !result.data.ok) return { empresas: 0, viagens: 0 };

        const db = getDB();
        let empProcessadas = 0;
        let viaProcessadas = 0;

        // Check data version — skip if remote data is from newer incompatible version
        const remoteDataVersion = result.data.data_version || 0;
        if (remoteDataVersion > DATA_VERSION) {
            console.log(`[SYNC] Dados remotos versao ${remoteDataVersion} > local ${DATA_VERSION}. Ignorando dados remotos (versao futura incompativel).`);
            return { empresas: 0, viagens: 0, motoristas: 0, skipped: true };
        }

        // ========== Process empresas with MERGE ==========
        if (result.data.empresas) {
            for (const empresa of result.data.empresas) {
                if (!empresa.nome) continue;
                const existing = db.prepare(`SELECT nome, logo, banner, motoristas, viagens, km, pontuacao FROM empresas WHERE nome = ?`).get(empresa.nome);
                if (!existing) {
                    db.prepare(`INSERT INTO empresas (nome, logo, banner, descricao, status, motoristas, viagens, km, pontuacao) VALUES (?, ?, ?, ?, 'aprovada', ?, ?, ?, ?)`).run(
                        empresa.nome, empresa.logo || '', empresa.banner || '', empresa.descricao || '',
                        empresa.motoristas || 0, empresa.viagens || 0, empresa.km || 0, empresa.pontuacao || 0
                    );
                    empProcessadas++;
                } else {
                    // MERGE: update images + take MAX of numeric fields
                    const updateFields = [];
                    const updateParams = [];
                    if (empresa.logo && (empresa.logo.startsWith('http://') || empresa.logo.startsWith('https://'))) {
                        const localLogo = existing.logo || '';
                        if (!localLogo.startsWith('http://') && !localLogo.startsWith('https://')) {
                            updateFields.push('logo = ?');
                            updateParams.push(empresa.logo);
                        }
                    }
                    if (empresa.banner && (empresa.banner.startsWith('http://') || empresa.banner.startsWith('https://'))) {
                        const localBanner = existing.banner || '';
                        if (!localBanner.startsWith('http://') && !localBanner.startsWith('https://')) {
                            updateFields.push('banner = ?');
                            updateParams.push(empresa.banner);
                        }
                    }
                    // MERGE numeric fields: use MAX between local and remote
                    const mergedMotoristas = Math.max(existing.motoristas || 0, empresa.motoristas || 0);
                    const mergedViagens = Math.max(existing.viagens || 0, empresa.viagens || 0);
                    const mergedKm = Math.max(existing.km || 0, empresa.km || 0);
                    const mergedPontuacao = Math.max(existing.pontuacao || 0, empresa.pontuacao || 0);
                    updateFields.push('motoristas = ?', 'viagens = ?', 'km = ?', 'pontuacao = ?');
                    updateParams.push(mergedMotoristas, mergedViagens, mergedKm, mergedPontuacao);

                    if (updateFields.length > 0) {
                        updateParams.push(empresa.nome);
                        db.prepare(`UPDATE empresas SET ${updateFields.join(', ')} WHERE nome = ?`).run(...updateParams);
                        empProcessadas++;
                    }
                }
            }
        }

        // ========== Process viagens with better dedup ==========
        if (result.data.viagens) {
            // Dedup by motorista+data+km+origem+destino+pontuacao
            const existingStmt = db.prepare(`SELECT id FROM viagens WHERE motorista = ? AND data = ? AND origem = ? AND destino = ? AND km = ?`);
            const insertStmt = db.prepare(`INSERT INTO viagens (motorista, empresa, data, origem, destino, km, pontuacao, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'completa')`);
            let ignoradas = 0;
            for (const v of result.data.viagens) {
                // Skip suspiciously short trips (<=5km) — likely from old 1km bug
                if (v.km <= 5) {
                    ignoradas++;
                    continue;
                }
                // Check dup considering pontuacao for exact match
                const dup = existingStmt.get(v.motorista, v.data, v.origem || '', v.destino || '', v.km || 0);
                if (!dup) {
                    insertStmt.run(v.motorista, v.empresa, v.data, v.origem || '', v.destino || '', v.km || 0, v.pontuacao || 0);
                    viaProcessadas++;
                }
            }
            if (ignoradas > 0) {
                console.log(`[SYNC] ${ignoradas} viagens ignoradas (km <= 5, provavelmente do bug de 1km da versao antiga)`);
            }
        }

        // ========== Process motoristas with MERGE ==========
        let motProcessados = 0;
        if (result.data.motoristas) {
            for (const mot of result.data.motoristas) {
                if (!mot.nome) continue;
                const empresaBusca = mot.empresa || 'Lobo Solitario';
                // Buscar por nome + empresa para evitar conflitos
                const existing = db.prepare(`SELECT nome, empresa, foto, cs_gold, plano FROM motoristas WHERE nome = ? AND empresa = ?`).get(mot.nome, empresaBusca);
                if (!existing) {
                    // Also check if exists under Lobo Solitario and transfer
                    const lobo = db.prepare(`SELECT nome, empresa FROM motoristas WHERE nome = ? AND (empresa = 'Lobo Solitario' OR empresa = 'Lobo Solitario')`).get(mot.nome);
                    if (lobo && empresaBusca !== 'Lobo Solitario' && empresaBusca !== 'Lobo Solitario') {
                        db.prepare(`UPDATE motoristas SET empresa = ?, cs_gold = ?, plano = ? WHERE nome = ? AND (empresa = 'Lobo Solitario' OR empresa = 'Lobo Solitario')`).run(
                            empresaBusca, mot.cs_gold || 0, mot.plano || 'bronze', mot.nome
                        );
                        motProcessados++;
                    } else {
                        db.prepare(`INSERT INTO motoristas (nome, empresa, foto, status, cargo, funcao, cs_gold, plano) VALUES (?, ?, ?, 'Ativo', 'Motorista', 'motorista', ?, ?)`).run(
                            mot.nome, empresaBusca, mot.foto || '', mot.cs_gold || 0, mot.plano || 'bronze'
                        );
                        motProcessados++;
                    }
                } else {
                    // MERGE: update foto, cs_gold (sum), plano (highest)
                    const updateFields = [];
                    const updateParams = [];

                    // Update foto if remote has one and local doesn't
                    if (mot.foto && !existing.foto) {
                        updateFields.push('foto = ?');
                        updateParams.push(mot.foto);
                    }

                    // MERGE cs_gold: MAX (valor absoluto do motorista, nao somar a cada sync)
                    const mergedGold = Math.max(existing.cs_gold || 0, mot.cs_gold || 0);
                    updateFields.push('cs_gold = ?');
                    updateParams.push(mergedGold);

                    // MERGE plano: pegar o mais alto
                    const planoRank = { bronze: 0, gold: 1, vip: 2 };
                    const existingPlanoRank = planoRank[existing.plano || 'bronze'] || 0;
                    const newPlanoRank = planoRank[mot.plano || 'bronze'] || 0;
                    if (newPlanoRank > existingPlanoRank) {
                        updateFields.push('plano = ?');
                        updateParams.push(mot.plano || 'bronze');
                    }

                    if (updateFields.length > 0) {
                        updateParams.push(mot.nome, empresaBusca);
                        db.prepare(`UPDATE motoristas SET ${updateFields.join(', ')} WHERE nome = ? AND empresa = ?`).run(...updateParams);
                        motProcessados++;
                    }
                }
            }
        }

        // Save reset_token and sync_generation from server
        if (result.data.reset_token !== undefined) {
            syncConfig.resetToken = result.data.reset_token;
        }
        if (result.data.sync_generation !== undefined) {
            syncConfig.syncGeneration = result.data.sync_generation;
        }

        // ========== VAGAS SYNC ==========
        let vagasProcessadas = 0;
        if (result.data.vagas) {
            const stmtCheck = db.prepare(`SELECT id FROM vagas WHERE empresa = ? AND titulo = ?`);
            const stmtInsert = db.prepare(`INSERT OR IGNORE INTO vagas (empresa, criada_por, titulo, descricao, categoria, qtd_vagas, status, criada_em) VALUES (?, 0, ?, ?, ?, ?, ?, ?)`);
            for (const v of result.data.vagas) {
                if (!v.empresa || !v.titulo) continue;
                const dup = stmtCheck.get(v.empresa, v.titulo);
                if (!dup) {
                    stmtInsert.run(v.empresa, v.titulo, v.descricao || '', v.categoria || 'geral', v.qtd_vagas || 1, v.status || 'aberta', v.criada_em || '');
                    vagasProcessadas++;
                }
            }
        }

        // ========== CANDIDATURAS SYNC ==========
        let candsProcessadas = 0;
        if (result.data.candidaturas) {
            const stmtCheckCand = db.prepare(`SELECT id FROM candidaturas WHERE motorista = ? AND vaga_id IN (SELECT id FROM vagas WHERE empresa = ?) AND status = ?`);
            const stmtInsertCand = db.prepare(`INSERT OR IGNORE INTO candidaturas (vaga_id, motorista, motorista_empresa, mensagem, status, criada_em) VALUES (?, ?, ?, ?, ?, ?)`);
            for (const c of result.data.candidaturas) {
                if (!c.motorista) continue;
                const vaga = db.prepare(`SELECT id FROM vagas WHERE empresa = ? AND titulo = ?`).get(c.vaga_empresa, c.vaga_titulo);
                if (!vaga) continue;
                const dup = stmtCheckCand.get(c.motorista, c.vaga_empresa, c.status || 'pendente');
                if (!dup) {
                    stmtInsertCand.run(vaga.id, c.motorista, c.motorista_empresa || 'Lobo Solitario', c.mensagem || '', c.status || 'pendente', c.criada_em || '');
                    candsProcessadas++;
                }
            }
        }

        // ========== SOLICITACOES/CONVITES SYNC ==========
        let solsProcessadas = 0;
        if (result.data.solicitacoes) {
            const stmtCheckSol = db.prepare(`SELECT id FROM solicitacoes WHERE motorista = ? AND empresa = ? AND tipo = ? AND (status = 'pendente' OR status = 'aceita' OR status = 'recusada')`);
            const stmtInsertSol = db.prepare(`INSERT OR IGNORE INTO solicitacoes (motorista, empresa, status, mensagem, tipo, vaga_id, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            for (const s of result.data.solicitacoes) {
                if (!s.motorista || !s.empresa) continue;
                const tipoSol = s.tipo || 'pedido';
                const dup = stmtCheckSol.get(s.motorista, s.empresa, tipoSol);
                if (!dup) {
                    stmtInsertSol.run(s.motorista, s.empresa, s.status || 'pendente', s.mensagem || '', tipoSol, s.vaga_id || 0, s.criada_em || '');
                    solsProcessadas++;
                }
            }
        }

        // Recalcular empresas after importing new viagens
        if (viaProcessadas > 0) {
            try {
                const { recalcEmpresas } = require('./database');
                recalcEmpresas();
            } catch (e) {
                console.error('[SYNC] Erro ao recalcular empresas:', e.message);
            }
        }

        if (empProcessadas > 0) {
            console.log(`[SYNC] ${empProcessadas} empresas importadas/atualizadas do servidor`);
        }
        if (viaProcessadas > 0) {
            console.log(`[SYNC] ${viaProcessadas} novas viagens importadas do servidor`);
        }
        if (motProcessados > 0) {
            console.log(`[SYNC] ${motProcessados} motoristas importados/atualizados do servidor`);
        }
        if (vagasProcessadas > 0) {
            console.log(`[SYNC] ${vagasProcessadas} vagas importadas do servidor`);
        }
        if (candsProcessadas > 0) {
            console.log(`[SYNC] ${candsProcessadas} candidaturas importadas do servidor`);
        }
        if (solsProcessadas > 0) {
            console.log(`[SYNC] ${solsProcessadas} convites importados do servidor`);
        }
        // Mescla possiveis duplicatas de empresa/motorista criadas por variacao
        // de caixa/espaco nas importacoes (caso-insensitive).
        try {
            const { repararDuplicatas } = require('./database');
            const reparo = repararDuplicatas();
            const total = (reparo.empresas || []).length + (reparo.motoristas || []).length;
            if (total > 0) {
                console.log(`[SYNC] Reparo pos-sync: ${reparo.empresas.length} empresas e ${reparo.motoristas.length} motoristas mesclados.`);
            }
        } catch (e) {
            console.error('[SYNC] Erro no reparo pos-sync:', e.message);
        }
        return { empresas: empProcessadas, viagens: viaProcessadas, motoristas: motProcessados, vagas: vagasProcessadas, candidaturas: candsProcessadas, solicitacoes: solsProcessadas };
    } catch (e) {
        console.error(`[SYNC] Erro ao importar dados remotos:`, e.message);
        return { empresas: 0, viagens: 0 };
    }
}

function postJsonTimeout(url, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const urlObj = new URL(url);
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
            timeout: timeoutMs || 30000
        };
        const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: { raw: data } });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
    });
}

async function uploadEmpresaImages(getDB) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return { enviados: 0 };
    const fs = require('fs');
    const path = require('path');
    const db = getDB();
    const empresas = db.prepare(`SELECT nome, logo, banner FROM empresas WHERE status = 'aprovada'`).all();
    let enviados = 0;

    console.log(`[SYNC] Verificando ${empresas.length} empresas para upload de imagens...`);

    let uploadsDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
    if (uploadsDir && !path.isAbsolute(uploadsDir)) {
        uploadsDir = path.resolve(__dirname, uploadsDir);
    }
    uploadsDir = path.resolve(uploadsDir);
    const appDataDir = process.env.APPDATA ? path.resolve(process.env.APPDATA, 'cargo-stats', 'uploads') : null;
    console.log(`[SYNC] Diretorio de uploads: ${uploadsDir}`);

    for (const empresa of empresas) {
        for (const tipo of ['logo', 'banner']) {
            const caminho = empresa[tipo];
            if (!caminho) continue;
            if (caminho.startsWith('http://') || caminho.startsWith('https://')) continue;

            let filePath = null;
            if (caminho.startsWith('/uploads/') || caminho.startsWith('uploads\\') || caminho.startsWith('uploads/')) {
                const normalizedCaminho = caminho.replace(/\\/g, '/').replace(/^uploads\//, '').replace(/^\/uploads\//, '');
                const filename = path.basename(normalizedCaminho);
                filePath = path.resolve(uploadsDir, filename);
                if (!fs.existsSync(filePath)) {
                    filePath = path.resolve(__dirname, 'uploads', filename);
                }
                if (!fs.existsSync(filePath)) {
                    filePath = path.resolve(__dirname, '..', 'uploads', filename);
                }
                if (!fs.existsSync(filePath)) {
                    filePath = path.resolve(__dirname, '..', filename);
                }
                if (!fs.existsSync(filePath) && appDataDir) {
                    filePath = path.resolve(appDataDir, filename);
                }
            } else {
                filePath = path.resolve(caminho);
            }

            if (!filePath || !fs.existsSync(filePath)) continue;

            try {
                const stat = fs.statSync(filePath);
                if (stat.size > 5 * 1024 * 1024) continue;

                const ext = path.extname(filePath).toLowerCase().replace('.', '');
                if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) continue;

                const imageBuffer = fs.readFileSync(filePath);
                const dataUri = `data:image/${ext};base64,${imageBuffer.toString('base64')}`;

                const uploadResult = await postJsonTimeout(`${baseUrl}/api/upload_image.php`, {
                    secret: syncConfig.syncSecret,
                    empresa: empresa.nome,
                    tipo,
                    data: dataUri
                }, 60000);

                if (uploadResult.status === 200 && uploadResult.data && uploadResult.data.ok && uploadResult.data.url) {
                    db.prepare(`UPDATE empresas SET ${tipo} = ? WHERE nome = ?`).run(uploadResult.data.url, empresa.nome);
                    enviados++;
                }
            } catch (e) {
                console.error(`[SYNC]   Erro ao enviar ${empresa.nome}.${tipo}:`, e.message);
            }
        }
    }
    console.log(`[SYNC] Upload de imagens concluido: ${enviados} enviadas`);
    return { enviados };
}

async function processPendingPlanos(setPlanoAdminFn) {
    const pending = await getPendingPlanos();
    if (pending.length === 0) return { processados: 0 };

    console.log(`[SYNC] ${pending.length} solicitacoes de plano pendentes encontradas`);
    let processados = 0;

    for (const sol of pending) {
        try {
            const result = setPlanoAdminFn(sol.motorista_nome, sol.plano, sol.dias);
            if (result && result.ok) {
                await confirmPlanoAplicado(sol.id, 'aplicado');
                console.log(`[SYNC] Plano ${sol.plano} ativado para ${sol.motorista_nome}`);
                processados++;
            } else {
                console.error(`[SYNC] Erro ao ativar plano para ${sol.motorista_nome}:`, result?.error || 'desconhecido');
                await confirmPlanoAplicado(sol.id, 'erro');
            }
        } catch (e) {
            console.error(`[SYNC] Erro ao processar plano #${sol.id}:`, e.message);
            await confirmPlanoAplicado(sol.id, 'erro');
        }
    }

    return { processados };
}

async function uploadLocalImageToHostinger(localUrlPath, empresaNome, tipo, motoristaNome) {
    console.log(`[UPLOAD] Chamado para ${empresaNome}.${tipo}: path="${localUrlPath}"`);

    if ((!syncConfig.hostingerUrl || !syncConfig.syncSecret) && syncConfig._dataDir) {
        loadConfig(syncConfig._dataDir);
    }

    if (!localUrlPath) return null;
    if (localUrlPath.startsWith('http://') || localUrlPath.startsWith('https://')) return localUrlPath;
    const baseUrl = getBaseUrl();
    if (!baseUrl) return null;
    if (!syncConfig.syncSecret) return null;

    const fs = require('fs');
    const path = require('path');
    let uploadsDir = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
    if (uploadsDir && !path.isAbsolute(uploadsDir)) {
        uploadsDir = path.resolve(__dirname, uploadsDir);
    }
    const appDataDir = process.env.APPDATA ? path.resolve(process.env.APPDATA, 'cargo-stats', 'uploads') : null;

    let filePath;
    if (localUrlPath.startsWith('/uploads/') || localUrlPath.startsWith('uploads\\') || localUrlPath.startsWith('uploads/')) {
        const normalizedCaminho = localUrlPath.replace(/\\/g, '/').replace(/^uploads\//, '').replace(/^\/uploads\//, '');
        const filename = path.basename(normalizedCaminho);
        filePath = path.resolve(uploadsDir, filename);
        if (!fs.existsSync(filePath)) {
            filePath = path.resolve(__dirname, 'uploads', filename);
        }
        if (!fs.existsSync(filePath)) {
            filePath = path.resolve(__dirname, '..', 'uploads', filename);
        }
        if (!fs.existsSync(filePath) && appDataDir) {
            filePath = path.resolve(appDataDir, filename);
        }
    } else {
        filePath = path.resolve(localUrlPath);
    }

    if (!fs.existsSync(filePath)) return null;

    try {
        const stat = fs.statSync(filePath);
        if (stat.size > 5 * 1024 * 1024) return null;

        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return null;

        const imageBuffer = fs.readFileSync(filePath);
        const dataUri = `data:image/${ext};base64,${imageBuffer.toString('base64')}`;

        const payload = {
            secret: syncConfig.syncSecret,
            empresa: empresaNome,
            tipo,
            data: dataUri
        };
        if (motoristaNome) payload.motorista = motoristaNome;

        const result = await postJsonTimeout(`${baseUrl}/api/upload_image.php`, payload, 30000);

        if (result.status === 200 && result.data && result.data.ok && result.data.url) {
            console.log(`[UPLOAD] ${tipo} de ${empresaNome}: ${localUrlPath} -> ${result.data.url}`);
            return result.data.url;
        }
    } catch (e) {
        console.error(`[UPLOAD] Erro ao enviar ${tipo} de ${empresaNome}:`, e.message);
    }

    return null;
}

async function clearRemoteData(pcIdOrSecret) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) {
        return { ok: false, error: 'sync_not_configured' };
    }
    try {
        const payload = { secret: syncConfig.syncSecret };
        if (pcIdOrSecret && typeof pcIdOrSecret === 'string' && pcIdOrSecret.startsWith('pc-')) {
            payload.pc_id = pcIdOrSecret;
        }
        const result = await postJson(`${baseUrl}/api/reset.php`, payload);
        if (result.status === 200 && result.data && result.data.ok) {
            if (result.data.reset_token !== undefined) {
                syncConfig.resetToken = result.data.reset_token;
            }
            if (result.data.sync_generation !== undefined) {
                syncConfig.syncGeneration = result.data.sync_generation;
            }
            return { ok: true, reset_token: result.data.reset_token };
        }
        return { ok: false, error: result.data?.error || 'unknown' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function testConnection() {
    const baseUrl = getBaseUrl();
    if (!baseUrl) return { ok: false, error: 'URL nao configurada' };
    if (!syncConfig.syncSecret) return { ok: false, error: 'Secret nao configurada' };
    try {
        const result = await postJson(`${baseUrl}/api/sync.php`, {
            secret: syncConfig.syncSecret,
            empresas: [],
            motoristas: [],
            viagens: [],
            stats: {},
            timestamp: new Date().toISOString()
        });
        if (result.status >= 200 && result.status < 300 && result.data?.ok) {
            return { ok: true, status: result.status, message: 'Conexao OK' };
        }
        return { ok: false, error: `HTTP ${result.status}: ${JSON.stringify(result.data)}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function setResetInProgress(value) {
    resetInProgress = value;
    // Persist to config so it survives app restarts
    if (syncConfig._dataDir) saveConfig(syncConfig._dataDir);
}

function getResetInProgress() {
    return resetInProgress;
}

function getStatus() {
    return {
        enabled: syncConfig.enabled,
        hostingerUrl: syncConfig.hostingerUrl || '',
        configured: !!(syncConfig.hostingerUrl && syncConfig.syncSecret),
        intervalMs: syncConfig.intervalMs,
        lastSync,
        lastError,
        isSyncing,
        resetInProgress,
        pcId: syncConfig.pcId,
        pcNome: syncConfig.pcNome,
        resetToken: syncConfig.resetToken
    };
}

async function getRemoteDispositivos() {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return { dispositivos: [], orfaos: {} };
    try {
        const result = await getJson(`${baseUrl}/api/dispositivos.php?secret=${syncConfig.syncSecret}`);
        if (result.status === 200 && result.data && result.data.ok) {
            return result.data;
        }
        return { dispositivos: [], orfaos: {} };
    } catch (e) {
        console.error('[SYNC] Erro ao buscar dispositivos:', e.message);
        return { dispositivos: [], orfaos: {} };
    }
}

async function deleteRemoteEmpresa(nome, pcIdAlvo) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return { ok: false, error: 'sync_not_configured' };
    try {
        const result = await postJson(`${baseUrl}/api/delete_empresa.php`, {
            secret: syncConfig.syncSecret,
            nome: nome,
            pc_id: pcIdAlvo || syncConfig.pcId
        });
        if (result.status === 200 && result.data && result.data.ok) {
            return { ok: true, message: result.data.message };
        }
        return { ok: false, error: result.data?.error || 'unknown' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function getRemoteData(filterPcId) {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return null;
    try {
        const pcParam = filterPcId ? `&pc_id=${encodeURIComponent(filterPcId)}` : '';
        const result = await getJson(`${baseUrl}/api/pull.php?secret=${syncConfig.syncSecret}${pcParam}`);
        if (result.status === 200 && result.data && result.data.ok) {
            return result.data;
        }
        return null;
    } catch (e) {
        console.error('[SYNC] Erro ao buscar dados remotos:', e.message);
        return null;
    }
}

async function resetAllRemote() {
    const baseUrl = getBaseUrl();
    if (!baseUrl || !syncConfig.syncSecret) return { ok: false, error: 'sync_not_configured' };
    try {
        const result = await postJson(`${baseUrl}/api/reset.php`, {
            secret: syncConfig.syncSecret
        });
        if (result.status === 200 && result.data && result.data.ok) {
            const newToken = result.data.reset_token || 0;
            const newGeneration = result.data.sync_generation || 0;
            syncConfig.resetToken = newToken;
            syncConfig.syncGeneration = newGeneration;
            if (syncConfig._dataDir) saveConfig(syncConfig._dataDir);

            // CRITICAL: Clear local database to prevent old data from being re-uploaded
            try {
                const { dropAllTables, resetDatabase } = require('./database.js');
                dropAllTables();
                resetDatabase();
                console.log('[RESET] Dados locais limpos apos reset remoto');
            } catch (localResetErr) {
                console.error('[RESET] Erro ao limpar dados locais:', localResetErr.message);
            }

            console.log(`[RESET] Reset global remoto concluido. Novo token: ${newToken}, generation: ${newGeneration}`);
            return { ok: true, reset_token: newToken, sync_generation: newGeneration, message: result.data.message };
        }
        return { ok: false, error: result.data?.error || 'unknown' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = {
    loadConfig,
    saveConfig,
    updateConfig,
    syncNow,
    startSyncTimer,
    stopSyncTimer,
    getStatus,
    getPendingPlanos,
    confirmPlanoAplicado,
    processPendingPlanos,
    processRemoteData,
    uploadEmpresaImages,
    uploadLocalImageToHostinger,
    clearRemoteData,
    testConnection,
    setResetInProgress,
    getResetInProgress,
    getRemoteDispositivos,
    deleteRemoteEmpresa,
    getRemoteData,
    resetAllRemote
};
