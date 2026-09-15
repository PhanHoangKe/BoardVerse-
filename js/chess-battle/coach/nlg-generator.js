/**
 * Phase 9: NLG Generator
 * Turns structured intent data into smooth, expert-level Vietnamese chess commentary.
 */

export class NLGGenerator {
  generateMoveNarrative(intentData, moveIndex, isPlayer) {
    const { moveObj, primaryIntent, secondaryIntents } = intentData;
    
    let prefix = '';
    if (moveIndex === 0) prefix = '🔹 Bước 1 (Đề xuất): Chúng ta';
    else if (moveIndex === 1) prefix = '🔸 Bước 2 (Dự đoán): Đối thủ có thể sẽ';
    else if (isPlayer) prefix = `🔹 Bước ${moveIndex + 1} (Phản công): Chúng ta`;
    else prefix = `🔸 Bước ${moveIndex + 1} (Chống trả): Đối thủ buộc phải`;

    const colorIcon = isPlayer ? '<strong style="color:var(--cb-gold);">' : '<strong>';
    
    let sentence = `<li style="margin-bottom: 10px; line-height: 1.5;">${prefix} ${colorIcon}${moveObj.san}</strong>, nhằm mục đích <i>${primaryIntent.toLowerCase()}</i>.`;
    
    if (secondaryIntents && secondaryIntents.length > 0) {
      sentence += ` Đồng thời, nước đi này cũng ${secondaryIntents[0].toLowerCase()}.`;
    }
    
    sentence += `</li>`;
    return sentence;
  }
}
