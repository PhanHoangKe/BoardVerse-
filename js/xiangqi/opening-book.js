/**
 * Xiangqi Master Opening Book
 * Canonical master opening moves for Red and Black.
 * Guarantees professional, grandmaster-level opening choices instead of shallow tactical mistakes.
 */

(function(exports) {
  'use strict';

  const XIANGQI_OPENING_BOOK = {
    // 1. Initial Position (Startpos) -> Red choices
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w': [
      { uci: 'h2e2', name: 'Pháo 2 bình 5 (Trung Pháo / Pháo Đầu)', weight: 45 },
      { uci: 'b2e2', name: 'Pháo 8 bình 5 (Trung Pháo / Pháo Đầu)', weight: 25 },
      { uci: 'b0c2', name: 'Mã 8 tiến 7 (Khởi Mã Cuộc)', weight: 15 },
      { uci: 'h0g2', name: 'Mã 2 tiến 3 (Khởi Mã Cuộc)', weight: 10 },
      { uci: 'c3c4', name: 'Binh 7 tiến 1 (Tiên Nhân Chỉ Lộ)', weight: 10 },
      { uci: 'g3g4', name: 'Binh 3 tiến 1 (Tiên Nhân Chỉ Lộ)', weight: 5 },
      { uci: 'c0e2', name: 'Tượng 3 tiến 5 (Phi Tượng Cuộc)', weight: 5 },
      { uci: 'h2d2', name: 'Pháo 2 bình 6 (Quá Cung Pháo)', weight: 5 },
      { uci: 'h2f2', name: 'Pháo 2 bình 4 (Sĩ Giác Pháo)', weight: 5 }
    ],

    // 2. Red played Pháo 2 bình 5 (h2e2) -> Black canonical responses
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b': [
      { uci: 'h9g7', name: 'Mã 8 tiến 7 (Bình Phong Mã)', weight: 50 },
      { uci: 'b9c7', name: 'Mã 2 tiến 3 (Bình Phong Mã)', weight: 20 },
      { uci: 'b7e7', name: 'Pháo 2 bình 5 (Nghịch Pháo)', weight: 15 },
      { uci: 'h7e7', name: 'Pháo 8 bình 5 (Thuận Pháo)', weight: 10 },
      { uci: 'c6c5', name: 'Tốt 7 tiến 1 (Đơn Đề Mã)', weight: 5 }
    ],

    // 3. Red played Pháo 8 bình 5 (b2e2) -> Black responses
    'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/4C1C1/9/RNBAKABNR b': [
      { uci: 'b9c7', name: 'Mã 2 tiến 3 (Bình Phong Mã)', weight: 50 },
      { uci: 'h9g7', name: 'Mã 8 tiến 7 (Bình Phong Mã)', weight: 20 },
      { uci: 'h7e7', name: 'Pháo 8 bình 5 (Nghịch Pháo)', weight: 15 },
      { uci: 'b7e7', name: 'Pháo 2 bình 5 (Thuận Pháo)', weight: 10 }
    ],

    // 4. Red Pháo 2 bình 5 (h2e2) & Black Mã 8 tiến 7 (h9g7) -> Red response: Mã 2 tiến 3 (h0g2)
    'rnbakab1r/9/1c4n1c/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR w': [
      { uci: 'h0g2', name: 'Mã 2 tiến 3 (Chính Mã)', weight: 60 },
      { uci: 'b0c2', name: 'Mã 8 tiến 7 (Tả Mã)', weight: 25 },
      { uci: 'i0i1', name: 'Xe 1 tiến 1 (Hoành Xe)', weight: 10 },
      { uci: 'c3c4', name: 'Binh 7 tiến 1 (Thất Lộ Binh)', weight: 5 }
    ],

    // 5. Red Mã 2 tiến 3 & Black Mã 2 tiến 3 (b9c7) -> Standard Screen Horse
    'r1bakab1r/9/1cn2nc1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R b': [
      { uci: 'i9i8', name: 'Xe 9 tiến 1 (Hoành Xe)', weight: 35 },
      { uci: 'a9a8', name: 'Xe 1 tiến 1 (Hoành Xe)', weight: 30 },
      { uci: 'c6c5', name: 'Tốt 7 tiến 1 (Bình Phong Mã Tốt 7)', weight: 25 },
      { uci: 'g6g5', name: 'Tốt 3 tiến 1 (Bình Phong Mã Tốt 3)', weight: 10 }
    ]
  };

  class XiangqiOpeningBook {
    static getBookMove(fen, sideToMove) {
      if (!fen) return null;
      // Extract position key (board + side)
      const parts = fen.trim().split(/\s+/);
      const posKey = `${parts[0]} ${parts[1] || sideToMove || 'w'}`;

      const candidates = XIANGQI_OPENING_BOOK[posKey];
      if (!candidates || candidates.length === 0) return null;

      // Weighted random selection for natural grandmaster diversity
      const totalWeight = candidates.reduce((sum, c) => sum + (c.weight || 1), 0);
      let rand = Math.random() * totalWeight;

      for (const candidate of candidates) {
        rand -= (candidate.weight || 1);
        if (rand <= 0) {
          return candidate;
        }
      }

      return candidates[0];
    }
  }

  exports.XiangqiOpeningBook = XiangqiOpeningBook;
})(typeof exports !== 'undefined' ? exports : (window.XiangqiOpeningBookModule = {}));
