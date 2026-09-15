/**
 * Xiangqi Move Validator
 * Validates moves before applying them to GameState.
 * Prevents illegal moves, detects check, checkmate, stalemate.
 */

(function(exports) {
  'use strict';

  const MoveGenerator = typeof require !== 'undefined'
    ? require('./move-generator.js').MoveGenerator
    : window.MoveGeneratorModule.MoveGenerator;

  class XiangqiMoveValidator {
    static isLegalMove(gameState, move) {
      if (!gameState || !move || !move.from || !move.to) return false;
      if (gameState.status === 'CHECKMATE' || gameState.status === 'STALEMATE') return false;

      const { from, to } = move;
      const piece = (typeof gameState.getPieceAt === 'function')
        ? gameState.getPieceAt(from.col, from.row)
        : (gameState.board && gameState.board[from.row] ? gameState.board[from.row][from.col] : null);
      if (!piece) return false;

      // Must be turn of piece owner
      if (piece.color !== gameState.sideToMove) return false;

      const legalMoves = MoveGenerator.generateLegalMoves(gameState.board, gameState.sideToMove);

      return legalMoves.some(m =>
        m.from.col === from.col &&
        m.from.row === from.row &&
        m.to.col === to.col &&
        m.to.row === to.row
      );
    }

    static validateEngineMove(gameState, engineMove) {
      if (!engineMove || !engineMove.from || !engineMove.to) {
        return { valid: false, reason: 'Invalid engine move format' };
      }

      const isLegal = this.isLegalMove(gameState, engineMove);
      if (!isLegal) {
        return { valid: false, reason: 'Engine move violates Xiangqi legal move rules' };
      }

      return { valid: true };
    }

    static evaluateGameState(gameState) {
      const currentSide = gameState.sideToMove;
      const inCheck = MoveGenerator.isKingInCheck(gameState.board, currentSide);
      const legalMoves = MoveGenerator.generateLegalMoves(gameState.board, currentSide);

      if (legalMoves.length === 0) {
        if (inCheck) {
          // Checkmate: No legal moves and king is in check
          gameState.setCheckState(true, currentSide, true, false);
          return { status: 'CHECKMATE', winner: currentSide === 'r' ? 'b' : 'r' };
        } else {
          // Stalemate: No legal moves but king is NOT in check (In Xiangqi, player with no moves loses)
          gameState.setCheckState(false, currentSide, false, true);
          return { status: 'STALEMATE', winner: currentSide === 'r' ? 'b' : 'r' };
        }
      }

      if (inCheck) {
        gameState.setCheckState(true, currentSide, false, false);
        return { status: 'CHECK', checkedSide: currentSide };
      }

      gameState.setCheckState(false, null, false, false);
      return { status: 'PLAYING' };
    }
  }

  exports.XiangqiMoveValidator = XiangqiMoveValidator;
})(typeof exports !== 'undefined' ? exports : (window.MoveValidatorModule = {}));
