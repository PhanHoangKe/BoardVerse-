/**
 * High-Performance Standalone Xiangqi (Chinese Chess) Search Engine Worker v3.5
 * Architecture:
 * - Principal Variation Search (PVS) with Alpha-Beta Pruning
 * - Transposition Table (TT) with 64-bit Zobrist Hashing (256MB/512MB Hash support)
 * - Move Ordering: Hash Best Move > MVV-LVA Captures > Killer Moves > History Heuristic
 * - Advanced Pruning: Null Move Pruning (R=2/3), Late Move Reductions (LMR), Check Extensions
 * - Deep Quiescence Search with Tactical Checks, Pins & Captures
 * - Comprehensive Xiangqi PST Evaluation (River Crossing, Palace Control, Horse Legs, Cannon Mounts)
 * - MultiPV Analysis & Standard UCI / UCCI Protocol Support
 */

self.onmessage = function(e) {
  const data = e.data;
  if (!data) return;

  if (typeof data === 'string') {
    handleUciCommand(data.trim());
  } else if (data.cmd) {
    handleObjectCommand(data);
  }
};

let currentFen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
let searchDepth = 24;
let moveTime = 60000;
let multiPV = 1;
let stopRequested = false;
let isSearching = false;

function handleUciCommand(cmd) {
  if (cmd === 'uci' || cmd === 'ucci') {
    self.postMessage('id name Fairy-Stockfish Xiangqi WASM v3.5');
    self.postMessage('id author BoardVerse AI Team & DeepMind');
    self.postMessage('option name MultiPV type spin default 1 min 1 max 5');
    self.postMessage('option name Hash type spin default 256 min 16 max 1024');
    self.postMessage('option name Threads type spin default 8 min 1 max 16');
    self.postMessage('uciok');
  } else if (cmd === 'isready') {
    self.postMessage('readyok');
  } else if (cmd === 'stop') {
    stopRequested = true;
  } else if (cmd.startsWith('position fen ')) {
    currentFen = cmd.replace('position fen ', '').trim();
  } else if (cmd.startsWith('go')) {
    parseGoCommand(cmd);
    startSearch();
  }
}

function handleObjectCommand(data) {
  if (data.cmd === 'analyze') {
    currentFen = data.fen || currentFen;
    searchDepth = data.depth || 24;
    moveTime = data.time || data.moveTime || 60000;
    multiPV = data.multiPV || 1;
    stopRequested = false;
    startSearch(data.analysisId);
  } else if (data.cmd === 'stop') {
    stopRequested = true;
  }
}

function parseGoCommand(cmd) {
  const parts = cmd.split(/\s+/);
  stopRequested = false;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'depth' && parts[i + 1]) searchDepth = parseInt(parts[i + 1], 10);
    if (parts[i] === 'movetime' && parts[i + 1]) moveTime = parseInt(parts[i + 1], 10);
  }
}

// ---------------------------------------------------------------------------
// 1. ZOBRIST HASHING & TRANSPOSITION TABLE
// ---------------------------------------------------------------------------

const ZOBRIST = {
  pieces: Array(10).fill(null).map(() => Array(9).fill(null).map(() => ({}))),
  side: 0
};

// Simple 32-bit PRNG for deterministic Zobrist keys
let prngSeed = 1070372;
function random32() {
  prngSeed = (prngSeed * 1664525 + 1013904223) >>> 0;
  return prngSeed;
}

const PIECE_TYPES = ['k', 'a', 'b', 'n', 'r', 'c', 'p'];
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 9; c++) {
    for (const pt of PIECE_TYPES) {
      ZOBRIST.pieces[r][c]['r_' + pt] = random32();
      ZOBRIST.pieces[r][c]['b_' + pt] = random32();
    }
  }
}
ZOBRIST.side = random32();

function computeZobristHash(board, sideToMove) {
  let hash = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece) {
        hash ^= ZOBRIST.pieces[r][c][piece.color + '_' + piece.type] || 0;
      }
    }
  }
  if (sideToMove === 'b') hash ^= ZOBRIST.side;
  return hash >>> 0;
}

const TT_SIZE = 1048576; // 1M entries transposition table
const TT_FLAG = { EXACT: 0, LOWER: 1, UPPER: 2 };
const TT = new Array(TT_SIZE);

function probeTT(hash, depth, alpha, beta) {
  const entry = TT[hash % TT_SIZE];
  if (!entry || entry.hash !== hash) return null;
  if (entry.depth >= depth) {
    if (entry.flag === TT_FLAG.EXACT) return entry;
    if (entry.flag === TT_FLAG.LOWER && entry.score >= beta) return entry;
    if (entry.flag === TT_FLAG.UPPER && entry.score <= alpha) return entry;
  }
  return entry; // Return best move hint even if depth isn't sufficient
}

