/**
 * Xiangqi Position Manager
 * Serializes and deserializes Xiangqi board state into standard FEN notation.
 * Handles position imports, exports, copy/paste, and history management.
 */

(function(exports) {
  'use strict';

  const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

  class PositionManager {
    static get INITIAL_FEN() {
      return START_FEN;
    }

    /**
     * Converts a 9x10 Xiangqi board grid to FEN notation string
     */
    static boardToFen(board, sideToMove = 'r', halfMove = 0, fullMove = 1) {
      if (!board) return START_FEN;

      const fenRows = [];

      for (let r = 0; r < 10; r++) {
        let emptyCount = 0;
        let rowStr = '';

        for (let c = 0; c < 9; c++) {
          const piece = board[r][c];
          if (!piece) {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              rowStr += emptyCount;
              emptyCount = 0;
            }
            const char = piece.type;
            rowStr += piece.color === 'r' ? char.toUpperCase() : char.toLowerCase();
          }
        }

        if (emptyCount > 0) {
          rowStr += emptyCount;
        }

        fenRows.push(rowStr);
      }

      const sideChar = sideToMove === 'r' || sideToMove === 'w' ? 'w' : 'b';
      return `${fenRows.join('/')} ${sideChar} - - ${halfMove} ${fullMove}`;
    }

    /**
     * Parses a FEN string into a 9x10 board grid and side to move
     */
    static fenToBoard(fen) {
      const fenString = (fen || START_FEN).trim();
      const parts = fenString.split(/\s+/);
      const positionPart = parts[0];
      const sidePart = parts[1] || 'w';

      const rows = positionPart.split('/');
      if (rows.length !== 10) {
        throw new Error(`Invalid Xiangqi FEN: expected 10 rows, got ${rows.length}`);
      }

      const board = Array(10).fill(null).map(() => Array(9).fill(null));

      for (let r = 0; r < 10; r++) {
        const rowStr = rows[r];
        let c = 0;

        for (let i = 0; i < rowStr.length; i++) {
          const char = rowStr[i];
          if (char >= '1' && char <= '9') {
            const emptySpaces = parseInt(char, 10);
            c += emptySpaces;
          } else {
            if (c >= 9) {
              throw new Error(`Invalid Xiangqi FEN row ${r}: exceeds 9 columns`);
            }
            const isRed = char === char.toUpperCase();
            const pieceType = char.toLowerCase();
            board[r][c] = {
              type: pieceType,
              color: isRed ? 'r' : 'b'
            };
            c++;
          }
        }
        if (c !== 9) {
          throw new Error(`Invalid Xiangqi FEN row ${r}: expected 9 columns, got ${c}`);
        }
      }

      const sideToMove = sidePart.toLowerCase() === 'b' ? 'b' : 'r';

      return {
        board,
        sideToMove
      };
    }

    static validateFen(fen) {
      try {
        const parsed = this.fenToBoard(fen);
        return { valid: true, parsed };
      } catch (e) {
        return { valid: false, error: e.message };
      }
    }
  }

  exports.PositionManager = PositionManager;
})(typeof exports !== 'undefined' ? exports : (window.PositionManagerModule = {}));
