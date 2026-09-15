/**
 * Xiangqi Playstyle Layer
 * Integrates Engine Candidate Selection, Opening Diversity, and Tactical Opportunity Detection.
 * STRICT LAWS:
 * 1. Forced Mates detected by Stockfish take 100% PRIORITY. Playstyle MUST NOT override forced mate.
 * 2. Playstyle candidate MUST be present in actual Stockfish MultiPV lines.
 * 3. Evaluation CP Gap MUST be within allowed threshold (max 25 cp). Otherwise REVERT to Stockfish #1.
 * 4. NEVER invents or creates moves.
 */

(function(exports) {
  'use strict';

  const OpeningDiversityManager = typeof require !== 'undefined'
    ? require('./opening-diversity-manager.js').OpeningDiversityManager
    : (window.OpeningDiversityModule ? window.OpeningDiversityModule.OpeningDiversityManager : null);

  const TacticalOpportunityDetector = typeof require !== 'undefined'
    ? require('./tactical-detector.js').TacticalOpportunityDetector
    : (window.TacticalDetectorModule ? window.TacticalDetectorModule.TacticalOpportunityDetector : null);

  const CoordinateMapper = typeof require !== 'undefined'
    ? require('./coordinate-mapper.js').CoordinateMapper
    : (typeof window !== 'undefined' && window.CoordinateMapperModule ? window.CoordinateMapperModule.CoordinateMapper : null);

  class XiangqiPlaystyleLayer {
    constructor(style = 'NATURAL', openingMode = 'BALANCED') {
      this.setStyle(style);
      this.openingManager = OpeningDiversityManager ? new OpeningDiversityManager(openingMode) : null;
      this.tacticalDetector = TacticalOpportunityDetector ? new TacticalOpportunityDetector() : null;
      this.MAX_CP_GAP = 35;
    }

    setStyle(style) {
      if (!style) {
        this.style = 'NATURAL';
        return;
      }
      const s = String(style).toUpperCase();
      if (s === 'AGGRESSIVE' || s === 'ATTACK') this.style = 'ATTACK';
      else if (s === 'DEFENSE' || s === 'SOLID') this.style = 'DEFENSE';
      else if (s === 'AUTO' || s === 'DYNAMIC') this.style = 'AUTO';
      else if (s === 'TACTICAL') this.style = 'TACTICAL';
      else this.style = 'NATURAL';
    }

    setOpeningMode(mode) {
      if (this.openingManager) {
        this.openingManager.setMode(mode);
      }
    }

    selectBestMove(engineResult, gameState) {
      if (!engineResult || engineResult.error || !engineResult.bestMoveUci) {
        return {
          selectedUci: null,
          objectiveBestmove: null,
          playstyleCandidate: null,
          evaluationGap: 0,
          tacticalScore: 0,
          reason: 'Engine output invalid or unavailable'
        };
      }

      const lines = engineResult.lines || [];
      const objectiveBestmove = engineResult.bestMoveUci || (lines[0] ? lines[0].bestUci : null);

      if (lines.length === 0 || !objectiveBestmove) {
        return {
          selectedUci: objectiveBestmove,
          objectiveBestmove,
          playstyleCandidate: objectiveBestmove,
          evaluationGap: 0,
          tacticalScore: 0,
          reason: 'Only single bestmove available from engine'
        };
      }

      const candidate1 = lines[0];

      // -------------------------------------------------------------------------
      // 1. ABSOLUTE PRIORITY: FORCED MATE DETECTION
      // -------------------------------------------------------------------------
      if (this.tacticalDetector) {
        const tacAnalysis = this.tacticalDetector.analyzeResult(engineResult, gameState);
        if (tacAnalysis.hasForcedMate && tacAnalysis.mateCandidateUci) {
          return {
            selectedUci: tacAnalysis.mateCandidateUci,
            objectiveBestmove,
            playstyleCandidate: tacAnalysis.mateCandidateUci,
            evaluationGap: 0,
            tacticalScore: tacAnalysis.tacticalScore,
            reason: `FORCED MATE (Mate in ${tacAnalysis.forcedMatePly}): Priority 1 Enforced`
          };
        }
      }

      // If candidate #1 reports mate
      if (candidate1.score && candidate1.score.type === 'mate') {
        return {
          selectedUci: candidate1.bestUci,
          objectiveBestmove,
          playstyleCandidate: candidate1.bestUci,
          evaluationGap: 0,
          tacticalScore: 10000,
          reason: 'FORCED MATE in Candidate #1: Priority 1 Enforced'
        };
      }

      // -------------------------------------------------------------------------
      // 2. NATURAL MODE: Always Stockfish #1
      // -------------------------------------------------------------------------
      if (this.style === 'NATURAL') {
        return {
          selectedUci: candidate1.bestUci,
          objectiveBestmove,
          playstyleCandidate: candidate1.bestUci,
          evaluationGap: 0,
          tacticalScore: 0,
          reason: 'NATURAL mode: Objective Stockfish #1'
        };
      }

      // -------------------------------------------------------------------------
      // 3. OPENING DIVERSITY LAYER (in opening phase)
      // -------------------------------------------------------------------------
      if (this.openingManager && gameState && gameState.plyCount <= 12) {
        const openingRes = this.openingManager.selectOpeningCandidate(engineResult, gameState);
        if (openingRes && openingRes.isDiversified && openingRes.bestUci) {
          return {
            selectedUci: openingRes.bestUci,
            objectiveBestmove,
            playstyleCandidate: openingRes.bestUci,
            evaluationGap: openingRes.cpGap,
            tacticalScore: 0,
            reason: openingRes.reason
          };
        }
      }

      // Determine active playstyle mode
      let activeStyle = this.style;
      if (activeStyle === 'AUTO') {
        activeStyle = this.determineAutoPlaystyle(gameState, engineResult);
      }

      const topScoreVal = candidate1.score ? candidate1.score.value : 0;

      // Filter eligible MultiPV candidates within MAX_CP_GAP threshold (25 cp)
      const eligibleCandidates = lines.filter(c => {
        if (!c.score || c.score.type !== 'cp') return false;
        return Math.abs(topScoreVal - c.score.value) <= this.MAX_CP_GAP;
      });

      if (eligibleCandidates.length <= 1) {
        return {
          selectedUci: candidate1.bestUci,
          objectiveBestmove,
          playstyleCandidate: candidate1.bestUci,
          evaluationGap: 0,
          tacticalScore: 0,
          reason: 'No additional candidates within evaluation gap threshold'
        };
      }

      // -------------------------------------------------------------------------
      // 4. ATTACK / DEFENSE PLAYSTYLE SELECTION WITHIN THRESHOLD
      // -------------------------------------------------------------------------
      let selectedCandidate = candidate1;

      if (activeStyle === 'ATTACK') {
        // ATTACK: Prefer forward advancing or aggressive moves
        const aggressiveCandidate = eligibleCandidates.find(c => {
          const uci = c.bestUci;
          if (!uci || uci.length < 4) return false;
          const fromRow = 9 - parseInt(uci.charAt(1), 10);
          const toRow = 9 - parseInt(uci.charAt(3), 10);
          return gameState.sideToMove === 'r' ? toRow < fromRow : toRow > fromRow;
        });

        if (aggressiveCandidate) {
          selectedCandidate = aggressiveCandidate;
        }
      } else if (activeStyle === 'TACTICAL') {
        // TACTICAL: Prefer captures or sharp forward moves
        const tacticalCandidate = eligibleCandidates.find(c => {
          const uci = c.bestUci;
          if (!uci || uci.length < 4) return false;
          if (CoordinateMapper) {
            const mObj = CoordinateMapper.engineToBoardMove(uci);
            if (mObj && gameState && gameState.getPieceAt) {
              const target = gameState.getPieceAt(mObj.to.col, mObj.to.row);
              if (target) return true; // Piece capture
            }
          }
          const fromRow = 9 - parseInt(uci.charAt(1), 10);
          const toRow = 9 - parseInt(uci.charAt(3), 10);
          return gameState.sideToMove === 'r' ? toRow < fromRow : toRow > fromRow;
        });

        if (tacticalCandidate) {
          selectedCandidate = tacticalCandidate;
        }
      } else if (activeStyle === 'DEFENSE') {
        // DEFENSE: Prefer solid / defensive moves
        const solidCandidate = eligibleCandidates.find(c => {
          const uci = c.bestUci;
          if (!uci || uci.length < 4) return false;
          const fromRow = 9 - parseInt(uci.charAt(1), 10);
          const toRow = 9 - parseInt(uci.charAt(3), 10);
          return gameState.sideToMove === 'r' ? toRow >= fromRow : toRow <= fromRow;
        });

        if (solidCandidate) {
          selectedCandidate = solidCandidate;
        }
      }

      const gap = Math.abs(topScoreVal - (selectedCandidate.score ? selectedCandidate.score.value : 0));

      // Threshold Safety Check: If gap > MAX_CP_GAP, REVERT to Stockfish #1
      if (gap > this.MAX_CP_GAP) {
        return {
          selectedUci: candidate1.bestUci,
          objectiveBestmove,
          playstyleCandidate: candidate1.bestUci,
          evaluationGap: 0,
          tacticalScore: 0,
          reason: `Candidate gap (${gap}cp) exceeded threshold (${this.MAX_CP_GAP}cp): Reverted to Stockfish #1`
        };
      }

      return {
        selectedUci: selectedCandidate.bestUci,
        objectiveBestmove,
        playstyleCandidate: selectedCandidate.bestUci,
        evaluationGap: gap,
        tacticalScore: 0,
        reason: `${activeStyle} playstyle candidate selected (Gap: ${gap}cp)`
      };
    }

    determineAutoPlaystyle(gameState, engineResult) {
      if (gameState && gameState.checkState && gameState.checkState.isCheck) {
        return 'DEFENSE'; // Under check -> Defense
      }

      const topCandidate = (engineResult && engineResult.lines && engineResult.lines[0]) || null;
      if (topCandidate && topCandidate.score && topCandidate.score.type === 'cp') {
        if (topCandidate.score.value >= 150) {
          return 'ATTACK'; // Large advantage -> Attack
        } else if (topCandidate.score.value <= -150) {
          return 'DEFENSE'; // Disadvantage -> Defense
        }
      }

      return 'NATURAL';
    }
  }

  exports.XiangqiPlaystyleLayer = XiangqiPlaystyleLayer;
})(typeof exports !== 'undefined' ? exports : (window.PlaystyleLayerModule = {}));