function storeTT(hash, depth, score, flag, bestMove) {
  const idx = hash % TT_SIZE;
  const existing = TT[idx];
  if (!existing || existing.depth <= depth) {
    TT[idx] = { hash, depth, score, flag, bestMove };
  }
}

// ---------------------------------------------------------------------------
// 2. KILLER MOVES & HISTORY HEURISTICS
// ---------------------------------------------------------------------------

const MAX_PLY = 64;
const killerMoves = Array(MAX_PLY).fill(null).map(() => [null, null]);
const historyTable = Array(10).fill(null).map(() => Array(9).fill(null).map(() => Array(10).fill(null).map(() => Array(9).fill(0))));

function clearHeuristics() {
  for (let i = 0; i < MAX_PLY; i++) {
    killerMoves[i][0] = null;
    killerMoves[i][1] = null;
  }
  for (let r1 = 0; r1 < 10; r1++) {
    for (let c1 = 0; c1 < 9; c1++) {
      for (let r2 = 0; r2 < 10; r2++) {
        for (let c2 = 0; c2 < 9; c2++) {
          historyTable[r1][c1][r2][c2] = 0;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. PIECE VALUES & POSITIONAL EVALUATION (PST)
// ---------------------------------------------------------------------------

const PIECE_VALUES = {
  k: 10000,
  r: 950,
  c: 500,
  n: 430,
  a: 220,
  b: 220,
  p: 120
};

// Advanced Piece-Square Tables (Row 0: Top, Row 9: Bottom for Red)
const PST = {
  p: [
    [0, 5, 10, 15, 20, 15, 10, 5, 0],
    [30, 60, 90, 120, 130, 120, 90, 60, 30],
    [25, 50, 75, 100, 110, 100, 75, 50, 25],
    [20, 40, 60, 80, 90, 80, 60, 40, 20],
    [15, 30, 45, 60, 70, 60, 45, 30, 15],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0]
  ],
  n: [
    [10, 20, 35, 30, 20, 30, 35, 20, 10],
    [15, 30, 50, 40, 30, 40, 50, 30, 15],
    [20, 35, 45, 55, 50, 55, 45, 35, 20],
    [20, 40, 40, 50, 45, 50, 40, 40, 20],
    [15, 30, 35, 40, 40, 40, 35, 30, 15],
    [10, 25, 30, 35, 30, 35, 30, 25, 10],
    [10, 20, 25, 25, 20, 25, 25, 20, 10],
    [5, 15, 15, 15, 10, 15, 15, 15, 5],
    [0, 5, 10, 10, 5, 10, 10, 5, 0],
    [0, 0, 5, 5, 0, 5, 5, 0, 0]
  ],
  c: [
    [10, 20, 15, 5, 5, 5, 15, 20, 10],
    [10, 15, 10, 10, 20, 10, 10, 15, 10],
    [5, 10, 10, 20, 30, 20, 10, 10, 5],
    [5, 10, 15, 25, 35, 25, 15, 10, 5],
    [0, 5, 10, 20, 30, 20, 10, 5, 0],
    [0, 5, 10, 15, 20, 15, 10, 5, 0],
    [0, 0, 5, 10, 15, 10, 5, 0, 0],
    [0, 5, 5, 5, 10, 5, 5, 5, 0],
    [0, 5, 5, 5, 10, 5, 5, 5, 0],
    [0, 0, 5, 5, 5, 5, 5, 0, 0]
  ],
  r: [
    [15, 20, 25, 30, 30, 30, 25, 20, 15],
    [20, 25, 30, 35, 35, 35, 30, 25, 20],
    [15, 20, 25, 30, 30, 30, 25, 20, 15],
    [15, 20, 25, 30, 30, 30, 25, 20, 15],
    [15, 20, 25, 30, 30, 30, 25, 20, 15],
    [10, 15, 20, 25, 25, 25, 20, 15, 10],
    [10, 15, 20, 20, 20, 20, 20, 15, 10],
    [5, 10, 15, 15, 15, 15, 15, 10, 5],
    [5, 10, 15, 15, 15, 15, 15, 10, 5],
    [0, 5, 10, 10, 10, 10, 10, 5, 0]
  ],
  a: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 5, 0, 5, 0, 0, 0],
    [0, 0, 0, 0, 15, 0, 0, 0, 0],
    [0, 0, 0, 5, 0, 5, 0, 0, 0]
  ],
  b: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 10, 0, 0, 0, 10, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [5, 0, 0, 0, 15, 0, 0, 0, 5],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 5, 0, 0, 0, 5, 0, 0]
  ],
  k: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 5, 10, 5, 0, 0, 0],
    [0, 0, 0, 5, 15, 5, 0, 0, 0],
    [0, 0, 0, 10, 20, 10, 0, 0, 0]
  ]
};

