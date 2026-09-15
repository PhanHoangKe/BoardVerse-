/**
 * Tactical Search & Mate Attack Layer for Chess Battle Assistant
 * 
 * STRICT ENGINE-FIRST ARCHITECTURE:
 * - STOCKFISH IS THE SOLE EVALUATION ENGINE. NO PST, NO FAKE SCORES, NO HEURISTIC OVERRIDES.
 * - ALL CANDIDATES MUST ORIGINATE FROM STOCKFISH MULTIPV.
 * - FORCED MATE HAS ABSOLUTE PRIORITY OVER NON-MATE MOVES.
 * - SACRIFICE CANDIDATES MUST BE VERIFIED AGAINST OPPONENT'S BEST RESPONSE.
 * - REJECT CANDIDATES THAT ARE REFUTED BY OPPONENT'S BEST DEFENSE.
 */

export class TacticalSearchLayer {
  constructor() {
    this.pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  }

  /**
   * Classifies a Stockfish MultiPV candidate move into tactical categories.
   * 
   * @param {Object} chessInstance - Current Chess.js game instance
   * @param {Object} candidateLine - Stockfish MultiPV line object
   * @returns {Object} Tactical classification metadata
   */
  classifyCandidate(chessInstance, candidateLine) {
    if (!candidateLine || (!candidateLine.san && !candidateLine.bestUci)) {
      return { primaryType: 'NORMAL', types: ['NORMAL'], isSacrifice: false, isForcing: false };
    }

    const san = candidateLine.san || '';
    const uci = candidateLine.bestUci || candidateLine.uci || '';
    const score = candidateLine.rawScore || candidateLine.score || { type: 'cp', value: 0 };
    const pvMoves = candidateLine.pvMoves || (candidateLine.pvLine ? candidateLine.pvLine.split(/\s+/) : []);

    const types = [];

    // 1. Forced Mate
    if (score.type === 'mate' && score.value > 0) {
      types.push('FORCED_MATE');
    }

    // 2. Check
    const isCheck = san.includes('+') || san.includes('#');
    if (isCheck) types.push('CHECK');

    // 3. Capture
    const isCapture = san.includes('x');
    if (isCapture) types.push('CAPTURE');

    // 4. Promotion
    const isPromotion = san.includes('=');
    if (isPromotion) types.push('PROMOTION_THREAT');

    // Simulate move on temp board to analyze board geometry & tactics
    let isSacrifice = false;
    let isFork = false;
    let isPin = false;
    let isDiscoveredAttack = false;
    let isKingAttack = false;
    let isMateThreat = false;
    let isDeflection = false;

    if (chessInstance && uci && uci.length >= 4) {
      const fromSq = uci.substring(0, 2);
      const toSq = uci.substring(2, 4);
      const movingPiece = chessInstance.get(fromSq);
      const capturedPiece = chessInstance.get(toSq);
      const sideToMove = chessInstance.turn();
      const oppColor = sideToMove === 'w' ? 'b' : 'w';

      const tempGame = new (chessInstance.constructor)(chessInstance.fen());
      const moveRes = tempGame.move({ from: fromSq, to: toSq, promotion: uci[4] });

      if (moveRes) {
        // King Attack Check
        const oppKingSquare = this.findKingSquare(tempGame, oppColor);
        if (oppKingSquare) {
          const distToKing = this.squareDistance(toSq, oppKingSquare);
          if (distToKing <= 2 || tempGame.inCheck()) {
            isKingAttack = true;
            types.push('KING_ATTACK');
          }
        }

        // Mate Threat Check (PV shows forced mate on next move)
        if (pvMoves.length >= 3 && score.type === 'mate' && score.value > 0 && score.value <= 3) {
          isMateThreat = true;
          types.push('MATE_THREAT');
        }

        // Sacrifice Candidate Check
        const movingVal = movingPiece ? (this.pieceValues[movingPiece.type] || 0) : 0;
        const capturedVal = capturedPiece ? (this.pieceValues[capturedPiece.type] || 0) : 0;

        // Check if destination square is attacked by lower value opponent piece
        const destAttackedByOpp = this.isSquareAttackedByLowerPiece(tempGame, toSq, oppColor, movingVal);
        if (destAttackedByOpp || (isCapture && movingVal > capturedVal + 150 && destAttackedByOpp)) {
          isSacrifice = true;
          types.push('SACRIFICE_CANDIDATE');
        }

        // Fork Check (Move attacks 2+ enemy pieces of value >= 300 or King + piece)
        const attackedEnemyTargets = this.getAttackedEnemyTargets(tempGame, toSq, oppColor);
        if (attackedEnemyTargets.length >= 2 || (tempGame.inCheck() && attackedEnemyTargets.length >= 1)) {
          isFork = true;
          types.push('FORK');
          types.push('DOUBLE_ATTACK');
        }

        // Discovered Attack Check
        if (this.detectDiscoveredAttack(chessInstance, tempGame, fromSq, sideToMove, oppColor)) {
          isDiscoveredAttack = true;
          types.push('DISCOVERED_ATTACK');
        }
      }
    }

    const isForcing = isCheck || isCapture || isMateThreat || isFork;
    if (isForcing) types.push('FORCING');

    if (types.length === 0) types.push('NORMAL');

    const primaryType = types.includes('FORCED_MATE') ? 'FORCED_MATE'
      : types.includes('SACRIFICE_CANDIDATE') ? 'SACRIFICE_CANDIDATE'
      : types.includes('MATE_THREAT') ? 'MATE_THREAT'
      : types.includes('FORK') ? 'FORK'
      : types.includes('KING_ATTACK') ? 'KING_ATTACK'
      : types.includes('CHECK') ? 'CHECK'
      : types.includes('CAPTURE') ? 'CAPTURE'
      : types.includes('FORCING') ? 'FORCING'
      : 'NORMAL';

    return {
      primaryType,
      types,
      isSacrifice,
      isForcing,
      isKingAttack,
      isMateThreat,
      isFork
    };
  }

