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
  /stockfish\s*(10|9|8|7|6|5|4|3|2|1)\b/i,
  /stockfish\s*10\./i
];

export function isEngineVersionAllowed(versionName) {
  if (!versionName || typeof versionName !== 'string') return false;
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
    this.engineVersion = 'Stockfish 18 WASM SIMD';
    this.latestDepth = 0;
    this.latestNodes = 0;
    this.latestNps = 0;
  }

  async init() {
    return new Promise((resolve) => {
      try {
        if (this.worker) {
          this.worker.terminate();
        }

        this.worker = new Worker('js/chess-battle/stockfish-worker.js');
        this.isReady = false;

        const initTimeout = setTimeout(() => {
          console.warn('Stockfish 18 WASM init timeout');
          this.isReady = false;
          resolve(false);
        }, 6000);

        const handleInitMessage = (e) => {
          const data = e.data || {};
          if (data.type === 'ready') {
            const ver = data.version || 'Stockfish 18 WASM SIMD';
            if (!isEngineVersionAllowed(ver)) {
              console.error('[VERSION GATING REJECTED ADAPTER]:', ver);
              clearTimeout(initTimeout);
              this.isReady = false;
              this.worker.terminate();
              this.worker = null;
              return resolve(false);
            }

            this.engineVersion = ver;
            this.isReady = true;
            clearTimeout(initTimeout);
            this.worker.removeEventListener('message', handleInitMessage);
            resolve(true);
          } else if (data.type === 'error' && data.error === 'ENGINE_REJECTED') {
            clearTimeout(initTimeout);
            this.isReady = false;
            resolve(false);
          }
        };

        this.worker.addEventListener('message', handleInitMessage);
        this.worker.postMessage({ command: 'init' });

      } catch (err) {
        console.error('Stockfish 18 WASM Worker Init Error:', err);
        this.isReady = false;
        resolve(false);
      }
    });
  }

  stop() {
    if (this.worker && this.isReady) {
      try {
        this.worker.postMessage({ command: 'stop' });
      } catch (e) {}
      this.isAnalyzing = false;
    }
  }

  async analyze(fen, config = {}, analysisId, onProgress = null) {
    if (!this.isReady || !this.worker) {
      console.log('[StockfishWasmEngine] Worker not ready yet, auto-initializing...');
      const ok = await this.init();
      if (!ok || !this.isReady || !this.worker) {
        return {
          error: 'ENGINE_UNAVAILABLE',
          analysisId,
          message: 'Stockfish 18 WASM Worker is not ready'
        };
      }
    }


    // Hard Version Gating Check before Analysis
    if (!isEngineVersionAllowed(this.engineVersion)) {
      return {
        error: 'ENGINE_UNAVAILABLE',
        analysisId,
        message: `Stockfish WASM version rejected by policy: ${this.engineVersion}`
      };
    }

    return new Promise((resolve) => {
      this.isAnalyzing = true;
      this.currentAnalysisId = analysisId;

      const depth = config.Depth || config.depth || 20;
      const time = config.MoveTime || config.time || 3000;
      const multiPV = config.MultiPV || config.multiPV || 1;

      // Smart Timeout Calculation
      let timeoutMs = time + 5000;
      if (config.preset === 'MAXIMUM') {
        if (time >= 60000) timeoutMs = 75000;
        else if (time >= 30000) timeoutMs = 40000;
        else if (time >= 10000) timeoutMs = 15000;
      }

      const timeoutTimer = setTimeout(() => {
        if (this.currentAnalysisId === analysisId && this.isAnalyzing) {
          this.stop();
          resolve({
            error: 'ENGINE_TIMEOUT',
            analysisId,
            message: 'Stockfish 18 WASM analysis timed out'
          });
        }
      }, timeoutMs);

      const handleAnalysisMessage = (e) => {
        const data = e.data || {};
        if (data.analysisId && data.analysisId !== analysisId) {
          return; // Ignore stale worker messages
        }

        if (data.type === 'progress') {
          if (typeof onProgress === 'function') {
            onProgress(data);
          }
        } else if (data.type === 'complete') {
          clearTimeout(timeoutTimer);
          this.isAnalyzing = false;
          this.worker.removeEventListener('message', handleAnalysisMessage);
          resolve({
            ...data,
            version: this.engineVersion,
            source: `Local ${this.engineVersion}`
          });
        } else if (data.type === 'error') {
          clearTimeout(timeoutTimer);
          this.isAnalyzing = false;
          this.worker.removeEventListener('message', handleAnalysisMessage);
          resolve({
            error: data.error || 'ENGINE_UNAVAILABLE',
            analysisId,
            message: data.message || 'WASM Engine error'
          });
        }
      };

      this.worker.addEventListener('message', handleAnalysisMessage);
      this.worker.postMessage({
        command: 'analyze',
        fen,
        depth,
        time,
        multiPV,
        threads: config.Threads || 8,
        hash: config.Hash || 256,
        analysisId
      });
    });
  }

  destroy() {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
  }
}