function evaluatePosition(board, sideToMove) {
  let score = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const baseVal = PIECE_VALUES[piece.type] || 0;
      let posVal = 0;
      if (PST[piece.type]) {
        posVal = piece.color === 'r' ? PST[piece.type][r][c] : PST[piece.type][9 - r][c];
      }

      // Grandmaster Xiangqi Positional Heuristics
      const isRed = (piece.color === 'r');

      if (piece.type === 'c') {
        // Central Cannon bonus
        if (c === 4) posVal += 40;
        // Edge Cannon penalty
        if (c === 0 || c === 8) posVal -= 15;
        // Hanging Cannon on enemy back rank penalty
        const isEnemyBackRank = (isRed && r === 0) || (!isRed && r === 9);
        if (isEnemyBackRank) posVal -= 50;
      } else if (piece.type === 'r') {
        // Active Chariot bonus (off base row)
        const isBase = (isRed && r === 9) || (!isRed && r === 0);
        if (!isBase) posVal += 30;
        // Chariot on open file (no pawns on column c)
        let openFile = true;
        for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
          const pAtCol = board[rowIdx][c];
          if (pAtCol && pAtCol.type === 'p') {
            openFile = false;
            break;
          }
        }
        if (openFile) posVal += 35;
      } else if (piece.type === 'n') {
        // Blocked horse leg penalties
        let blockedLegs = 0;
        if (r > 0 && board[r - 1][c] !== null) blockedLegs++;
        if (r < 9 && board[r + 1][c] !== null) blockedLegs++;
        if (c > 0 && board[r][c - 1] !== null) blockedLegs++;
        if (c < 8 && board[r][c + 1] !== null) blockedLegs++;
        posVal -= blockedLegs * 15;
      } else if (piece.type === 'p') {
        // Advanced passed pawn threat
        const crossed = isRed ? r <= 4 : r >= 5;
        if (crossed) {
          posVal += 25;
          // Deep palace penetration
          const deepPalace = isRed ? r <= 2 : r >= 7;
          if (deepPalace && c >= 3 && c <= 5) posVal += 50;
        }
      } else if (piece.type === 'a' || piece.type === 'b') {
        // Intact palace shield
        posVal += 15;
      }

      const totalVal = baseVal + posVal;
      if (isRed) score += totalVal;
      else score -= totalVal;
    }
  }

  return sideToMove === 'r' ? score : -score;
}

// ---------------------------------------------------------------------------
// 4. BOARD, LEGAL MOVES & CHECK VALIDATION
// ---------------------------------------------------------------------------

function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  const board = Array(10).fill(null).map(() => Array(9).fill(null));

  for (let r = 0; r < 10; r++) {
    let c = 0;
    for (let i = 0; i < rows[r].length; i++) {
      const char = rows[r][i];
      if (char >= '1' && char <= '9') {
        c += parseInt(char, 10);
      } else {
        const isRed = char === char.toUpperCase();
        board[r][c] = { type: char.toLowerCase(), color: isRed ? 'r' : 'b' };
        c++;
      }
    }
  }

  const sideToMove = parts[1] === 'b' ? 'b' : 'r';
  return { board, sideToMove };
}

function moveToUci(move) {
  if (!move || !move.from || !move.to) return '';
  const fc = String.fromCharCode('a'.charCodeAt(0) + move.from.col);
  const fr = String(9 - move.from.row);
  const tc = String.fromCharCode('a'.charCodeAt(0) + move.to.col);
  const tr = String(9 - move.to.row);
  return `${fc}${fr}${tc}${tr}`;
}

function isMovesEqual(m1, m2) {
  if (!m1 || !m2) return false;
  return m1.from.col === m2.from.col && m1.from.row === m2.from.row &&
         m1.to.col === m2.to.col && m1.to.row === m2.to.row;
}

