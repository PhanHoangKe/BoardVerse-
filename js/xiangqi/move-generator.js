/**
 * Xiangqi Move Generator
 * Generates pseudo-legal and legal moves for all Xiangqi piece types.
 * Enforces strict piece rules, blocking constraints, palace bounds, flying general, and check validation.
 */

(function(exports) {
  'use strict';

  function findKingPosition(board, color) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          return { col: c, row: r };
        }
      }
    }
    return null;
  }

  function isFlyingGeneral(board) {
    const redKing = findKingPosition(board, 'r');
    const blackKing = findKingPosition(board, 'b');

    if (!redKing || !blackKing) return false;
    if (redKing.col !== blackKing.col) return false;

    const col = redKing.col;
    const startRow = Math.min(redKing.row, blackKing.row) + 1;
    const endRow = Math.max(redKing.row, blackKing.row);

    for (let r = startRow; r < endRow; r++) {
      if (board[r][col] !== null) {
        return false; // Intervening piece exists
      }
    }

    return true; // Two Kings face each other directly!
  }

  function generatePseudoLegalMoves(board, sideToMove) {
    const moves = [];

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== sideToMove) continue;

        const from = { col: c, row: r };

        switch (piece.type) {
          case 'k': // General / King
            generateKingMoves(board, from, piece, moves);
            break;
          case 'a': // Guard / Advisor
            generateAdvisorMoves(board, from, piece, moves);
            break;
          case 'b': // Elephant / Bishop
            generateElephantMoves(board, from, piece, moves);
            break;
          case 'n': // Horse / Knight
            generateKnightMoves(board, from, piece, moves);
            break;
          case 'r': // Chariot / Rook
            generateRookMoves(board, from, piece, moves);
            break;
          case 'c': // Cannon
            generateCannonMoves(board, from, piece, moves);
            break;
          case 'p': // Soldier / Pawn
            generatePawnMoves(board, from, piece, moves);
            break;
        }
      }
    }

    return moves;
  }

  function isInsidePalace(col, row, color) {
    if (col < 3 || col > 5) return false;
    if (color === 'b') return row >= 0 && row <= 2;
    if (color === 'r') return row >= 7 && row <= 9;
    return false;
  }

  function generateKingMoves(board, from, piece, moves) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dc, dr] of dirs) {
      const tc = from.col + dc;
      const tr = from.row + dr;
      if (isInsidePalace(tc, tr, piece.color)) {
        const target = board[tr][tc];
        if (!target || target.color !== piece.color) {
          moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: target ? { ...target } : null });
        }
      }
    }
  }

  function generateAdvisorMoves(board, from, piece, moves) {
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dc, dr] of dirs) {
      const tc = from.col + dc;
      const tr = from.row + dr;
      if (isInsidePalace(tc, tr, piece.color)) {
        const target = board[tr][tc];
        if (!target || target.color !== piece.color) {
          moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: target ? { ...target } : null });
        }
      }
    }
  }

  function generateElephantMoves(board, from, piece, moves) {
    const dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    for (const [dc, dr] of dirs) {
      const tc = from.col + dc;
      const tr = from.row + dr;

      // Bounds check
      if (tc < 0 || tc > 8 || tr < 0 || tr > 9) continue;

      // Cannot cross River (Black stays 0-4, Red stays 5-9)
      if (piece.color === 'b' && tr > 4) continue;
      if (piece.color === 'r' && tr < 5) continue;

      // Elephant eye check (Midpoint must be empty)
      const eyeC = from.col + dc / 2;
      const eyeR = from.row + dr / 2;
      if (board[eyeR][eyeC] !== null) continue; // Eye is blocked!

      const target = board[tr][tc];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: target ? { ...target } : null });
      }
    }
  }

  function generateKnightMoves(board, from, piece, moves) {
    // 8 possible L-shaped destinations with corresponding leg positions
    const knightMoves = [
      { dc: 1, dr: 2, legC: 0, legR: 1 },
      { dc: -1, dr: 2, legC: 0, legR: 1 },
      { dc: 1, dr: -2, legC: 0, legR: -1 },
      { dc: -1, dr: -2, legC: 0, legR: -1 },
      { dc: 2, dr: 1, legC: 1, legR: 0 },
      { dc: 2, dr: -1, legC: 1, legR: 0 },
      { dc: -2, dr: 1, legC: -1, legR: 0 },
      { dc: -2, dr: -1, legC: -1, legR: 0 }
    ];

    for (const m of knightMoves) {
      const tc = from.col + m.dc;
      const tr = from.row + m.dr;

      if (tc < 0 || tc > 8 || tr < 0 || tr > 9) continue;

      // Check horse leg (Chân mã)
      const legC = from.col + m.legC;
      const legR = from.row + m.legR;

      if (board[legR][legC] !== null) continue; // Horse leg is hobbled!

      const target = board[tr][tc];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: target ? { ...target } : null });
      }
    }
  }

  function generateRookMoves(board, from, piece, moves) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dc, dr] of dirs) {
      let tc = from.col + dc;
      let tr = from.row + dr;

      while (tc >= 0 && tc <= 8 && tr >= 0 && tr <= 9) {
        const target = board[tr][tc];
        if (!target) {
          moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: null });
        } else {
          if (target.color !== piece.color) {
            moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: { ...target } });
          }
          break; // Stop at first piece encountered
        }
        tc += dc;
        tr += dr;
      }
    }
  }

  function generateCannonMoves(board, from, piece, moves) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [dc, dr] of dirs) {
      let tc = from.col + dc;
      let tr = from.row + dr;
      let platformFound = false;

      while (tc >= 0 && tc <= 8 && tr >= 0 && tr <= 9) {
        const target = board[tr][tc];

        if (!platformFound) {
          if (!target) {
            // Non-capturing movement before platform
            moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: null });
          } else {
            // First piece encountered becomes the platform (Ngòi pháo)
            platformFound = true;
          }
        } else {
          // After platform, look for target piece to capture
          if (target) {
            if (target.color !== piece.color) {
              moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: { ...target } });
            }
            break; // Cannon can only jump one platform and capture the first piece after it
          }
        }

        tc += dc;
        tr += dr;
      }
    }
  }

  function generatePawnMoves(board, from, piece, moves) {
    const isRed = piece.color === 'r';
    const forwardDir = isRed ? -1 : 1;
    const crossedRiver = isRed ? from.row <= 4 : from.row >= 5;

    // 1. Forward move (always available if inside board)
    const fc = from.col;
    const fr = from.row + forwardDir;
    if (fr >= 0 && fr <= 9) {
      const target = board[fr][fc];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { ...from }, to: { col: fc, row: fr }, piece: { ...piece }, captured: target ? { ...target } : null });
      }
    }

    // 2. Sideways moves (only after crossing river)
    if (crossedRiver) {
      const sideDirs = [-1, 1];
      for (const sc of sideDirs) {
        const tc = from.col + sc;
        const tr = from.row;
        if (tc >= 0 && tc <= 8) {
          const target = board[tr][tc];
          if (!target || target.color !== piece.color) {
            moves.push({ from: { ...from }, to: { col: tc, row: tr }, piece: { ...piece }, captured: target ? { ...target } : null });
          }
        }
      }
    }
  }

  function isSquareAttacked(board, targetCol, targetRow, attackerColor) {
    const pseudoMoves = generatePseudoLegalMoves(board, attackerColor);
    return pseudoMoves.some(m => m.to.col === targetCol && m.to.row === targetRow);
  }

  function isKingInCheck(board, kingColor) {
    const kingPos = findKingPosition(board, kingColor);
    if (!kingPos) return false;
    const attackerColor = kingColor === 'r' ? 'b' : 'r';

    // 1. Direct attack check
    if (isSquareAttacked(board, kingPos.col, kingPos.row, attackerColor)) {
      return true;
    }

    // 2. Flying General rule check (Counts as check/illegal)
    if (isFlyingGeneral(board)) {
      return true;
    }

    return false;
  }

  function generateLegalMoves(board, sideToMove) {
    const pseudoMoves = generatePseudoLegalMoves(board, sideToMove);
    const legalMoves = [];

    for (const move of pseudoMoves) {
      // Simulate move
      const { from, to } = move;
      const originalFromPiece = board[from.row][from.col];
      const originalToPiece = board[to.row][to.col];

      board[to.row][to.col] = originalFromPiece;
      board[from.row][from.col] = null;

      // Check if move leaves own king in check or causes flying general
      const kingInCheck = isKingInCheck(board, sideToMove);

      // Revert move
      board[from.row][from.col] = originalFromPiece;
      board[to.row][to.col] = originalToPiece;

      if (!kingInCheck) {
        legalMoves.push(move);
      }
    }

    return legalMoves;
  }

  const MoveGenerator = {
    generatePseudoLegalMoves,
    generateLegalMoves,
    isKingInCheck,
    isFlyingGeneral,
    findKingPosition,
    isInsidePalace,
    isSquareAttacked
  };

  exports.MoveGenerator = MoveGenerator;
})(typeof exports !== 'undefined' ? exports : (window.MoveGeneratorModule = {}));
