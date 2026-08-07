const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { authenticateWithSteam } = require('./steam-auth');
const telemetryBridge = require('./telemetry-bridge');

const SERVER_PORT = 3000;
const STEAM_REG_PATH = 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam';
const ETS2_APPID = '227300';
const ATS_APPID = '270880';

let mainWindow = null;
let serverInstance = null;
let tray = null;
let forceQuit = false;

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('[APP] Erro nao capturado:', error.message);
    console.error(error.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('[APP] Promise rejeitada nao tratada:', reason instanceof Error ? reason.message : reason);
});

autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'mapabrasiltruck-cmyk',
    repo: 'cargo-stats'
});
autoUpdater.autoDownload = false;

autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update_available', info.version);
});
autoUpdater.on('download-progress', (p) => {
    if (mainWindow) mainWindow.webContents.send('update_progress', p.percent);
});
autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update_downloaded');
});

function checkForUpdates() {
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            console.error('[UPDATER] Erro ao verificar atualizacoes:', err.message);
        });
    }, 5000);
}

function isDev() {
    return !app.isPackaged;
}

function getServerDir() {
    if (isDev()) return path.join(__dirname, '..', 'app');
    return path.join(process.resourcesPath, 'server');
}

function getPluginsDir() {
    if (isDev()) return path.join(__dirname, 'plugins');
    return path.join(process.resourcesPath, 'plugins');
}

function getSteamInstallPath() {
    const commonPaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
    ];
    for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
    }
    // Try 32-bit registry path first, fallback to 64-bit
    const regPaths = [
        'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
        'HKLM\\SOFTWARE\\Valve\\Steam',
    ];
    for (const regPath of regPaths) {
        try {
            const result = require('child_process').execSync(
                `reg query "${regPath}" /v InstallPath`, { encoding: 'utf8', timeout: 5000 }
            );
            const match = result.match(/InstallPath\s+REG_SZ\s+(.+)/i);
            if (match) {
                const p = match[1].trim();
                if (fs.existsSync(p)) return p;
            }
        } catch (e) {}
    }
    return null;
}

function findSteamGamePaths() {
    const steamPath = getSteamInstallPath();
    if (!steamPath) return [];
    const results = [];
    const baseDir = path.join(steamPath, 'steamapps', 'common');
    const etsDir = path.join(baseDir, 'Euro Truck Simulator 2');
    const atsDir = path.join(baseDir, 'American Truck Simulator');
    if (fs.existsSync(etsDir)) results.push(etsDir);
    if (fs.existsSync(atsDir)) results.push(atsDir);
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdfPath)) {
        try {
            const vdf = fs.readFileSync(vdfPath, 'utf8');
            const pathMatches = vdf.match(/"path"\s+"([^"]+)"/g);
            if (pathMatches) {
                for (const pm of pathMatches) {
                    const libPath = pm.match(/"path"\s+"([^"]+)"/)[1];
                    if (!libPath || libPath === steamPath) continue;
                    const commonDir = path.join(libPath, 'steamapps', 'common');
                    const ets = path.join(commonDir, 'Euro Truck Simulator 2');
                    const ats = path.join(commonDir, 'American Truck Simulator');
                    if (fs.existsSync(ets) && !results.includes(ets)) results.push(ets);
                    if (fs.existsSync(ats) && !results.includes(ats)) results.push(ats);
                }
            }
        } catch (e) {}
    }
    return results;
}

function getSteamPluginsPaths() {
    const gamePaths = findSteamGamePaths();
    const result = [];
    for (const gamePath of gamePaths) {
        const x64 = path.join(gamePath, 'bin', 'win_x64', 'plugins');
        const x86 = path.join(gamePath, 'bin', 'win_x86', 'plugins');
        if (fs.existsSync(path.dirname(x64))) result.push(x64);
        if (fs.existsSync(path.dirname(x86))) result.push(x86);
    }
    return result;
}