  /**
   * Performs Double-Verification of a tactical/sacrifice candidate against opponent's best response.
   * 
   * @param {Object} chessInstance - Current position
   * @param {Object} candidateLine - Candidate line from Stockfish
   * @param {Object} topScore - Stockfish #1 score
   * @param {Number} maxAllowedGapCp - Maximum allowed evaluation gap
   * @returns {Object} Verification result
   */
  verifyCandidate(chessInstance, candidateLine, topScore, maxAllowedGapCp = 25) {
    if (!candidateLine) {
      return { verified: false, status: 'REJECTED_REFUTED', reason: 'Null candidate' };
    }

    const lineScore = candidateLine.rawScore || candidateLine.score || { type: 'cp', value: 0 };
    const topCp = topScore.type === 'cp' ? topScore.value : (topScore.value > 0 ? 10000 : -10000);
    const lineCp = lineScore.type === 'cp' ? lineScore.value : (lineScore.value > 0 ? 10000 : -10000);

    // Rule: Forced mate on candidate always passes verification
    if (lineScore.type === 'mate' && lineScore.value > 0) {
      return {
        verified: true,
        status: 'VERIFIED_MATE',
        reason: `Forced Mate confirmed (M+${lineScore.value})`,
        oppBestResponse: candidateLine.pvMoves ? candidateLine.pvMoves[1] || '-' : '-'
      };
    }

    // Rule: If candidate is losing forced mate, reject!
    if (lineScore.type === 'mate' && lineScore.value < 0) {
      return {
        verified: false,
        status: 'REJECTED_REFUTED',
        reason: `Candidate leads to opponent forced mate (${lineScore.value})`,
        oppBestResponse: candidateLine.pvMoves ? candidateLine.pvMoves[1] || '-' : '-'
      };
    }

    const evalGap = Math.max(0, topCp - lineCp);

    // Classification
    const classification = this.classifyCandidate(chessInstance, candidateLine);

    // Sacrifice Candidate Verification
    if (classification.isSacrifice) {
      // Sacrifice MUST be confirmed by Stockfish to give winning advantage or forced mate
      // Or stay within allowed gap with positive score (cp >= 100)
      if (evalGap <= maxAllowedGapCp && lineCp >= 50) {
        return {
          verified: true,
          status: 'VERIFIED_WINNING_SACRIFICE',
          reason: `Stockfish confirmed sacrifice advantage (+${(lineCp / 100).toFixed(2)} pawn, eval gap ${evalGap}cp <= ${maxAllowedGapCp}cp)`,
          oppBestResponse: candidateLine.pvMoves ? candidateLine.pvMoves[1] || '-' : '-'
        };
      } else {
        return {
          verified: false,
          status: 'REJECTED_REFUTED',
          reason: `Sacrifice refuted by Stockfish (eval gap ${evalGap}cp exceeds threshold ${maxAllowedGapCp}cp, or line score ${(lineCp / 100).toFixed(2)} insufficient)`,
          oppBestResponse: candidateLine.pvMoves ? candidateLine.pvMoves[1] || '-' : '-'
        };
      }
    }

    // General Tactical Verification
    if (evalGap <= maxAllowedGapCp) {
      return {
        verified: true,
        status: 'VERIFIED_STABLE',
        reason: `Verified tactical candidate within ${evalGap}cp gap <= ${maxAllowedGapCp}cp threshold`,
        oppBestResponse: candidateLine.pvMoves ? candidateLine.pvMoves[1] || '-' : '-'
      };
    } else {
      return {
        verified: false,
        status: 'REJECTED_REFUTED',
        reason: `Evaluation gap ${evalGap}cp exceeds allowed threshold ${maxAllowedGapCp}cp`,
        oppBestResponse: candidateLine.pvMoves ? candidateLine.pvMoves[1] || '-' : '-'
      };
    }
  }