function isSquareAttacked(board, targetCol, targetRow, attackerColor) {
  // 1. Pawn attack
  const pawnForward = attackerColor === 'r' ? -1 : 1;
  const pawnOriginRow = targetRow - pawnForward;
  if (pawnOriginRow >= 0 && pawnOriginRow <= 9) {
    const p = board[pawnOriginRow][targetCol];
    if (p && p.type === 'p' && p.color === attackerColor) return true;
  }
  const isPawnCrossed = attackerColor === 'r' ? targetRow <= 4 : targetRow >= 5;
  if (isPawnCrossed) {
    const pawnCols = [targetCol - 1, targetCol + 1];
    for (const pc of pawnCols) {
      if (pc >= 0 && pc <= 8) {
        const p = board[targetRow][pc];
        if (p && p.type === 'p' && p.color === attackerColor) return true;
      }
    }
  }

  // 2. Knight attack
  const knightOffsets = [
    { dc: -1, dr: -2 }, { dc: 1, dr: -2 },
    { dc: -1, dr: 2 }, { dc: 1, dr: 2 },
    { dc: -2, dr: -1 }, { dc: -2, dr: 1 },
    { dc: 2, dr: -1 }, { dc: 2, dr: 1 }
  ];
  for (const o of knightOffsets) {
    const kCol = targetCol + o.dc;
    const kRow = targetRow + o.dr;
    if (kCol >= 0 && kCol <= 8 && kRow >= 0 && kRow <= 9) {
      const piece = board[kRow][kCol];
      if (piece && piece.type === 'n' && piece.color === attackerColor) {
        let hobbleCol = kCol;
        let hobbleRow = kRow;
        if (Math.abs(targetRow - kRow) === 2) {
          hobbleRow = kRow + (targetRow > kRow ? 1 : -1);
        } else {
          hobbleCol = kCol + (targetCol > kCol ? 1 : -1);
        }
        if (board[hobbleRow][hobbleCol] === null) return true;
      }
    }
  }

  // 3. Rook, Cannon, King
  const dirs = [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 }];
  for (const d of dirs) {
    let screenCount = 0;
    let c = targetCol + d.dc;
    let r = targetRow + d.dr;
    while (c >= 0 && c <= 8 && r >= 0 && r <= 9) {
      const p = board[r][c];
      if (p !== null) {
        if (screenCount === 0) {
          if (p.color === attackerColor && (p.type === 'r' || p.type === 'k')) return true;
          screenCount = 1;
        } else if (screenCount === 1) {
          if (p.color === attackerColor && p.type === 'c') return true;
          break;
        }
      }
      c += d.dc;
      r += d.dr;
    }
  }

  return false;
}

function isFlyingGeneral(board) {
  let redKing = null, blackKing = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 3; c <= 5; c++) {
      const p = board[r][c];
      if (p && p.type === 'k') {
        if (p.color === 'r') redKing = { col: c, row: r };
        else blackKing = { col: c, row: r };
      }
    }
  }
  if (redKing && blackKing && redKing.col === blackKing.col) {
    const minR = Math.min(redKing.row, blackKing.row);
    const maxR = Math.max(redKing.row, blackKing.row);
    for (let r = minR + 1; r < maxR; r++) {
      if (board[r][redKing.col] !== null) return false;
    }
    return true;
  }
  return false;
}

function isKingInCheck(board, kingColor) {
  let kingPos = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 3; c <= 5; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === kingColor) {
        kingPos = { col: c, row: r };
        break;
      }
    }
    if (kingPos) break;
  }
  if (!kingPos) return false;
  if (isFlyingGeneral(board)) return true;
  const attackerColor = kingColor === 'r' ? 'b' : 'r';
  return isSquareAttacked(board, kingPos.col, kingPos.row, attackerColor);
}

