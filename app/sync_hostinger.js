const https = require('https');
const http = require('http');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30 * 1000;

let syncConfig = {
    hostingerUrl: '',
    syncSecret: '',
    intervalMs: DEFAULT_INTERVAL_MS,
    enabled: false
};

let syncTimer = null;
let lastSync = null;
let lastError = null;
let isSyncing = false;

function loadConfig(dataDir) {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(dataDir, 'sync_config.json');
    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            const saved = JSON.parse(raw);
            syncConfig.hostingerUrl = saved.hostingerUrl || '';
            syncConfig.syncSecret = saved.syncSecret || '';
            syncConfig.intervalMs = saved.intervalMs || DEFAULT_INTERVAL_MS;
            syncConfig.enabled = saved.enabled || false;
        }
    } catch (e) {
        console.error('[SYNC] Erro ao carregar config:', e.message);
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
            enabled: syncConfig.enabled
        }, null, 2));
    } catch (e) {
        console.error('[SYNC] Erro ao salvar config:', e.message);
    }
}

function updateConfig(dataDir, newConfig) {
    if (newConfig.hostingerUrl !== undefined) syncConfig.hostingerUrl = newConfig.hostingerUrl;
    if (newConfig.syncSecret !== undefined) syncConfig.syncSecret = newConfig.syncSecret;
    if (newConfig.intervalMs !== undefined) syncConfig.intervalMs = newConfig.intervalMs;
    if (newConfig.enabled !== undefined) syncConfig.enabled = newConfig.enabled;
    saveConfig(dataDir);
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    if (syncConfig.enabled && syncConfig.hostingerUrl) {
        startSyncTimer(dataDir);
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

async function syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais) {
    if (isSyncing) {
        console.log('[SYNC] Sincronizacao ja em andamento, ignorando...');
        return { ok: false, reason: 'already_syncing' };
    }

    if (!syncConfig.hostingerUrl || !syncConfig.syncSecret) {
        return { ok: false, reason: 'not_configured' };
    }

    isSyncing = true;
    const startTime = Date.now();

    try {
        console.log('[SYNC] Coletando dados do SQLite...');
        const empresas = getRankingEmpresas('geral');
        const motoristas = getRankingMotoristas('geral');
        const stats = getStatsGerais();

        const payload = {
            secret: syncConfig.syncSecret,
            empresas: empresas.map(e => ({
                nome: e.nome,
                logo: e.logo || '',
                descricao: e.descricao || '',
                motoristas: e.motoristas || 0,
                viagens: e.viagens || 0,
                km: e.km || 0,
                pontuacao: e.pontuacao || 0
            })),
            motoristas: motoristas.map(m => ({
                nome: m.nome,
                empresa: m.empresa,
                viagens: m.viagens || 0,
                km: m.km || 0,
                pontuacao: m.pontuacao || 0
            })),
            stats: {
                totalEmpresas: stats.totalEmpresas,
                totalMotoristas: stats.totalMotoristas,
                totalViagens: stats.totalViagens,
                totalKm: stats.totalKm
            },
            timestamp: new Date().toISOString()
        };

        console.log(`[SYNC] Enviando ${empresas.length} empresas, ${motoristas.length} motoristas...`);

        let lastErr = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await postJson(syncConfig.hostingerUrl, payload);
                if (result.status >= 200 && result.status < 300) {
                    const elapsed = Date.now() - startTime;
                    lastSync = new Date().toISOString();
                    lastError = null;
                    isSyncing = false;
                    console.log(`[SYNC] Sucesso em ${elapsed}ms (tentativa ${attempt})`);
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

function startSyncTimer(dataDir, getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais) {
    if (syncTimer) clearInterval(syncTimer);
    console.log(`[SYNC] Timer iniciado: a cada ${syncConfig.intervalMs / 1000}s`);
    syncTimer = setInterval(async () => {
        if (syncConfig.enabled && syncConfig.hostingerUrl) {
            console.log('[SYNC] Executando sync automatico...');
            await syncNow(getDB, getRankingEmpresas, getRankingMotoristas, getStatsGerais);
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

function getStatus() {
    return {
        enabled: syncConfig.enabled,
        hostingerUrl: syncConfig.hostingerUrl || '',
        configured: !!(syncConfig.hostingerUrl && syncConfig.syncSecret),
        intervalMs: syncConfig.intervalMs,
        lastSync,
        lastError,
        isSyncing
    };
}

module.exports = {
    loadConfig,
    saveConfig,
    updateConfig,
    syncNow,
    startSyncTimer,
    stopSyncTimer,
    getStatus
};
