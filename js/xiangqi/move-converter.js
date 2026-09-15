/**
 * Xiangqi Move Converter
 * Converts moves between Internal representation, UCI coordinate string, Chinese notation, and Vietnamese notation.
 */

(function(exports) {
  'use strict';

  const RED_COLS = ['九', '八', '七', '六', '五', '四', '三', '二', '一']; // col 0 to 8 for Red (right to left)
  const BLACK_COLS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']; // col 0 to 8 for Black (left to right)

  const NUM_TO_CHINESE = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  const PIECE_CHINESE = {
    r: { k: '帥', a: '仕', b: '相', n: '馬', r: '車', c: '炮', p: '兵' },
    b: { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' }
  };

  const PIECE_VIETNAMESE = {
    k: 'Tướng', a: 'Sĩ', b: 'Tượng', n: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt'
  };

  class MoveConverter {
    /**
     * Converts internal move {from: {col, row}, to: {col, row}} to UCI string (e.g. "b2e2" or "h2e2")
     */
    static moveToUci(move) {
      if (typeof CoordinateMapper !== 'undefined' && CoordinateMapper.moveToUci) {
        return CoordinateMapper.moveToUci(move);
      }
      if (!move || !move.from || !move.to) return '';
      const fromColChar = String.fromCharCode('a'.charCodeAt(0) + move.from.col);
      const fromRowChar = String(9 - move.from.row);
      const toColChar = String.fromCharCode('a'.charCodeAt(0) + move.to.col);
      const toRowChar = String(9 - move.to.row);
      return `${fromColChar}${fromRowChar}${toColChar}${toRowChar}`;
    }

    /**
     * Converts UCI string (e.g. "b2e2") to internal move {from: {col, row}, to: {col, row}}
     */
    static uciToMove(uci) {
      if (typeof CoordinateMapper !== 'undefined' && CoordinateMapper.uciToMove) {
        return CoordinateMapper.uciToMove(uci);
      }
      if (!uci || uci.length < 4) return null;
      const fromCol = uci.charCodeAt(0) - 'a'.charCodeAt(0);
      const fromRow = 9 - parseInt(uci.charAt(1), 10);
      const toCol = uci.charCodeAt(2) - 'a'.charCodeAt(0);
      const toRow = 9 - parseInt(uci.charAt(3), 10);

      if (isNaN(fromCol) || isNaN(fromRow) || isNaN(toCol) || isNaN(toRow)) return null;
      if (fromCol < 0 || fromCol > 8 || fromRow < 0 || fromRow > 9) return null;
      if (toCol < 0 || toCol > 8 || toRow < 0 || toRow > 9) return null;

      return {
        from: { col: fromCol, row: fromRow },
        to: { col: toCol, row: toRow }
      };
    }

    /**
     * Formats a move into Chinese Xiangqi Notation (e.g., 炮二平五, 馬８進７)
     */
    static toChineseNotation(move, piece) {
      if (!move || !move.from || !move.to || !piece) return '';
      const color = piece.color;
      const pieceName = PIECE_CHINESE[color][piece.type] || piece.type.toUpperCase();

      const fromColIndex = move.from.col;
      const toColIndex = move.to.col;
      const fromRow = move.from.row;
      const toRow = move.to.row;

      let fromColStr = '';
      let toColStr = '';
      let action = '';
      let valStr = '';

      if (color === 'r') {
        // Red moves
        fromColStr = RED_COLS[fromColIndex];
        toColStr = RED_COLS[toColIndex];

        if (fromRow > toRow) {
          action = '進'; // Advance up
          const dist = fromRow - toRow;
          valStr = isDiagonalPiece(piece.type) ? toColStr : NUM_TO_CHINESE[dist];
        } else if (fromRow < toRow) {
          action = '退'; // Retreat down
          const dist = toRow - fromRow;
          valStr = isDiagonalPiece(piece.type) ? toColStr : NUM_TO_CHINESE[dist];
        } else {
          action = '平'; // Traverse sideways
          valStr = toColStr;
        }
      } else {
        // Black moves
        fromColStr = BLACK_COLS[fromColIndex];
        toColStr = BLACK_COLS[toColIndex];

        if (fromRow < toRow) {
          action = '進'; // Advance down
          const dist = toRow - fromRow;
          valStr = isDiagonalPiece(piece.type) ? toColStr : dist.toString();
        } else if (fromRow > toRow) {
          action = '退'; // Retreat up
          const dist = fromRow - toRow;
          valStr = isDiagonalPiece(piece.type) ? toColStr : dist.toString();
        } else {
          action = '平'; // Traverse sideways
          valStr = toColStr;
        }
      }

      return `${pieceName}${fromColStr}${action}${valStr}`;
    }

    /**
     * Formats a move into Vietnamese description (e.g. Pháo 2 bình 5, Mã 8 tiến 7)
     */
    static toVietnameseNotation(move, piece) {
      if (!move || !move.from || !move.to || !piece) return '';
      const color = piece.color;
      const pieceName = PIECE_VIETNAMESE[piece.type] || piece.type.toUpperCase();

      const fromColIndex = move.from.col;
      const toColIndex = move.to.col;
      const fromRow = move.from.row;
      const toRow = move.to.row;

      let fromColStr = color === 'r' ? (9 - fromColIndex) : (fromColIndex + 1);
      let toColStr = color === 'r' ? (9 - toColIndex) : (toColIndex + 1);
      let action = '';
      let valStr = '';

      if (color === 'r') {
        if (fromRow > toRow) {
          action = 'tiến';
          valStr = isDiagonalPiece(piece.type) ? toColStr : (fromRow - toRow);
        } else if (fromRow < toRow) {
          action = 'thối';
          valStr = isDiagonalPiece(piece.type) ? toColStr : (toRow - fromRow);
        } else {
          action = 'bình';
          valStr = toColStr;
        }
      } else {
        if (fromRow < toRow) {
          action = 'tiến';
          valStr = isDiagonalPiece(piece.type) ? toColStr : (toRow - fromRow);
        } else if (fromRow > toRow) {
          action = 'thối';
          valStr = isDiagonalPiece(piece.type) ? toColStr : (fromRow - toRow);
        } else {
          action = 'bình';
          valStr = toColStr;
        }
      }

      return `${pieceName} ${fromColStr} ${action} ${valStr}`;
    }
  }

  function isDiagonalPiece(type) {
    return type === 'a' || type === 'b' || type === 'n';
  }

  exports.MoveConverter = MoveConverter;
})(typeof exports !== 'undefined' ? exports : (window.MoveConverterModule = {}));
