const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RENDER_URL = 'https://cargo-stats-oficial.onrender.com';
const SERVER_PORT = 3000;

let mainWindow = null;
let telemetryProcess = null;
let serverInstance = null;

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

function getSteamPluginsPaths() {
    return [
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Euro Truck Simulator 2\\bin\\win_x64\\plugins',
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\American Truck Simulator\\bin\\win_x64\\plugins',
    ];
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
    if (!pluginSrc) { console.log('[PLUGIN] DLL nao encontrada'); return; }

    for (const destDir of getSteamPluginsPaths()) {
        if (!fs.existsSync(destDir)) {
            try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) { continue; }
        }
        const destFile = path.join(destDir, 'ets2-telemetry-server.dll');
        if (!fs.existsSync(destFile)) {
            try { fs.copyFileSync(pluginSrc, destFile); console.log('[PLUGIN] Instalado em:', destFile); } catch (e) {}
        } else { console.log('[PLUGIN] Ja instalado em:', destFile); }
    }
}

function startTelemetryServer() {
    const telemetryExe = path.join(getPluginsDir(), 'Ets2Telemetry.exe');
    if (!fs.existsSync(telemetryExe)) {
        console.log('[TELEMETRY] Servidor nao encontrado em:', telemetryExe);
        return;
    }
    try {
        telemetryProcess = spawn(telemetryExe, [], {
            cwd: path.dirname(telemetryExe), stdio: 'ignore', detached: true
        });
        telemetryProcess.unref();
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

    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
    console.log('[APP] Iniciando Cargo Stats v' + app.getVersion());

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
    if (telemetryProcess) { try { telemetryProcess.kill(); } catch (e) {} telemetryProcess = null; }
    if (serverInstance) { try { serverInstance.close(); } catch (e) {} serverInstance = null; }
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow(`http://localhost:${SERVER_PORT}`);
});