function installGamePlugin() {
    // Try multiple possible locations for the plugin DLL
    const possibleSrcs = [
        path.join(getPluginsDir(), 'win_x64', 'plugins', 'cargostats-plugin.dll'),
        path.join(getPluginsDir(), 'win_x64', 'cargostats-plugin.dll'),
        path.join(getPluginsDir(), 'cargostats-plugin.dll'),
    ];
    let pluginSrc = null;
    for (const s of possibleSrcs) {
        if (fs.existsSync(s)) { pluginSrc = s; break; }
    }
    if (!pluginSrc) {
        console.log('[PLUGIN] DLL nao encontrada em nenhum local esperado:', getPluginsDir());
        return;
    }
    if (!fs.existsSync(pluginSrc)) {
        console.log('[PLUGIN] DLL nao encontrada em:', pluginSrc);
        return;
    }
    const destDirs = getSteamPluginsPaths();
    if (destDirs.length === 0) {
        console.log('[PLUGIN] Nenhuma pasta de jogo encontrada');
        return;
    }
    for (const destDir of destDirs) {
        if (!fs.existsSync(destDir)) {
            try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) { continue; }
        }
        const destFile = path.join(destDir, 'cargostats-plugin.dll');
        if (!fs.existsSync(destFile)) {
            try {
                fs.copyFileSync(pluginSrc, destFile);
                console.log('[PLUGIN] Instalado em:', destFile);
            } catch (e) {
                console.log('[PLUGIN] Erro ao instalar em:', destFile, e.message);
            }
        } else {
            console.log('[PLUGIN] Ja instalado em:', destFile);
        }
    }
}

function waitForServer(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const startTime = Date.now();
        function check() {
            const req = http.get(url + '/api/auth/me', (res) => {
                resolve();
            });
            req.on('error', () => {
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error('Timeout ao aguardar servidor local'));
                } else {
                    setTimeout(check, 500);
                }
            });
            req.setTimeout(2000, () => {
                req.destroy();
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error('Timeout ao aguardar servidor local'));
                } else {
                    setTimeout(check, 500);
                }
            });
        }
        check();
    });
}

function startLocalServer() {
    return new Promise((resolve, reject) => {
        const serverDir = getServerDir();
        const serverPath = path.join(serverDir, 'server.js');
        console.log('[SERVER] Iniciando:', serverPath);
        if (!fs.existsSync(serverPath)) {
            return reject(new Error('server.js nao encontrado em: ' + serverPath));
        }

        const userDataPath = app.getPath('userData');
        process.env.CARGOSTATS_DB_PATH = path.join(userDataPath, 'data.db');
        process.env.CARGOSTATS_UPLOADS_PATH = path.join(userDataPath, 'uploads');

        try {
            delete require.cache[require.resolve(serverPath)];
            const { startServer } = require(serverPath);
            serverInstance = startServer(SERVER_PORT, telemetryBridge);
            console.log('[SERVER] Servidor iniciado na porta', SERVER_PORT);
            console.log('[SERVER] DB:', process.env.CARGOSTATS_DB_PATH);
            console.log('[SERVER] Uploads:', process.env.CARGOSTATS_UPLOADS_PATH);
            // Poll server until it responds (health check)
            waitForServer('http://localhost:' + SERVER_PORT, 10000)
                .then(() => {
                    console.log('[SERVER] Servidor respondeu a requisicoes');
                    resolve();
                })
                .catch((err) => {
                    console.error('[SERVER] Servidor nao respondeu a tempo:', err.message);
                    reject(err);
                });
        } catch (e) {
            console.error('[SERVER] Erro:', e.message);
            reject(e);
        }
    });
}

