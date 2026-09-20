/**
 * BoardVerse Curated Tactical Puzzles Database
 * Includes tactics for: Mate in 1, Mate in 2, Double Attack (Fork), Pin, Skewer, Deflection.
 */
export const PUZZLE_DATABASE = [
  {
    id: 'puz-001',
    title: 'Chiếu Hết 1 Nước (Bậc Thầy Tấn Công)',
    category: 'MATE_IN_1',
    rating: 800,
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5',
    turn: 'w',
    prompt: 'Trắng đi trước: Hãy tung đòn kết liễu chiếu hết đối thủ chỉ trong 1 nước!',
    solution: ['c4f7'],
    explanation: 'Tượng Trắng ăn f7 (Bxf7#) tấn công trực diện Vua Đen và được bảo vệ bởi Mã f3, Vua Đen không còn ô thoát.'
  },
  {
    id: 'puz-002',
    title: 'Đòn Chĩa Đôi (Knight Fork Bắt Hậu)',
    category: 'FORK',
    rating: 1100,
    fen: 'r1b1kb1r/pp3ppp/2n1p3/2pp4/3Pn3/2PBPN2/PP1N1PPP/R1BQK2R w KQkq - 0 8',
    turn: 'w',
    prompt: 'Trắng đi trước: Tận dụng sơ hở để đoạt lợi thế lớn!',
    solution: ['d2e4'],
    explanation: 'Trắng đổi Mã d2xe4 chiếm ưu thế khu vực trung tâm và giải tỏa áp lực.'
  },
  {
    id: 'puz-003',
    title: 'Thắt Cổ Vua (Smothered Mate Trong 2 Nước)',
    category: 'MATE_IN_2',
    rating: 1400,
    fen: '6k1/5ppp/8/8/8/8/5QPP/4N1K1 w - - 0 1',
    turn: 'w',
    prompt: 'Trắng đi trước: Dồn Vua Đen vào góc hiểm và kết liễu trong 2 nước!',
    solution: ['f2f7', 'g8h8', 'f7f8'],
    explanation: 'Hậu Trắng tấn công f7 buộc Vua lùi về góc h8, sau đó Qf8# chiếu hết hoàn toàn.'
  },
  {
    id: 'puz-004',
    title: 'Ghim Quân Đoạt Hậu (Absolute Pin)',
    category: 'PIN',
    rating: 1250,
    fen: 'r1b1k2r/ppppqppp/2n5/4P3/1bB5/2N2N2/PPP2PPP/R1BQK2R w KQkq - 1 8',
    turn: 'w',
    prompt: 'Trắng đi trước: Tìm nước đi kích hoạt đòn ghim chết đối thủ!',
    solution: ['e1g1'],
    explanation: 'Trắng Nhập thành (O-O) đưa Vua vào nơi an toàn và chuẩn bị đưa Xe ra cột mở e1 ghim thẳng vào Hậu Đen.'
  },
  {
    id: 'puz-005',
    title: 'Đòn Tấn Công Cột Mở Hàng Đáy (Back-rank Mate)',
    category: 'MATE_IN_1',
    rating: 950,
    fen: '3r2k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1',
    turn: 'w',
    prompt: 'Trắng đi trước: Khai thác điểm yếu hàng ngang cuối cùng của Đen!',
    solution: ['b1b8'],
    explanation: 'Xe b1 phi thẳng xuống b8 (Rb8#) chiếu hết do các tốt Đen f7, g7, h7 tự chặn đường thoát của Vua.'
  },
  {
    id: 'puz-006',
    title: 'Phối Hợp Hậu Tượng Chiếu Hết (Queen & Bishop Battery)',
    category: 'MATE_IN_1',
    rating: 1050,
    fen: 'r1bq1rk1/pp1nbppp/2p1pn2/6N1/2BP4/4PN2/PPQ2PPP/R1B1K2R w KQ - 0 10',
    turn: 'w',
    prompt: 'Trắng đi trước: Phối hợp Hậu và Tượng tấn công hiểm hóc vào điểm h7!',
    solution: ['c2h7'],
    explanation: 'Hậu Trắng ăn h7 (Qxh7#) được bảo vệ bởi Mã g5, chiếu hết đối thủ trong chớp mắt.'
  },
  {
    id: 'puz-007',
    title: 'Bẫy Đổi Quân Hậu Đen (Discovered Attack)',
    category: 'DISCOVERED_ATTACK',
    rating: 1350,
    fen: 'r1b1k2r/pp3ppp/2n1p3/q1pp4/3Pn3/2PBPN2/PP1N1PPP/R2QK2R w KQkq - 0 9',
    turn: 'w',
    prompt: 'Trắng đi trước: Tung đòn tấn công mở đoạt quân!',
    solution: ['d2e4', 'd5e4', 'd3e4'],
    explanation: 'Trắng triệt tiêu quân Mã chủ lực ở e4 và kiểm soát hoàn toàn trung tâm.'
  },
  {
    id: 'puz-008',
    title: 'Hiệp Sĩ Săn Hậu (Royal Fork)',
    category: 'FORK',
    rating: 1300,
    fen: 'r2qk2r/ppp2ppp/2n5/3p4/3Pn1b1/2N2N2/PPP1BPPP/R1BQK2R w KQkq - 0 8',
    turn: 'w',
    prompt: 'Trắng đi trước: Tìm nước đi chiến thuật mạnh nhất!',
    solution: ['c3e4', 'd5e4', 'f3e5'],
    explanation: 'Trắng đẩy đối thủ vào thế bị động và chiếm lĩnh các ô cờ quan trọng nhất.'
  }
];
