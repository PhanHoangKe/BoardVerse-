/**
 * Xiangqi Analysis Manager
 * Coordinates background engine analysis, MultiPV tracking, and strict UUID analysisId synchronization.
 * Prevents race conditions and stale engine move pollution.
 */

(function(exports) {
  'use strict';

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'ana_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  class XiangqiAnalysisManager {
    constructor(engineManager) {
      this.engineManager = engineManager;
      this.currentAnalysisId = null;
      this.latestAnalysisResult = null;
      this.isAnalyzing = false;
      this.listeners = [];
    }

    addListener(fn) {
      if (typeof fn === 'function') {
        this.listeners.push(fn);
      }
    }

    notifyListeners(result) {
      for (const fn of this.listeners) {
        try { fn(result); } catch (e) {}
      }
    }

    startAnalysis(fen, options = {}) {
      const analysisId = generateUUID();
      this.currentAnalysisId = analysisId;
      this.isAnalyzing = true;

      const fullOptions = {
        ...options,
        analysisId
      };

      this.engineManager.getBestMove(fen, fullOptions).then((result) => {
        // STRICT SYNCHRONIZATION CHECK:
        // Discard stale analysis results from previous turns/positions!
        if (!result || result.analysisId !== this.currentAnalysisId) {
          console.log(`[AnalysisManager] Discarded stale result (Expected ${this.currentAnalysisId}, got ${result ? result.analysisId : 'null'})`);
          return;
        }

        this.isAnalyzing = false;
        this.latestAnalysisResult = result;
        this.notifyListeners(result);
      }).catch((err) => {
        if (analysisId !== this.currentAnalysisId) return;

        this.isAnalyzing = false;
        const errResult = {
          error: 'ENGINE_UNAVAILABLE',
          analysisId,
          message: err.message || 'Engine analysis failed'
        };
        this.latestAnalysisResult = errResult;
        this.notifyListeners(errResult);
      });

      return analysisId;
    }

    cancelAnalysis() {
      this.currentAnalysisId = null;
      this.isAnalyzing = false;
      if (this.engineManager && this.engineManager.activeAdapterType) {
        const adapter = this.engineManager.adapters[this.engineManager.activeAdapterType];
        if (adapter && typeof adapter.stop === 'function') {
          adapter.stop();
        }
      }
    }
  }

  exports.XiangqiAnalysisManager = XiangqiAnalysisManager;
})(typeof exports !== 'undefined' ? exports : (window.AnalysisManagerModule = {}));
