const store = new Map();

function getBucket(key) {
    const now = Date.now();
    let bucket = store.get(key);
    if (!bucket || now - bucket.windowStart > bucket.windowMs) {
        bucket = { count: 0, windowStart: now, windowMs: 0 };
        store.set(key, bucket);
    }
    return bucket;
}

function isRateLimited(key, limit, windowMs) {
    const bucket = getBucket(key);
    bucket.windowMs = windowMs;
    if (bucket.count >= limit) return true;
    bucket.count++;
    return false;
}

function cleanup() {
    const now = Date.now();
    for (const [key, bucket] of store) {
        if (now - bucket.windowStart > bucket.windowMs * 2) {
            store.delete(key);
        }
    }
}

setInterval(cleanup, 60 * 1000);

function rateLimit(options) {
    const { limit = 100, windowMs = 60 * 1000, keyFn } = options;
    return function checkRateLimit(req, res) {
        const key = keyFn ? keyFn(req) : (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
        if (isRateLimited(key, limit, windowMs)) {
            return true;
        }
        return false;
    };
}

module.exports = { rateLimit, isRateLimited, getBucket };