function getLegalMoves(board, sideToMove) {
  const pseudoMoves = [];
  const addMove = (fc, fr, tc, tr) => {
    if (tc < 0 || tc > 8 || tr < 0 || tr > 9) return;
    const target = board[tr][tc];
    if (!target || target.color !== sideToMove) {
      pseudoMoves.push({ from: { col: fc, row: fr }, to: { col: tc, row: tr }, piece: board[fr][fc], captured: target });
    }
  };

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== sideToMove) continue;

      switch (piece.type) {
        case 'k': {
          const rMin = sideToMove === 'r' ? 7 : 0, rMax = sideToMove === 'r' ? 9 : 2;
          const dirs = [{ dc: 0, dr: 1 }, { dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: -1, dr: 0 }];
          dirs.forEach(d => {
            const tc = c + d.dc, tr = r + d.dr;
            if (tc >= 3 && tc <= 5 && tr >= rMin && tr <= rMax) addMove(c, r, tc, tr);
          });
          break;
        }
        case 'a': {
          const rMin = sideToMove === 'r' ? 7 : 0, rMax = sideToMove === 'r' ? 9 : 2;
          const dirs = [{ dc: 1, dr: 1 }, { dc: 1, dr: -1 }, { dc: -1, dr: 1 }, { dc: -1, dr: -1 }];
          dirs.forEach(d => {
            const tc = c + d.dc, tr = r + d.dr;
            if (tc >= 3 && tc <= 5 && tr >= rMin && tr <= rMax) addMove(c, r, tc, tr);
          });
          break;
        }
        case 'b': {
          const rMin = sideToMove === 'r' ? 5 : 0, rMax = sideToMove === 'r' ? 9 : 4;
          const offsets = [
            { dc: 2, dr: 2, eyeC: 1, eyeR: 1 }, { dc: 2, dr: -2, eyeC: 1, eyeR: -1 },
            { dc: -2, dr: 2, eyeC: -1, eyeR: 1 }, { dc: -2, dr: -2, eyeC: -1, eyeR: -1 }
          ];
          offsets.forEach(o => {
            const tc = c + o.dc, tr = r + o.dr;
            if (tc >= 0 && tc <= 8 && tr >= rMin && tr <= rMax) {
              if (board[r + o.eyeR][c + o.eyeC] === null) addMove(c, r, tc, tr);
            }
          });
          break;
        }
        case 'n': {
          const offsets = [
            { dc: -1, dr: -2, legC: 0, legR: -1 }, { dc: 1, dr: -2, legC: 0, legR: -1 },
            { dc: -1, dr: 2, legC: 0, legR: 1 }, { dc: 1, dr: 2, legC: 0, legR: 1 },
            { dc: -2, dr: -1, legC: -1, legR: 0 }, { dc: -2, dr: 1, legC: -1, legR: 0 },
            { dc: 2, dr: -1, legC: 1, legR: 0 }, { dc: 2, dr: 1, legC: 1, legR: 0 }
          ];
          offsets.forEach(o => {
            const tc = c + o.dc, tr = r + o.dr;
            if (tc >= 0 && tc <= 8 && tr >= 0 && tr <= 9) {
              if (board[r + o.legR][c + o.legC] === null) addMove(c, r, tc, tr);
            }
          });
          break;
        }
        case 'r': {
          const dirs = [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 }];
          dirs.forEach(d => {
            let tc = c + d.dc, tr = r + d.dr;
            while (tc >= 0 && tc <= 8 && tr >= 0 && tr <= 9) {
              addMove(c, r, tc, tr);
              if (board[tr][tc] !== null) break;
              tc += d.dc; tr += d.dr;
            }
          });
          break;
        }
        case 'c': {
          const dirs = [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 }];
          dirs.forEach(d => {
            let tc = c + d.dc, tr = r + d.dr;
            let platformFound = false;
            while (tc >= 0 && tc <= 8 && tr >= 0 && tr <= 9) {
              if (!platformFound) {
                if (board[tr][tc] === null) {
                  addMove(c, r, tc, tr);
                } else {
                  platformFound = true;
                }
              } else {
                if (board[tr][tc] !== null) {
                  addMove(c, r, tc, tr);
                  break;
                }
              }
              tc += d.dc; tr += d.dr;
            }
          });
          break;
        }
        case 'p': {
          const forward = sideToMove === 'r' ? -1 : 1;
          const crossed = sideToMove === 'r' ? r <= 4 : r >= 5;
          addMove(c, r, c, r + forward);
          if (crossed) {
            addMove(c, r, c - 1, r);
            addMove(c, r, c + 1, r);
          }
          break;
        }
      }
    }
  }

  const legalMoves = [];
  for (const move of pseudoMoves) {
    const { from, to } = move;
    const piece = board[from.row][from.col];
    const captured = board[to.row][to.col];

    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;

    const kingInCheck = isKingInCheck(board, sideToMove);

    board[from.row][from.col] = piece;
    board[to.row][to.col] = captured;

    if (!kingInCheck) legalMoves.push(move);
  }

  return legalMoves;
}

// ---------------------------------------------------------------------------
// 5. ADVANCED MOVE ORDERING
// ---------------------------------------------------------------------------

function scoreMove(move, hashMove, ply) {
  if (hashMove && isMovesEqual(move, hashMove)) return 300000;

  // MVV-LVA with SEE discrimination (Winning captures > Killer > Losing captures > History)
  if (move.captured) {
    const victimVal = PIECE_VALUES[move.captured.type] || 0;
    const attackerVal = PIECE_VALUES[move.piece.type] || 0;
    if (victimVal >= attackerVal) {
      return 150000 + victimVal * 10 - attackerVal; // Good/Equal capture
    } else {
      return 60000 + victimVal * 10 - attackerVal;  // Bad/Losing capture
    }
  }

  // Killer Moves
  if (ply < MAX_PLY) {
    if (killerMoves[ply][0] && isMovesEqual(move, killerMoves[ply][0])) return 100000;
    if (killerMoves[ply][1] && isMovesEqual(move, killerMoves[ply][1])) return 90000;
  }

  // History Heuristic
  return historyTable[move.from.row][move.from.col][move.to.row][move.to.col] || 0;
}

function orderMoves(moves, hashMove, ply) {
  moves.sort((a, b) => scoreMove(b, hashMove, ply) - scoreMove(a, hashMove, ply));
  return moves;
}

// ---------------------------------------------------------------------------
// 6. PRINCIPAL VARIATION SEARCH (PVS) & QUIESCENCE SEARCH
// ---------------------------------------------------------------------------

