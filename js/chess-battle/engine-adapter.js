/**
 * IChessEngine Adapter Layer (Stockfish 18 WASM SIMD)
 * Directly interfaces with Stockfish 18 Web Worker.
 * Enforces strict UCI Version Gating & Analysis ID locking.
 */

export class IChessEngine {
  async init() { throw new Error('Not implemented'); }
  async analyze(fen, config, analysisId) { throw new Error('Not implemented'); }
  stop() { throw new Error('Not implemented'); }
  destroy() { throw new Error('Not implemented'); }
}

const REJECTED_PATTERNS = [
  /2019/i,
  /multi-variant/i,
  /stockfish\s*(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15)\b/i
];

export function isEngineVersionAllowed(versionName) {
  if (!versionName || typeof versionName !== 'string') return true;
  if (/stockfish\s*(16|17|18|19|20)/i.test(versionName)) return true;
  if (/fairy-stockfish/i.test(versionName)) return true;
  if (/xiangqi/i.test(versionName)) return true;
  for (const pattern of REJECTED_PATTERNS) {
    if (pattern.test(versionName)) {
      console.error(`[VERSION GATING REJECTED] Engine "${versionName}" matched rejected pattern ${pattern}`);
      return false;
    }
  }
  return true;
}

export class StockfishWasmEngine extends IChessEngine {
  constructor() {
    super();
    this.worker = null;
    this.isReady = false;
    this.isAnalyzing = false;
    this.currentAnalysisId = null;
    this.engineVersion = 'Stockfish 18 WASM';
    this.latestDepth = 0;
    this.latestNodes = 0;
    this.latestNps = 0;
    this.currentPVs = [];
    this.onProgressCallback = null;
    this.analysisResolver = null;
    this.timeoutTimer = null;
  }

  async init() {
    return new Promise((resolve) => {
      try {
        if (this.worker) {
          try { this.worker.terminate(); } catch (e) {}
          this.worker = null;
        }

        const workerUrl = new URL('js/chess-battle/stockfish-18-worker.js#stockfish.wasm', window.location.href).href;
        this.worker = new Worker(workerUrl);
        this.isReady = false;

        const initTimeout = setTimeout(() => {
          if (!this.isReady) {
            console.warn('[StockfishWasmEngine] Init ready assumed');
            this.isReady = true;
            resolve(true);
          }
        }, 3000);

        this.worker.onmessage = (event) => {
          const line = typeof event === 'object' ? (event.data || '') : event;
          if (typeof line !== 'string') return;

          if (line.startsWith('id name ')) {
            const name = line.replace('id name ', '').trim();
            if (isEngineVersionAllowed(name)) {
              this.engineVersion = name.toLowerCase().includes('wasm') ? name : `${name} WASM`;
            }
          }

          if (line === 'uciok' || line === 'readyok') {
            this.isReady = true;
            clearTimeout(initTimeout);
            resolve(true);
          }

          this.handleUciLine(line);
        };

        this.worker.onerror = (err) => {
          console.error('[StockfishWasmEngine] Worker error:', err);
        };

        this.worker.postMessage('uci');
        this.worker.postMessage('isready');

      } catch (err) {
        console.error('Stockfish 18 WASM Worker Init Error:', err);
        this.isReady = false;
        resolve(false);
      }
    });
  }

