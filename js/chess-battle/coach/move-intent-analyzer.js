/**
 * Phase 4: Move Intent Analyzer
 * Determines WHY a move was made by evaluating Before and After states.
 */
import { PositionAnalyzer } from './position-analyzer.js';

export class MoveIntentAnalyzer {
  constructor(chessInstance) {
    this.game = chessInstance; // Expected to be a clone!
  }

  analyzeIntent(uciMove) {
    const sideToMove = this.game.turn();
    const opponentSide = sideToMove === 'w' ? 'b' : 'w';

    // 1. Analyze Before State
    const posAnalyzerBefore = new PositionAnalyzer(this.game);
    const beforeState = posAnalyzerBefore.analyze(sideToMove);

    // 2. Make Move
    const moveObj = this.game.move(uciMove, { sloppy: true });
    if (!moveObj) return null;

    // 3. Analyze After State
    // Note: It is now opponent's turn, so we still analyze from the perspective of sideToMove
    const posAnalyzerAfter = new PositionAnalyzer(this.game);
    const afterState = posAnalyzerAfter.analyze(sideToMove);

    let primaryIntent = '';
    const secondaryIntents = [];

    // Analyze specific tactical motifs
    if (moveObj.san.includes('#')) {
      primaryIntent = 'Tung đòn sát thủ chiếu hết (Mate)';
    } else if (moveObj.san.includes('+')) {
      primaryIntent = 'Tạo áp lực mạnh mẽ bằng đòn chiếu tướng';
    } else if (moveObj.captured) {
      const pVal = posAnalyzerBefore.getPieceValue(moveObj.piece);
      const cVal = posAnalyzerBefore.getPieceValue(moveObj.captured);
      if (pVal <= cVal) {
        primaryIntent = `Tiêu diệt ${this.getPieceName(moveObj.captured)} đối phương, giành lợi thế vật chất trực tiếp`;
      } else {
        primaryIntent = `Đổi ${this.getPieceName(moveObj.piece)} lấy ${this.getPieceName(moveObj.captured)} nhằm phá vỡ cấu trúc hoặc triệt tiêu phòng ngự`;
      }
    } else if (moveObj.san === 'O-O' || moveObj.san === 'O-O-O') {
      primaryIntent = 'Đưa Vua vào vị trí an toàn tuyệt đối và mở đường cho Xe tham chiến';
    } else if (moveObj.promotion) {
      primaryIntent = `Phong cấp Tốt thành ${this.getPieceName(moveObj.promotion)} để tạo áp đảo`;
    } else {
      // Positional moves
      if (moveObj.piece === 'n' || moveObj.piece === 'b') {
        primaryIntent = 'Triển khai quân nhẹ đến vị trí chiến lược, kiểm soát tầm nhìn';
      } else if (moveObj.piece === 'q' || moveObj.piece === 'r') {
        primaryIntent = 'Gia tăng hỏa lực hạng nặng vào trận địa đối phương';
      } else if (moveObj.piece === 'p') {
        primaryIntent = 'Đẩy Tốt chiếm không gian, hạn chế quân địch mở rộng';
      } else {
        primaryIntent = 'Cải thiện vị trí an toàn cho Vua';
      }
    }
    
    // Check if it creates new threats (e.g. hanging pieces increased)
    if (afterState.hangingEnemyPieces.length > beforeState.hangingEnemyPieces.length) {
       secondaryIntents.push(`Tạo ra mối đe dọa trực tiếp lên quân ${this.getPieceName(afterState.hangingEnemyPieces[0].type)} của địch`);
    }

    // Undo move to restore state!
    this.game.undo();

    return {
      moveObj,
      primaryIntent,
      secondaryIntents
    };
  }
  
  getPieceName(type) {
    const pieceNames = { 'p': 'Tốt', 'n': 'Mã', 'b': 'Tượng', 'r': 'Xe', 'q': 'Hậu', 'k': 'Vua' };
    return pieceNames[type.toLowerCase()] || 'Quân';
  }
}
