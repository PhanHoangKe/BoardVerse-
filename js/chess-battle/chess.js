/**
 * Chess Rules & Position Manager
 * Lightweight, self-contained Chess Engine Rules Module (ES Module)
 * Supports FEN, PGN, Move Generation, Legal Move Validation, SAN/UCI Parsing, Check/Checkmate/Stalemate
 */

export class Chess {
  constructor(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    this.WHITE = 'w';
    this.BLACK = 'b';
    this.PAWN = 'p';
    this.KNIGHT = 'n';
    this.BISHOP = 'b';
    this.ROOK = 'r';
    this.QUEEN = 'q';
    this.KING = 'k';

    this.SQUARES = [];
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const file = String.fromCharCode(97 + f);
        const rank = (r + 1).toString();
        this.SQUARES.push(file + rank);
      }
    }

    this.historyList = [];
    this.load(fen);
  }

  reset() {
    this.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  loadStateFromFen(fen) {
    const tokens = fen.trim().split(/\s+/);
    if (tokens.length < 2) return false;

    const position = tokens[0];
    const turn = tokens[1];
    const castling = tokens[2] || '-';
    const ep = tokens[3] || '-';
    const halfMoves = parseInt(tokens[4] || '0', 10);
    const fullMoves = parseInt(tokens[5] || '1', 10);

    const board = new Array(64).fill(null);
    let row = 7, col = 0;

    for (let i = 0; i < position.length; i++) {
      const c = position[i];
      if (c === '/') {
        row--;
        col = 0;
      } else if (c >= '1' && c <= '8') {
        col += parseInt(c, 10);
      } else {
        const color = c === c.toUpperCase() ? 'w' : 'b';
        const type = c.toLowerCase();
        const sqIndex = row * 8 + col;
        board[sqIndex] = { type, color };
        col++;
      }
    }

    this.boardState = board;
    this.turnColor = turn === 'w' ? 'w' : 'b';
    this.castlingRights = {
      w: { k: castling.includes('K'), q: castling.includes('Q') },
      b: { k: castling.includes('k'), q: castling.includes('q') }
    };
    this.epSquare = ep !== '-' ? ep : null;
    this.halfMoveClock = halfMoves;
    this.fullMoveNumber = fullMoves;
    return true;
  }

  load(fen) {
    const ok = this.loadStateFromFen(fen);
    if (ok) {
      this.startFen = this.fen();
      this.historyList = [];
      this.positionHistory = [this.startFen];
      this.redoStack = [];
    }
    return ok;
  }

  fen() {
    let empty = 0;
    let fenStr = '';

    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const piece = this.boardState[r * 8 + f];
        if (!piece) {
          empty++;
        } else {
          if (empty > 0) {
            fenStr += empty;
            empty = 0;
          }
          const char = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
          fenStr += char;
        }
      }
      if (empty > 0) {
        fenStr += empty;
        empty = 0;
      }
      if (r > 0) fenStr += '/';
    }

    const turnStr = this.turnColor;
    let castlingStr = '';
    if (this.castlingRights.w.k) castlingStr += 'K';
    if (this.castlingRights.w.q) castlingStr += 'Q';
    if (this.castlingRights.b.k) castlingStr += 'k';
    if (this.castlingRights.b.q) castlingStr += 'q';
    if (!castlingStr) castlingStr = '-';

    const epStr = this.epSquare || '-';
    return `${fenStr} ${turnStr} ${castlingStr} ${epStr} ${this.halfMoveClock} ${this.fullMoveNumber}`;
  }

  turn() {
    return this.turnColor;
  }

  setTurn(color) {
    if (color === 'w' || color === 'b') {
      this.turnColor = color;
      if (this.positionHistory && this.positionHistory.length > 0) {
        this.positionHistory[this.positionHistory.length - 1] = this.fen();
      }
      return true;
    }
    return false;
  }



  get(square) {
    const idx = this.squareToIndex(square);
    if (idx === -1) return null;
    return this.boardState[idx];
  }

  put(piece, square) {
    const idx = this.squareToIndex(square);
    if (idx === -1) return false;
    this.boardState[idx] = piece ? { type: piece.type.toLowerCase(), color: piece.color.toLowerCase() } : null;
    return true;
  }

  getKingSquare(color = this.turnColor) {
    for (let i = 0; i < 64; i++) {
      const p = this.boardState[i];
      if (p && p.color === color && p.type === 'k') return this.indexToSquare(i);
    }
    return null;
  }

  getQueenSquare(color = this.turnColor) {
    for (let i = 0; i < 64; i++) {
      const p = this.boardState[i];
      if (p && p.color === color && p.type === 'q') return this.indexToSquare(i);
    }
    return null;
  }

  validateCastlingRights() {
    // Check White Kingside Castling
    if (this.castlingRights.w.k) {
      const kSq = this.getKingSquare('w');
      const r = this.boardState[7]; // h1
      if (!kSq || (kSq !== 'e1' && kSq !== 'd1') || !r || r.type !== 'r' || r.color !== 'w') {
        this.castlingRights.w.k = false;
      }
    }
    // Check White Queenside Castling
    if (this.castlingRights.w.q) {
      const kSq = this.getKingSquare('w');
      const r = this.boardState[0]; // a1
      if (!kSq || (kSq !== 'e1' && kSq !== 'd1') || !r || r.type !== 'r' || r.color !== 'w') {
        this.castlingRights.w.q = false;
      }
    }
    // Check Black Kingside Castling
    if (this.castlingRights.b.k) {
      const kSq = this.getKingSquare('b');
      const r = this.boardState[63]; // h8
      if (!kSq || (kSq !== 'e8' && kSq !== 'd8') || !r || r.type !== 'r' || r.color !== 'b') {
        this.castlingRights.b.k = false;
      }
    }
    // Check Black Queenside Castling
    if (this.castlingRights.b.q) {
      const kSq = this.getKingSquare('b');
      const r = this.boardState[56]; // a8
      if (!kSq || (kSq !== 'e8' && kSq !== 'd8') || !r || r.type !== 'r' || r.color !== 'b') {
        this.castlingRights.b.q = false;
      }
    }
  }

  swapKingQueen() {
    // Swap d1 and e1 (White)
    const d1 = this.get('d1');
    const e1 = this.get('e1');
    this.put(e1, 'd1');
    this.put(d1, 'e1');

    // Swap d8 and e8 (Black)
    const d8 = this.get('d8');
    const e8 = this.get('e8');
    this.put(e8, 'd8');
    this.put(d8, 'e8');

    // Reset history and derived state
    this.epSquare = null;
    this.halfMoveClock = 0;

    // Retain castling rights if pieces present
    this.castlingRights = {
      w: { k: true, q: true },
      b: { k: true, q: true }
    };
    this.validateCastlingRights();

    this.startFen = this.fen();
    this.historyList = [];
    this.positionHistory = [this.startFen];
    this.redoStack = [];
  }

  resetStandardKingQueen() {
    const currentWKingSq = this.getKingSquare('w');
    if (currentWKingSq === 'd1') {
      const d1 = this.get('d1');
      const e1 = this.get('e1');
      this.put(e1, 'd1');
      this.put(d1, 'e1');
    }
    const currentBKingSq = this.getKingSquare('b');
    if (currentBKingSq === 'd8') {
      const d8 = this.get('d8');
      const e8 = this.get('e8');
      this.put(e8, 'd8');
      this.put(d8, 'e8');
    }

    this.epSquare = null;
    this.halfMoveClock = 0;
    this.castlingRights = {
      w: { k: true, q: true },
      b: { k: true, q: true }
    };
    this.validateCastlingRights();

    this.startFen = this.fen();
    this.historyList = [];
    this.positionHistory = [this.startFen];
    this.redoStack = [];
  }



  logStateValidation(label = 'FEN_VALIDATION') {
    const fen = this.fen();
    const stateLog = {
      label,
      fen,
      sideToMove: this.turnColor,
      whiteKingSquare: this.getKingSquare('w'),
      whiteQueenSquare: this.getQueenSquare('w'),
      blackKingSquare: this.getKingSquare('b'),
      blackQueenSquare: this.getQueenSquare('b'),
      castlingRights: JSON.parse(JSON.stringify(this.castlingRights)),
      enPassant: this.epSquare,
      halfmove: this.halfMoveClock,
      fullmove: this.fullMoveNumber
    };
    console.log(`[STATE LOG ${label}]`, stateLog);
    return stateLog;
  }


  remove(square) {
    const idx = this.squareToIndex(square);
    if (idx === -1) return null;
    const piece = this.boardState[idx];
    this.boardState[idx] = null;
    return piece;
  }

  board() {
    const b = [];
    for (let r = 7; r >= 0; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        row.push(this.boardState[r * 8 + f]);
      }
      b.push(row);
    }
    return b;
  }

  squareToIndex(sq) {
    if (typeof sq !== 'string' || sq.length !== 2) return -1;
    const f = sq.charCodeAt(0) - 97;
    const r = parseInt(sq[1], 10) - 1;
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return r * 8 + f;
  }

  indexToSquare(idx) {
    const r = Math.floor(idx / 8);
    const f = idx % 8;
    return String.fromCharCode(97 + f) + (r + 1);
  }

  moves(options = { verbose: false }) {
    const color = options.color || this.turnColor;
    const legalMoves = this.generateLegalMoves(color);
    if (!options.verbose) {
      return legalMoves.map(m => m.san);
    }
    return legalMoves;
  }

  generatePseudoMoves(color = this.turnColor) {
    const moves = [];
    const us = color;
    const them = us === 'w' ? 'b' : 'w';

    for (let idx = 0; idx < 64; idx++) {
      const p = this.boardState[idx];
      if (!p || p.color !== us) continue;

      const r = Math.floor(idx / 8);
      const f = idx % 8;
      const fromSq = this.indexToSquare(idx);

      if (p.type === 'p') {
        const dir = us === 'w' ? 1 : -1;
        const startRank = us === 'w' ? 1 : 6;
        const promRank = us === 'w' ? 7 : 0;

        // 1 step forward
        const r1 = r + dir;
        if (r1 >= 0 && r1 <= 7) {
          const idx1 = r1 * 8 + f;
          if (!this.boardState[idx1]) {
            if (r1 === promRank) {
              ['q', 'r', 'b', 'n'].forEach(pr => {
                moves.push({ from: fromSq, to: this.indexToSquare(idx1), piece: 'p', promotion: pr, color: us });
              });
            } else {
              moves.push({ from: fromSq, to: this.indexToSquare(idx1), piece: 'p', color: us });
              // 2 steps forward
              if (r === startRank) {
                const r2 = r + dir * 2;
                const idx2 = r2 * 8 + f;
                if (!this.boardState[idx2]) {
                  moves.push({ from: fromSq, to: this.indexToSquare(idx2), piece: 'p', color: us });
                }
              }
            }
          }
        }

        // Captures
        [-1, 1].forEach(df => {
          const fCap = f + df;
          if (fCap >= 0 && fCap <= 7 && r1 >= 0 && r1 <= 7) {
            const idxCap = r1 * 8 + fCap;
            const target = this.boardState[idxCap];
            const toSq = this.indexToSquare(idxCap);

            if (target && target.color === them) {
              if (r1 === promRank) {
                ['q', 'r', 'b', 'n'].forEach(pr => {
                  moves.push({ from: fromSq, to: toSq, piece: 'p', captured: target.type, promotion: pr, color: us });
                });
              } else {
                moves.push({ from: fromSq, to: toSq, piece: 'p', captured: target.type, color: us });
              }
            } else if (this.epSquare === toSq) {
              moves.push({ from: fromSq, to: toSq, piece: 'p', captured: 'p', flags: 'e', color: us });
            }
          }
        });
      }

      // Knights
      if (p.type === 'n') {
        const offsets = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
        offsets.forEach(([dr, df]) => {
          const nr = r + dr, nf = f + df;
          if (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
            const nidx = nr * 8 + nf;
            const target = this.boardState[nidx];
            if (!target || target.color === them) {
              moves.push({
                from: fromSq,
                to: this.indexToSquare(nidx),
                piece: 'n',
                captured: target ? target.type : null,
                color: us
              });
            }
          }
        });
      }

      // Kings
      if (p.type === 'k') {
        const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        offsets.forEach(([dr, df]) => {
          const nr = r + dr, nf = f + df;
          if (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
            const nidx = nr * 8 + nf;
            const target = this.boardState[nidx];
            if (!target || target.color === them) {
              moves.push({
                from: fromSq,
                to: this.indexToSquare(nidx),
                piece: 'k',
                captured: target ? target.type : null,
                color: us
              });
            }
          }
        });

        // Castling (Dynamic support for standard e1/e8 and swapped d1/d8 King placement)
        if (!this.inCheck(us)) {
          if (us === 'w' && r === 0) {
            const kSq = f === 4 ? 'e1' : (f === 3 ? 'd1' : null);
            if (kSq) {
              // Kingside Castling
              if (this.castlingRights.w.k && this.boardState[7]?.type === 'r' && this.boardState[7]?.color === 'w') {
                const emptyCheck = kSq === 'e1' ? (!this.boardState[5] && !this.boardState[6]) : (!this.boardState[4] && !this.boardState[5] && !this.boardState[6]);
                const attackCheck = kSq === 'e1' ? (!this.isSquareAttacked('f1', 'b') && !this.isSquareAttacked('g1', 'b')) : (!this.isSquareAttacked('e1', 'b') && !this.isSquareAttacked('f1', 'b'));
                if (emptyCheck && attackCheck) {
                  moves.push({ from: kSq, to: kSq === 'e1' ? 'g1' : 'f1', piece: 'k', flags: 'k', color: us });
                  if (kSq === 'd1') {
                    moves.push({ from: kSq, to: 'g1', piece: 'k', flags: 'k', color: us });
                  }
                }
              }
              // Queenside Castling
              if (this.castlingRights.w.q && this.boardState[0]?.type === 'r' && this.boardState[0]?.color === 'w') {
                const emptyCheck = kSq === 'e1' ? (!this.boardState[3] && !this.boardState[2] && !this.boardState[1]) : (!this.boardState[2] && !this.boardState[1]);
                const attackCheck = kSq === 'e1' ? (!this.isSquareAttacked('d1', 'b') && !this.isSquareAttacked('c1', 'b')) : (!this.isSquareAttacked('c1', 'b') && !this.isSquareAttacked('b1', 'b'));
                if (emptyCheck && attackCheck) {
                  moves.push({ from: kSq, to: kSq === 'e1' ? 'c1' : 'b1', piece: 'k', flags: 'q', color: us });
                  if (kSq === 'd1') {
                    moves.push({ from: kSq, to: 'c1', piece: 'k', flags: 'q', color: us });
                  }
                }
              }
            }
          } else if (us === 'b' && r === 7) {
            const kSq = f === 4 ? 'e8' : (f === 3 ? 'd8' : null);
            if (kSq) {
              // Kingside Castling
              if (this.castlingRights.b.k && this.boardState[63]?.type === 'r' && this.boardState[63]?.color === 'b') {
                const emptyCheck = kSq === 'e8' ? (!this.boardState[61] && !this.boardState[62]) : (!this.boardState[60] && !this.boardState[61] && !this.boardState[62]);
                const attackCheck = kSq === 'e8' ? (!this.isSquareAttacked('f8', 'w') && !this.isSquareAttacked('g8', 'w')) : (!this.isSquareAttacked('e8', 'w') && !this.isSquareAttacked('f8', 'w'));
                if (emptyCheck && attackCheck) {
                  moves.push({ from: kSq, to: kSq === 'e8' ? 'g8' : 'f8', piece: 'k', flags: 'k', color: us });
                  if (kSq === 'd8') {
                    moves.push({ from: kSq, to: 'g8', piece: 'k', flags: 'k', color: us });
                  }
                }
              }
              // Queenside Castling
              if (this.castlingRights.b.q && this.boardState[56]?.type === 'r' && this.boardState[56]?.color === 'b') {
                const emptyCheck = kSq === 'e8' ? (!this.boardState[59] && !this.boardState[58] && !this.boardState[57]) : (!this.boardState[58] && !this.boardState[57]);
                const attackCheck = kSq === 'e8' ? (!this.isSquareAttacked('d8', 'w') && !this.isSquareAttacked('c8', 'w')) : (!this.isSquareAttacked('c8', 'w') && !this.isSquareAttacked('b8', 'w'));
                if (emptyCheck && attackCheck) {
                  moves.push({ from: kSq, to: kSq === 'e8' ? 'c8' : 'b8', piece: 'k', flags: 'q', color: us });
                  if (kSq === 'd8') {
                    moves.push({ from: kSq, to: 'c8', piece: 'k', flags: 'q', color: us });
                  }
                }
              }
            }
          }

        }
      }

      // Sliding pieces (Bishop, Rook, Queen)
      const rayDirs = [];
      if (p.type === 'b' || p.type === 'q') rayDirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
      if (p.type === 'r' || p.type === 'q') rayDirs.push([1,0],[-1,0],[0,1],[0,-1]);

      rayDirs.forEach(([dr, df]) => {
        let nr = r + dr, nf = f + df;
        while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
          const nidx = nr * 8 + nf;
          const target = this.boardState[nidx];
          if (!target) {
            moves.push({ from: fromSq, to: this.indexToSquare(nidx), piece: p.type, color: us });
          } else {
            if (target.color === them) {
              moves.push({ from: fromSq, to: this.indexToSquare(nidx), piece: p.type, captured: target.type, color: us });
            }
            break;
          }
          nr += dr;
          nf += df;
        }
      });
    }

    return moves;
  }

  isSquareAttacked(sq, attackerColor) {
    const idx = this.squareToIndex(sq);
    if (idx === -1) return false;
    const r = Math.floor(idx / 8);
    const f = idx % 8;

    // Pawns
    const pawnDir = attackerColor === 'w' ? -1 : 1;
    const pawnR = r + pawnDir;
    for (let df of [-1, 1]) {
      const pawnF = f + df;
      if (pawnR >= 0 && pawnR <= 7 && pawnF >= 0 && pawnF <= 7) {
        const target = this.boardState[pawnR * 8 + pawnF];
        if (target && target.color === attackerColor && target.type === 'p') return true;
      }
    }

    // Knights
    const knightOffsets = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    for (let [dr, df] of knightOffsets) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const target = this.boardState[nr * 8 + nf];
        if (target && target.color === attackerColor && target.type === 'n') return true;
      }
    }

    // Kings
    const kingOffsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr, df] of kingOffsets) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const target = this.boardState[nr * 8 + nf];
        if (target && target.color === attackerColor && target.type === 'k') return true;
      }
    }

    // Rays (Bishops/Queens/Rooks)
    const diagDirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr, df] of diagDirs) {
      let nr = r + dr, nf = f + df;
      while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const target = this.boardState[nr * 8 + nf];
        if (target) {
          if (target.color === attackerColor && (target.type === 'b' || target.type === 'q')) return true;
          break;
        }
        nr += dr;
        nf += df;
      }
    }

    const straightDirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let [dr, df] of straightDirs) {
      let nr = r + dr, nf = f + df;
      while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const target = this.boardState[nr * 8 + nf];
        if (target) {
          if (target.color === attackerColor && (target.type === 'r' || target.type === 'q')) return true;
          break;
        }
        nr += dr;
        nf += df;
      }
    }

    return false;
  }

  inCheck(color = this.turnColor) {
    const kingType = 'k';
    let kingSq = null;
    for (let i = 0; i < 64; i++) {
      const p = this.boardState[i];
      if (p && p.color === color && p.type === kingType) {
        kingSq = this.indexToSquare(i);
        break;
      }
    }
    if (!kingSq) return false;
    const attackerColor = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingSq, attackerColor);
  }

  generateLegalMoves(color = this.turnColor) {
    const pseudo = this.generatePseudoMoves(color);
    const legal = [];

    for (let m of pseudo) {
      const tempState = this.makeTemporaryMove(m);
      if (!this.inCheck(m.color)) {
        m.san = this.moveToSan(m, legal);
        legal.push(m);
      }
      this.undoTemporaryMove(tempState);
    }
    return legal;
  }

  makeTemporaryMove(m) {
    const fromIdx = this.squareToIndex(m.from);
    const toIdx = this.squareToIndex(m.to);

    const saved = {
      fromIdx,
      toIdx,
      fromPiece: this.boardState[fromIdx],
      toPiece: this.boardState[toIdx],
      epSquare: this.epSquare,
      castlingRights: JSON.parse(JSON.stringify(this.castlingRights)),
      halfMoveClock: this.halfMoveClock,
      turnColor: this.turnColor
    };

    let p = this.boardState[fromIdx];
    this.boardState[fromIdx] = null;

    if (m.promotion) {
      p = { type: m.promotion, color: m.color };
    }

    if (m.flags === 'e') {
      const epCapIdx = m.color === 'w' ? toIdx - 8 : toIdx + 8;
      saved.epCapIdx = epCapIdx;
      saved.epCapPiece = this.boardState[epCapIdx];
      this.boardState[epCapIdx] = null;
    }

    if (m.flags === 'k') {
      const rFrom = m.color === 'w' ? 7 : 63;
      const rTo = this.squareToIndex(m.color === 'w' ? (m.from === 'd1' ? 'e1' : 'f1') : (m.from === 'd8' ? 'e8' : 'f8'));
      saved.rookFromIdx = rFrom;
      saved.rookToIdx = rTo;
      saved.rookPiece = this.boardState[rFrom];
      this.boardState[rTo] = saved.rookPiece;
      this.boardState[rFrom] = null;
    }

    if (m.flags === 'q') {
      const rFrom = m.color === 'w' ? 0 : 56;
      const rTo = this.squareToIndex(m.color === 'w' ? (m.from === 'd1' ? 'c1' : 'd1') : (m.from === 'd8' ? 'c8' : 'd8'));
      saved.rookFromIdx = rFrom;
      saved.rookToIdx = rTo;
      saved.rookPiece = this.boardState[rFrom];
      this.boardState[rTo] = saved.rookPiece;
      this.boardState[rFrom] = null;
    }

    this.boardState[toIdx] = p;
    return saved;
  }

  undoTemporaryMove(saved) {
    this.boardState[saved.fromIdx] = saved.fromPiece;
    this.boardState[saved.toIdx] = saved.toPiece;
    this.epSquare = saved.epSquare;
    this.castlingRights = saved.castlingRights;
    this.halfMoveClock = saved.halfMoveClock;
    this.turnColor = saved.turnColor;

    if (saved.epCapIdx !== undefined) {
      this.boardState[saved.epCapIdx] = saved.epCapPiece;
    }

    if (saved.rookFromIdx !== undefined) {
      this.boardState[saved.rookFromIdx] = saved.rookPiece;
      this.boardState[saved.rookToIdx] = null;
    }
  }

  moveToSan(m, existingLegalMoves = []) {
    if (m.flags === 'k') return 'O-O';
    if (m.flags === 'q') return 'O-O-O';

    let san = '';
    const pType = m.piece.toUpperCase();

    if (pType !== 'P') {
      san += pType;
      // Disambiguation
      const ambiguous = existingLegalMoves.filter(
        other => other.piece === m.piece && other.to === m.to && other.from !== m.from
      );
      if (ambiguous.length > 0) {
        const fromFile = m.from[0];
        const fromRank = m.from[1];
        const sameFile = ambiguous.some(other => other.from[0] === fromFile);
        const sameRank = ambiguous.some(other => other.from[1] === fromRank);

        if (!sameFile) {
          san += fromFile;
        } else if (!sameRank) {
          san += fromRank;
        } else {
          san += m.from;
        }
      }
    } else if (m.captured || m.flags === 'e') {
      san += m.from[0];
    }

    if (m.captured || m.flags === 'e') {
      san += 'x';
    }

    san += m.to;

    if (m.promotion) {
      san += '=' + m.promotion.toUpperCase();
    }

    // Check / Checkmate symbol preview
    const tempState = this.makeTemporaryMove(m);
    const opponentColor = m.color === 'w' ? 'b' : 'w';
    const isCheck = this.inCheck(opponentColor);
    if (isCheck) {
      // test checkmate
      const oppLegal = this.generatePseudoMoves(opponentColor).filter(om => {
        const st = this.makeTemporaryMove(om);
        const legal = !this.inCheck(om.color);
        this.undoTemporaryMove(st);
        return legal;
      });
      san += oppLegal.length === 0 ? '#' : '+';
    }
    this.undoTemporaryMove(tempState);

    return san;
  }

  move(moveObj) {
    // 1. Normalize string input (0-0 -> O-O, 0-0-0 -> O-O-O)
    if (typeof moveObj === 'string') {
      let str = moveObj.replace(/[+#!\?]/g, '').trim();
      if (str === '0-0' || str === 'o-o') moveObj = 'O-O';
      else if (str === '0-0-0' || str === 'o-o-o') moveObj = 'O-O-O';
    }

    // 2. Normalize Drag & Drop King / Rook Castling Target ONLY when castling rights exist
    if (typeof moveObj === 'object' && moveObj.from && moveObj.to) {
      const p = this.get(moveObj.from);
      if (p && p.type === 'k') {
        const kSq = moveObj.from;
        if (kSq === 'e1') {
          if ((moveObj.to === 'h1' || moveObj.to === 'g1') && this.castlingRights.w.k) moveObj.to = 'g1';
          else if ((moveObj.to === 'a1' || moveObj.to === 'c1') && this.castlingRights.w.q) moveObj.to = 'c1';
        } else if (kSq === 'd1') {
          if (moveObj.to === 'h1' && this.castlingRights.w.k) moveObj.to = 'f1';
          else if (moveObj.to === 'a1' && this.castlingRights.w.q) moveObj.to = 'b1';
        } else if (kSq === 'e8') {
          if ((moveObj.to === 'h8' || moveObj.to === 'g8') && this.castlingRights.b.k) moveObj.to = 'g8';
          else if ((moveObj.to === 'a8' || moveObj.to === 'c8') && this.castlingRights.b.q) moveObj.to = 'c8';
        } else if (kSq === 'd8') {
          if (moveObj.to === 'h8' && this.castlingRights.b.k) moveObj.to = 'f8';
          else if (moveObj.to === 'a8' && this.castlingRights.b.q) moveObj.to = 'b8';
        }
      } else if (p && p.type === 'r') {
        const wKingSq = this.get('e1')?.type === 'k' ? 'e1' : (this.get('d1')?.type === 'k' ? 'd1' : null);
        const bKingSq = this.get('e8')?.type === 'k' ? 'e8' : (this.get('d8')?.type === 'k' ? 'd8' : null);
        const kSq = p.color === 'w' ? wKingSq : bKingSq;
        if (kSq && moveObj.to === kSq) {
          if (moveObj.from === 'h1' && this.castlingRights.w.k) { moveObj.from = kSq; moveObj.to = kSq === 'e1' ? 'g1' : 'f1'; }
          else if (moveObj.from === 'a1' && this.castlingRights.w.q) { moveObj.from = kSq; moveObj.to = kSq === 'e1' ? 'c1' : 'b1'; }
          else if (moveObj.from === 'h8' && this.castlingRights.b.k) { moveObj.from = kSq; moveObj.to = kSq === 'e8' ? 'g8' : 'f8'; }
          else if (moveObj.from === 'a8' && this.castlingRights.b.q) { moveObj.from = kSq; moveObj.to = kSq === 'e8' ? 'c8' : 'b8'; }
        }
      }
    }

    if (typeof moveObj === 'object' && moveObj.from) {
      const p = this.get(moveObj.from);
      if (p && p.color !== this.turnColor) {
        this.turnColor = p.color;
      }
    } else if (typeof moveObj === 'string') {
      const legalCurrent = this.generateLegalMoves(this.turnColor);
      const cleanStr = moveObj.replace(/[+#!\?]/g, '').trim();
      const matchCurrent = legalCurrent.find(m => m.san.replace(/[+#!\?]/g, '') === cleanStr || `${m.from}${m.to}` === cleanStr.toLowerCase());
      if (!matchCurrent) {
        const otherColor = this.turnColor === 'w' ? 'b' : 'w';
        const legalOther = this.generateLegalMoves(otherColor);
        const matchOther = legalOther.find(m => m.san.replace(/[+#!\?]/g, '') === cleanStr || `${m.from}${m.to}` === cleanStr.toLowerCase());
        if (matchOther) {
          this.turnColor = otherColor;
        }
      }
    }

    const legalMoves = this.generateLegalMoves(this.turnColor);
    let matchedMove = null;

    if (typeof moveObj === 'string') {
      const cleanStr = moveObj.replace(/[+#!\?]/g, '').trim();
      matchedMove = legalMoves.find(
        m => m.san.replace(/[+#!\?]/g, '') === cleanStr ||
             `${m.from}${m.to}${m.promotion || ''}` === cleanStr.toLowerCase()
      );
    } else if (typeof moveObj === 'object') {
      matchedMove = legalMoves.find(m => {
        if (m.from !== moveObj.from || m.to !== moveObj.to) return false;
        if (moveObj.promotion && m.promotion !== moveObj.promotion.toLowerCase()) return false;
        return true;
      });
    }

    if (!matchedMove) return null;

    const executed = this.makeMoveInternal(matchedMove);
    this.historyList.push(executed);
    if (!this.positionHistory) this.positionHistory = [this.startFen || this.fen()];
    this.positionHistory.push(this.fen());
    this.redoStack = [];
    return executed;
  }

  makeMoveInternal(m) {
    const fromIdx = this.squareToIndex(m.from);
    const toIdx = this.squareToIndex(m.to);
    const piece = this.boardState[fromIdx];

    // Castling update
    if (piece.type === 'k') {
      this.castlingRights[piece.color].k = false;
      this.castlingRights[piece.color].q = false;
    }
    if (piece.type === 'r') {
      if (m.from === 'a1') this.castlingRights.w.q = false;
      if (m.from === 'h1') this.castlingRights.w.k = false;
      if (m.from === 'a8') this.castlingRights.b.q = false;
      if (m.from === 'h8') this.castlingRights.b.k = false;
    }
    if (m.to === 'a1') this.castlingRights.w.q = false;
    if (m.to === 'h1') this.castlingRights.w.k = false;
    if (m.to === 'a8') this.castlingRights.b.q = false;
    if (m.to === 'h8') this.castlingRights.b.k = false;

    // En Passant target
    if (piece.type === 'p' && Math.abs(toIdx - fromIdx) === 16) {
      this.epSquare = this.indexToSquare(m.color === 'w' ? fromIdx + 8 : fromIdx - 8);
    } else {
      this.epSquare = null;
    }

    // Halfmove clock
    if (piece.type === 'p' || m.captured) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    if (this.turnColor === 'b') {
      this.fullMoveNumber++;
    }

    this.makeTemporaryMove(m);
    this.turnColor = this.turnColor === 'w' ? 'b' : 'w';

    return {
      from: m.from,
      to: m.to,
      piece: piece.type,
      color: piece.color,
      san: m.san,
      captured: m.captured,
      promotion: m.promotion,
      flags: m.flags,
      fenAfter: this.fen()
    };
  }

  undo() {
    if (!this.positionHistory || this.positionHistory.length <= 1) return null;
    const currentFen = this.positionHistory.pop();
    const lastMove = this.historyList.pop();
    if (!this.redoStack) this.redoStack = [];
    this.redoStack.push({ fen: currentFen, move: lastMove });

    const prevFen = this.positionHistory[this.positionHistory.length - 1];
    this.loadStateFromFen(prevFen);
    return lastMove;
  }

  redo() {
    if (!this.redoStack || this.redoStack.length === 0) return null;
    const item = this.redoStack.pop();
    if (!this.positionHistory) this.positionHistory = [this.startFen || this.fen()];
    this.historyList.push(item.move);
    this.positionHistory.push(item.fen);
    this.loadStateFromFen(item.fen);
    return item.move;
  }


  isCheck() {
    return this.inCheck(this.turnColor);
  }

  isCheckmate() {
    if (!this.isCheck()) return false;
    return this.generateLegalMoves().length === 0;
  }

  isStalemate() {
    if (this.isCheck()) return false;
    return this.generateLegalMoves().length === 0;
  }

  isGameOver() {
    return this.isCheckmate() || this.isStalemate() || this.halfMoveClock >= 100;
  }

  history({ verbose = false } = {}) {
    if (!verbose) {
      return this.historyList.map(h => h.san);
    }
    return this.historyList;
  }

  pgn() {
    let pgnStr = '';
    let moveNum = 1;
    for (let i = 0; i < this.historyList.length; i++) {
      const h = this.historyList[i];
      if (i % 2 === 0) {
        pgnStr += `${moveNum}. ${h.san} `;
        moveNum++;
      } else {
        pgnStr += `${h.san} `;
      }
    }
    return pgnStr.trim();
  }

  loadPgn(pgnText) {
    this.reset();
    if (!pgnText || typeof pgnText !== 'string') return false;

    // 1. Remove comments { ... }, headers [ ... ], NAGs $1..$255
    let clean = pgnText
      .replace(/\[.*?\]/g, ' ')
      .replace(/\{.*?\}/g, ' ')
      .replace(/\(.*?\)/g, ' ')
      .replace(/\$\d+/g, ' ');

    // 2. Normalize move numbers like "1.e4", "1...e5", "1. e4", "12." by removing number and dot
    clean = clean.replace(/(\d+)\.+/g, ' ');

    // 3. Tokenize moves
    const tokens = clean.trim().split(/\s+/).filter(Boolean);

    for (let token of tokens) {
      // Skip result notations and empty tokens
      if (!token || token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') continue;
      const res = this.move(token);
      if (!res) {
        // Try cleaning check/mate suffixes if still failed
        const cleanTok = token.replace(/[+#!\?]/g, '');
        const res2 = this.move(cleanTok);
        if (!res2) {
          console.warn('[loadPgn] Failed to parse/apply move token:', token, 'at position:', this.fen());
          break;
        }
      }
    }
    return true;
  }
}