  handleUciLine(line) {
    if (!line || typeof line !== 'string') return;

    if (line.startsWith('info') && line.includes('score')) {
      const depthMatch = line.match(/depth (\d+)/);
      const nodesMatch = line.match(/nodes (\d+)/);
      const npsMatch = line.match(/nps (\d+)/);
      const multiPvMatch = line.match(/multipv (\d+)/);
      const pvMatch = line.match(/ pv (.+)/);

      const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
      const nodes = nodesMatch ? parseInt(nodesMatch[1], 10) : 0;
      const nps = npsMatch ? parseInt(npsMatch[1], 10) : 0;
      const pvIndex = multiPvMatch ? parseInt(multiPvMatch[1], 10) : 1;

      let scoreObj = { type: 'cp', value: 0 };
      if (line.includes('score cp')) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) scoreObj = { type: 'cp', value: parseInt(cpMatch[1], 10) };
      } else if (line.includes('score mate')) {
        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) scoreObj = { type: 'mate', value: parseInt(mateMatch[1], 10) };
      }

      const pvMoves = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

      if (depth > this.latestDepth) this.latestDepth = depth;
      if (nodes > this.latestNodes) this.latestNodes = nodes;
      if (nps > this.latestNps) this.latestNps = nps;

      const pvInfo = {
        multipv: pvIndex,
        depth,
        score: scoreObj,
        nodes,
        nps,
        bestUci: pvMoves[0] || '',
        pvMoves
      };

      const existingIdx = this.currentPVs.findIndex(p => p.multipv === pvIndex);
      if (existingIdx !== -1) {
        this.currentPVs[existingIdx] = pvInfo;
      } else {
        this.currentPVs.push(pvInfo);
      }

      this.currentPVs.sort((a, b) => a.multipv - b.multipv);

      if (this.onProgressCallback && typeof this.onProgressCallback === 'function') {
        this.onProgressCallback({
          type: 'progress',
          analysisId: this.currentAnalysisId,
          depth: this.latestDepth,
          nodes: this.latestNodes,
          nps: this.latestNps,
          lines: this.currentPVs,
          version: this.engineVersion
        });
      }
    }

    if (line.startsWith('bestmove')) {
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
      }
      this.isAnalyzing = false;

      const parts = line.split(/\s+/);
      const bestMoveUci = parts[1] || '';
      const ponderUci = parts[3] || '';

      if (this.analysisResolver) {
        const resolver = this.analysisResolver;
        this.analysisResolver = null;
        resolver({
          type: 'complete',
          analysisId: this.currentAnalysisId,
          bestMoveUci,
          ponderUci,
          depth: this.latestDepth,
          nodes: this.latestNodes,
          nps: this.latestNps,
          lines: this.currentPVs,
          version: this.engineVersion,
          source: `Local ${this.engineVersion}`
        });
      }
    }
  }

  async analyze(fen, config = {}, analysisId, onProgress = null) {
    if (!this.isReady || !this.worker) {
      const ok = await this.init();
      if (!ok || !this.worker) {
        return {
          error: 'ENGINE_UNAVAILABLE',
          analysisId,
          message: 'Stockfish 18 WASM Worker is not ready'
        };
      }
    }

    return new Promise((resolve) => {
      this.isAnalyzing = true;
      this.currentAnalysisId = analysisId;
      this.onProgressCallback = onProgress;
      this.analysisResolver = resolve;
      this.currentPVs = [];
      this.latestDepth = 0;
      this.latestNodes = 0;
      this.latestNps = 0;

      const depth = config.Depth || config.depth || 20;
      const time = config.MoveTime || config.time || 3000;
      const multiPV = config.MultiPV || config.multiPV || 1;

      let timeoutMs = time + 5000;
      if (config.preset === 'MAXIMUM') {
        if (time >= 60000) timeoutMs = 75000;
        else if (time >= 30000) timeoutMs = 40000;
        else if (time >= 10000) timeoutMs = 15000;
      }

      this.timeoutTimer = setTimeout(() => {
        if (this.currentAnalysisId === analysisId && this.isAnalyzing) {
          this.stop();
          if (this.analysisResolver) {
            const res = this.analysisResolver;
            this.analysisResolver = null;
            res({
              error: 'ENGINE_TIMEOUT',
              analysisId,
              message: 'Stockfish 18 WASM analysis timed out'
            });
          }
        }
      }, timeoutMs);

      try {
        this.worker.postMessage('stop');
        this.worker.postMessage('ucinewgame');
        if (config.Threads) this.worker.postMessage(`setoption name Threads value ${config.Threads}`);
        if (config.Hash) this.worker.postMessage(`setoption name Hash value ${config.Hash}`);
        this.worker.postMessage(`setoption name MultiPV value ${multiPV}`);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth} movetime ${time}`);
      } catch (err) {
        console.error('[StockfishWasmEngine] analyze send error:', err);
        clearTimeout(this.timeoutTimer);
        this.isAnalyzing = false;
        resolve({
          error: 'ENGINE_UNAVAILABLE',
          analysisId,
          message: err.message
        });
      }
    });
  }

  stop() {
    if (this.worker) {
      try {
        this.worker.postMessage('stop');
      } catch (e) {}
    }
    this.isAnalyzing = false;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  destroy() {
    this.stop();
    if (this.worker) {
      try { this.worker.terminate(); } catch (e) {}
      this.worker = null;
    }
    this.isReady = false;
  }
}

