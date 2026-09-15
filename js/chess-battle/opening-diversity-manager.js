/**
 * Opening Diversity Manager for Chess Battle Assistant
 * Prevents opening repetition across games, enforces profile-driven opening selection,
 * and maintains strict evaluation gap constraints (<= 15cp) and Safety Checklist rules.
 * 
 * STRICT INTEGRITY:
 * - NO Math.random() directly for move picks; uses deterministic game profile seeding.
 * - Candidates MUST be present in Stockfish MultiPV output.
 * - Max evaluation gap limit: 15cp (or playstyle mode limit, whichever is smaller).
 * - Anti-repetition window: 8-10 games.
 * - Emergency exit: Out-of-book or position tactical/volatile -> Hand control back to Stockfish.
 */

import { OpeningBook } from './opening-book.js';

export class OpeningDiversityManager {
  constructor(maxGapCp = 15, memoryWindowSize = 10) {
    this.openingBook = new OpeningBook();
    this.maxGapCp = maxGapCp;
    this.memoryWindowSize = memoryWindowSize;
    this.recentOpenings = []; // Rolling array of recently played opening system names
    this.currentProfile = 'FLEXIBLE';
    this.gameSeed = 1;
    this.plyCount = 0;
    this.activeInCurrentGame = true;
  }

  /**
   * Resets state for a new game session with deterministic profile seeding
   */
  startNewGame(seed = null) {
    this.plyCount = 0;
    this.activeInCurrentGame = true;
    this.gameSeed = (seed !== null && typeof seed === 'number') ? seed : (Date.now() % 10000);

    const profiles = ['AGGRESSIVE', 'CLASSICAL', 'POSITIONAL', 'FLEXIBLE', 'DYNAMIC'];
    const profileIdx = Math.abs(this.gameSeed) % profiles.length;
    this.currentProfile = profiles[profileIdx];
  }

  /**
   * Evaluates Stockfish MultiPV candidate moves during the opening phase.
   * 
   * @param {Object} chessInstance - Chess.js game instance
   * @param {Array} stockfishLines - Array of Stockfish MultiPV candidate objects
   * @param {Number} playstyleMaxGapCp - Maximum allowed gap from current playstyle mode
   * @returns {Object|null} Selected opening candidate metadata or null if out-of-book/disabled
   */
  selectOpeningCandidate(chessInstance, stockfishLines, playstyleMaxGapCp = 25) {
    if (!this.activeInCurrentGame || !stockfishLines || stockfishLines.length === 0) {
      return null;
    }

    const fen = chessInstance.fen();
    const ply = chessInstance.history().length;
    this.plyCount = ply;

    // Emergency Exit Check 1: Out of opening phase (e.g. ply > 16)
    if (ply > 16) {
      this.activeInCurrentGame = false;
      return null;
    }

    // Emergency Exit Check 2: Tactical / Volatile position (in check, high eval drop)
    if (chessInstance.inCheck()) {
      this.activeInCurrentGame = false;
      return null;
    }

    // Query Opening Book for current position
    const bookData = this.openingBook.getOpeningData(fen);
    if (!bookData || !bookData.moves || bookData.moves.length === 0) {
      this.activeInCurrentGame = false;
      return null;
    }

    const objectiveBest = stockfishLines[0];
    const topScore = objectiveBest.rawScore || objectiveBest.score || { type: 'cp', value: 0 };
    const topCp = topScore.type === 'cp' ? topScore.value : (topScore.value > 0 ? 10000 : -10000);

    const allowedGap = Math.min(this.maxGapCp, Math.abs(playstyleMaxGapCp));

    // Filter Stockfish MultiPV lines matching Opening Book candidates within allowed gap
    const validCandidates = [];

    for (let idx = 0; idx < stockfishLines.length; idx++) {
      const line = stockfishLines[idx];
      const san = line.san || '';
      const uci = line.bestUci || line.uci || '';
      const lineScore = line.rawScore || line.score || { type: 'cp', value: 0 };
      const lineCp = lineScore.type === 'cp' ? lineScore.value : (lineScore.value > 0 ? 10000 : -10000);
      const evalGap = Math.max(0, topCp - lineCp);

      // Check evaluation gap constraint (<= 15cp)
      if (evalGap > allowedGap) continue;

      // Match against opening book repertoire entries
      const matchedBookEntry = bookData.moves.find(bm => bm.uci === uci || bm.san === san);
      if (matchedBookEntry) {
        // Anti-repetition check: Penalize recently played opening systems
        const isRecentlyPlayed = this.recentOpenings.includes(matchedBookEntry.system);
        const profileMatchBonus = (matchedBookEntry.style === this.currentProfile) ? 20 : 0;
        const antiRepeatBonus = isRecentlyPlayed ? -30 : 15;

        validCandidates.push({
          line,
          idx,
          evalGap,
          matchedBookEntry,
          preferenceScore: (100 - evalGap) + profileMatchBonus + antiRepeatBonus
        });
      }
    }

    if (validCandidates.length === 0) {
      return null;
    }

    // Sort valid candidates by preference score
    validCandidates.sort((a, b) => b.preferenceScore - a.preferenceScore);
    const chosen = validCandidates[0];

    // Record system name in rolling memory
    if (chosen.matchedBookEntry.system && !this.recentOpenings.includes(chosen.matchedBookEntry.system)) {
      this.recentOpenings.push(chosen.matchedBookEntry.system);
      if (this.recentOpenings.length > this.memoryWindowSize) {
        this.recentOpenings.shift();
      }
    }

    return {
      selectedLine: chosen.line,
      candidateRank: chosen.idx + 1,
      evalGap: chosen.evalGap,
      systemName: chosen.matchedBookEntry.system,
      moveSan: chosen.line.san,
      moveUci: chosen.line.bestUci || chosen.line.uci,
      profile: this.currentProfile
    };
  }
}
