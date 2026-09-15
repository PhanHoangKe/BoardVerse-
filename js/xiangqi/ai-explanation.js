/**
 * Xiangqi AI Explanation Manager - Grandmaster Edition
 * Generates natural language explanations of Engine moves with authentic Vietnamese Xiangqi tactical motifs.
 */

(function(exports) {
  'use strict';

  const MoveConverter = typeof require !== 'undefined'
    ? require('./move-converter.js').MoveConverter
    : (window.MoveConverterModule ? window.MoveConverterModule.MoveConverter : null);

  class XiangqiAIExplanation {
    static generateExplanation(engineResult, move, gameState) {
      if (!engineResult || engineResult.error || !move) {
        return 'Chưa có phân tích nước đi từ Engine.';
      }

      const scoreFormatted = engineResult.lines && engineResult.lines[0]
        ? engineResult.lines[0].scoreFormatted || '0.00'
        : '0.00';

      const movedPiece = move.movedPiece || (gameState && gameState.board && move.from ? gameState.board[move.from.row][move.from.col] : null);
      const pieceType = movedPiece ? movedPiece.type : 'p';
      const pieceColor = movedPiece ? movedPiece.color : (gameState ? gameState.sideToMove : 'r');
      const pieceName = getPieceNameVi(pieceType);
      const isCapture = !!move.captured;

      // Extract notation
      let vnNotation = '';
      if (MoveConverter && movedPiece) {
        vnNotation = MoveConverter.toVietnameseNotation(move, movedPiece);
      }

      // Eval narrative
      let evalDesc = 'Thế trận cân bằng';
      let scoreNum = parseFloat(scoreFormatted) || 0;
      if (scoreFormatted.includes('M')) {
        evalDesc = scoreFormatted.startsWith('+') || scoreFormatted.startsWith('M')
          ? 'Đang có đòn sát cục dứt điểm (Chiếu bí)'
          : 'Nguy cơ bị sát cục';
      } else if (scoreNum > 2.0) {
        evalDesc = pieceColor === 'r' ? 'Quân Đỏ chiếm ưu thế áp đảo (+ ' + scoreNum.toFixed(2) + ')' : 'Quân Đen ưu thế áp đảo';
      } else if (scoreNum > 0.6) {
        evalDesc = 'Chiếm ưu thế thế trận tích cực (+ ' + scoreNum.toFixed(2) + ')';
      } else if (scoreNum < -2.0) {
        evalDesc = 'Thế trận bất lợi, cần phòng thủ chắc chắn';
      }

      let lines = [];
      lines.push(`<strong><i class="fa-solid fa-brain" style="color:var(--cb-indigo);"></i> PHÂN TÍCH ĐẠI SƯ (${evalDesc}):</strong><br>`);

      // Tactical commentary
      let tacticalInsight = '';
      if (gameState && gameState.checkState && gameState.checkState.isCheck) {
        tacticalInsight = `Nước đi hóa giải đòn chiếu hiểm hóc của đối phương, tái cấu trúc đội hình bảo vệ Cung Tướng.`;
      } else if (isCapture) {
        const capName = getPieceNameVi(move.captured ? move.captured.type : '');
        tacticalInsight = `Nước đi quyết đoán ăn quân <b>${capName}</b> của đối phương, chiếm đoạt ưu thế quân lực và phá vỡ cấu trúc liên hoàn đối thủ.`;
      } else {
        tacticalInsight = getTacticalMotif(move, pieceType, pieceColor, gameState);
      }

      lines.push(`<div style="margin-bottom: 6px; line-height: 1.5; color: #ffffff;"><b>${vnNotation || pieceName}:</b> ${tacticalInsight}</div>`);

      // PV Sequence Analysis (Chuỗi nước đi biến thể dự đoán)
      const topCandidate = engineResult.lines && engineResult.lines[0];
      const pvMoves = topCandidate && topCandidate.pvMoves ? topCandidate.pvMoves : [];

      if (pvMoves.length > 0 && MoveConverter) {
        lines.push('<div style="font-weight:700; color:var(--cb-gold); margin-top:8px; margin-bottom:6px; font-size:0.78rem;"><i class="fa-solid fa-route"></i> KẾ HOẠCH & CHUỖI BIẾN ĐA BƯỚC (PV):</div>');
        let seqHtml = '<ul style="margin: 0; padding-left: 0; list-style-type: none; font-size: 0.76rem; line-height: 1.5; color: #e2e8f0;">';
        
        // Clone board for accurate virtual step tracing
        let simBoard = null;
        if (gameState && gameState.board) {
          simBoard = gameState.board.map(row => row.map(cell => cell ? { ...cell } : null));
        }

        const stepBadgeColors = ['#22c55e', '#f59e0b', '#38bdf8', '#a855f7'];
        const maxSteps = Math.min(4, pvMoves.length);

        for (let i = 0; i < maxSteps; i++) {
          const uci = pvMoves[i];
          const mObj = MoveConverter.uciToMove(uci);
          const stepNum = i + 1;
          const isCurrentSide = (i % 2 === 0);
          const sideLabel = isCurrentSide ? (pieceColor === 'r' ? 'Đỏ' : 'Đen') : (pieceColor === 'r' ? 'Đen' : 'Đỏ');
          const badgeColor = stepBadgeColors[i % stepBadgeColors.length];

          let stepDesc = `${uci}`;
          if (mObj && simBoard) {
            const p = simBoard[mObj.from.row] ? simBoard[mObj.from.row][mObj.from.col] : null;
            if (p) {
              const notStr = MoveConverter.toVietnameseNotation(mObj, p);
              stepDesc = `<strong>${notStr}</strong> <span style="opacity:0.75; font-size:0.7rem;">(${uci})</span>`;
            }

            // Advance simulation board
            const movingPiece = simBoard[mObj.from.row][mObj.from.col];
            simBoard[mObj.to.row][mObj.to.col] = movingPiece;
            simBoard[mObj.from.row][mObj.from.col] = null;
          }

          seqHtml += `<li style="margin-bottom: 5px; display:flex; align-items:center; gap:6px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px; border-radius:50%; background:${badgeColor}; color:#0f172a; font-weight:900; font-size:10px;">${stepNum}</span> 
            <span style="font-weight:700; color:${badgeColor}; min-width:32px;">${sideLabel}:</span> 
            <span>${stepDesc}</span>
          </li>`;
        }
        seqHtml += '</ul>';
        lines.push(seqHtml);
      }

      return lines.join('');
    }
  }

  function getTacticalMotif(move, type, color, gameState) {
    const from = move.from;
    const to = move.to;

    if (type === 'c') {
      if (to.col === 4) {
        return '<b>Trung Pháo (Pháo Đầu):</b> Đóng pháo vào trung lộ kiểm soát tim bàn cờ, dồn áp lực trực diện lên đôi tượng và cung Tướng.';
      } else if (to.col === 3 || to.col === 5) {
        return '<b>Sĩ Giác Pháo:</b> Pháo thủ góc sĩ, vừa giữ sườn vừa mở đường thông thoáng cho Xe xuất chiến.';
      } else if (to.col === 1 || to.col === 7) {
        return '<b>Quá Cung Pháo:</b> Chuyển pháo sang cánh đối diện tập trung hỏa lực công phá điểm yếu sườn đối phương.';
      } else if (to.row === 0 || to.row === 9) {
        return '<b>Pháo Đáy:</b> Đâm pháo xuống tuyến đáy uy hiếp cung tướng, tạo thế sát cục hoặc khóa chặt quân địch.';
      }
      return 'Pháo cơ động chiếm lộ hiểm yếu, chuẩn bị giương ngòi đe dọa trục tấn công then chốt.';
    }

    if (type === 'r') {
      if (to.row === 5 || to.row === 4) {
        return '<b>Kỵ Hà Xa:</b> Xe dâng lên bờ sông chiếm cứ hàng hà đối phương, đè ép cánh quân và khống chế điểm vượt sông.';
      } else if (to.row === 6 || to.row === 3) {
        return '<b>Tuần Hà Xa:</b> Xe tuần hà bảo vệ hàng tốt từ xa, vừa phong tỏa vừa sẵn sàng chuyển cánh chi viện.';
      } else if (to.col === 1 || to.col === 7 || to.col === 3 || to.col === 5) {
        return '<b>Xuất Xe Chiếm Lộ:</b> Xe xuất trận chiếm lộ huyết mạch thông suốt, giành quyền kiểm soát không gian chiến thuật.';
      } else if (to.row === 0 || to.row === 9) {
        return '<b>Xe Đâm Đáy:</b> Xe thọc sâu xuống đáy cung thành đe dọa Tướng, phá vỡ thế phòng ngự Sĩ Tượng.';
      }
      return 'Xuất Xe cơ động kiểm soát trục chiến lược, tạo uy lực cơ bắp đè bẹp các đòn phản công.';
    }

    if (type === 'n') {
      if ((to.col === 2 || to.col === 6) && (to.row === 7 || to.row === 2)) {
        return '<b>Bình Phong Mã:</b> Dựng cặp mã chính diện kiên cố, vừa yểm trợ tốt đầu vừa giữ thế trận vững chắc như bàn thạch.';
      } else if (to.row === 1 || to.row === 8) {
        return '<b>Mã Ngọa Tào:</b> Phi mã nhảy vào điểm ngọa tào hiểm hóc, khóa chặt cửa Tướng và chuẩn bị đòn sát cục!';
      } else if (to.col === 0 || to.col === 8) {
        return '<b>Biên Mã:</b> Mã biên linh hoạt thoát chân cản, mở đường cho Pháo Xe triển khai thế trận.';
      }
      return 'Mã nhảy vào vị trí đắc địa, thoát chân cản, tăng cường tầm kiểm soát đa hướng (bát diện uy phong).';
    }

    if (type === 'p') {
      if ((color === 'r' && to.row <= 4) || (color === 'b' && to.row >= 5)) {
        return '<b>Quá Hà Tốt (Tốt qua sông):</b> Tốt vượt sông gia tăng sức mạnh uy hiếp, có giá trị chiến lược như nửa con Xe, kẹp nách cung thành.';
      } else if (to.col === 2 || to.col === 6) {
        return '<b>Tiên Nhân Chỉ Lộ (Binh 3/7):</b> Mở đường cho Mã xuất trận, thăm dò phản ứng và cấu trúc trận địa đối phương.';
      }
      return 'Tiến tốt ghìm giữ trung tâm, mở đường cho quân chủ lực phát triển thế công.';
    }

    if (type === 'a' || type === 'b') {
      return '<b>Củng cố Sĩ Tượng:</b> Kết nối hệ thống phòng thủ liên hoàn, che chắn trung lộ, triệt tiêu mọi hướng công kích của Xe Pháo đối thủ.';
    }

    return 'Nước đi chiến lược tối ưu vị trí quân, duy trì cân bằng và nắm quyền chủ động ván cờ.';
  }

  function getPieceNameVi(type) {
    const map = { k: 'Tướng', a: 'Sĩ', b: 'Tượng', n: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt' };
    return map[type] || 'Quân';
  }

  exports.XiangqiAIExplanation = XiangqiAIExplanation;
})(typeof exports !== 'undefined' ? exports : (window.AIExplanationModule = {}));

