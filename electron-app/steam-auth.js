const { BrowserWindow, net } = require('electron');
const http = require('http');
const https = require('https');

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAMID_REGEX = /https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)/;
const CALLBACK_PATH = '/steam-callback';

function buildSteamOpenIdUrl(returnUrl) {
    const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnUrl,
        'openid.realm': new URL(returnUrl).origin,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
    });
    return `${STEAM_OPENID_URL}?${params.toString()}`;
}

function extractSteamId(url) {
    const match = url.match(STEAMID_REGEX);
    return match ? match[1] : null;
}

function fetchSteamProfile(steamId) {
    return new Promise((resolve, reject) => {
        const url = `https://steamcommunity.com/profiles/${steamId}?xml=1`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const nameMatch = data.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
                    const avatarMatch = data.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/);
                    const avatarFull = data.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
                    resolve({
                        nome: nameMatch ? nameMatch[1] : 'Motorista Steam',
                        avatar: (avatarFull && avatarFull[1]) || (avatarMatch && avatarMatch[1]) || ''
                    });
                } catch (e) {
                    resolve({ nome: 'Motorista Steam', avatar: '' });
                }
            });
        }).on('error', (e) => {
            resolve({ nome: 'Motorista Steam', avatar: '' });
        });
    });
}

function authenticateWithSteam(serverPort) {
    return new Promise((resolve, reject) => {
        const returnUrl = `http://localhost:${serverPort}${CALLBACK_PATH}`;
        const steamUrl = buildSteamOpenIdUrl(returnUrl);

        const authWindow = new BrowserWindow({
            width: 520,
            height: 620,
            modal: true,
            parent: BrowserWindow.getFocusedWindow() || undefined,
            title: 'Login com Steam',
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });

        authWindow.setMenu(null);
        authWindow.loadURL(steamUrl);

        let resolved = false;

        authWindow.webContents.on('will-redirect', (event, url) => {
            if (resolved) return;
            const steamId = extractSteamId(url);
            if (steamId) {
                resolved = true;
                authWindow.destroy();
                fetchSteamProfile(steamId).then(profile => {
                    resolve({
                        steam_id: steamId,
                        nome: profile.nome,
                        avatar: profile.avatar
                    });
                }).catch(() => {
                    resolve({
                        steam_id: steamId,
                        nome: 'Motorista Steam',
                        avatar: ''
                    });
                });
            }
        });

        authWindow.webContents.on('will-navigate', (event, url) => {
            if (resolved) return;
            const steamId = extractSteamId(url);
            if (steamId) {
                resolved = true;
                authWindow.destroy();
                fetchSteamProfile(steamId).then(profile => {
                    resolve({
                        steam_id: steamId,
                        nome: profile.nome,
                        avatar: profile.avatar
                    });
                }).catch(() => {
                    resolve({
                        steam_id: steamId,
                        nome: 'Motorista Steam',
                        avatar: ''
                    });
                });
            }
        });

        authWindow.on('closed', () => {
            if (!resolved) {
                reject(new Error('Janela de login fechada pelo usuario'));
            }
        });
    });
}

module.exports = { authenticateWithSteam, extractSteamId, fetchSteamProfile, CALLBACK_PATH };
