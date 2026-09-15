/**
 * Xiangqi Coordinate Mapper (Single Source of Truth for Coordinates)
 * Standardized absolute coordinate system: col = 0..8, row = 0..9.
 * Row 0: Black back rank (top in Red view)
 * Row 9: Red back rank (bottom in Red view)
 * Col 0: Left side from Red perspective (a0)
 */

(function(exports) {
  'use strict';

  class CoordinateMapper {
    /**
     * Checks if coordinates are inside valid Xiangqi board boundaries
     */
    static isValidPos(col, row) {
      return (
        typeof col === 'number' &&
        typeof row === 'number' &&
        !isNaN(col) &&
        !isNaN(row) &&
        col >= 0 &&
        col <= 8 &&
        row >= 0 &&
        row <= 9
      );
    }

    /**
     * Converts absolute board pos {col, row} to UCI square string (e.g. {col: 1, row: 7} -> "b2")
     */
    static posToUciSquare(col, row) {
      if (!this.isValidPos(col, row)) return '';
      const colChar = String.fromCharCode('a'.charCodeAt(0) + col);
      const rowNum = 9 - row;
      return `${colChar}${rowNum}`;
    }

    /**
     * Converts UCI square string (e.g. "b2") to absolute board pos {col, row}
     */
    static uciSquareToPos(uciSq) {
      if (!uciSq || uciSq.length < 2) return null;
      const col = uciSq.charCodeAt(0) - 'a'.charCodeAt(0);
      const row = 9 - parseInt(uciSq.charAt(1), 10);
      if (!this.isValidPos(col, row)) return null;
      return { col, row };
    }

    /**
     * Converts internal board move {from: {col, row}, to: {col, row}} to UCI engine move string (e.g. "b2e2")
     */
    static moveToUci(move) {
      if (!move || !move.from || !move.to) return '';
      const fromUci = this.posToUciSquare(move.from.col, move.from.row);
      const toUci = this.posToUciSquare(move.to.col, move.to.row);
      if (!fromUci || !toUci) return '';
      return `${fromUci}${toUci}`;
    }

    /**
     * Converts UCI engine move string (e.g. "b2e2") to internal board move {from: {col, row}, to: {col, row}}
     */
    static uciToMove(uci) {
      if (!uci || uci.length < 4) return null;
      const from = this.uciSquareToPos(uci.substring(0, 2));
      const to = this.uciSquareToPos(uci.substring(2, 4));
      if (!from || !to) return null;
      return { from, to };
    }

    // Specification Aliases
    static engineToBoardMove(engineMove) {
      return this.uciToMove(engineMove);
    }

    static boardToEngineMove(boardMove) {
      return this.moveToUci(boardMove);
    }

    static boardToDisplayCoordinate(coord, orientation = 'r') {
      if (!coord) return null;
      return this.boardToDisplay(coord.col, coord.row, orientation);
    }

    static displayToBoardCoordinate(coord, orientation = 'r') {
      if (!coord) return null;
      return this.displayToBoard(coord.col, coord.row, orientation);
    }

    /**
     * Verifies exact round-trip conversion identity: engineMove -> boardMove -> engineMoveAgain === engineMove
     */
    static validateRoundTrip(engineMove) {
      if (typeof engineMove !== 'string' || engineMove.length < 4) return false;
      const boardMove = this.engineToBoardMove(engineMove);
      if (!boardMove) return false;
      const engineMoveAgain = this.boardToEngineMove(boardMove);
      return engineMoveAgain === engineMove;
    }

    /**
     * Maps absolute board coordinates {col, row} to screen display coordinates {visCol, visRow}
     * based on board orientation ('r' or 'b').
     * 'r': Red at bottom -> visCol = col, visRow = row
     * 'b': Black at bottom -> visCol = 8 - col, visRow = 9 - row
     */
    static boardToDisplay(col, row, orientation = 'r') {
      if (!this.isValidPos(col, row)) return { visCol: col, visRow: row };
      if (orientation === 'b') {
        return { visCol: 8 - col, visRow: 9 - row };
      }
      return { visCol: col, visRow: row };
    }

    /**
     * Maps screen display coordinates {visCol, visRow} back to absolute board coordinates {col, row}
     * based on board orientation ('r' or 'b').
     */
    static displayToBoard(visCol, visRow, orientation = 'r') {
      if (typeof visCol !== 'number' || typeof visRow !== 'number') return null;
      if (orientation === 'b') {
        const col = 8 - visCol;
        const row = 9 - visRow;
        if (!this.isValidPos(col, row)) return null;
        return { col, row };
      }
      if (!this.isValidPos(visCol, visRow)) return null;
      return { col: visCol, row: visRow };
    }

    /**
     * Normalizes and validates raw coordinate object or values
     */
    static normalizePos(pos) {
      if (!pos) return null;
      const col = parseInt(pos.col, 10);
      const row = parseInt(pos.row, 10);
      if (!this.isValidPos(col, row)) return null;
      return { col, row };
    }
  }

  exports.CoordinateMapper = CoordinateMapper;
})(typeof exports !== 'undefined' ? exports : (window.CoordinateMapperModule = {}));
