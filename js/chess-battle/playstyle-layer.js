/**
 * Playstyle Layer & Central Orchestrator for Chess Battle Assistant
 * Integrated with PlaystyleCandidateSelector, TacticalTrapDetector & OpeningDiversityManager
 */

import { PlaystyleCandidateSelector } from './playstyle-candidate-selector.js';

export class PlaystyleLayer {
  constructor(defaultThresholdCp = 25) {
    this.selector = new PlaystyleCandidateSelector(defaultThresholdCp);
  }

  setThresholdCp(cp) {
    this.selector.setThresholdCp(cp);
  }

  startNewGame(seed = null) {
    this.selector.startNewGame(seed);
  }

  /**
   * Evaluates Stockfish MultiPV lines according to requested playstyle.
   * 
   * @param {Object} chessInstance - Chess.js instance
   * @param {Array} stockfishLines - Array of Stockfish candidate lines
   * @param {String} userStyle - 'NATURAL' | 'ATTACK' | 'TACTICAL' | 'MATE_TRAP' | 'DEFENSE' | 'AUTO'
   * @param {Number|null} prevEvalCp - Previous eval score in centipawns
   * @returns {Object} Full Telemetry & Final Selected Move
   */
  selectMove(chessInstance, stockfishLines, userStyle = 'AUTO', prevEvalCp = null) {
    return this.selector.selectBestMove(chessInstance, stockfishLines, userStyle, prevEvalCp);
  }
}
