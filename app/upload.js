const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = process.env.CARGOSTATS_UPLOADS_PATH || path.join(__dirname, 'uploads');
const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);

if (process.env.CARGOSTATS_UPLOADS_PATH) {
    const oldDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(process.env.CARGOSTATS_UPLOADS_PATH) && fs.existsSync(oldDir)) {
        try {
            fs.mkdirSync(process.env.CARGOSTATS_UPLOADS_PATH, { recursive: true });
            const entries = fs.readdirSync(oldDir);
            for (const entry of entries) {
                const src = path.join(oldDir, entry);
                const dest = path.join(process.env.CARGOSTATS_UPLOADS_PATH, entry);
                if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
                    fs.copyFileSync(src, dest);
                }
            }
            console.log('[UPLOAD] Migrados arquivos existentes para:', process.env.CARGOSTATS_UPLOADS_PATH);
        } catch (e) {
            console.error('[UPLOAD] Erro ao migrar uploads:', e.message);
        }
    }
}

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
        if (!boundaryMatch) return reject(new Error('No boundary'));
        const boundary = boundaryMatch[1];

        const chunks = [];
        let totalSize = 0;

        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > MAX_SIZE) {
                req.destroy();
                return reject(new Error('Arquivo muito grande (max 2MB)'));
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const result = parseBuffer(buffer, boundary);
                resolve(result);
            } catch(e) {
                reject(e);
            }
        });

        req.on('error', reject);
    });
}

function parseBuffer(buffer, boundary) {
    const parts = {};
    const files = {};
    const boundaryBuf = Buffer.from('--' + boundary);
    let start = bufferIndexOf(buffer, boundaryBuf, 0);

    while (start !== -1) {
        const nextStart = bufferIndexOf(buffer, boundaryBuf, start + boundaryBuf.length);
        const part = nextStart !== -1
            ? buffer.slice(start + boundaryBuf.length, nextStart)
            : buffer.slice(start + boundaryBuf.length);

        const headerEnd = bufferIndexOf(part, Buffer.from('\r\n\r\n'), 0);
        if (headerEnd === -1) { start = nextStart; continue; }

        const headerStr = part.slice(0, headerEnd).toString('utf8');
        const body = part.slice(headerEnd + 4);

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);

        if (!nameMatch) { start = nextStart; continue; }
        const fieldName = nameMatch[1];

        if (filenameMatch && filenameMatch[1]) {
            const ext = path.extname(filenameMatch[1]).toLowerCase() || '.png';
            if (!ALLOWED_EXTENSIONS.has(ext)) {
                start = nextStart;
                continue;
            }
            const safeName = crypto.randomBytes(8).toString('hex') + ext;
            const filePath = path.join(UPLOADS_DIR, safeName);

            const trimmedBody = body.slice(0, body.length - 2);
            fs.writeFileSync(filePath, trimmedBody);
            files[fieldName] = '/uploads/' + safeName;
        } else {
            const value = body.slice(0, body.length - 2).toString('utf8').trim();
            parts[fieldName] = value;
        }

        start = nextStart;
    }

    return { fields: parts, files };
}

function bufferIndexOf(buf, search, start) {
    for (let i = start; i <= buf.length - search.length; i++) {
        let found = true;
        for (let j = 0; j < search.length; j++) {
            if (buf[i + j] !== search[j]) { found = false; break; }
        }
        if (found) return i;
    }
    return -1;
}

module.exports = { parseMultipart, UPLOADS_DIR };
