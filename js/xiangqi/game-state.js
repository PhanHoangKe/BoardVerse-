/**
 * GameState - Single Source of Truth for Xiangqi Game
 * Manages standard 9x10 Xiangqi board state, move history, captured pieces, bot side, and game status.
 */

(function(exports) {
  'use strict';

  // Standard Xiangqi initial board setup (9 cols x 10 rows)
  // Row 0 is Black base, Row 9 is Red base
  function createInitialBoard() {
    const board = Array(10).fill(null).map(() => Array(9).fill(null));

    // Black pieces (Row 0 - 3)
    board[0][0] = { type: 'r', color: 'b' };
    board[0][1] = { type: 'n', color: 'b' };
    board[0][2] = { type: 'b', color: 'b' };
    board[0][3] = { type: 'a', color: 'b' };
    board[0][4] = { type: 'k', color: 'b' };
    board[0][5] = { type: 'a', color: 'b' };
    board[0][6] = { type: 'b', color: 'b' };
    board[0][7] = { type: 'n', color: 'b' };
    board[0][8] = { type: 'r', color: 'b' };

    board[2][1] = { type: 'c', color: 'b' };
    board[2][7] = { type: 'c', color: 'b' };

    board[3][0] = { type: 'p', color: 'b' };
    board[3][2] = { type: 'p', color: 'b' };
    board[3][4] = { type: 'p', color: 'b' };
    board[3][6] = { type: 'p', color: 'b' };
    board[3][8] = { type: 'p', color: 'b' };

    // Red pieces (Row 6 - 9)
    board[9][0] = { type: 'r', color: 'r' };
    board[9][1] = { type: 'n', color: 'r' };
    board[9][2] = { type: 'b', color: 'r' };
    board[9][3] = { type: 'a', color: 'r' };
    board[9][4] = { type: 'k', color: 'r' };
    board[9][5] = { type: 'a', color: 'r' };
    board[9][6] = { type: 'b', color: 'r' };
    board[9][7] = { type: 'n', color: 'r' };
    board[9][8] = { type: 'r', color: 'r' };

    board[7][1] = { type: 'c', color: 'r' };
    board[7][7] = { type: 'c', color: 'r' };

    board[6][0] = { type: 'p', color: 'r' };
    board[6][2] = { type: 'p', color: 'r' };
    board[6][4] = { type: 'p', color: 'r' };
    board[6][6] = { type: 'p', color: 'r' };
    board[6][8] = { type: 'p', color: 'r' };

    return board;
  }

  function cloneBoard(board) {
    return board.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  class XiangqiGameState {
    constructor() {
      this.reset();
    }

    reset() {
      this.gameId = generateUUID();
      this.board = createInitialBoard();
      this.sideToMove = 'r'; // Red always goes first in Xiangqi standard rules
      this.botColor = null;   // 'r' or 'b' chosen by user for Bot
      this.botSide = null;    // alias for botColor
      this.playerSide = null; // Opponent side ('b' or 'r')
      this.opponentColor = null;
      this.moveHistory = []; // Array of snapshots/moves
      this.historyIndex = -1; // Current ply index in history
      this.capturedPieces = { r: [], b: [] };
      this.status = 'SELECT_SIDE'; // 'SELECT_SIDE', 'PLAYING', 'CHECK', 'CHECKMATE', 'STALEMATE', 'DRAW'
      this.winner = null; // 'r', 'b', 'draw', null
      this.checkState = { isCheck: false, checkedSide: null };
      this.orientation = 'r'; // UI display perspective (ALWAYS = botColor once chosen)
      this.plyCount = 0;

      // Save initial snapshot
      this.saveSnapshot(null);
    }

    selectBotSide(botColor, orientation = null) {
      if (botColor !== 'r' && botColor !== 'b') return;
      this.botColor = botColor;
      this.botSide = botColor;
      this.playerSide = botColor === 'r' ? 'b' : 'r';
      this.opponentColor = this.playerSide;
      this.orientation = orientation || botColor;
      this.status = 'PLAYING';

      // Update initial snapshot
      if (this.moveHistory.length > 0) {
        this.moveHistory[0].botColor = this.botColor;
        this.moveHistory[0].botSide = this.botSide;
        this.moveHistory[0].playerSide = this.playerSide;
        this.moveHistory[0].opponentColor = this.opponentColor;
        this.moveHistory[0].orientation = this.orientation;
        this.moveHistory[0].status = this.status;
      }
    }

    setOrientation(orientation) {
      if (orientation === 'r' || orientation === 'b') {
        this.orientation = orientation;
      }
    }

    // Backwards compatible alias
    selectSide(side) {
      this.selectBotSide(side);
    }

    saveSnapshot(lastMove = null) {
      const snapshot = {
        board: cloneBoard(this.board),
        sideToMove: this.sideToMove,
        botColor: this.botColor,
        botSide: this.botSide,
        playerSide: this.playerSide,
        opponentColor: this.opponentColor,
        orientation: this.orientation,
        capturedPieces: {
          r: [...this.capturedPieces.r],
          b: [...this.capturedPieces.b]
        },
        status: this.status,
        winner: this.winner,
        checkState: { ...this.checkState },
        lastMove: lastMove ? { ...lastMove } : null,
        plyCount: this.plyCount
      };

      // Truncate redo history if we make a move from a rewound position
      if (this.historyIndex < this.moveHistory.length - 1) {
        this.moveHistory = this.moveHistory.slice(0, this.historyIndex + 1);
      }

      this.moveHistory.push(snapshot);
      this.historyIndex = this.moveHistory.length - 1;
    }

    applyMove(move) {
      const { from, to } = move;
      const piece = this.board[from.row][from.col];
      if (!piece) return false;

      const targetPiece = this.board[to.row][to.col];
      if (targetPiece) {
        // Add to captured pieces of opponent
        this.capturedPieces[this.sideToMove].push({ ...targetPiece });
        move.captured = { ...targetPiece };
      }

      // Execute move on board
      this.board[to.row][to.col] = piece;
      this.board[from.row][from.col] = null;

      // Switch turn
      this.sideToMove = this.sideToMove === 'r' ? 'b' : 'r';
      this.plyCount++;

      move.ply = this.plyCount;
      move.movedPiece = piece;

      // Save state snapshot
      this.saveSnapshot(move);
      return true;
    }

    undo() {
      if (this.historyIndex <= 0) return false;
      this.historyIndex--;
      this.restoreSnapshot(this.moveHistory[this.historyIndex]);
      return true;
    }

    redo() {
      if (this.historyIndex >= this.moveHistory.length - 1) return false;
      this.historyIndex++;
      this.restoreSnapshot(this.moveHistory[this.historyIndex]);
      return true;
    }

    rewindToStart() {
      if (this.moveHistory.length === 0) return false;
      this.historyIndex = 0;
      this.restoreSnapshot(this.moveHistory[0]);
      return true;
    }

    jumpToMove(index) {
      if (index < 0 || index >= this.moveHistory.length) return false;
      this.historyIndex = index;
      this.restoreSnapshot(this.moveHistory[this.historyIndex]);
      return true;
    }

    restoreSnapshot(snapshot) {
      this.board = cloneBoard(snapshot.board);
      this.sideToMove = snapshot.sideToMove;
      this.botColor = snapshot.botColor;
      this.botSide = snapshot.botSide;
      this.playerSide = snapshot.playerSide;
      this.opponentColor = snapshot.opponentColor;
      this.orientation = snapshot.orientation;
      this.capturedPieces = {
        r: [...snapshot.capturedPieces.r],
        b: [...snapshot.capturedPieces.b]
      };
      this.status = snapshot.status;
      this.winner = snapshot.winner;
      this.checkState = { ...snapshot.checkState };
      this.plyCount = snapshot.plyCount;
    }

    setCheckState(isCheck, checkedSide, isCheckmate = false, isStalemate = false) {
      this.checkState = { isCheck, checkedSide };
      if (isCheckmate) {
        this.status = 'CHECKMATE';
        this.winner = checkedSide === 'r' ? 'b' : 'r';
      } else if (isStalemate) {
        this.status = 'STALEMATE';
        // In Xiangqi standard rules, the player with NO legal moves loses (Bí / Stalemate = Loss)
        this.winner = checkedSide === 'r' ? 'b' : 'r';
      } else if (isCheck) {
        this.status = 'CHECK';
      } else {
        this.status = 'PLAYING';
      }

      // Update current snapshot check state
      if (this.historyIndex >= 0 && this.historyIndex < this.moveHistory.length) {
        this.moveHistory[this.historyIndex].status = this.status;
        this.moveHistory[this.historyIndex].winner = this.winner;
        this.moveHistory[this.historyIndex].checkState = { ...this.checkState };
      }
    }

    isCurrentTurnBot() {
      if (this.status !== 'PLAYING' && this.status !== 'CHECK') {
        return false;
      }
      return this.botColor !== null && this.sideToMove === this.botColor;
    }

    isCurrentTurnHuman() {
      if (this.status !== 'PLAYING' && this.status !== 'CHECK') {
        return false;
      }
      return this.botColor !== null && this.sideToMove !== this.botColor;
    }

    getCurrentMove() {
      if (this.historyIndex < 0 || !this.moveHistory[this.historyIndex]) return null;
      return this.moveHistory[this.historyIndex].lastMove;
    }

    getPieceAt(col, row) {
      if (row < 0 || row > 9 || col < 0 || col > 8) return null;
      return this.board[row][col];
    }
  }

  exports.XiangqiGameState = XiangqiGameState;
})(typeof exports !== 'undefined' ? exports : (window.XiangqiGameStateModule = {}));
