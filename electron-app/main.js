const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RENDER_URL = 'https://cargo-stats-oficial.onrender.com';
const SERVER_PORT = 3000;
const STEAM_REG_PATH = 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam';
const ETS2_APPID = '227300';
const ATS_APPID = '270880';

let mainWindow = null;
let telemetryProcess = null;
let serverInstance = null;
let tray = null;
let forceQuit = false;

autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'mapabrasiltruck-cmyk',
    repo: 'cargo-stats'
});

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
    autoUpdater.checkForUpdates().catch(() => {});
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
    try {
        const result = require('child_process').execSync(
            `reg query "${STEAM_REG_PATH}" /v InstallPath`, { encoding: 'utf8', timeout: 5000 }
        );
        const match = result.match(/InstallPath\s+REG_SZ\s+(.+)/i);
        if (match) {
            const regPath = match[1].trim();
            if (fs.existsSync(regPath)) return regPath;
        }
    } catch (e) {}
    return null;
}

function findSteamGamePaths(appId) {
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
    const pluginCandidates = [
        path.join(getPluginsDir(), 'Ets2Plugins', 'win_x64', 'plugins', 'ets2-telemetry-server.dll'),
        path.join(getPluginsDir(), 'ets2-telemetry-server.dll'),
    ];
    let pluginSrc = null;
    for (const p of pluginCandidates) {
        if (fs.existsSync(p)) { pluginSrc = p; break; }
    }
    if (!pluginSrc) {
        console.log('[PLUGIN] DLL nao encontrada em:', getPluginsDir());
        console.log('[PLUGIN] Candidates:', JSON.stringify(pluginCandidates));
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
        const destFile = path.join(destDir, 'ets2-telemetry-server.dll');
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

function startTelemetryServer() {
    const telemetryExe = path.join(getPluginsDir(), 'Ets2Telemetry.exe');
    const telemetryDir = getPluginsDir();
    console.log('[TELEMETRY] Procurando em:', telemetryExe);
    console.log('[TELEMETRY] Existe?', fs.existsSync(telemetryExe));
    if (!fs.existsSync(telemetryExe)) {
        console.log('[TELEMETRY] Servidor nao encontrado');
        return;
    }
    try {
        telemetryProcess = spawn(telemetryExe, [], {
            cwd: telemetryDir,
            stdio: 'ignore',
            windowsHide: true
        });
        console.log('[TELEMETRY] Servidor iniciado (PID:', telemetryProcess.pid, ')');
    } catch (e) {
        console.log('[TELEMETRY] Erro ao iniciar:', e.message);
    }
}

function startLocalServer() {
    return new Promise((resolve, reject) => {
        const serverDir = getServerDir();
        const serverPath = path.join(serverDir, 'server.js');
        console.log('[SERVER] Iniciando:', serverPath);
        if (!fs.existsSync(serverPath)) {
            return reject(new Error('server.js nao encontrado em: ' + serverPath));
        }
        try {
            delete require.cache[require.resolve(serverPath)];
            const { startServer } = require(serverPath);
            serverInstance = startServer(SERVER_PORT);
            console.log('[SERVER] Servidor iniciado na porta', SERVER_PORT);
            setTimeout(() => resolve(), 2000);
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
                    mainWindow.show();
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
            mainWindow.show();
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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadURL(serverUrl);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return { action: url.startsWith(RENDER_URL) ? 'allow' : 'deny' };
    });

    mainWindow.on('close', (event) => {
        if (!forceQuit) {
            event.preventDefault();
            mainWindow.hide();
        } else {
            cleanup();
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

function killTelemetryProcess() {
    if (!telemetryProcess) return;
    try {
        telemetryProcess.kill();
    } catch (e) {
        try { process.kill(telemetryProcess.pid); } catch (e2) {
            spawn('taskkill', ['/F', '/T', '/PID', telemetryProcess.pid.toString()], { stdio: 'ignore' });
        }
    }
    telemetryProcess = null;
}

function cleanup() {
    console.log('[APP] Limpando processos...');
    killTelemetryProcess();
    if (serverInstance) {
        try { serverInstance.close(); } catch (e) {}
        serverInstance = null;
    }
}

app.on('before-quit', () => {
    forceQuit = true;
});

ipcMain.handle('get-telemetry-status', () => {
    const running = telemetryProcess !== null && !telemetryProcess.killed;
    return { running, pid: running ? telemetryProcess.pid : null };
});

app.whenReady().then(async () => {
    console.log('[APP] Iniciando Cargo Stats v' + app.getVersion());
    console.log('[APP] isDev:', isDev());
    console.log('[APP] pluginsDir:', getPluginsDir());
    console.log('[APP] plugins existe?', fs.existsSync(getPluginsDir()));

    createTray();
    installGamePlugin();
    startTelemetryServer();

    try {
        await startLocalServer();
        createWindow(`http://localhost:${SERVER_PORT}`);
    } catch (e) {
        console.log('[APP] Servidor local indisponivel, usando modo remoto:', e.message);
        createWindow(RENDER_URL);
    }

    checkForUpdates();
});

app.on('window-all-closed', () => {
    cleanup();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow(`http://localhost:${SERVER_PORT}`);
});
