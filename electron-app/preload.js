const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cargoStats', {
    // ─── Version Info ───────────────────────────────────
    getVersion: () => ipcRenderer.invoke('get-version'),

    // ─── Auto-Update Events ─────────────────────────────
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update_available', (_e, version) => callback(version));
    },
    onUpdateNotAvailable: (callback) => {
        ipcRenderer.on('update_not_available', () => callback());
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update_progress', (_e, percent) => callback(percent));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update_downloaded', () => callback());
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('update_error', (_e, msg) => callback(msg));
    },

    // ─── Telemetry Status ───────────────────────────────
    getTelemetryStatus: () => ipcRenderer.invoke('get-telemetry-status'),

    // ─── Diagnostics ────────────────────────────────────
    getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),

    // ─── Manual Update ──────────────────────────────────
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),

    // ─── Start with Windows ────────────────────────────
    getStartupSettings: () => ipcRenderer.invoke('get-startup-settings'),
    setStartupSettings: (enabled) => ipcRenderer.invoke('set-startup-settings', enabled),

    // ─── Background Auto-Record ────────────────────────
    getBGTripData: () => ipcRenderer.invoke('get-bg-trip-data'),
    onBgAutoRecord: (callback) => {
        ipcRenderer.on('bg-auto-record', (_e, data) => callback(data));
    },

    // ─── Credential Persistence ─────────────────────────
    saveCredentials: (data) => ipcRenderer.invoke('save-credentials', data),
    loadCredentials: () => ipcRenderer.invoke('load-credentials'),
    clearCredentials: () => ipcRenderer.invoke('clear-credentials'),

    // ─── Steam Authentication ───────────────────────────
    steamLogin: () => ipcRenderer.invoke('steam-login'),
});
