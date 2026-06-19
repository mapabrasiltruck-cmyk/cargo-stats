const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cargoStats', {
    // ─── Version Info ───────────────────────────────────
    getVersion: () => ipcRenderer.invoke('get-version'),

    // ─── Auto-Update Events ─────────────────────────────
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update_available', (_e, version) => callback(version));
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update_progress', (_e, percent) => callback(percent));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update_downloaded', () => callback());
    },

    // ─── Telemetry Status ───────────────────────────────
    getTelemetryStatus: () => ipcRenderer.invoke('get-telemetry-status'),

    // ─── Diagnostics ────────────────────────────────────
    getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
});