function createTray() {
    let iconPath = path.join(__dirname, 'build', 'icon.ico');
    if (!fs.existsSync(iconPath)) iconPath = path.join(__dirname, 'build', 'icon.png');
    tray = new Tray(iconPath);
    tray.setToolTip('Cargo Stats');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Abrir Cargo Stats',
            click: () => {
                if (mainWindow) {
                    mainWindow.setSkipTaskbar(false);
                    mainWindow.restore();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Fechar',
            click: () => {
                forceQuit = true;
                if (mainWindow) mainWindow.close();
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.setSkipTaskbar(false);
            mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function createWindow(serverUrl) {
    mainWindow = new BrowserWindow({
        width: 1280, height: 720,
        minWidth: 900, minHeight: 600,
        icon: path.join(__dirname, 'build', 'icon.png'),
        title: 'Cargo Stats',
        backgroundThrottling: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadURL(serverUrl);

    mainWindow.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });

    mainWindow.on('close', (event) => {
        if (!forceQuit) {
            event.preventDefault();
            mainWindow.minimize();
            mainWindow.setSkipTaskbar(true);
        } else {
            cleanup();
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.on('minimize', () => {
        startBackgroundTelemetryPoll();
    });

    mainWindow.on('restore', () => {
        stopBackgroundTelemetryPoll();
    });
}

function cleanup() {
    console.log('[APP] Limpando processos...');
    stopBackgroundTelemetryPoll();
    telemetryBridge.stopPolling();
    if (serverInstance) {
        try { serverInstance.close(); } catch (e) {}
        serverInstance = null;
    }
}

// ========== BACKGROUND TELEMETRY POLLING (main process, no Chromium throttling) ==========

let bgPollInterval = null;
let bgPendingTrip = null;
let bgAutoRecorder = {
    lastJobActive: false, lastCargo: '', lastCargoId: '',
    lastOrigin: '', lastDestination: '',
    lastTotalDistance: 0, lastRemainingDistance: 0,
    lastIncome: 0, isRecording: false,
    jobStartTime: 0, bgSeenPositive: false
};

function httpGetJson(url) {
    return new Promise((resolve) => {
        const http = require('http');
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    });
}

function httpPostJson(url, body, token) {
    return new Promise((resolve) => {
        const http = require('http');
        const payload = JSON.stringify(body);
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname, port: parsed.port, path: parsed.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };
        if (token) options.headers['Authorization'] = 'Bearer ' + token;
        const req = http.request(options, (res) => {
            let respData = '';
            res.on('data', chunk => respData += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(respData)); }
                catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(3000, () => { req.destroy(); resolve(null); });
        req.write(payload);
        req.end();
    });
}

function resetBgAutoRecorder() {
    bgAutoRecorder = {
        lastJobActive: false, lastCargo: '', lastCargoId: '',
        lastOrigin: '', lastDestination: '',
        lastTotalDistance: 0, lastRemainingDistance: 0,
        lastIncome: 0, isRecording: false,
        bgSeenPositive: false
    };
}

function startBackgroundTelemetryPoll() {
    if (bgPollInterval) return;
    console.log('[BG-POLL] Iniciando polling de telemetria em background');

    telemetryBridge.loadAddon();

    bgPollInterval = setInterval(async () => {
        try {
            const data = telemetryBridge.getLatestTelemetry();
            if (!data || !data.job || data.error) return;

            const jobActive = !!(data.job.income > 0 || data.job.sourceCity);
            const cargo = (data.trailer && data.trailer.name) || (data.job && data.job.cargo && data.job.cargo.name) || '';
            const cargoId = (data.trailer && data.trailer.id) || '';
            const origem = (data.job && (data.job.sourceCity || (data.job.source && data.job.source.city))) || '';
            const destino = (data.job && (data.job.destinationCity || (data.job.destination && data.job.destination.city))) || '';
            const totalMeters = parseFloat(data.job && data.job.distance) || 0;
            const remainingMeters = parseFloat(data.job && data.job.destination && data.job.destination.distance) || parseFloat(data.navigation && data.navigation.estimatedDistance) || 0;
            const totalKm = totalMeters > 0 ? Math.round(totalMeters / 1000) : 0;
            const remainingKm = remainingMeters > 0 ? Math.round(remainingMeters / 1000) : 0;
            const income = parseInt(data.job && data.job.income) || 0;

            if (!bgAutoRecorder.isRecording && bgAutoRecorder.lastJobActive && !jobActive && bgAutoRecorder.lastCargo
                && bgAutoRecorder.bgSeenPositive
                && Date.now() - bgAutoRecorder.jobStartTime > 30000) {
                bgAutoRecorder.isRecording = true;

                const hasBoth = bgAutoRecorder.lastTotalDistance > 0 && bgAutoRecorder.lastRemainingDistance > 0;
                const actualKm = hasBoth && bgAutoRecorder.lastTotalDistance > bgAutoRecorder.lastRemainingDistance
                    ? bgAutoRecorder.lastTotalDistance - bgAutoRecorder.lastRemainingDistance
                    : (bgAutoRecorder.lastTotalDistance > 0 ? bgAutoRecorder.lastTotalDistance : bgAutoRecorder.lastRemainingDistance);
                const isComplete = !hasBoth || bgAutoRecorder.lastRemainingDistance <= 5 || actualKm >= bgAutoRecorder.lastTotalDistance * 0.85;
                const status = isComplete ? 'completa' : 'abandonada';

                const pontos = isComplete ? Math.round(actualKm * 2 + (bgAutoRecorder.lastIncome / 100)) : 0;
                const tripData = {
                    cargo: bgAutoRecorder.lastCargo || '',
                    origem: bgAutoRecorder.lastOrigin || '',
                    destino: bgAutoRecorder.lastDestination || '',
                    km: Math.round(actualKm) || 0,
                    income: bgAutoRecorder.lastIncome || 0,
                    cargoId: bgAutoRecorder.lastCargoId || '',
                    hash: (() => { const raw = (bgAutoRecorder.lastCargo || '') + '|' + (bgAutoRecorder.lastOrigin || '') + '|' + (bgAutoRecorder.lastDestination || ''); let h = 0; for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; } return 'job_' + Math.abs(h).toString(36); })(),
                    status: status,
                    jobType: '',
                    penalidade: 0
                };

                bgPendingTrip = tripData;

                try {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('bg-auto-record', tripData);
                    }
                } catch (e) {}

                console.log('[BG-POLL] Viagem detectada em background, enviando pro renderer:', Math.round(actualKm) + 'km', status);

                setTimeout(() => { bgAutoRecorder.isRecording = false; }, 5000);
            }

            if (jobActive) {
                if (!bgAutoRecorder.lastJobActive) {
                    bgAutoRecorder.jobStartTime = Date.now();
                    // Reset metricas do job anterior para nao vazarem para o novo job
                    bgAutoRecorder.lastTotalDistance = 0;
                    bgAutoRecorder.lastRemainingDistance = 0;
                    bgAutoRecorder.bgSeenPositive = false;
                    if (totalKm > 0) {
                        bgAutoRecorder.lastTotalDistance = totalKm;
                        bgAutoRecorder.lastRemainingDistance = remainingKm > 0 ? remainingKm : totalKm;
                    } else if (remainingKm > 0) {
                        bgAutoRecorder.lastTotalDistance = remainingKm;
                        bgAutoRecorder.lastRemainingDistance = remainingKm;
                    }
                }

                bgAutoRecorder.lastCargo = cargo;
                bgAutoRecorder.lastCargoId = cargoId;
                bgAutoRecorder.lastOrigin = origem;
                bgAutoRecorder.lastDestination = destino;
                bgAutoRecorder.lastIncome = income;

                if (totalKm > 0 && totalKm !== bgAutoRecorder.lastTotalDistance) {
                    bgAutoRecorder.lastTotalDistance = totalKm;
                }
                if (bgAutoRecorder.lastTotalDistance === 0 && remainingKm > 0) {
                    bgAutoRecorder.lastTotalDistance = remainingKm;
                }
                if (remainingKm > 0) {
                    bgAutoRecorder.lastRemainingDistance = remainingKm;
                }
                if (remainingKm > 0 || bgAutoRecorder.lastRemainingDistance > 0) {
                    bgAutoRecorder.bgSeenPositive = true;
                }
            }

            bgAutoRecorder.lastJobActive = jobActive;

        } catch (e) {
            // Telemetry server not running — ignore
        }
    }, 300);
}

function stopBackgroundTelemetryPoll() {
    if (bgPollInterval) {
        clearInterval(bgPollInterval);
        bgPollInterval = null;
        console.log('[BG-POLL] Polling de telemetria em background parado');
    }
    resetBgAutoRecorder();
}

app.on('before-quit', () => {
    forceQuit = true;
});

ipcMain.handle('get-telemetry-status', () => {
    const status = telemetryBridge.getStatus();
    return {
        running: status.available && status.sdkActive,
        sdkActive: status.sdkActive || false,
        available: status.available || false,
        paused: status.paused || true
    };
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('check-for-updates', () => {
    checkForUpdates();
});

ipcMain.handle('get-startup-settings', () => {
    return app.getLoginItemSettings().openAtLogin || false;
});

ipcMain.handle('set-startup-settings', (_event, enabled) => {
    const settings = {
        openAtLogin: !!enabled
    };
    if (!isDev()) {
        settings.path = process.execPath;
        settings.args = [];
    }
    app.setLoginItemSettings(settings);
    return app.getLoginItemSettings().openAtLogin || false;
});

ipcMain.handle('download-update', () => {
    autoUpdater.downloadUpdate();
});

ipcMain.handle('restart-and-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-diagnostics', () => {
    const pluginsDir = getPluginsDir();
    const bridgeStatus = telemetryBridge.getStatus();
    const latestData = telemetryBridge.getLatestData();
    const detailed = telemetryBridge.getDetailedDiagnostics();
    // Check if plugin DLL exists in ANY expected location
    const pluginPaths = [
        path.join(pluginsDir, 'win_x64', 'plugins', 'cargostats-plugin.dll'),
        path.join(pluginsDir, 'win_x64', 'cargostats-plugin.dll'),
        path.join(pluginsDir, 'cargostats-plugin.dll'),
    ];
    // Also check game plugin folders
    const steamPaths = getSteamPluginsPaths();
    for (const sp of steamPaths) {
        pluginPaths.push(path.join(sp, 'cargostats-plugin.dll'));
    }
    const dllExists = pluginPaths.some(p => fs.existsSync(p));
    return {
        plugins: {
            path: pluginsDir,
            exists: fs.existsSync(pluginsDir),
            dllExists: dllExists
        },
        telemetry: {
            addonLoaded: detailed.addonLoaded,
            addonPath: detailed.addonPath,
            addonPathExists: detailed.addonPathExists,
            sharedMemoryAvailable: bridgeStatus.available || false,
            errorCode: detailed.errorCode,
            sdkActive: bridgeStatus.sdkActive || false,
            pollsAttempted: latestData.pollsAttempted || 0,
            pollsSucceeded: latestData.pollsSucceeded || 0,
            lastError: latestData.lastError || null
        },
        detailedFields: detailed.fields,
        isDev: isDev(),
        version: app.getVersion()
    };
});

ipcMain.handle('steam-login', async () => {
    try {
        const result = await authenticateWithSteam(SERVER_PORT);
        return { success: true, ...result };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.json');

ipcMain.handle('get-bg-trip-data', () => {
    const data = bgPendingTrip;
    bgPendingTrip = null;
    return data;
});

ipcMain.handle('save-credentials', (_event, data) => {
    try {
        fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({
            ...data,
            _savedAt: new Date().toISOString()
        }));
        return true;
    } catch (e) { return false; }
});

ipcMain.handle('load-credentials', () => {
    try {
        if (fs.existsSync(CREDENTIALS_PATH)) {
            return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        }
    } catch (e) {}
    return null;
});

ipcMain.handle('clear-credentials', () => {
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch (e) {}
});

app.whenReady().then(async () => {
    console.log('[APP] Iniciando Cargo Stats v' + app.getVersion());
    console.log('[APP] isDev:', isDev());
    console.log('[APP] pluginsDir:', getPluginsDir());
    console.log('[APP] plugins existe?', fs.existsSync(getPluginsDir()));

    // Start telemetry bridge addon polling (always keeps data fresh for frontend)
    telemetryBridge.startPolling();

    createTray();
    installGamePlugin();

    try {
        await startLocalServer();
        createWindow(`http://localhost:${SERVER_PORT}/login_local.html`);
    } catch (e) {
        console.error('[APP] Servidor local indisponivel:', e.message);
        dialog.showErrorBox('Erro ao iniciar servidor local', e.message + '\n\nO aplicativo sera encerrado.');
        app.quit();
    }

    checkForUpdates();
});

app.on('window-all-closed', () => {
    cleanup();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow(`http://localhost:${SERVER_PORT}/update_check.html`);
});
