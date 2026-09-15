/**
 * Opening Database & Syzygy Endgame Tablebase Service
 * Queries Lichess Masters Explorer & Lichess Syzygy 7-Piece Tablebase API
 */

export class OpeningTablebaseService {
  constructor() {
    this.tablebaseApiUrl = 'https://tablebase.lichess.ovh/standard';
    this.openingApiUrl = 'https://explorer.lichess.ovh/masters';
    this.openingCache = new Map();
    this.tablebaseCache = new Map();
  }

  /**
   * Count total pieces on board from FEN string
   */
  countPieces(fen) {
    const boardPart = fen.split(' ')[0];
    let count = 0;
    for (let char of boardPart) {
      if (char !== '/' && (char < '0' || char > '9')) {
        count++;
      }
    }
    return count;
  }

  /**
   * Query Syzygy Tablebase for positions with <= 7 pieces
   */
  async checkTablebase(fen) {
    const pieceCount = this.countPieces(fen);
    if (pieceCount > 7) return null;

    const cacheKey = fen;
    if (this.tablebaseCache.has(cacheKey)) {
      return this.tablebaseCache.get(cacheKey);
    }

    try {
      const url = `${this.tablebaseApiUrl}?fen=${encodeURIComponent(fen)}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || data.category === undefined) return null;

      let resultText = 'DRAW';
      if (data.category === 'win' || data.wdl > 0) resultText = 'WIN';
      if (data.category === 'loss' || data.wdl < 0) resultText = 'LOSS';

      const parsed = {
        pieceCount,
        category: data.category,
        wdl: data.wdl,
        dtz: data.dtz !== undefined ? Math.abs(data.dtz) : null,
        dtm: data.dtm !== undefined ? Math.abs(data.dtm) : null,
        resultText,
        moves: (data.moves || []).map(m => ({
          san: m.san,
          uci: m.uci,
          category: m.category,
          dtz: m.dtz,
          dtm: m.dtm
        }))
      };

      if (this.tablebaseCache.size > 200) {
        const firstKey = this.tablebaseCache.keys().next().value;
        if (firstKey) this.tablebaseCache.delete(firstKey);
      }
      this.tablebaseCache.set(cacheKey, parsed);
      return parsed;

    } catch (err) {
      console.warn('Syzygy Tablebase query failed:', err);
      return null;
    }
  }

  /**
   * Query Lichess Master Opening Explorer for opening names and stats
   */
  async checkOpening(fen) {
    const cacheKey = fen.split(' ').slice(0, 4).join(' ');
    if (this.openingCache.has(cacheKey)) {
      return this.openingCache.get(cacheKey);
    }

    try {
      const url = `${this.openingApiUrl}?fen=${encodeURIComponent(fen)}&topGames=0`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || (!data.opening && (!data.moves || data.moves.length === 0))) {
        return null;
      }

      const totalGames = (data.white || 0) + (data.draws || 0) + (data.black || 0);
      let whiteWinPct = 0, drawPct = 0, blackWinPct = 0;
      if (totalGames > 0) {
        whiteWinPct = Math.round((data.white / totalGames) * 100);
        drawPct = Math.round((data.draws / totalGames) * 100);
        blackWinPct = 100 - whiteWinPct - drawPct;
      }

      const parsed = {
        name: data.opening ? data.opening.name : null,
        eco: data.opening ? data.opening.eco : null,
        totalGames,
        whiteWinPct,
        drawPct,
        blackWinPct,
        moves: (data.moves || []).map(m => {
          const mTotal = m.white + m.draws + m.black;
          return {
            san: m.san,
            uci: m.uci,
            games: mTotal,
            whiteWinPct: mTotal > 0 ? Math.round((m.white / mTotal) * 100) : 0,
            drawPct: mTotal > 0 ? Math.round((m.draws / mTotal) * 100) : 0,
            blackWinPct: mTotal > 0 ? Math.round((m.black / mTotal) * 100) : 0
          };
        })
      };

      this.openingCache.set(cacheKey, parsed);
      return parsed;
    } catch (err) {
      console.warn('Opening database query failed:', err);
      return null;
    }
  }
}

export { OpeningTablebaseService as TablebaseService };
