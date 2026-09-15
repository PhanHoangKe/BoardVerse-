/**
 * Adaptive Time Manager (ATM) for Xiangqi
 * Dynamic search time & depth allocation based on position volatility, MultiPV evaluation gaps, and forced mate detection.
 * STRICT LAW: ATM ONLY decides search time and early exit. ATM MUST NOT decide moves, modify evaluations, or use heuristics as evaluators.
 */

(function(exports) {
  'use strict';

  const TIME_PRESETS = {
    QUICK: { maxTime: 1000, depth: 14, multiPV: 1, minTime: 300 },
    BLITZ_5M: { maxTime: 3000, depth: 18, multiPV: 1, minTime: 800 },
    HUMAN_GM: { maxTime: 4500, depth: 20, multiPV: 2, minTime: 1200 },
    STRONG: { maxTime: 4500, depth: 20, multiPV: 2, minTime: 1200 },
    DEEP: { maxTime: 7500, depth: 26, multiPV: 3, minTime: 2000 },
    MAXIMUM: { maxTime: 12000, depth: 36, multiPV: 1, minTime: 3000 }
  };

  class AdaptiveTimeManager {
    constructor(preset = 'STRONG') {
      this.setPreset(preset);
      this.stabilityIndex = 0;
      this.moveChangeCount = 0;
      this.lastBestMove = '';
      this.lastExitReason = 'Full Search Completed';
    }

    setPreset(preset) {
      this.preset = TIME_PRESETS[preset] ? preset : 'STRONG';
      this.config = { ...TIME_PRESETS[this.preset] };
    }

    getConfig(gameState, overridePreset = null) {
      const presetKey = (overridePreset && TIME_PRESETS[overridePreset]) ? overridePreset : (this.preset || 'STRONG');
      const baseConfig = { ...(TIME_PRESETS[presetKey] || this.config) };

      if (!gameState) return baseConfig;

      // Adjust thinking time dynamically if position is in check or tactical
      const inCheck = gameState.checkState && gameState.checkState.isCheck;
      if (inCheck) {
        baseConfig.maxTime = Math.round(baseConfig.maxTime * 1.25);
      }

      return baseConfig;
    }

    processIteration(info) {
      if (!info) return;

      if (info.bestUci && info.bestUci !== this.lastBestMove) {
        this.moveChangeCount++;
        this.lastBestMove = info.bestUci;
        this.stabilityIndex = 0;
      } else {
        this.stabilityIndex++;
      }
    }

    evaluateEarlyExit(elapsedTime, maxTime, minTime = 800, inTactical = false) {
      // In MAXIMUM or DEEP mode, disable premature early exit
      if (this.preset === 'MAXIMUM') {
        this.lastExitReason = 'MAXIMUM Mode: Full Depth Target Enforced';
        return { shouldStop: false, reason: this.lastExitReason };
      }

      const effectiveMinTime = Math.max(minTime, this.config.minTime || 800);
      if (elapsedTime < effectiveMinTime) {
        this.lastExitReason = 'Minimum Search Time Not Met';
        return { shouldStop: false, reason: this.lastExitReason };
      }

      if (inTactical) {
        this.lastExitReason = 'Tactical Position: Extended Search Required';
        return { shouldStop: false, reason: this.lastExitReason };
      }

      if (this.stabilityIndex >= 5 && elapsedTime >= Math.round(maxTime * 0.5)) {
        this.lastExitReason = 'High Bestmove Stability Index Early Exit';
        return { shouldStop: true, reason: this.lastExitReason };
      }

      this.lastExitReason = 'Standard Search Completed';
      return { shouldStop: false, reason: 'Searching...' };
    }
  }

  exports.AdaptiveTimeManager = AdaptiveTimeManager;
})(typeof exports !== 'undefined' ? exports : (window.AdaptiveTimeManagerModule = {}));
