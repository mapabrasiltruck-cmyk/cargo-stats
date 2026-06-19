const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_SIZE = 2 * 1024 * 1024;

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) return reject(new Error('No boundary'));
        const boundary = boundaryMatch[1];

        let body = [];
        let totalSize = 0;

        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > MAX_SIZE) {
                req.destroy();
                return reject(new Error('Arquivo muito grande (max 2MB)'));
            }
            body.push(chunk);
        });

        req.on('end', () => {
            const buffer = Buffer.concat(body);
            const result = parseBuffer(buffer, boundary);
            resolve(result);
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
        const contentTypeMatch = headerStr.match(/Content-Type:\s*(.+)/i);

        if (!nameMatch) { start = nextStart; continue; }
        const fieldName = nameMatch[1];

        if (filenameMatch && filenameMatch[1]) {
            const ext = path.extname(filenameMatch[1]) || '.png';
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
