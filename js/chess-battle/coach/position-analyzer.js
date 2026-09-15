/**
 * Phase 1: Position Understanding Core
 * Evaluates the board state and returns raw insights (attacked squares, hanging pieces, etc.)
 */

export class PositionAnalyzer {
  constructor(chessInstance) {
    this.game = chessInstance;
    this.board = chessInstance.board();
  }

  analyze(sideToMove) {
    const opponentSide = sideToMove === 'w' ? 'b' : 'w';
    
    // Find pieces
    const myPieces = [];
    const enemyPieces = [];
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const sq = String.fromCharCode(97 + j) + (8 - i);
        const piece = this.board[i][j];
        if (piece) {
          const pieceData = { ...piece, square: sq };
          if (piece.color === sideToMove) myPieces.push(pieceData);
          else enemyPieces.push(pieceData);
        }
      }
    }

    // Determine which pieces are hanging (attacked and not defended, or attacked by a lower value piece)
    const hangingEnemyPieces = enemyPieces.filter(p => {
      return this.game.isSquareAttacked(p.square, sideToMove) && !this.game.isSquareAttacked(p.square, opponentSide);
    });

    return {
      sideToMove,
      myPieces,
      enemyPieces,
      hangingEnemyPieces
    };
  }

  getPieceValue(type) {
    const values = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 100 };
    return values[type] || 0;
  }
}
