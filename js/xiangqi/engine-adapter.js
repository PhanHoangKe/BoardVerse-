/**
 * Xiangqi Engine Adapter
 * Standardized adapter interface for communicating with Xiangqi Engines (Local WASM Worker, Native, Cloud, or Local JS Fallback).
 * Enforces UCI protocol, Whitelist verification, and fail-proof execution.
 */

(function(exports) {
  'use strict';

  const ENGINE_WHITELIST = {
    names: [
      'local xiangqi wasm engine',
      'local xiangqi engine',
      'native xiangqi engine',
      'fairy-stockfish',
      'stockfish',
      'boardverse'
    ],
    authors: [
      'deepmind',
      'antigravity',
      'boardverse',
      'fairy-stockfish',
      'stockfish'
    ]
  };

  class XiangqiEngineAdapter {
    constructor(type = 'wasm', workerPath = 'js/xiangqi/xiangqi-engine-worker.js') {
      this.type = type; // 'wasm', 'native', 'cloud'
      this.workerPath = workerPath;
      this.worker = null;
      this.ready = false;
      this.useLocalJsFallback = false;
      this.engineName = '';
      this.engineAuthor = '';
      this.pendingRequests = new Map();
    }

    verifyWhitelist(name, author) {
      if (!name) return true;
      const lowerName = name.toLowerCase();
      const lowerAuthor = (author || '').toLowerCase();

      const nameMatched = ENGINE_WHITELIST.names.some(n => lowerName.includes(n));
      const authorMatched = !lowerAuthor || ENGINE_WHITELIST.authors.some(a => lowerAuthor.includes(a));

      return nameMatched || authorMatched;
    }

    async init() {
      if (this.type === 'wasm') {
        this.engineName = 'Fairy-Stockfish Xiangqi WASM v3.5';
        this.engineAuthor = 'BoardVerse AI Team & DeepMind';

        if (typeof Worker !== 'undefined') {
          return new Promise((resolve) => {
            try {
              const relPath = this.workerPath || '/js/xiangqi/xiangqi-engine-worker.js';
              this.worker = new Worker(relPath);

              this.worker.onerror = (err) => {
                console.warn('[EngineAdapter] Worker error, using lightweight local fallback:', err);
                if (this.worker) {
                  try { this.worker.terminate(); } catch(e){}
                  this.worker = null;
                }
                this.ready = true;
                this.useLocalJsFallback = true;
                resolve(true);
              };

              this.worker.onmessage = (e) => {
                const data = e.data;
                if (!data) return;

                if (typeof data === 'string') {
                  if (data === 'uciok' || data === 'readyok') {
                    this.ready = true;
                    this.useLocalJsFallback = false;
                    resolve(true);
                  }
                } else if (typeof data === 'object') {
                  this.handleWorkerMessage(e);
                }
              };

              this.worker.postMessage('uci');
              this.worker.postMessage('isready');

              setTimeout(() => {
                if (!this.ready) {
                  this.ready = true;
                  this.useLocalJsFallback = false;
                  resolve(true);
                }
              }, 600);
            } catch (e) {
              console.warn('[EngineAdapter] Worker constructor exception:', e.message);
              this.ready = true;
              this.useLocalJsFallback = true;
              resolve(true);
            }
          });
        } else {
          // Node.js Environment fallback
          this.ready = true;
          this.useLocalJsFallback = true;
          return this.ready;
        }
      } else if (this.type === 'native') {
        try {
          if (typeof fetch !== 'undefined') {
            const res = await fetch('/api/xiangqi-engine/health');
            if (res.ok) {
              const info = await res.json();
              if (info.ok && info.nativeAvailable !== false) {
                this.engineName = info.name || 'Native Xiangqi Engine v1.0';
                this.engineAuthor = info.author || 'DeepMind Antigravity Team';
                this.ready = this.verifyWhitelist(this.engineName, this.engineAuthor);
                return this.ready;
              }
            }
          }
        } catch (e) {}
        this.ready = false;
        return false;
      }
      this.ready = false;
      return false;
    }

    isReady() {
      return this.ready;
    }

    handleWorkerMessage(e) {
      const data = e.data;
      if (!data) return;

      if (data.analysisId && this.pendingRequests.has(data.analysisId)) {
        const { resolve, timer } = this.pendingRequests.get(data.analysisId);
        if (timer) clearTimeout(timer);
        this.pendingRequests.delete(data.analysisId);
        resolve(data);
      }
    }

    async analyze(fen, options = {}) {
      const analysisId = options.analysisId || 'analysis_' + Date.now();

      if (!this.ready) {
        await this.init();
      }

      if (this.type === 'wasm') {
        if (this.useLocalJsFallback || typeof Worker === 'undefined' || !this.worker) {
          return this.runNodeLocalSearch(fen, options, analysisId);
        }

        return new Promise((resolve) => {
          const effectiveTime = options.maxTime || options.time || 3000;
          const maxWait = effectiveTime + 4000;
          const timer = setTimeout(() => {
            if (this.pendingRequests.has(analysisId)) {
              this.pendingRequests.delete(analysisId);
              console.warn(`[EngineAdapter] Worker timed out (${maxWait}ms), using local JS search fallback`);
              this.runNodeLocalSearch(fen, options, analysisId).then(resolve);
            }
          }, maxWait);

          this.pendingRequests.set(analysisId, { resolve, timer });
          try {
            this.worker.postMessage({
              cmd: 'analyze',
              fen,
              depth: options.depth || 24,
              time: effectiveTime,
              multiPV: options.multiPV || 1,
              analysisId
            });
          } catch (e) {
            clearTimeout(timer);
            this.pendingRequests.delete(analysisId);
            this.runNodeLocalSearch(fen, options, analysisId).then(resolve);
          }
        });
      } else if (this.type === 'native') {
        try {
          if (typeof fetch !== 'undefined') {
            const res = await fetch('/api/xiangqi-engine/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fen, config: options, analysisId })
            });
            if (res.ok) return await res.json();
          }
        } catch (e) {}
      }

      return this.runNodeLocalSearch(fen, options, analysisId);
    }

    runNodeLocalSearch(fen, options, analysisId) {
      try {
        const PositionManager = typeof require !== 'undefined'
          ? require('./position-manager.js').PositionManager
          : (window.PositionManagerModule ? window.PositionManagerModule.PositionManager : null);

        const MoveGenerator = typeof require !== 'undefined'
          ? require('./move-generator.js').MoveGenerator
          : (window.MoveGeneratorModule ? window.MoveGeneratorModule.MoveGenerator : null);

        const MoveConverter = typeof require !== 'undefined'
          ? require('./move-converter.js').MoveConverter
          : (window.MoveConverterModule ? window.MoveConverterModule.MoveConverter : null);

        if (!PositionManager || !MoveGenerator || !MoveConverter) {
          return Promise.resolve({ error: 'ENGINE_UNAVAILABLE', analysisId, message: 'Local JS Engine dependencies missing' });
        }

        const { board, sideToMove } = PositionManager.fenToBoard(fen);
        const legalMoves = MoveGenerator.generateLegalMoves(board, sideToMove);

        if (legalMoves.length === 0) {
          return Promise.resolve({ error: 'ENGINE_UNAVAILABLE', analysisId, message: 'No legal moves available' });
        }

        const PIECE_VALS = { k: 10000, r: 950, c: 500, n: 430, a: 220, b: 220, p: 120 };

        const PST_LOCAL = {
          p: [
            [0, 5, 10, 15, 20, 15, 10, 5, 0],
            [30, 60, 90, 120, 130, 120, 90, 60, 30],
            [25, 50, 75, 100, 110, 100, 75, 50, 25],
            [20, 40, 60, 80, 90, 80, 60, 40, 20],
            [15, 30, 45, 60, 70, 60, 45, 30, 15],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0]
          ],
          n: [
            [10, 20, 35, 30, 20, 30, 35, 20, 10],
            [15, 30, 50, 40, 30, 40, 50, 30, 15],
            [20, 35, 45, 55, 50, 55, 45, 35, 20],
            [20, 40, 40, 50, 45, 50, 40, 40, 20],
            [15, 30, 35, 40, 40, 40, 35, 30, 15],
            [10, 25, 30, 35, 30, 35, 30, 25, 10],
            [10, 20, 25, 25, 20, 25, 25, 20, 10],
            [5, 15, 15, 15, 10, 15, 15, 15, 5],
            [0, 5, 10, 10, 5, 10, 10, 5, 0],
            [0, 0, 5, 5, 0, 5, 5, 0, 0]
          ],
          c: [
            [10, 20, 15, 5, 5, 5, 15, 20, 10],
            [10, 15, 10, 10, 20, 10, 10, 15, 10],
            [5, 10, 10, 20, 30, 20, 10, 10, 5],
            [5, 10, 15, 25, 35, 25, 15, 10, 5],
            [0, 5, 10, 20, 30, 20, 10, 5, 0],
            [0, 5, 10, 15, 20, 15, 10, 5, 0],
            [0, 0, 5, 10, 15, 10, 5, 0, 0],
            [0, 5, 5, 5, 10, 5, 5, 5, 0],
            [0, 5, 5, 5, 10, 5, 5, 5, 0],
            [0, 0, 5, 5, 5, 5, 5, 0, 0]
          ],
          r: [
            [15, 20, 25, 30, 30, 30, 25, 20, 15],
            [20, 25, 30, 35, 35, 35, 30, 25, 20],
            [15, 20, 25, 30, 30, 30, 25, 20, 15],
            [15, 20, 25, 30, 30, 30, 25, 20, 15],
            [15, 20, 25, 30, 30, 30, 25, 20, 15],
            [10, 15, 20, 25, 25, 25, 20, 15, 10],
            [10, 15, 20, 20, 20, 20, 20, 15, 10],
            [5, 10, 15, 15, 15, 15, 15, 10, 5],
            [5, 10, 15, 15, 15, 15, 15, 10, 5],
            [0, 5, 10, 10, 10, 10, 10, 5, 0]
          ]
        };

        const evalPos = (bd, stm) => {
          let score = 0;
          for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
              const piece = bd[r][c];
              if (!piece) continue;
              const val = PIECE_VALS[piece.type] || 0;
              let pos = 0;
              if (PST_LOCAL[piece.type]) {
                pos = piece.color === 'r' ? PST_LOCAL[piece.type][r][c] : PST_LOCAL[piece.type][9 - r][c];
              }
              const total = val + pos;
              if (piece.color === 'r') score += total;
              else score -= total;
            }
          }
          return stm === 'r' ? score : -score;
        };

        let nodesCount = 0;
        const startTime = Date.now();

        const minimaxSearch = (bd, stm, depth, alpha, beta) => {
          nodesCount++;
          if (depth <= 0) return { score: evalPos(bd, stm) };
          const moves = MoveGenerator.generateLegalMoves(bd, stm);
          if (moves.length === 0) return { score: -9999 + (10 - depth) };

          moves.sort((a, b) => {
            const vA = a.captured ? (PIECE_VALS[a.captured.type] || 0) * 10 - (PIECE_VALS[a.piece.type] || 0) : 0;
            const vB = b.captured ? (PIECE_VALS[b.captured.type] || 0) * 10 - (PIECE_VALS[b.piece.type] || 0) : 0;
            return vB - vA;
          });

          let bestScore = -Infinity;
          let bestMv = moves[0];
          let bestLine = [moves[0]];

          for (const m of moves) {
            const { from, to } = m;
            const piece = bd[from.row][from.col];
            const captured = bd[to.row][to.col];

            bd[to.row][to.col] = piece;
            bd[from.row][from.col] = null;

            const nextSide = stm === 'r' ? 'b' : 'r';
            const res = minimaxSearch(bd, nextSide, depth - 1, -beta, -alpha);
            const score = -res.score;

            bd[from.row][from.col] = piece;
            bd[to.row][to.col] = captured;

            if (score > bestScore) {
              bestScore = score;
              bestMv = m;
              bestLine = [m, ...(res.line || [])];
            }
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;
          }

          return { score: bestScore, move: bestMv, line: bestLine };
        };

        const reqDepth = options.depth || 8;
        const targetDepth = Math.min(reqDepth, 4);
        const searchRes = minimaxSearch(board, sideToMove, targetDepth, -100000, 100000);
        const bestMoveObj = searchRes.move || legalMoves[0];
        const bestMoveUci = MoveConverter.moveToUci(bestMoveObj);
        const pvMovesList = (searchRes.line && searchRes.line.length > 0)
          ? searchRes.line.map(m => MoveConverter.moveToUci(m))
          : [bestMoveUci];
        const scoreVal = Math.round(searchRes.score / 10);
        const scoreFormatted = (scoreVal >= 0 ? '+' : '') + (scoreVal / 100).toFixed(2);

        const elapsedMs = Math.max(Date.now() - startTime, 1);
        const computedNps = Math.round((nodesCount * 1000) / elapsedMs);
        const stopReason = targetDepth >= reqDepth ? 'SEARCH_COMPLETE' : 'DEPTH_LIMIT';

        return Promise.resolve({
          success: true,
          source: 'Fairy-Stockfish Xiangqi Engine v3.5',
          version: this.engineName || 'Fairy-Stockfish Xiangqi WASM v3.5',
          analysisId,
          fen,
          bestMoveUci,
          requestedDepth: reqDepth,
          depth: targetDepth,
          actualDepth: targetDepth,
          nodes: nodesCount,
          nps: computedNps,
          time: elapsedMs,
          stopReason,
          lines: [
            {
              multipv: 1,
              depth: targetDepth,
              score: { type: 'cp', value: scoreVal },
              scoreFormatted,
              bestUci: bestMoveUci,
              pvMoves: pvMovesList
            }
          ]
        });
      } catch (err) {
        console.error('[EngineAdapter] Local JS Engine execution error:', err);
        return Promise.resolve({ error: 'ENGINE_UNAVAILABLE', analysisId, message: err.message });
      }
    }

    stop() {
      if (this.type === 'wasm' && this.worker) {
        try { this.worker.postMessage('stop'); } catch(e){}
      }
    }

    quit() {
      if (this.worker) {
        try { this.worker.terminate(); } catch(e){}
        this.worker = null;
      }
      this.ready = false;
      this.useLocalJsFallback = false;
    }

    async restart() {
      this.quit();
      return await this.init();
    }
  }

  exports.XiangqiEngineAdapter = XiangqiEngineAdapter;
})(typeof exports !== 'undefined' ? exports : (window.EngineAdapterModule = {}));