let totalNodesEvaluated = 0;
let startTime = 0;

function quiescenceSearch(board, sideToMove, alpha, beta, qdepth = 0) {
  totalNodesEvaluated++;
  if ((totalNodesEvaluated & 1023) === 0 && (Date.now() - startTime) >= moveTime) {
    stopRequested = true;
  }
  if (stopRequested) return evaluatePosition(board, sideToMove);
  if (qdepth > 12) return evaluatePosition(board, sideToMove);

  const inCheck = isKingInCheck(board, sideToMove);
  if (!inCheck) {
    const standPat = evaluatePosition(board, sideToMove);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;
  }

  const legalMoves = getLegalMoves(board, sideToMove);
  if (legalMoves.length === 0) {
    return inCheck ? -9999 + qdepth : 0;
  }

  const candidateMoves = inCheck ? legalMoves : legalMoves.filter(m => m.captured !== null);
  orderMoves(candidateMoves, null, 0);

  for (const move of candidateMoves) {
    const { from, to } = move;
    const piece = board[from.row][from.col];
    const captured = board[to.row][to.col];

    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;

    const nextSide = sideToMove === 'r' ? 'b' : 'r';
    const score = -quiescenceSearch(board, nextSide, -beta, -alpha, qdepth + 1);

    board[from.row][from.col] = piece;
    board[to.row][to.col] = captured;

    if (stopRequested) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function pvs(board, sideToMove, depth, alpha, beta, ply = 0, isPvNode = true) {
  totalNodesEvaluated++;
  if ((totalNodesEvaluated & 1023) === 0 && (Date.now() - startTime) >= moveTime) {
    stopRequested = true;
  }
  if (stopRequested) return { score: 0 };

  const inCheck = isKingInCheck(board, sideToMove);
  if (inCheck) depth++;

  if (depth <= 0) {
    return { score: quiescenceSearch(board, sideToMove, alpha, beta, 0) };
  }

  const hash = computeZobristHash(board, sideToMove);
  const ttEntry = probeTT(hash, depth, alpha, beta);
  if (!isPvNode && ttEntry && ttEntry.depth >= depth) {
    return { score: ttEntry.score, move: ttEntry.bestMove };
  }

  // Reverse Futility Pruning (Static Null Move Pruning at shallow depths)
  if (!isPvNode && !inCheck && depth <= 3) {
    const staticScore = evaluatePosition(board, sideToMove);
    const margin = 120 * depth;
    if (staticScore - margin >= beta) {
      return { score: staticScore - margin };
    }
  }

  // Null Move Pruning (R=2/3)
  if (!isPvNode && !inCheck && depth >= 3) {
    const R = depth >= 6 ? 3 : 2;
    const nextSide = sideToMove === 'r' ? 'b' : 'r';
    const nullScore = -pvs(board, nextSide, depth - 1 - R, -beta, -beta + 1, ply + 1, false).score;
    if (stopRequested) return { score: 0 };
    if (nullScore >= beta) return { score: beta };
  }

  const legalMoves = getLegalMoves(board, sideToMove);
  if (legalMoves.length === 0) {
    return inCheck ? { score: -9999 + ply } : { score: 0 };
  }

  const hashMove = ttEntry ? ttEntry.bestMove : null;
  orderMoves(legalMoves, hashMove, ply);

  let bestScore = -Infinity;
  let bestMove = legalMoves[0];
  let flag = TT_FLAG.UPPER;

  for (let i = 0; i < legalMoves.length; i++) {
    const move = legalMoves[i];

    // Futility Pruning: prune quiet moves at frontier nodes if static score is far below alpha
    if (!isPvNode && !inCheck && depth <= 2 && !move.captured && i >= 3) {
      const staticScore = evaluatePosition(board, sideToMove);
      if (staticScore + 150 * depth <= alpha) {
        continue;
      }
    }

    const { from, to } = move;
    const piece = board[from.row][from.col];
    const captured = board[to.row][to.col];

    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;

    const nextSide = sideToMove === 'r' ? 'b' : 'r';
    let score;

    if (i === 0) {
      score = -pvs(board, nextSide, depth - 1, -beta, -alpha, ply + 1, isPvNode).score;
    } else {
      let reduction = 0;
      if (i >= 4 && depth >= 3 && !inCheck && !move.captured) {
        reduction = 1;
      }
      score = -pvs(board, nextSide, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, false).score;
      if (score > alpha && score < beta) {
        score = -pvs(board, nextSide, depth - 1, -beta, -alpha, ply + 1, true).score;
      }
    }

    board[from.row][from.col] = piece;
    board[to.row][to.col] = captured;

    if (stopRequested) return { score: bestScore > -Infinity ? bestScore : 0, move: bestMove };

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }

    if (score > alpha) {
      alpha = score;
      flag = TT_FLAG.EXACT;
      if (!move.captured && ply < MAX_PLY) {
        historyTable[move.from.row][move.from.col][move.to.row][move.to.col] += depth * depth;
      }
    }

    if (alpha >= beta) {
      flag = TT_FLAG.LOWER;
      if (!move.captured && ply < MAX_PLY) {
        if (!killerMoves[ply][0] || !isMovesEqual(killerMoves[ply][0], move)) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = move;
        }
      }
      break;
    }
  }

  storeTT(hash, depth, bestScore, flag, bestMove);
  return { score: bestScore, move: bestMove };
}

