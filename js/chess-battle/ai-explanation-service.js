import { MoveIntentAnalyzer } from './coach/move-intent-analyzer.js';
import { NLGGenerator } from './coach/nlg-generator.js';

export class AIExplanationService {
  /**
   * Generate natural Vietnamese explanation for engine recommendation
   */
  generateDetailedExplanation(analysisResult, game) {
    if (!analysisResult) return 'Chưa có phân tích cho thế cờ hiện tại.';

    const { bestMoveSan, evalScore, blunderInfo, pvUci, source } = analysisResult;
    let lines = [];

    // Tablebase explanation
    if (source === 'TABLEBASE') {
      const tb = analysisResult.tablebase;
      lines.push(`Syzygy Tablebase xác nhận đây là vị trí **${tb.resultText}** tuyệt đối.`);
      lines.push(`Nước đi tối ưu nhất là **${bestMoveSan}** để đạt mục tiêu nhanh nhất (DTZ: ${tb.dtz}).`);
      return lines.join('\n\n');
    }

    if (bestMoveSan) {
      let evalDesc = 'cân bằng';
      if (evalScore) {
        if (evalScore.type === 'mate') {
          evalDesc = `chiếu hết trong ${Math.abs(evalScore.value)} nước`;
        } else {
          const val = (evalScore.value / 100).toFixed(2);
          evalDesc = val > 0 ? `lợi thế +${val}` : `điểm số ${val}`;
        }
      }
      lines.push(`<strong><i class="fa-solid fa-brain"></i> AI PHÂN TÍCH DIỄN BIẾN (${evalDesc}):</strong><br>`);
    }

    if (game && pvUci && pvUci.length > 0) {
      try {
        const tempGame = new (game.constructor)(game.fen());
        const intentAnalyzer = new MoveIntentAnalyzer(tempGame);
        const nlg = new NLGGenerator();
        
        let sequenceHtml = '<ul style="margin: 0; padding-left: 20px; list-style-type: none;">';
        const maxMovesToExplain = Math.min(6, pvUci.length);
        
        for (let i = 0; i < maxMovesToExplain; i++) {
          const uciMove = pvUci[i];
          if (!uciMove || uciMove.length < 4) continue;
          
          const isPlayer = (i % 2 === 0);
          
          const intentData = intentAnalyzer.analyzeIntent(uciMove);
          if (!intentData) break;
          
          sequenceHtml += nlg.generateMoveNarrative(intentData, i, isPlayer);
          
          // Actually make the move on tempGame for the next iteration (since analyzeIntent undoes it)
          tempGame.move(uciMove, { sloppy: true });
        }
        sequenceHtml += '</ul>';
        lines.push(sequenceHtml);

        if (pvUci.length > maxMovesToExplain) {
          lines.push(`<i style="color:#94a3b8; font-size:0.85rem; margin-top: 8px; display: block;">(Hệ thống tính toán sâu tới ${pvUci.length} nước cho biến thể này...)</i>`);
        }
      } catch (e) {
        console.error("AI Detailed Explanation Parse Error:", e);
        lines.push(`Lỗi khi trích xuất dữ liệu chiến thuật chi tiết.`);
      }
    } else {
       lines.push("Không có dữ liệu chuỗi biến thể (PV) để giải thích.");
    }

    return lines.join('\n');
  }
}
