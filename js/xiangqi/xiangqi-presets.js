/**
 * Xiangqi Presets & Famous Positions Library
 * Standard & handicap variants, famous openings, and master endgame positions for Xiangqi (Chinese Chess).
 */

(function(exports) {
  'use strict';

  const XIANGQI_PRESETS = {
    // 1. TIÊU CHUẨN (STANDARD)
    STANDARD: {
      id: 'STANDARD',
      name: 'Cờ Tướng Tiêu Chuẩn',
      category: 'TIÊU CHUẨN',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
      description: 'Bàn cờ tướng 9x10 tiêu chuẩn với đầy đủ 32 quân cờ.'
    },

    // 2. KHAI CUỘC KINH ĐIỂN (FAMOUS OPENINGS)
    OPENING_PHAO_DAU_BINH_PHONG_MA: {
      id: 'OPENING_PHAO_DAU_BINH_PHONG_MA',
      name: 'Pháo Đầu Đối Bình Phong Mã',
      category: 'KHAI CUỘC',
      fen: 'r1bakab1r/9/1cn3nc1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R b - - 0 3',
      description: 'Thế trận kinh điển bậc nhất: Đỏ tấn công bằng Pháo đầu, Đen phòng thủ vững chắc bằng đôi Mã bảo vệ.'
    },
    OPENING_THUAN_PHAO: {
      id: 'OPENING_THUAN_PHAO',
      name: 'Thuận Pháo (Cùng Bên)',
      category: 'KHAI CUỘC',
      fen: 'rnbakabnr/9/9/p1p1p1p1p/2c6/4C4/P1P1P1P1P/1C7/9/RNBAKABNR b - - 0 2',
      description: 'Cả hai bên cùng đưa Pháo vào trung lộ cùng hướng tạo thế trận công kích nảy lửa.'
    },
    OPENING_NGHICH_PHAO: {
      id: 'OPENING_NGHICH_PHAO',
      name: 'Nghịch Pháo (Ngược Hướng)',
      category: 'KHAI CUỘC',
      fen: 'rnbakabnr/9/9/p1p1p1p1p/6c2/4C4/P1P1P1P1P/1C7/9/RNBAKABNR b - - 0 2',
      description: 'Hai bên vào Pháo ngược cánh nhau, thế trận công thủ đối kháng quyết liệt.'
    },
    OPENING_TIEN_NHAN_CHI_LO: {
      id: 'OPENING_TIEN_NHAN_CHI_LO',
      name: 'Tiên Nhân Chỉ Lộ (Mở Tốt 7/3)',
      category: 'KHAI CUỘC',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/2P6/P1P3P1P/1C5C1/9/RNBAKABNR b - - 0 1',
      description: 'Nước mở đầu Tốt 7 tiến 1 để thăm dò chiến thuật và linh hoạt mở đường phát triển Mã.'
    },
    OPENING_KHOI_MA_CUOC: {
      id: 'OPENING_KHOI_MA_CUOC',
      name: 'Khởi Mã Cuộc (Nhảy Mã 8+7)',
      category: 'KHAI CUỘC',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNB1KABNR b - - 0 1',
      description: 'Xuất Mã trước để xây dựng thế trận vững chắc, phòng thủ chắc chắn.'
    },
    OPENING_QUA_CUNG_PHAO: {
      id: 'OPENING_QUA_CUNG_PHAO',
      name: 'Quá Cung Pháo (Pháo 2 bình 6)',
      category: 'KHAI CUỘC',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C3C3/9/RNBAKABNR b - - 0 1',
      description: 'Di chuyển Pháo ngang qua cung điện để uy hiếp mạn sườn đối phương.'
    },
    OPENING_SI_GIAC_PHAO: {
      id: 'OPENING_SI_GIAC_PHAO',
      name: 'Sĩ Giác Pháo (Pháo 2 bình 4)',
      category: 'KHAI CUỘC',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C1C5/9/RNBAKABNR b - - 0 1',
      description: 'Pháo đậu tại góc Sĩ, linh hoạt hỗ trợ phòng thủ và phản công trung lộ.'
    },

    // 3. TÀN CUỘC NGHỆ THUẬT (MASTER ENDGAMES)
    ENDGAME_DON_XA_THANG_MA_SONG_SI: {
      id: 'ENDGAME_DON_XA_THANG_MA_SONG_SI',
      name: 'Đơn Xe Thắng Mã Song Sĩ',
      category: 'TÀN CUỘC',
      fen: '3a1k3/4a4/4n4/9/9/9/9/9/9/3K1R3 w - - 0 1',
      description: 'Kỹ thuật dùng Đơn Xe khống chế bắt Mã và phá vỡ cấu trúc Sĩ của đối phương.'
    },
    ENDGAME_PHAO_MA_CHOT_THANG_SY_TUONG: {
      id: 'ENDGAME_PHAO_MA_CHOT_THANG_SY_TUONG',
      name: 'Pháo Mã Tốt Thắng Khuyết Sĩ Tượng',
      category: 'TÀN CUỘC',
      fen: '3ak1b2/4a4/9/4P4/9/9/9/4C4/4N4/4K4 w - - 0 1',
      description: 'Đòn phối hợp tam tử kinh điển Pháo - Mã - Tốt áp đảo đối thủ khuyết Tượng.'
    },
    ENDGAME_TAM_BINH_THANG_SI_TUONG_TOAN: {
      id: 'ENDGAME_TAM_BINH_THANG_SI_TUONG_TOAN',
      name: 'Tam Binh Thắng Sĩ Tượng Toàn',
      category: 'TÀN CUỘC',
      fen: '2b1k1b2/4a4/4a4/2P1P1P2/9/9/9/9/9/4K4 w - - 0 1',
      description: 'Ba Binh đã qua sông liên kết tạo thành sức mạnh công phá hàng phòng ngự kiên cố.'
    },
    ENDGAME_DON_PHAO_THANG_DON_SI: {
      id: 'ENDGAME_DON_PHAO_THANG_DON_SI',
      name: 'Đơn Pháo Thắng Đơn Sĩ (Giam Tướng)',
      category: 'TÀN CUỘC',
      fen: '3ak4/9/9/9/9/9/9/9/4K4/3C5 w - - 0 1',
      description: 'Kỹ thuật chiếm lộ mặt Tướng và dùng Pháo phong tỏa điểm huyệt.'
    },

    // 4. THẾ CỜ CHẤP (HANDICAP / ODDS)
    ODDS_CHAP_1_MA: {
      id: 'ODDS_CHAP_1_MA',
      name: 'Chấp 1 Mã (Trắng/Đỏ chấp Mã trái)',
      category: 'CỜ CHẤP',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/R1BAKABNR w - - 0 1',
      description: 'Đỏ chấp đối thủ 1 quân Mã ở góc b0.'
    },
    ODDS_CHAP_2_MA: {
      id: 'ODDS_CHAP_2_MA',
      name: 'Chấp 2 Mã (Song Mã)',
      category: 'CỜ CHẤP',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/R1BAKAB1R w - - 0 1',
      description: 'Đỏ chấp đối thủ cả 2 quân Mã.'
    },
    ODDS_CHAP_1_PHAO: {
      id: 'ODDS_CHAP_1_PHAO',
      name: 'Chấp 1 Pháo (Đỏ chấp Pháo b2)',
      category: 'CỜ CHẤP',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/7C1/9/RNBAKABNR w - - 0 1',
      description: 'Đỏ chấp đối thủ 1 quân Pháo cánh trái.'
    },
    ODDS_CHAP_2_PHAO: {
      id: 'ODDS_CHAP_2_PHAO',
      name: 'Chấp 2 Pháo (Song Pháo)',
      category: 'CỜ CHẤP',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/9/9/RNBAKABNR w - - 0 1',
      description: 'Đỏ chấp đối thủ cả 2 quân Pháo.'
    },
    ODDS_CHAP_1_XE: {
      id: 'ODDS_CHAP_1_XE',
      name: 'Chấp 1 Xe (Đỏ chấp Xe a0)',
      category: 'CỜ CHẤP',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/1NBAKABNR w - - 0 1',
      description: 'Đỏ chấp đối thủ 1 quân Xe cánh trái.'
    }
  };

  exports.XIANGQI_PRESETS = XIANGQI_PRESETS;
})(typeof exports !== 'undefined' ? exports : (window.XiangqiPresetsModule = {}));
