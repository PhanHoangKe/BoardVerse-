/**
 * Opening Book Repertoire for Chess Battle Assistant
 * Comprehensive opening database covering White & Black opening lines:
 * 
 * WHITE REPERTOIRE:
 * - 1.e4: Italian Game, Ruy Lopez, Scotch Game, Vienna Game, King's Gambit, Anti-Sicilian (Open, Alapin, Moscow/Rossolimo)
 * - 1.d4: Queen's Gambit, London System, Catalan, Colle System, King's Indian Attack
 * - 1.c4: English Opening (transposing to d4/Nf3)
 * 
 * BLACK REPERTOIRE vs 1.e4:
 * - 1...e5 (Open Game), 1...c5 (Sicilian Defense), 1...e6 (French Defense), 1...c6 (Caro-Kann Defense)
 * 
 * BLACK REPERTOIRE vs 1.d4:
 * - 1...e6 (Queen's Gambit Declined), 1...Nf6 2.c4 g6 (King's Indian Defense), 1...Nf6 2.c4 e6 3.Nc3 Bb4 (Nimzo-Indian), 1...c6 (Slav Defense)
 */

export class OpeningBook {
  constructor() {
    this.book = new Map();
    this.initBook();
  }

  initBook() {
    // 1. Initial Position (Ply 1 - White)
    this.addOpening('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', {
      system: 'Opening Choices',
      moves: [
        { uci: 'e2e4', san: 'e4', system: 'King\'s Pawn Opening (1.e4)', style: 'AGGRESSIVE' },
        { uci: 'd2d4', san: 'd4', system: 'Queen\'s Pawn Opening (1.d4)', style: 'CLASSICAL' },
        { uci: 'g1f3', san: 'Nf3', system: 'Zukertort / Réti Opening (1.Nf3)', style: 'FLEXIBLE' },
        { uci: 'c2c4', san: 'c4', system: 'English Opening (1.c4)', style: 'POSITIONAL' }
      ]
    });

    // 2. White 1.e4 Continuations
    // 1.e4 e5 -> 2.Nf3, 2.Nc3, 2.f4
    this.addOpening('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6', {
      system: 'Open Game (1.e4 e5)',
      moves: [
        { uci: 'g1f3', san: 'Nf3', system: 'King\'s Knight Opening', style: 'CLASSICAL' },
        { uci: 'b1c3', san: 'Nc3', system: 'Vienna Game', style: 'DYNAMIC' },
        { uci: 'f2f4', san: 'f4', system: 'King\'s Gambit', style: 'AGGRESSIVE' }
      ]
    });

    // 1.e4 e5 2.Nf3 Nc6 -> Italian, Ruy Lopez, Scotch
    this.addOpening('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', {
      system: 'King\'s Knight Defence',
      moves: [
        { uci: 'f1c4', san: 'Bc4', system: 'Italian Game', style: 'AGGRESSIVE' },
        { uci: 'f1b5', san: 'Bb5', system: 'Ruy Lopez (Spanish Opening)', style: 'CLASSICAL' },
        { uci: 'd2d4', san: 'd4', system: 'Scotch Game', style: 'DYNAMIC' }
      ]
    });

    // Italian Game 3...Bc5 -> 4.c3 or 4.d3
    this.addOpening('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -', {
      system: 'Giuoco Piano (Italian)',
      moves: [
        { uci: 'c2c3', san: 'c3', system: 'Giuoco Piano Main Line', style: 'CLASSICAL' },
        { uci: 'd2d3', san: 'd3', system: 'Giuoco Pianissimo', style: 'POSITIONAL' }
      ]
    });

    // 1.e4 c5 (Sicilian) -> 2.Nf3, 2.c3, 2.Nc3
    this.addOpening('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6', {
      system: 'Sicilian Defense',
      moves: [
        { uci: 'g1f3', san: 'Nf3', system: 'Open Sicilian (2.Nf3)', style: 'AGGRESSIVE' },
        { uci: 'c2c3', san: 'c3', system: 'Alapin Sicilian (2.c3)', style: 'POSITIONAL' },
        { uci: 'b1c3', san: 'Nc3', system: 'Closed Sicilian (2.Nc3)', style: 'FLEXIBLE' }
      ]
    });

    // 1.e4 c5 2.Nf3 d6 -> 3.d4 or 3.Bb5+
    this.addOpening('rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', {
      system: 'Sicilian Defense (2...d6)',
      moves: [
        { uci: 'd2d4', san: 'd4', system: 'Open Sicilian Main Line', style: 'AGGRESSIVE' },
        { uci: 'f1b5', san: 'Bb5+', system: 'Moscow Variation (3.Bb5+)', style: 'POSITIONAL' }
      ]
    });

    // 1.e4 c5 2.Nf3 Nc6 -> 3.d4 or 3.Bb5
    this.addOpening('r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -', {
      system: 'Sicilian Defense (2...Nc6)',
      moves: [
        { uci: 'd2d4', san: 'd4', system: 'Open Sicilian (3.d4)', style: 'AGGRESSIVE' },
        { uci: 'f1b5', san: 'Bb5', system: 'Rossolimo Variation (3.Bb5)', style: 'POSITIONAL' }
      ]
    });

    // 1.e4 e6 (French Defense) -> 2.d4
    this.addOpening('rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', {
      system: 'French Defense',
      moves: [
        { uci: 'd2d4', san: 'd4', system: 'French Defense (2.d4)', style: 'CLASSICAL' }
      ]
    });

    // 1.e4 c6 (Caro-Kann Defense) -> 2.d4
    this.addOpening('rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', {
      system: 'Caro-Kann Defense',
      moves: [
        { uci: 'd2d4', san: 'd4', system: 'Caro-Kann Main Line (2.d4)', style: 'CLASSICAL' }
      ]
    });

    // 3. White 1.d4 Continuations
    // 1.d4 d5 -> 2.c4, 2.Bf4, 2.Nf3
    this.addOpening('rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6', {
      system: 'Queen\'s Pawn Game (1.d4 d5)',
      moves: [
        { uci: 'c2c4', san: 'c4', system: 'Queen\'s Gambit', style: 'CLASSICAL' },
        { uci: 'c1f4', san: 'Bf4', system: 'London System', style: 'POSITIONAL' },
        { uci: 'g1f3', san: 'Nf3', system: 'Colle / Catalan Setup', style: 'FLEXIBLE' }
      ]
    });

    // 1.d4 Nf6 -> 2.c4, 2.Bf4, 2.Nf3
    this.addOpening('rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', {
      system: 'Indian Defense Setup',
      moves: [
        { uci: 'c2c4', san: 'c4', system: 'Main Line Indian (2.c4)', style: 'CLASSICAL' },
        { uci: 'c1f4', san: 'Bf4', system: 'London System vs Indian', style: 'POSITIONAL' },
        { uci: 'g1f3', san: 'Nf3', system: 'King\'s Indian Attack Setup', style: 'FLEXIBLE' }
      ]
    });

    // 1.d4 Nf6 2.c4 e6 -> 3.Nc3 (Nimzo), 3.Nf3 (Catalan/QGD), 3.g3
    this.addOpening('rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -', {
      system: 'Nimzo / QGD Setup',
      moves: [
        { uci: 'b1c3', san: 'Nc3', system: 'Nimzo-Indian Challenge (3.Nc3)', style: 'DYNAMIC' },
        { uci: 'g1f3', san: 'Nf3', system: 'Queen\'s Gambit Declined (3.Nf3)', style: 'CLASSICAL' },
        { uci: 'g2g3', san: 'g3', system: 'Catalan Opening (3.g3)', style: 'POSITIONAL' }
      ]
    });

    // 1.d4 Nf6 2.c4 g6 -> 3.Nc3 (King's Indian / Grünfeld)
    this.addOpening('rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -', {
      system: 'King\'s Indian / Grünfeld Setup',
      moves: [
        { uci: 'b1c3', san: 'Nc3', system: 'King\'s Indian Defense (3.Nc3)', style: 'AGGRESSIVE' }
      ]
    });

    // 4. Black Repertoire vs 1.e4
    this.addOpening('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3', {
      system: 'Black vs 1.e4',
      moves: [
        { uci: 'e7e5', san: 'e5', system: 'Open Game (1...e5)', style: 'CLASSICAL' },
        { uci: 'c7c5', san: 'c5', system: 'Sicilian Defense (1...c5)', style: 'AGGRESSIVE' },
        { uci: 'e7e6', san: 'e6', system: 'French Defense (1...e6)', style: 'POSITIONAL' },
        { uci: 'c7c6', san: 'c6', system: 'Caro-Kann Defense (1...c6)', style: 'FLEXIBLE' }
      ]
    });

    // 5. Black Repertoire vs 1.d4
    this.addOpening('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3', {
      system: 'Black vs 1.d4',
      moves: [
        { uci: 'g8f6', san: 'Nf6', system: 'Indian Defense (1...Nf6)', style: 'DYNAMIC' },
        { uci: 'e7e6', san: 'e6', system: 'Queen\'s Gambit Setup (1...e6)', style: 'CLASSICAL' },
        { uci: 'c7c6', san: 'c6', system: 'Slav Defense Setup (1...c6)', style: 'POSITIONAL' },
        { uci: 'd7d5', san: 'd5', system: 'Closed Game (1...d5)', style: 'CLASSICAL' }
      ]
    });
  }

  addOpening(fenKey, data) {
    const normalizedKey = this.normalizeFenKey(fenKey);
    this.book.set(normalizedKey, data);
  }

  normalizeFenKey(fen) {
    // Keep first 4 parts of FEN (board, turn, castling, en-passant)
    return fen.trim().split(/\s+/).slice(0, 4).join(' ');
  }

  getOpeningData(fen) {
    const key = this.normalizeFenKey(fen);
    return this.book.get(key) || null;
  }
}
