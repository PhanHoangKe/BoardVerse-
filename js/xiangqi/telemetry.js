/**
 * Xiangqi Telemetry Service
 * Monitors performance metrics, engine search statistics, watchdog restarts, and system status.
 */

(function(exports) {
  'use strict';

  class XiangqiTelemetry {
    constructor() {
      this.reset();
    }

    reset() {
      this.metrics = {
        totalEngineCalls: 0,
        totalAnalysisTimeMs: 0,
        avgResponseTimeMs: 0,
        lastDepth: 0,
        lastNodes: 0,
        lastNps: 0,
        watchdogRestarts: 0,
        engineErrors: 0,
        activeEngineSource: 'Initializing...',
        history: []
      };
    }

    recordAnalysis(result) {
      if (!result) return;
      this.metrics.totalEngineCalls++;

      if (result.error) {
        this.metrics.engineErrors++;
        return;
      }

      const time = result.time || 0;
      this.metrics.totalAnalysisTimeMs += time;
      this.metrics.avgResponseTimeMs = Math.round(this.metrics.totalAnalysisTimeMs / Math.max(1, this.metrics.totalEngineCalls));

      this.metrics.lastDepth = result.depth || 0;
      this.metrics.lastNodes = result.nodes || 0;
      this.metrics.lastNps = result.nps || 0;
      this.metrics.activeEngineSource = result.source || result.version || 'Unknown Engine';

      this.metrics.history.push({
        timestamp: Date.now(),
        bestMove: result.bestMoveUci,
        depth: result.depth,
        timeMs: time,
        nps: result.nps
      });

      if (this.metrics.history.length > 50) {
        this.metrics.history.shift();
      }
    }

    recordWatchdogRestart() {
      this.metrics.watchdogRestarts++;
    }

    getSummary() {
      return { ...this.metrics };
    }
  }

  exports.XiangqiTelemetry = XiangqiTelemetry;
})(typeof exports !== 'undefined' ? exports : (window.TelemetryModule = {}));
