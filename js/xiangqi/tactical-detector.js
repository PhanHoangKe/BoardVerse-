/**
 * Xiangqi Tactical Opportunity Detector
 * Analyzes Stockfish MultiPV search lines for forced mates, tactical sacrifices, checks, captures, and threats.
 * ABSOLUTE RULE: Forced Mates detected by Stockfish take 100% priority. Never invent tactical moves without Stockfish evaluation support.
 */

(function(exports) {
  'use strict';

  class TacticalOpportunityDetector {
    analyzeResult(engineResult, gameState) {
      if (!engineResult || engineResult.error || !engineResult.lines || engineResult.lines.length === 0) {
        return {
          hasForcedMate: false,
          forcedMatePly: null,
          mateCandidateUci: null,
          tacticalOpportunities: [],
          tacticalScore: 0
        };
      }

      const lines = engineResult.lines;
      let hasForcedMate = false;
      let forcedMatePly = null;
      let mateCandidateUci = null;
      const tacticalOpportunities = [];

      // Check for forced mate in top lines
      for (const line of lines) {
        if (line.score && line.score.type === 'mate') {
          const val = line.score.value;
          if (val > 0) { // Positive mate score means current side can deliver mate
            if (!hasForcedMate || val < forcedMatePly) { // Prefer faster mate
              hasForcedMate = true;
              forcedMatePly = val;
              mateCandidateUci = line.bestUci;
            }
          }
        }
      }

      // Analyze tactical features of candidates
      lines.forEach((line, index) => {
        const uci = line.bestUci;
        if (!uci) return;

        let score = 0;
        const features = [];

        // CP value bonus
        if (line.score && line.score.type === 'cp') {
          score += Math.max(0, line.score.value);
        } else if (line.score && line.score.type === 'mate' && line.score.value > 0) {
          score += 10000 - line.score.value * 100;
          features.push(`Mate in ${line.score.value}`);
        }

        // Depth bonus
        score += (line.depth || 0) * 2;

        tacticalOpportunities.push({
          rank: index + 1,
          uci,
          score,
          features,
          line
        });
      });

      // Sort opportunities by tactical score descending
      tacticalOpportunities.sort((a, b) => b.score - a.score);

      const topTactical = tacticalOpportunities[0] || null;

      return {
        hasForcedMate,
        forcedMatePly,
        mateCandidateUci,
        tacticalOpportunities,
        tacticalScore: topTactical ? topTactical.score : 0,
        topCandidateUci: topTactical ? topTactical.uci : null
      };
    }
  }

  exports.TacticalOpportunityDetector = TacticalOpportunityDetector;
})(typeof exports !== 'undefined' ? exports : (window.TacticalDetectorModule = {}));
