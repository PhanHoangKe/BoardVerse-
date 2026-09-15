/**
 * Tactical Trap Detector & Double-Verification Engine for Chess Battle Assistant
 * Detects tactical opportunities, mating nets, forks, pins, discovered attacks, and sacrifices.
 * Performs Double-Verification against Opponent's Best Defense to reject refuted tactics.
 */

import { TacticalSearchLayer } from './tactical-search-layer.js';

export class TacticalTrapDetector {
  constructor() {
    this.tacticalSearch = new TacticalSearchLayer();
  }

  /**
   * Classifies a Stockfish candidate line into tactical patterns.
   */
  classifyLine(chessInstance, candidateLine) {
    return this.tacticalSearch.classifyCandidate(chessInstance, candidateLine);
  }

  /**
   * Performs Double-Verification for a candidate move against opponent's best response.
   */
  verifyCandidate(chessInstance, candidateLine, topScore, maxAllowedGapCp = 25) {
    return this.tacticalSearch.verifyCandidate(chessInstance, candidateLine, topScore, maxAllowedGapCp);
  }

  /**
   * Scans all MultiPV lines to detect tactical trap opportunities.
   * 
   * @param {Object} chessInstance - Chess.js game instance
   * @param {Array} stockfishLines - Stockfish MultiPV lines
   * @param {Number} maxAllowedGapCp - Maximum allowed evaluation gap limit
   * @returns {Object} Tactical opportunities summary & verified tactical candidates
   */
  detectTacticalOpportunities(chessInstance, stockfishLines, maxAllowedGapCp = 25) {
    if (!stockfishLines || stockfishLines.length === 0) {
      return {
        hasOpportunity: false,
        opportunityType: 'NONE',
        verifiedCandidates: []
      };
    }

    const topScore = stockfishLines[0].rawScore || stockfishLines[0].score || { type: 'cp', value: 0 };
    const verifiedCandidates = [];
    let hasOpportunity = false;
    let primaryOpportunityType = 'NONE';

    for (let idx = 0; idx < stockfishLines.length; idx++) {
      const line = stockfishLines[idx];
      const classification = this.classifyLine(chessInstance, line);
      const verification = this.verifyCandidate(chessInstance, line, topScore, maxAllowedGapCp);

      if (verification.verified && classification.primaryType !== 'NORMAL') {
        hasOpportunity = true;
        if (primaryOpportunityType === 'NONE' || classification.primaryType === 'FORCED_MATE') {
          primaryOpportunityType = classification.primaryType;
        }

        verifiedCandidates.push({
          line,
          idx,
          classification,
          verification
        });
      }
    }

    return {
      hasOpportunity,
      opportunityType: primaryOpportunityType,
      verifiedCandidates
    };
  }
}