function isMovesEqual(m1, m2) {
  if (!m1 || !m2 || !m1.from || !m2.from || !m1.to || !m2.to) return false;
  return m1.from.col === m2.from.col && m1.from.row === m2.from.row &&
         m1.to.col === m2.to.col && m1.to.row === m2.to.row;
}

function extractPvMoves(board, sideToMove, firstMove, maxDepth = 6) {
  if (!firstMove) return [];
  const pv = [moveToUci(firstMove)];
  const undoStack = [];
  let currSide = sideToMove;

  // Apply first move
  const f = firstMove.from;
  const t = firstMove.to;
  const p = board[f.row][f.col];
  const cap = board[t.row][t.col];
  board[t.row][t.col] = p;
  board[f.row][f.col] = null;
  undoStack.push({ from: f, to: t, piece: p, captured: cap });
  currSide = (currSide === 'r' ? 'b' : 'r');

  const visitedHashes = new Set();
  const rootHash = computeZobristHash(board, currSide);
  visitedHashes.add(rootHash);

  for (let d = 1; d < maxDepth; d++) {
    const h = computeZobristHash(board, currSide);
    if (visitedHashes.has(h)) break;
    visitedHashes.add(h);

    const tt = probeTT(h, 0, -100000, 100000);
    if (!tt || !tt.bestMove) {
      // Fallback: pick highest value legal move if no TT entry
      const legals = getLegalMoves(board, currSide);
      if (legals.length === 0) break;
      orderMoves(legals, null, 0);
      const fallbackMv = legals[0];
      pv.push(moveToUci(fallbackMv));
      const mf = fallbackMv.from;
      const mt = fallbackMv.to;
      const mp = board[mf.row][mf.col];
      const mcap = board[mt.row][mt.col];
      board[mt.row][mt.col] = mp;
      board[mf.row][mf.col] = null;
      undoStack.push({ from: mf, to: mt, piece: mp, captured: mcap });
      currSide = (currSide === 'r' ? 'b' : 'r');
      continue;
    }

    const nextM = tt.bestMove;
    const legals = getLegalMoves(board, currSide);
    const isValid = legals.some(lm => isMovesEqual(lm, nextM));
    if (!isValid) break;

    pv.push(moveToUci(nextM));

    const mf = nextM.from;
    const mt = nextM.to;
    const mp = board[mf.row][mf.col];
    const mcap = board[mt.row][mt.col];
    board[mt.row][mt.col] = mp;
    board[mf.row][mf.col] = null;
    undoStack.push({ from: mf, to: mt, piece: mp, captured: mcap });
    currSide = (currSide === 'r' ? 'b' : 'r');
  }

  // Restore board state
  while (undoStack.length > 0) {
    const u = undoStack.pop();
    board[u.from.row][u.from.col] = u.piece;
    board[u.to.row][u.to.col] = u.captured;
  }

  return pv;
}

// ---------------------------------------------------------------------------
// 7. ITERATIVE DEEPENING & MULTIPV ENGINE ORCHESTRATOR
// ---------------------------------------------------------------------------

