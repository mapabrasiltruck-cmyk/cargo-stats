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
        autoUpdater.checkForUpdates().catch(() => {});
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

function checkDotNetVersion() {
    try {
        const result = require('child_process').execSync(
            'reg query "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" /v Release',
            { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const match = result.match(/Release\s+REG_DWORD\s+0x([0-9a-f]+)/i);
        if (match) {
            const release = parseInt(match[1], 16);
            const versions = [
                { min: 528040, label: '4.8' },
                { min: 461808, label: '4.7.2' },
                { min: 461308, label: '4.7.1' },
                { min: 460798, label: '4.7' },
                { min: 394802, label: '4.6.2' },
                { min: 394254, label: '4.6.1' },
                { min: 393295, label: '4.6' },
                { min: 379893, label: '4.5.2' },
                { min: 378675, label: '4.5.1' },
                { min: 378389, label: '4.5' }
            ];
            for (const v of versions) {
                if (release >= v.min) return { installed: true, version: v.label, release };
            }
            return { installed: true, version: '4.x+', release };
        }
    } catch (e) {
        return { installed: false, version: null, error: e.message };
    }
    return { installed: false, version: null, error: 'Chave de registro nao encontrada' };
}

function copyFolderSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyFolderSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function extractPluginsIfNeeded() {
    const pluginsDir = getPluginsDir();
    const exePath = path.join(pluginsDir, 'Ets2Telemetry.exe');
    if (fs.existsSync(exePath)) return;
    const srcPlugins = path.join(__dirname, 'plugins');
    if (fs.existsSync(srcPlugins)) {
        console.log('[TELEMETRY] Extraindo plugins de', srcPlugins, 'para', pluginsDir);
        try {
            copyFolderSync(srcPlugins, pluginsDir);
            console.log('[TELEMETRY] Plugins extraidos com sucesso');
        } catch (e) {
            console.log('[TELEMETRY] Falha ao extrair plugins:', e.message);
        }
    }
}

function startTelemetryServer() {
    extractPluginsIfNeeded();
    const dotnet = checkDotNetVersion();
    console.log('[TELEMETRY] .NET Framework:', dotnet.installed ? dotnet.version : 'AUSENTE');
    if (!dotnet.installed) {
        console.log('[TELEMETRY] .NET Framework 4.5+ necessario. Instale em: https://dotnet.microsoft.com/download/dotnet-framework');
    }
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

        const userDataPath = app.getPath('userData');
        process.env.CARGOSTATS_DB_PATH = path.join(userDataPath, 'data.db');
        process.env.CARGOSTATS_UPLOADS_PATH = path.join(userDataPath, 'uploads');

        try {
            delete require.cache[require.resolve(serverPath)];
            const { startServer } = require(serverPath);
            serverInstance = startServer(SERVER_PORT);
            console.log('[SERVER] Servidor iniciado na porta', SERVER_PORT);
            console.log('[SERVER] DB:', process.env.CARGOSTATS_DB_PATH);
            console.log('[SERVER] Uploads:', process.env.CARGOSTATS_UPLOADS_PATH);
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

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('check-for-updates', () => {
    checkForUpdates();
});

ipcMain.handle('download-update', () => {
    autoUpdater.downloadUpdate();
});

ipcMain.handle('restart-and-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-diagnostics', () => {
    const dotnet = checkDotNetVersion();
    const pluginsDir = getPluginsDir();
    const exePath = path.join(pluginsDir, 'Ets2Telemetry.exe');
    return {
        dotnet,
        plugins: {
            path: pluginsDir,
            exists: fs.existsSync(pluginsDir),
            exeExists: fs.existsSync(exePath)
        },
        telemetry: {
            running: telemetryProcess !== null && !telemetryProcess.killed,
            pid: telemetryProcess && !telemetryProcess.killed ? telemetryProcess.pid : null
        },
        isDev: isDev(),
        version: app.getVersion()
    };
});

const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.json');

ipcMain.handle('save-credentials', (_event, data) => {
    try {
        fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data));
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

    createTray();
    installGamePlugin();
    startTelemetryServer();

    try {
        await startLocalServer();
        createWindow(`http://localhost:${SERVER_PORT}/update_check.html`);
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
