/**
 * Xiangqi Opening Diversity Manager
 * Controls opening repertoire diversification from Stockfish MultiPV lines.
 * STRICT LAW: Never invents moves. Only picks legal moves from actual Stockfish MultiPV lines within strict CP evaluation gap thresholds.
 */

(function(exports) {
  'use strict';

  class OpeningDiversityManager {
    constructor(mode = 'BALANCED') {
      this.mode = mode; // 'OFF', 'BALANCED', 'DIVERSE'
    }

    setMode(mode) {
      this.mode = mode || 'BALANCED';
    }

    selectOpeningCandidate(engineResult, gameState) {
      if (!engineResult || engineResult.error || !engineResult.lines || engineResult.lines.length === 0) {
        return null;
      }

      const lines = engineResult.lines;
      const candidate1 = lines[0];

      // OFF mode or not in opening phase (plyCount > 12) -> return Stockfish #1
      if (this.mode === 'OFF' || (gameState && gameState.plyCount > 12) || lines.length === 1) {
        return {
          bestUci: candidate1.bestUci,
          isDiversified: false,
          cpGap: 0,
          reason: 'Default Stockfish #1 (Opening Diversity OFF or non-opening)'
        };
      }

      // Max allowed CP evaluation gap based on mode
      const maxGap = this.mode === 'BALANCED' ? 10 : 25;
      const topScore = candidate1.score ? candidate1.score.value : 0;

      // Filter candidates within CP gap threshold
      const validCandidates = lines.filter(line => {
        if (!line.score || line.score.type !== 'cp') return false;
        return Math.abs(topScore - line.score.value) <= maxGap;
      });

      if (validCandidates.length <= 1) {
        return {
          bestUci: candidate1.bestUci,
          isDiversified: false,
          cpGap: 0,
          reason: 'No additional candidates within evaluation gap'
        };
      }

      // Deterministic selection based on gameId & plyCount to allow reproducible testing
      const seedStr = (gameState && gameState.gameId ? gameState.gameId : 'game') + `_ply_${gameState ? gameState.plyCount : 0}`;
      let hash = 0;
      for (let i = 0; i < seedStr.length; i++) {
        hash = (hash << 5) - hash + seedStr.charCodeAt(i);
        hash |= 0;
      }
      const pickedIndex = Math.abs(hash) % validCandidates.length;
      const selected = validCandidates[pickedIndex];
      const gap = Math.abs(topScore - (selected.score ? selected.score.value : 0));

      return {
        bestUci: selected.bestUci,
        isDiversified: pickedIndex > 0,
        cpGap: gap,
        reason: pickedIndex > 0
          ? `Opening Diversity (${this.mode}): selected candidate #${pickedIndex + 1} with ${gap}cp gap`
          : `Opening Diversity (${this.mode}): selected candidate #1`
      };
    }
  }

  exports.OpeningDiversityManager = OpeningDiversityManager;
})(typeof exports !== 'undefined' ? exports : (window.OpeningDiversityModule = {}));
