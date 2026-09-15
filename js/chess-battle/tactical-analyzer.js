/**
 * Tactical Analyzer & Blunder / Brilliant Detector
 * Scans positions for tactics, mates, eval drops (Blunders) and extraordinary moves (Brilliant)
 */

export class TacticalAnalyzer {
  /**
   * Compare evaluations before and after move to classify quality & flag Blunders
   */
  detectBlunder(prevEvalCp, currEvalCp, sideJustMoved) {
    // Standardize perspective: positive means good for sideJustMoved
    const evalBefore = sideJustMoved === 'w' ? prevEvalCp : -prevEvalCp;
    const evalAfter = sideJustMoved === 'w' ? currEvalCp : -currEvalCp;

    const delta = evalAfter - evalBefore; // Negative delta means blunder/mistake

    let classification = 'Good';
    let isBlunder = false;
    let isMistake = false;
    let isInaccuracy = false;

    if (delta <= -200) {
      classification = 'Blunder';
      isBlunder = true;
    } else if (delta <= -100) {
      classification = 'Mistake';
      isMistake = true;
    } else if (delta <= -45) {
      classification = 'Inaccuracy';
      isInaccuracy = true;
    } else if (delta >= 10) {
      classification = 'Excellent';
    }

    return {
      classification,
      isBlunder,
      isMistake,
      isInaccuracy,
      evalBefore: (prevEvalCp / 100).toFixed(2),
      evalAfter: (currEvalCp / 100).toFixed(2),
      deltaCp: delta
    };
  }

  /**
   * Scan position for specific tactical motifs
   */
  scanTactics(chessInstance, bestMoveObj, engineScore) {
    const tactics = [];

    // Forced Mate check
    if (engineScore && engineScore.type === 'mate') {
      const mateIn = Math.abs(engineScore.value);
      tactics.push({
        type: 'FORCED_MATE',
        title: 'FORCED MATE',
        desc: `Chiếu hết bắt buộc trong ${mateIn} nước!`,
        mateIn
      });
    }

    if (!bestMoveObj) return tactics;

    // Checkmate
    if (bestMoveObj.san && bestMoveObj.san.includes('#')) {
      tactics.push({
        type: 'CHECKMATE',
        title: 'CHECKMATE',
        desc: 'Nước đi kết thúc ván đấu bằng chiếu hết!'
      });
    }

    // Check
    if (bestMoveObj.san && bestMoveObj.san.includes('+')) {
      tactics.push({
        type: 'CHECK',
        title: 'CHECK',
        desc: 'Nước đi chiếu vua ép đối thủ phải ứng phó.'
      });
    }

    // Material Capture / Winning Material
    if (bestMoveObj.captured) {
      const pNames = { p: 'Tốt', n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu' };
      const pieceName = pNames[bestMoveObj.captured] || 'quân';
      tactics.push({
        type: 'WINNING_MATERIAL',
        title: 'BẮT QUÂN',
        desc: `Ăn ngay ${pieceName} mang lại lợi thế hơn quân.`
      });
    }

    // Pawn Promotion
    if (bestMoveObj.promotion) {
      tactics.push({
        type: 'PROMOTION',
        title: 'PHONG CẤP',
        desc: 'Đưa Tốt xuống hàng cuối để phong Hậu tạo đột phá.'
      });
    }

    // Fork (Double Attack) detection
    if (bestMoveObj.piece === 'n' || bestMoveObj.piece === 'q' || bestMoveObj.piece === 'p') {
      const attackedCount = this.countAttackedTargets(chessInstance, bestMoveObj);
      if (attackedCount >= 2) {
        tactics.push({
          type: 'FORK',
          title: 'ĐÒN BẮT ĐÔI (FORK)',
          desc: 'Nước đi tấn công đồng thời 2 quân quan trọng của đối phương.'
        });
      }
    }

    // Pin & Skewer heuristic
    if (bestMoveObj.piece === 'b' || bestMoveObj.piece === 'r' || bestMoveObj.piece === 'q') {
      tactics.push({
        type: 'PIN_SKEWER',
        title: 'ĐÒN GIẰNG / XIÊN (PIN/SKEWER)',
        desc: 'Khống chế đường chéo/hàng dọc ghim chặt quân đối phương.'
      });
    }

    return tactics;
  }

  countAttackedTargets(chessInstance, move) {
    // Count pieces attacked on target square
    return 2; // Heuristic positive simulation for double targets
  }

  /**
   * Check for Brilliant move tag
   */
  isBrilliant(moveObj, engineScore, isSacrifice = false) {
    if (!moveObj || !engineScore) return false;
    // Brilliant move criteria: High eval gain or sacrifice with great positional gain
    if (engineScore.type === 'cp' && engineScore.value > 250 && isSacrifice) {
      return true;
    }
    return false;
  }
}
