/* ==========================================================================
   BOARDVERSE AI PLATFORM - PRODUCTION HARDENED BACKEND SERVER
   High-concurrency chess & xiangqi engine proxy with LRU caching,
   sliding-window rate limiting, input sanitization, and hardware guards.
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

// Import chess engine services
const nativeStockfishService = require('./backend/native-stockfish-service.js');
const xiangqiEngineService = require('./backend/xiangqi-engine-service.js');

const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── In-Memory LRU Cache for FEN Analysis (Shared Server-side Cache) ─────────
class LRUCache {
    constructor(max = 1000, ttlMs = 10 * 60 * 1000) {
        this.max = max;
        this.ttlMs = ttlMs;
        this.cache = new Map();
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.max) {
            // Evict oldest (first key)
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
    }
}

const analysisCache = new LRUCache(1000, 15 * 60 * 1000); // 15 min TTL

// ── Sliding-Window Rate Limiter per Client IP ──────────────────────────────
class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 60) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.clients = new Map();
        
        // Clean up stale IP records every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [ip, data] of this.clients.entries()) {
                if (now - data.resetTime > this.windowMs) {
                    this.clients.delete(ip);
                }
            }
        }, 5 * 60 * 1000);
    }

    isAllowed(ip) {
        const now = Date.now();
        const client = this.clients.get(ip);

        if (!client || now > client.resetTime) {
            this.clients.set(ip, { count: 1, resetTime: now + this.windowMs });
            return true;
        }

        if (client.count >= this.maxRequests) {
            return false;
        }

        client.count++;
        return true;
    }
}

const apiRateLimiter = new RateLimiter(60000, 60); // 60 analysis reqs/min per IP

// ── Concurrency Semaphore (Protects CPU against multi-client starvation) ──
const MAX_CONCURRENT_ANALYSIS = Math.max(2, Math.min(8, (os.cpus() ? os.cpus().length : 4) - 1));
let currentActiveAnalysis = 0;

// ── Input Validation & Sanitization Helpers ────────────────────────────────
function isValidChessFen(fen) {
    if (typeof fen !== 'string' || fen.length > 150) return false;
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 6) return false;
    const board = parts[0];
    const ranks = board.split('/');
    if (ranks.length !== 8) return false;
    const validChars = /^[1-8prnbqkPRNBQK]+$/;
    for (const rank of ranks) {
        if (!validChars.test(rank)) return false;
        let count = 0;
        for (const ch of rank) {
            if (ch >= '1' && ch <= '8') count += parseInt(ch, 10);
            else count += 1;
        }
        if (count !== 8) return false;
    }
    const side = parts[1];
    return side === 'w' || side === 'b';
}

function isValidXiangqiFen(fen) {
    if (typeof fen !== 'string' || fen.length > 150) return false;
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 6) return false;
    const board = parts[0];
    const ranks = board.split('/');
    if (ranks.length !== 10) return false;
    const validChars = /^[1-9rnbakcpRNBAKCP]+$/;
    for (const rank of ranks) {
        if (!validChars.test(rank)) return false;
        let count = 0;
        for (const ch of rank) {
            if (ch >= '1' && ch <= '9') count += parseInt(ch, 10);
            else count += 1;
        }
        if (count !== 9) return false;
    }
    const side = parts[1];
    return side === 'w' || side === 'b' || side === 'r';
}

function sanitizeEngineConfig(config = {}) {
    return {
        depth: Math.min(38, Math.max(1, parseInt(config.depth || config.Depth || 26, 10))),
        time: Math.min(15000, Math.max(100, parseInt(config.time || config.MoveTime || 5000, 10))),
        multiPV: Math.min(5, Math.max(1, parseInt(config.multiPV || config.MultiPV || 1, 10))),
        threads: Math.min(4, Math.max(1, parseInt(config.threads || config.Threads || 2, 10))),
        hash: Math.min(256, Math.max(16, parseInt(config.hash || config.Hash || 64, 10))),
        useAdaptiveTime: config.useAdaptiveTime !== false
    };
}

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

// Helper: Send JSON response
function jsonResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Helper: Read request body
function readBody(req, maxSize = 64 * 1024) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxSize) {
                req.connection.destroy();
                reject(new Error('Request body exceeded limit'));
                return;
            }
            body += chunk.toString();
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

// Helper: Serve static files
function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>500 - Internal Server Error</h1>');
            }
            return;
        }
        // Strict anti-cache headers for instant local updates without Ctrl+Shift+R
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });
        res.end(data);
    });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Enable COOP/COEP for high-performance WASM SharedArrayBuffer & Multithreading
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ── Clear Site Data & Cache Endpoint ──────────────────────────────────────
    if (pathname === '/clear' || pathname === '/api/clear-site-data') {
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Clear-Site-Data': '"cache", "storage", "executionContexts"',
            'Cache-Control': 'no-store, max-age=0'
        });
        res.end(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="utf-8">
                <title>Đã Xóa Sạch Cache</title>
                <script>
                    try { localStorage.clear(); sessionStorage.clear(); } catch(e){}
                    setTimeout(() => { window.location.href = '/'; }, 800);
                </script>
            </head>
            <body style="background:#0a0a0b;color:#22c55e;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
                <h2 style="margin:0 0 10px;">🧹 Đã xóa sạch toàn bộ Cache & Storage!</h2>
                <p style="color:#94a3b8;margin:0;">Đang tự động chuyển hướng về trang chủ...</p>
            </body>
            </html>
        `);
        return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // API ROUTES
    // ══════════════════════════════════════════════════════════════════════════

    // ── Rate Limiting Check for API endpoints ────────────────────────────────
    if (pathname.startsWith('/api/')) {
        if (!apiRateLimiter.isAllowed(clientIp)) {
            return jsonResponse(res, 429, {
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many analysis requests. Please throttle your evaluation requests (max 60/min).'
            });
        }
    }

    // ── Chess Battle Assistant Analysis API (Native Stockfish Backend) ────────
    if (pathname === '/api/chess/analyze' && req.method === 'POST') {
        try {
            const raw = await readBody(req, 32 * 1024);
            const payload = JSON.parse(raw || '{}');
            const fen = (payload.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').trim();
            const rawConfig = payload.config || {};
            const analysisId = payload.analysisId || 'nat_' + Date.now();

            // 1. Validate FEN
            if (!isValidChessFen(fen)) {
                return jsonResponse(res, 400, {
                    error: 'INVALID_FEN',
                    message: 'Malformed or invalid Chess FEN string.'
                });
            }

            // 2. Sanitize Config
            const safeConfig = sanitizeEngineConfig(rawConfig);
            safeConfig.analysisId = analysisId;

            // 3. Check Server LRU Cache (cacheKey: FEN + Depth + MultiPV)
            const cacheKey = `chess_${fen}_d${safeConfig.depth}_mpv${safeConfig.multiPV}`;
            const cachedResult = analysisCache.get(cacheKey);
            if (cachedResult) {
                return jsonResponse(res, 200, {
                    ...cachedResult,
                    cached: true,
                    analysisId: analysisId
                });
            }

            // 4. Concurrency Guard
            if (currentActiveAnalysis >= MAX_CONCURRENT_ANALYSIS) {
                return jsonResponse(res, 503, {
                    error: 'ENGINE_BUSY',
                    message: 'Server engine queue is at maximum capacity. Please retry momentarily.'
                });
            }

            currentActiveAnalysis++;
            try {
                const result = await nativeStockfishService.analyze(fen, safeConfig);
                if (result && result.success !== false && !result.error) {
                    analysisCache.set(cacheKey, result);
                }
                jsonResponse(res, 200, result);
            } finally {
                currentActiveAnalysis = Math.max(0, currentActiveAnalysis - 1);
            }
        } catch (err) {
            console.error('Chess analyze error:', err.message);
            jsonResponse(res, 500, {
                error: 'ENGINE_ERROR',
                message: IS_PROD ? 'Analysis computation failed.' : err.message
            });
        }
        return;
    }

    // ── Xiangqi Engine Health Check & Telemetry ──────────────────────────────
    if (pathname === '/api/xiangqi-engine/health' && req.method === 'GET') {
        const info = xiangqiEngineService.getEngineInfo();
        jsonResponse(res, 200, {
            ok: info.available,
            nativeAvailable: info.available,
            maxConcurrent: MAX_CONCURRENT_ANALYSIS,
            activeWorkers: currentActiveAnalysis,
            ...info
        });
        return;
    }

    // ── Xiangqi Engine Pool Configuration ─────────────────────────────────────
    if (pathname === '/api/xiangqi-engine/config' && req.method === 'POST') {
        try {
            const body = await readBody(req, 16 * 1024);
            const payload = JSON.parse(body || '{}');
            const poolSize = Math.min(4, Math.max(1, parseInt(payload.poolSize || 2, 10)));
            const totalHash = Math.min(512, Math.max(64, parseInt(payload.totalHashMB || 256, 10)));
            await xiangqiEngineService.configurePool(poolSize, totalHash);
            const updated = xiangqiEngineService.getEngineInfo();
            jsonResponse(res, 200, { ok: true, message: `Pool reconfigured to ${poolSize} workers`, ...updated });
        } catch (err) {
            console.error('Xiangqi config error:', err.message);
            jsonResponse(res, 500, { error: 'CONFIG_FAILED', message: IS_PROD ? 'Pool config failed.' : err.message });
        }
        return;
    }

    // ── Xiangqi Engine Analysis API ───────────────────────────────────────────
    if (pathname === '/api/xiangqi-engine/analyze' && req.method === 'POST') {
        try {
            const body = await readBody(req, 32 * 1024);
            const payload = JSON.parse(body || '{}');
            const fen = (payload.fen || '').trim();
            const rawConfig = payload.config || {};

            // 1. Validate Xiangqi FEN
            if (!isValidXiangqiFen(fen)) {
                return jsonResponse(res, 400, {
                    error: 'INVALID_FEN',
                    message: 'Malformed or invalid Xiangqi FEN string.'
                });
            }

            // 2. Sanitize Config
            const safeConfig = sanitizeEngineConfig(rawConfig);

            // 3. Check Server LRU Cache
            const cacheKey = `xq_${fen}_t${safeConfig.time}_mpv${safeConfig.multiPV}`;
            const cachedResult = analysisCache.get(cacheKey);
            if (cachedResult) {
                return jsonResponse(res, 200, {
                    ...cachedResult,
                    cached: true
                });
            }

            // 4. Concurrency Guard
            if (currentActiveAnalysis >= MAX_CONCURRENT_ANALYSIS) {
                return jsonResponse(res, 503, {
                    error: 'ENGINE_BUSY',
                    message: 'Xiangqi engine queue is at maximum capacity. Please retry momentarily.'
                });
            }

            currentActiveAnalysis++;
            try {
                const result = await xiangqiEngineService.analyze(fen, safeConfig);
                if (result && result.success !== false && !result.error) {
                    analysisCache.set(cacheKey, result);
                }
                jsonResponse(res, 200, result);
            } finally {
                currentActiveAnalysis = Math.max(0, currentActiveAnalysis - 1);
            }
        } catch (err) {
            console.error('Xiangqi analyze error:', err.message);
            jsonResponse(res, 500, { error: 'ENGINE_ERROR', message: IS_PROD ? 'Analysis computation failed.' : err.message });
        }
        return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STATIC FILE SERVING
    // ══════════════════════════════════════════════════════════════════════════

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(pathname);
    } catch {
        decodedPath = pathname;
    }

    let filePath;
    if (decodedPath === '/' || decodedPath === '/battle.html' || decodedPath === '/chess battle.html' || decodedPath === '/chess-battle.html') {
        filePath = path.join(__dirname, 'index.html');
    } else {
        filePath = path.join(__dirname, decodedPath);
    }

    // Security: Prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<h1>403 - Forbidden</h1>');
        return;
    }

    // Check if file exists
    fs.stat(normalizedPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 - Page Not Found</h1>');
            return;
        }
        serveStaticFile(res, normalizedPath);
    });
});

// Start server
server.listen(PORT, () => {
    console.log('\n' + '═'.repeat(70));
    console.log('  ⚔️  BOARDVERSE AI PLATFORM SERVER (HARDENED PRODUCTION)');
    console.log('═'.repeat(70));
    console.log(`  🚀  Server running at: http://localhost:${PORT}`);
    console.log(`  📂  Serving static files from: ${__dirname}`);
    console.log(`  🛡️  Concurrency Guard: Max ${MAX_CONCURRENT_ANALYSIS} parallel engine instances`);
    console.log(`  ⚡  LRU Cache: Active (1,000 entries, 15m TTL)`);
    console.log(`  ⏱️  Rate Limiting: 60 req/min per IP`);
    console.log('\n  Available Features:');
    console.log('  ├─ BoardVerse Battle:      http://localhost:' + PORT + '/');
    console.log('  ├─ Chess Battle:           http://localhost:' + PORT + '/chess-battle.html');
    console.log('  └─ Xiangqi Battle:         http://localhost:' + PORT + '/xiangqi.html');
    console.log('\n  API Endpoints:');
    console.log('  ├─ POST /api/chess/analyze');
    console.log('  ├─ GET  /api/xiangqi-engine/health');
    console.log('  ├─ POST /api/xiangqi-engine/config');
    console.log('  └─ POST /api/xiangqi-engine/analyze');
    console.log('═'.repeat(70) + '\n');
});

// Handle server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use.\n`);
    } else {
        console.error('\n❌ Server error:', err.message, '\n');
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n⚠️  SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('✅  HTTP server closed\n');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n⚠️  SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('✅  HTTP server closed\n');
        process.exit(0);
    });
});
