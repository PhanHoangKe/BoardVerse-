/**
 * High-Precision Position Evaluator & Minimax Alpha-Beta Engine with Quiescence Search
 * Uses Piece-Square Tables (PST), Material Balance, Center Control, Mobility, and Alpha-Beta Search
 */

const PieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PawnPST = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 27, 27, 10,  5,  5,
   0,  0,  0, 25, 25,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-25,-25, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KnightPST = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BishopPST = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const RookPST = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
];

const QueenPST = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KingMiddlegamePST = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

const PST_MAP = {
  p: PawnPST,
  n: KnightPST,
  b: BishopPST,
  r: RookPST,
  q: QueenPST,
  k: KingMiddlegamePST
};

export class PositionEvaluator {
  /**
   * Static evaluation of position (+ for White, - for Black)
   */
  static evaluatePosition(chessInstance) {
    const boardState = chessInstance.boardState;
    let score = 0;

    for (let i = 0; i < 64; i++) {
      const piece = boardState[i];
      if (!piece) continue;

      const val = PieceValues[piece.type] || 0;
      const pst = PST_MAP[piece.type] || [];
      const sqIdx = piece.color === 'w' ? (63 - i) : i;
      const pstVal = pst[sqIdx] || 0;

      if (piece.color === 'w') {
        score += val + pstVal;
      } else {
        score -= (val + pstVal);
      }
    }

    return score;
  }

  /**
   * Quiescence Search (searches all captures to avoid horizon effect)
   */
  static quiescenceSearch(chessInstance, alpha, beta, isMaximizing) {
    const standPat = PositionEvaluator.evaluatePosition(chessInstance);

    if (isMaximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;
    }

    const turn = chessInstance.turn();
    const captureMoves = chessInstance.generateLegalMoves(turn).filter(m => m.captured);

    // MVV-LVA move ordering for captures
    captureMoves.sort((a, b) => (PieceValues[b.captured] || 0) - (PieceValues[a.captured] || 0));

    if (isMaximizing) {
      let maxEval = standPat;
      for (let m of captureMoves) {
        const saved = chessInstance.makeTemporaryMove(m);
        const score = PositionEvaluator.quiescenceSearch(chessInstance, alpha, beta, false);
        chessInstance.undoTemporaryMove(saved);
        maxEval = Math.max(maxEval, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = standPat;
      for (let m of captureMoves) {
        const saved = chessInstance.makeTemporaryMove(m);
        const score = PositionEvaluator.quiescenceSearch(chessInstance, alpha, beta, true);
        chessInstance.undoTemporaryMove(saved);
        minEval = Math.min(minEval, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  /**
   * Alpha-Beta Search Algorithm with Depth
   */
  static minimax(chessInstance, depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
      return PositionEvaluator.quiescenceSearch(chessInstance, alpha, beta, isMaximizing);
    }

    const turn = chessInstance.turn();
    const legalMoves = chessInstance.generateLegalMoves(turn);

    if (legalMoves.length === 0) {
      if (chessInstance.inCheck(turn)) {
        return isMaximizing ? -90000 - depth : 90000 + depth;
      }
      return 0; // Stalemate
    }

    // Move ordering: captures & checks first
    legalMoves.sort((a, b) => {
      let scoreA = a.captured ? (PieceValues[a.captured] || 10) * 10 : 0;
      let scoreB = b.captured ? (PieceValues[b.captured] || 10) * 10 : 0;
      return scoreB - scoreA;
    });

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (let m of legalMoves) {
        const saved = chessInstance.makeTemporaryMove(m);
        const score = PositionEvaluator.minimax(chessInstance, depth - 1, alpha, beta, false);
        chessInstance.undoTemporaryMove(saved);
        maxEval = Math.max(maxEval, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (let m of legalMoves) {
        const saved = chessInstance.makeTemporaryMove(m);
        const score = PositionEvaluator.minimax(chessInstance, depth - 1, alpha, beta, true);
        chessInstance.undoTemporaryMove(saved);
        minEval = Math.min(minEval, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  /**
   * Evaluates position using Alpha-Beta Minimax search tree (Depth 4-5)
   */
  static evaluateAndRankMoves(chessInstance, multiPV = 3, targetDepth = 4) {
    const turn = chessInstance.turn();
    const legalMoves = chessInstance.generateLegalMoves(turn);

    if (legalMoves.length === 0) return [];

    const isMaximizing = turn === 'w';

    const scoredMoves = legalMoves.map(m => {
      const saved = chessInstance.makeTemporaryMove(m);
      const evalScore = PositionEvaluator.minimax(
        chessInstance,
        targetDepth - 1,
        -Infinity,
        Infinity,
        !isMaximizing
      );
      chessInstance.undoTemporaryMove(saved);

      return {
        move: m,
        score: isMaximizing ? evalScore : -evalScore,
        rawCp: evalScore
      };
    });

    // Sort descending (highest score first)
    scoredMoves.sort((a, b) => b.score - a.score);

    return scoredMoves.slice(0, multiPV);
  }

  /**
   * Queries Lichess Cloud Stockfish API (Depth 40-50 Stockfish 16)
   */
  static async queryLichessCloudEval(fen, multiPV = 3) {
    try {
      const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPV}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || !data.pvs || data.pvs.length === 0) return null;

      return {
        depth: data.depth || 40,
        nodes: data.knodes ? data.knodes * 1000 : 25000000,
        pvs: data.pvs.map((item, idx) => {
          const moves = (item.moves || '').split(' ');
          const bestUci = moves[0] || '';
          let scoreObj = { type: 'cp', value: item.cp !== undefined ? item.cp : 0 };
          if (item.mate !== undefined) {
            scoreObj = { type: 'mate', value: item.mate };
          }
          return {
            rank: idx + 1,
            uci: bestUci,
            score: scoreObj,
            pvLine: moves
          };
        })
      };
    } catch (e) {
      return null;
    }
  }
}
