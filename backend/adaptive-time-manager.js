/**
 * Adaptive Time Manager Module (ATM)
 * Dynamically computes optimal thinking time based strictly on RAW STOCKFISH UCI DATA:
 * - score & score volatility
 * - MultiPV gap
 * - bestmove changes across depths
 * - PV stability & mate scores
 * 
 * NO Heuristics! NO PST! NO Fake move selection!
 * 100% Stockfish evaluation and UCI bestmove output.
 */

class AdaptiveTimeManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.history = []; // Array of depth iterations: { depth, bestUci, score, pvGap }
    this.lastBestMove = null;
    this.moveChangeCount = 0;
    this.stableDepthCount = 0;
    this.lastScoreCp = null;
    this.scoreVolatility = 0;
    this.stabilityIndex = 0; // 0% to 100%
  }

  /**
   * Process a single info iteration from Stockfish UCI output
   */
  processIteration(parsedInfo) {
    if (!parsedInfo || !parsedInfo.bestUci) return null;

    const depth = parsedInfo.depth || 0;
    const bestUci = parsedInfo.bestUci;
    const scoreObj = parsedInfo.score || { type: 'cp', value: 0 };
    const scoreCp = scoreObj.type === 'cp' ? scoreObj.value : (scoreObj.value > 0 ? 10000 : -10000);

    // Track bestmove changes
    if (this.lastBestMove === null) {
      this.lastBestMove = bestUci;
      this.stableDepthCount = 1;
    } else if (this.lastBestMove === bestUci) {
      this.stableDepthCount++;
    } else {
      this.moveChangeCount++;
      this.stableDepthCount = 1;
      this.lastBestMove = bestUci;
    }

    // Track score volatility
    if (this.lastScoreCp !== null) {
      this.scoreVolatility = Math.abs(scoreCp - this.lastScoreCp);
    }
    this.lastScoreCp = scoreCp;

    // MultiPV Gap (difference between rank 1 score and rank 2 score if present)
    let pvGap = parsedInfo.pvGap !== undefined ? parsedInfo.pvGap : 999;

    // Compute Stability Index (0 - 100%)
    let stability = Math.min(70, this.stableDepthCount * 18);

    if (pvGap >= 100) stability += 20;
    else if (pvGap >= 50) stability += 10;
    else if (pvGap <= 15) stability -= 25; // Close evaluation between top 2 candidate moves

    if (this.scoreVolatility > 50) stability -= 25;
    else if (this.scoreVolatility < 10) stability += 10;

    if (scoreObj.type === 'mate' && this.stableDepthCount >= 3) {
      stability += 30; // Quick exit on stable forced mate
    }

    this.stabilityIndex = Math.max(0, Math.min(100, Math.round(stability)));

    const iterationRecord = {
      depth,
      bestUci,
      score: scoreObj,
      pvGap,
      stableDepthCount: this.stableDepthCount,
      moveChangeCount: this.moveChangeCount,
      scoreVolatility: this.scoreVolatility,
      stabilityIndex: this.stabilityIndex
    };

    this.history.push(iterationRecord);
    return iterationRecord;
  }

  /**
   * Determines if Stockfish search can terminate early or needs extended time
   */
  evaluateEarlyExit(elapsedTimeMs, maxTimeMs, minTimeMs = 400) {
    const effectiveMinTime = Math.max(300, Math.min(minTimeMs, Math.floor(maxTimeMs * 0.25)));

    if (elapsedTimeMs < effectiveMinTime) {
      return { shouldStop: false, reason: 'Minimum search time not reached' };
    }

    // High stability early exit
    if (this.stabilityIndex >= 85 && this.stableDepthCount >= 4) {
      return {
        shouldStop: true,
        reason: `High Move & PV Stability (${this.stabilityIndex}% - ${this.stableDepthCount} depths stable)`
      };
    }

    // Stable forced mate early exit
    if (this.history.length > 0) {
      const latest = this.history[this.history.length - 1];
      if (latest.score.type === 'mate' && this.stableDepthCount >= 3 && elapsedTimeMs >= 500) {
        return {
          shouldStop: true,
          reason: `Stable Mate Score M${latest.score.value} (${this.stableDepthCount} depths stable)`
        };
      }
    }

    // Maximum time reached
    if (elapsedTimeMs >= maxTimeMs) {
      return {
        shouldStop: true,
        reason: `Maximum Allocated Time Reached (${maxTimeMs}ms)`
      };
    }

    return { shouldStop: false, reason: 'Search ongoing' };
  }
}

module.exports = AdaptiveTimeManager;