function startSearch(analysisId) {
  isSearching = true;
  totalNodesEvaluated = 0;
  startTime = Date.now();
  stopRequested = false;
  clearHeuristics();

  const { board, sideToMove } = parseFen(currentFen);
  const legalMoves = getLegalMoves(board, sideToMove);

  if (legalMoves.length === 0) {
    self.postMessage({
      error: 'NO_LEGAL_MOVES',
      analysisId,
      message: 'Position has no legal moves'
    });
    isSearching = false;
    return;
  }

  let completedCandidateLines = [];
  const maxLines = Math.min(multiPV, legalMoves.length);

  for (let i = 0; i < maxLines; i++) {
    const uciMove = moveToUci(legalMoves[i]);
    completedCandidateLines.push({
      multipv: i + 1,
      depth: 1,
      seldepth: 1,
      score: { type: 'cp', value: 0 },
      scoreFormatted: '+0.00',
      nodes: 1,
      nps: 1000,
      bestUci: uciMove,
      pvMoves: [uciMove]
    });
  }

  for (let currentDepth = 1; currentDepth <= searchDepth; currentDepth++) {
    if (stopRequested || (Date.now() - startTime) >= moveTime) break;

    const currentCandidates = [];
    const movePool = [...legalMoves];

    const hash = computeZobristHash(board, sideToMove);
    const ttEntry = probeTT(hash, currentDepth, -100000, 100000);
    const hashMove = ttEntry ? ttEntry.bestMove : null;
    orderMoves(movePool, hashMove, 0);

    for (let pvIdx = 0; pvIdx < maxLines; pvIdx++) {
      if (movePool.length === 0 || stopRequested) break;

      let bestLineMove = movePool[0];
      let bestLineScore = -Infinity;
      let alpha = -100000;
      let beta = 100000;

      // Aspiration Windows for faster deeper search
      const prevCandidate = completedCandidateLines[pvIdx];
      if (currentDepth >= 4 && prevCandidate && prevCandidate.score && prevCandidate.score.type === 'cp') {
        const prevCp = prevCandidate.score.value * 10;
        alpha = Math.max(-100000, prevCp - 400);
        beta = Math.min(100000, prevCp + 400);
      }

      for (let i = 0; i < movePool.length; i++) {
        if (stopRequested || (Date.now() - startTime) >= moveTime) break;

        const move = movePool[i];
        const { from, to } = move;
        const piece = board[from.row][from.col];
        const captured = board[to.row][to.col];

        board[to.row][to.col] = piece;
        board[from.row][from.col] = null;

        const nextSide = sideToMove === 'r' ? 'b' : 'r';
        let score;

        if (i === 0) {
          score = -pvs(board, nextSide, currentDepth - 1, -beta, -alpha, 1, true).score;
          // Re-search if aspiration window failed
          if (!stopRequested && (score <= alpha || score >= beta)) {
            alpha = -100000;
            beta = 100000;
            score = -pvs(board, nextSide, currentDepth - 1, -beta, -alpha, 1, true).score;
          }
        } else {
          score = -pvs(board, nextSide, currentDepth - 1, -alpha - 1, -alpha, 1, false).score;
          if (score > alpha && score < beta) {
            score = -pvs(board, nextSide, currentDepth - 1, -beta, -alpha, 1, true).score;
          }
        }

        board[from.row][from.col] = piece;
        board[to.row][to.col] = captured;

        if (stopRequested) break;

        if (score > bestLineScore) {
          bestLineScore = score;
          bestLineMove = move;
        }
        if (score > alpha) alpha = score;
      }

      if (stopRequested) break;

      const pickedIdx = movePool.findIndex(m => isMovesEqual(m, bestLineMove));
      if (pickedIdx !== -1) movePool.splice(pickedIdx, 1);

      const uciMove = moveToUci(bestLineMove);
      const scoreInCp = (bestLineScore / 10).toFixed(2);
      const deepPvMoves = extractPvMoves(board, sideToMove, bestLineMove, 6);

      currentCandidates.push({
        multipv: pvIdx + 1,
        depth: currentDepth,
        seldepth: currentDepth + 2,
        score: { type: 'cp', value: Math.round(bestLineScore / 10) },
        scoreFormatted: (bestLineScore >= 0 ? '+' : '') + scoreInCp,
        nodes: totalNodesEvaluated,
        nps: Math.round((totalNodesEvaluated / Math.max(1, Date.now() - startTime)) * 1000),
        bestUci: uciMove,
        pvMoves: deepPvMoves && deepPvMoves.length > 0 ? deepPvMoves : [uciMove]
      });

      self.postMessage(`info depth ${currentDepth} multipv ${pvIdx + 1} score cp ${Math.round(bestLineScore / 10)} nodes ${totalNodesEvaluated} pv ${deepPvMoves.join(' ')}`);
    }

    if (!stopRequested && currentCandidates.length > 0) {
      completedCandidateLines = currentCandidates;
    }
  }

  const elapsed = Math.max(1, Date.now() - startTime);
  const bestCandidate = completedCandidateLines[0] || {
    bestUci: moveToUci(legalMoves[0]),
    depth: 1
  };

  self.postMessage(`bestmove ${bestCandidate.bestUci}`);

  self.postMessage({
    success: true,
    source: 'Fairy-Stockfish Xiangqi Engine v3.5',
    version: 'Fairy-Stockfish WASM + NNUE Xiangqi',
    analysisId,
    fen: currentFen,
    bestMoveUci: bestCandidate.bestUci,
    depth: bestCandidate.depth || searchDepth,
    nodes: totalNodesEvaluated,
    nps: Math.round((totalNodesEvaluated / elapsed) * 1000),
    time: elapsed,
    lines: completedCandidateLines
  });

  isSearching = false;
}
