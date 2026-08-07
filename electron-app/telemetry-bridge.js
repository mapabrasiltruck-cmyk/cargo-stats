const path = require('path');
const fs = require('fs');

let addon = null;
let pollTimer = null;
const POLL_INTERVAL = 250;

const latestData = {
    telemetry: null,
    status: { available: false, sdkActive: false, paused: true },
    lastTimestamp: '0',
    pollsAttempted: 0,
    pollsSucceeded: 0,
    lastError: null,
};

function getAddonPath() {
    try {
        const app = require('electron').app;
        if (app && !app.isPackaged) {
            return path.join(__dirname, 'native', 'build', 'Release', 'telemetry-addon.node');
        }
        if (process.resourcesPath) {
            return path.join(process.resourcesPath, 'native', 'telemetry-addon.node');
        }
    } catch (e) {}
    return path.join(__dirname, 'native', 'build', 'Release', 'telemetry-addon.node');
}

function loadAddon() {
    if (addon) return true;
    const addonPath = getAddonPath();
    if (!fs.existsSync(addonPath)) {
        latestData.lastError = 'Addon not found at: ' + addonPath;
        return false;
    }
    try {
        addon = require(addonPath);
        return true;
    } catch (e) {
        latestData.lastError = e.message;
        return false;
    }
}

function readTelemetry() {
    if (!addon && !loadAddon()) {
        return { error: 'Addon not loaded', errorCode: -1 };
    }
    try {
        latestData.pollsAttempted++;
        const data = addon.readTelemetry();
        if (data && !data.error) {
            latestData.telemetry = data;
            latestData.status.available = true;
            latestData.status.sdkActive = data.game && data.game.sdkActive;
            latestData.status.paused = data.game && data.game.paused;
            latestData.lastTimestamp = Date.now().toString();
            latestData.pollsSucceeded++;
            latestData.lastError = null;
        } else {
            latestData.status.available = false;
            latestData.status.sdkActive = false;
            latestData.status.paused = true;
            latestData.lastError = data ? data.error : 'No data';
        }
        return data;
    } catch (e) {
        latestData.status.available = false;
        latestData.status.sdkActive = false;
        latestData.status.paused = true;
        latestData.lastError = e.message;
        return { error: e.message };
    }
}

function getStatus() {
    if (!addon && !loadAddon()) {
        return { available: false, sdkActive: false, paused: true, error: 'Addon not loaded' };
    }
    try {
        const status = addon.getTelemetryStatus();
        latestData.status = status;
        return status;
    } catch (e) {
        return { available: false, sdkActive: false, paused: true, error: e.message };
    }
}

function startPolling(callback) {
    if (pollTimer) return;
    loadAddon();
    pollTimer = setInterval(() => {
        const data = readTelemetry();
        if (callback && data) {
            callback(data);
        }
    }, POLL_INTERVAL);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function getLatestData() {
    return latestData;
}

function getLatestTelemetry() {
    return latestData.telemetry;
}

function getDetailedDiagnostics() {
    const result = {
        addonLoaded: false,
        addonPath: getAddonPath(),
        addonPathExists: false,
        sharedMemoryAvailable: false,
        errorCode: null,
        lastError: latestData.lastError,
        pollsAttempted: latestData.pollsAttempted,
        pollsSucceeded: latestData.pollsSucceeded,
        fields: {},
        telemetry: null
    };

    try {
        result.addonPathExists = fs.existsSync(result.addonPath);
    } catch (e) {}

    if (!loadAddon()) {
        result.lastError = result.lastError || 'Failed to load addon';
        return result;
    }
    result.addonLoaded = true;

    try {
        const status = addon.getTelemetryStatus();
        result.sharedMemoryAvailable = !!status.available;
        result.errorCode = status.errorCode != null ? status.errorCode : null;
    } catch (e) {}

    const data = readTelemetry();
    if (data && !data.error) {
        result.telemetry = data;
        // Build field-by-field diagnostic map
        const allFields = {};
        function flatten(obj, prefix) {
            if (!obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                const path = prefix ? prefix + '.' + key : key;
                if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                    flatten(val, path);
                } else if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
                    allFields[path] = val;
                }
            }
        }
        flatten(data, '');
        result.fields = allFields;
    }

    return result;
}

module.exports = {
    loadAddon,
    readTelemetry,
    getStatus,
    startPolling,
    stopPolling,
    getLatestData,
    getLatestTelemetry,
    getDetailedDiagnostics,
};