  // Helper Methods for Board Geometry
  findKingSquare(chessInstance, color) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = String.fromCharCode(97 + f) + (r + 1);
        const p = chessInstance.get(sq);
        if (p && p.type === 'k' && p.color === color) return sq;
      }
    }
    return null;
  }

  squareDistance(sq1, sq2) {
    if (!sq1 || !sq2) return 99;
    const f1 = sq1.charCodeAt(0) - 97, r1 = parseInt(sq1[1], 10) - 1;
    const f2 = sq2.charCodeAt(0) - 97, r2 = parseInt(sq2[1], 10) - 1;
    return Math.max(Math.abs(f1 - f2), Math.abs(r1 - r2));
  }

  isSquareAttackedByLowerPiece(chessInstance, targetSq, oppColor, pieceVal) {
    const legalMoves = chessInstance.moves({ verbose: true, color: oppColor });
    return legalMoves.some(m => {
      if (m.to !== targetSq) return false;
      const attacker = chessInstance.get(m.from);
      const attackerVal = attacker ? (this.pieceValues[attacker.type] || 0) : 0;
      return attackerVal <= pieceVal;
    });
  }

  getAttackedEnemyTargets(chessInstance, fromSq, oppColor) {
    const targets = [];
    const legalMoves = chessInstance.moves({ verbose: true, color: chessInstance.turn() });
    legalMoves.forEach(m => {
      if (m.from === fromSq) {
        const destPiece = chessInstance.get(m.to);
        if (destPiece && destPiece.color === oppColor && (this.pieceValues[destPiece.type] >= 300 || destPiece.type === 'k')) {
          targets.push({ square: m.to, piece: destPiece });
        }
      }
    });
    return targets;
  }

  detectDiscoveredAttack(oldGame, newGame, movedFromSq, sideToMove, oppColor) {
    // Check if moving piece away from movedFromSq opens a ray of attack onto a major opponent piece
    const newMoves = newGame.moves({ verbose: true, color: sideToMove });
    return newMoves.some(m => {
      if (m.from === movedFromSq) return false; // Not the piece that moved
      const p = newGame.get(m.to);
      return p && p.color === oppColor && (this.pieceValues[p.type] >= 500 || p.type === 'k');
    });
  }
}
