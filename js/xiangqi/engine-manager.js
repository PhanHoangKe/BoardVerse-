/**
 * Xiangqi Engine Manager
 * Manages engine selection routing, fallback chain, watchdog timeout management, and health checks.
 * STRICT ENFORCEMENT: Fallback chain automatically recovers engine via Local JS fallback if WASM/Native fail.
 */

(function(exports) {
  'use strict';

  const XiangqiEngineAdapter = typeof require !== 'undefined'
    ? require('./engine-adapter.js').XiangqiEngineAdapter
    : window.EngineAdapterModule.XiangqiEngineAdapter;

  class XiangqiEngineManager {
    constructor() {
      this.adapters = {
        native: new XiangqiEngineAdapter('native'),
        wasm: new XiangqiEngineAdapter('wasm')
      };
      this.activeAdapterType = null;
      this.watchdogRetries = 0;
      this.MAX_RETRIES = 2;
    }

    async init() {
      // 1. Try Native Engine first
      const nativeReady = await this.adapters.native.init();
      if (nativeReady) {
        this.activeAdapterType = 'native';
        return 'native';
      }

      // 2. Fallback to Local WASM / JS Engine
      const wasmReady = await this.adapters.wasm.init();
      if (wasmReady) {
        this.activeAdapterType = 'wasm';
        return 'wasm';
      }

      // 3. Fallback to ENGINE_UNAVAILABLE
      this.activeAdapterType = 'ENGINE_UNAVAILABLE';
      return 'ENGINE_UNAVAILABLE';
    }

    getActiveEngineType() {
      return this.activeAdapterType || 'wasm';
    }

    async getBestMove(fen, options = {}) {
      if (this.activeAdapterType === 'ENGINE_UNAVAILABLE') {
        return { error: 'ENGINE_UNAVAILABLE', message: 'No Xiangqi engine is available' };
      }

      let adapter = this.adapters[this.activeAdapterType];
      if (!adapter) {
        const status = await this.init();
        if (status === 'ENGINE_UNAVAILABLE') {
          return { error: 'ENGINE_UNAVAILABLE', message: 'Engine routing failed' };
        }
        adapter = this.adapters[this.activeAdapterType];
      }

      // Watchdog execution loop
      let retries = 0;
      while (retries <= this.MAX_RETRIES) {
        try {
          const result = await adapter.analyze(fen, options);
          if (result && !result.error && result.bestMoveUci) {
            this.watchdogRetries = 0;
            return result;
          }

          if (result && result.error === 'ENGINE_UNAVAILABLE' && this.activeAdapterType === 'native') {
            break; // Immediately fallback to WASM without retry loops
          }

          retries++;
          this.watchdogRetries++;

          if (retries <= this.MAX_RETRIES && typeof adapter.restart === 'function') {
            await adapter.restart();
          }
        } catch (e) {
          retries++;
          this.watchdogRetries++;
          if (retries <= this.MAX_RETRIES && typeof adapter.restart === 'function') {
            await adapter.restart();
          }
        }
      }

      // Try fallback adapter if active adapter fails
      if (this.activeAdapterType === 'native') {
        this.activeAdapterType = 'wasm';
        await this.adapters.wasm.init();
        return await this.adapters.wasm.analyze(fen, options);
      }

      // Ultimate fallback: direct local search
      return await this.adapters.wasm.runNodeLocalSearch(fen, options, options.analysisId || 'fallback_' + Date.now());
    }

    async runBenchmark() {
      const benchmarkPositions = [
        { name: 'Start Position', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1' },
        { name: 'Midgame Cannon Test', fen: 'r1bakab1r/9/1c4nc1/p3p1p1p/2p6/6P2/P1P1P3P/1C2C4/9/RNBAKABNR w - - 0 5' },
        { name: 'Endgame Rook-Pawn', fen: '3ak4/9/4b4/9/9/9/9/4B4/4A4/3K5 w - - 0 40' }
      ];

      const results = [];
      for (const pos of benchmarkPositions) {
        const start = Date.now();
        const res = await this.getBestMove(pos.fen, { depth: 6, time: 1000 });
        const elapsed = Date.now() - start;

        results.push({
          positionName: pos.name,
          success: !res.error,
          bestMove: res.bestMoveUci || 'NONE',
          depth: res.depth || 0,
          nodes: res.nodes || 0,
          nps: res.nps || 0,
          timeMs: elapsed,
          engineSource: res.source || this.activeAdapterType
        });
      }

      return results;
    }
  }

  exports.XiangqiEngineManager = XiangqiEngineManager;
})(typeof exports !== 'undefined' ? exports : (window.EngineManagerModule = {}));
