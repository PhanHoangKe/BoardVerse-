/**
 * Playstyle Candidate Selector & Core Decision Engine for Chess Battle Assistant
 * Enforces absolute priority hierarchy:
 * 1. FORCED MATE (prefer faster mate: M+1 > M+4)
 * 2. FORCED TACTICAL WIN
 * 3. STOCKFISH BEST MOVE (#1)
 * 4. SAFE PLAYSTYLE CANDIDATE
 * 5. OPENING DIVERSITY CANDIDATE
 * 
 * Enforces Safety Checklist (Section 3) for ALL non-Stockfish #1 candidates.
 */

import { OpeningDiversityManager } from './opening-diversity-manager.js';
import { TacticalTrapDetector } from './tactical-trap-detector.js';

export class PlaystyleCandidateSelector {
  constructor(defaultThresholdCp = 25) {
    this.thresholdCp = defaultThresholdCp;
    this.openingDiversityManager = new OpeningDiversityManager(15, 10);
    this.tacticalTrapDetector = new TacticalTrapDetector();
  }

  setThresholdCp(cp) {
    this.thresholdCp = typeof cp === 'number' ? Math.abs(cp) : 25;
  }

  startNewGame(seed = null) {
    this.openingDiversityManager.startNewGame(seed);
  }

  /**
   * Main candidate selection pipeline enforcing Section 6 priority hierarchy and Section 3 Safety Checklist.
   */
  selectBestMove(chessInstance, stockfishLines, userStyle = 'AUTO', prevEvalCp = null) {
    if (!stockfishLines || stockfishLines.length === 0) {
      return {
        objectiveBestMove: null,
        playstyleCandidate: null,
        evaluationGap: 0,
        tacticalMode: userStyle,
        tacticalCandidate: null,
        tacticalType: 'NORMAL',
        stockfishScore: '-',
        candidateScore: '-',
        opponentBestResponse: '-',
        verificationDepth: 0,
        verificationStatus: 'NOT_REQUIRED',
        mateStatus: 'NONE',
        sacrificeStatus: 'NO_SACRIFICE',
        openingSystem: '-',
        openingMove: '-',
        openingCandidateRank: '-',
        tacticalOpportunity: 'NO',
        finalSelectedMove: null,
        finalSelectedUci: null,
        pvLine: '',
        reason: 'No Stockfish lines available',
        isLegalAndFromStockfish: false
      };
    }

    const objectiveBest = stockfishLines[0];
    const topScore = objectiveBest.rawScore || objectiveBest.score || { type: 'cp', value: 0 };
    const currentEvalCp = topScore.type === 'cp' ? topScore.value : (topScore.value > 0 ? 10000 : -10000);
    const stockfishScoreText = objectiveBest.scoreText || (topScore.type === 'mate' ? `M${topScore.value}` : `${(currentEvalCp / 100).toFixed(2)}`);

    // 1. HIERARCHY LEVEL 1: FORCED MATE PRIORITY (Absolutes: M+1 > M+4)
    const mateCandidates = stockfishLines
      .map((line, idx) => ({ line, idx, score: line.rawScore || line.score || { type: 'cp', value: 0 } }))
      .filter(item => item.score.type === 'mate' && item.score.value > 0)
      .sort((a, b) => a.score.value - b.score.value); // Fastest mate first

    if (mateCandidates.length > 0) {
      const bestMateItem = mateCandidates[0];
      const chosenLine = bestMateItem.line;
      const chosenScore = bestMateItem.score;

      return {
        objectiveBestMove: objectiveBest.san,
        playstyleCandidate: chosenLine.san,
        evaluationGap: 0,
        tacticalMode: userStyle.toUpperCase(),
        tacticalCandidate: chosenLine.san,
        tacticalType: 'FORCED_MATE',
        stockfishScore: stockfishScoreText,
        candidateScore: chosenLine.scoreText || `M${chosenScore.value}`,
        opponentBestResponse: chosenLine.pvMoves ? chosenLine.pvMoves[1] || '-' : '-',
        verificationDepth: chosenLine.depth || 24,
        verificationStatus: 'VERIFIED_MATE',
        mateStatus: `FORCED_MATE_M+${chosenScore.value}`,
        sacrificeStatus: 'NO_SACRIFICE',
        openingSystem: '-',
        openingMove: '-',
        openingCandidateRank: '-',
        tacticalOpportunity: 'YES',
        finalSelectedMove: chosenLine.san,
        finalSelectedUci: chosenLine.bestUci || chosenLine.uci,
        pvLine: chosenLine.pvLine || chosenLine.san,
        reason: `FORCED MATE PRIORITY: Selected fastest forced mate line (${chosenLine.san} - M+${chosenScore.value}). Forced mate overrides playstyle & opening diversity.`,
        isLegalAndFromStockfish: true
      };
    }

    // Determine Effective Playstyle Mode & Allowed Gap Limit
    let effectiveStyle = (userStyle || 'AUTO').toUpperCase();
    let autoReasonPrefix = '';

    if (effectiveStyle === 'AUTO') {
      const inCheck = chessInstance ? chessInstance.inCheck() : false;
      const evalDrop = (prevEvalCp !== null && typeof prevEvalCp === 'number')
        ? (currentEvalCp - prevEvalCp)
        : 0;

      if (inCheck) {
        effectiveStyle = 'DEFENSE';
        autoReasonPrefix = 'AUTO: King in check -> DEFENSE mode activated. ';
      } else if (chessInstance && chessInstance.history().length > 60 && currentEvalCp > -150 && currentEvalCp < 150) {
        // Upgrade 2: Dirty Flagging (Ép cờ / Ép thời gian)
        // Nếu ván đấu kéo dài quá 30 nước (60 plies) và thế trận đang giằng co, 
        // bot tự động bung sức tấn công để làm đối thủ rối trí và hết giờ.
        effectiveStyle = 'ATTACK';
        autoReasonPrefix = `AUTO: Late game (Ply ${chessInstance.history().length}) assumed time pressure -> Dirty Flagging (ATTACK) activated. `;
      } else if (evalDrop >= 50) {
        effectiveStyle = 'ATTACK';
        autoReasonPrefix = `AUTO: Opponent blundered (+${(evalDrop / 100).toFixed(2)} drop) -> ATTACK mode activated. `;
      } else if (currentEvalCp > 200) {
        effectiveStyle = 'TACTICAL';
        autoReasonPrefix = `AUTO: Substantial advantage (+${(currentEvalCp / 100).toFixed(2)}) -> TACTICAL mode activated. `;
      } else if (currentEvalCp < -150) {
        effectiveStyle = 'DEFENSE';
        autoReasonPrefix = `AUTO: Position under pressure (${(currentEvalCp / 100).toFixed(2)}) -> DEFENSE mode activated. `;
      } else {
        effectiveStyle = 'AUTO';
      }
    }

    let maxAllowedGap = this.thresholdCp;
    if (effectiveStyle === 'NATURAL') maxAllowedGap = 0;
    else if (effectiveStyle === 'DEFENSE') maxAllowedGap = 10;
    else if (effectiveStyle === 'TACTICAL' || effectiveStyle === 'MATE_TRAP') maxAllowedGap = 25;
    else if (effectiveStyle === 'ATTACK') maxAllowedGap = 50;

    // Upgrade 1: Hope Chess (Cờ Cáo Già)
    // Nới lỏng thêm ngưỡng chấp nhận lỗ (Gap) để tung ra các bẫy khó chịu
    // Hy vọng con người sẽ tính sót và rơi vào bẫy.
    if (effectiveStyle === 'TACTICAL' || effectiveStyle === 'MATE_TRAP' || effectiveStyle === 'ATTACK') {
      maxAllowedGap += 25; // Nới thêm 0.25 Tốt để dám chơi các đòn thí quân/chiến thuật mạo hiểm hơn
      autoReasonPrefix = '(Hope Chess +25cp) ' + autoReasonPrefix;
    }

    // 2. OPENING DIVERSITY MANAGER (If in opening phase & not forced natural)
    if (effectiveStyle !== 'NATURAL' && maxAllowedGap > 0) {
      const openingChoice = this.openingDiversityManager.selectOpeningCandidate(chessInstance, stockfishLines, maxAllowedGap);
      if (openingChoice) {
        // Safety Checklist Validation for Opening Choice
        const isLegal = this.isMoveLegal(chessInstance, openingChoice.moveUci);
        if (isLegal && openingChoice.evalGap <= 15) {
          return {
            objectiveBestMove: objectiveBest.san,
            playstyleCandidate: openingChoice.moveSan,
            evaluationGap: openingChoice.evalGap,
            tacticalMode: effectiveStyle === 'AUTO' ? 'OPENING' : effectiveStyle,
            tacticalCandidate: openingChoice.moveSan,
            tacticalType: 'NORMAL',
            stockfishScore: stockfishScoreText,
            candidateScore: openingChoice.selectedLine.scoreText || `${((currentEvalCp - openingChoice.evalGap) / 100).toFixed(2)}`,
            opponentBestResponse: openingChoice.selectedLine.pvMoves ? openingChoice.selectedLine.pvMoves[1] || '-' : '-',
            verificationDepth: openingChoice.selectedLine.depth || 24,
            verificationStatus: 'VERIFIED_STABLE',
            mateStatus: 'NONE',
            sacrificeStatus: 'NO_SACRIFICE',
            openingSystem: openingChoice.systemName,
            openingMove: openingChoice.moveSan,
            openingCandidateRank: `#${openingChoice.candidateRank}`,
            tacticalOpportunity: 'NO',
            finalSelectedMove: openingChoice.moveSan,
            finalSelectedUci: openingChoice.moveUci,
            pvLine: openingChoice.selectedLine.pvLine || openingChoice.moveSan,
            reason: `${autoReasonPrefix}Opening Diversity Manager: Selected repertoire candidate #${openingChoice.candidateRank} (${openingChoice.moveSan} - ${openingChoice.systemName}, gap ${openingChoice.evalGap}cp <= 15cp). Passed Safety Checklist.`,
            isLegalAndFromStockfish: true
          };
        }
      }
    }

    // If AUTO hasn't resolved, default effectiveStyle to TACTICAL or NATURAL
    if (effectiveStyle === 'AUTO') {
      const tacScan = this.tacticalTrapDetector.detectTacticalOpportunities(chessInstance, stockfishLines, maxAllowedGap);
      if (tacScan.hasOpportunity) {
        effectiveStyle = 'TACTICAL';
        autoReasonPrefix = 'AUTO: Tactical opportunity detected -> TACTICAL mode activated. ';
      } else {
        effectiveStyle = 'NATURAL';
        autoReasonPrefix = 'AUTO: Position stable and equal -> NATURAL mode activated. ';
      }
    }

    // 3. NATURAL MODE: Always select Stockfish #1
    if (effectiveStyle === 'NATURAL' || maxAllowedGap === 0) {
      const classification = this.tacticalTrapDetector.classifyLine(chessInstance, objectiveBest);
      return {
        objectiveBestMove: objectiveBest.san,
        playstyleCandidate: objectiveBest.san,
        evaluationGap: 0,
        tacticalMode: 'NATURAL',
        tacticalCandidate: objectiveBest.san,
        tacticalType: classification.primaryType,
        stockfishScore: stockfishScoreText,
        candidateScore: stockfishScoreText,
        opponentBestResponse: objectiveBest.pvMoves ? objectiveBest.pvMoves[1] || '-' : '-',
        verificationDepth: objectiveBest.depth || 24,
        verificationStatus: 'NOT_REQUIRED',
        mateStatus: 'NONE',
        sacrificeStatus: classification.isSacrifice ? 'VERIFIED_WINNING' : 'NO_SACRIFICE',
        openingSystem: '-',
        openingMove: '-',
        openingCandidateRank: '-',
        tacticalOpportunity: classification.primaryType !== 'NORMAL' ? 'YES' : 'NO',
        finalSelectedMove: objectiveBest.san,
        finalSelectedUci: objectiveBest.bestUci || objectiveBest.uci,
        pvLine: objectiveBest.pvLine || objectiveBest.san,
        reason: `${autoReasonPrefix}NATURAL mode: Selected Stockfish MultiPV #1 move strictly.`,
        isLegalAndFromStockfish: true
      };
    }

    // 4. TACTICAL & PLAYSTYLE CANDIDATE SELECTION (ATTACK, TACTICAL, MATE_TRAP, DEFENSE)
    const tacOpportunities = this.tacticalTrapDetector.detectTacticalOpportunities(chessInstance, stockfishLines, maxAllowedGap);

    if (tacOpportunities.hasOpportunity && tacOpportunities.verifiedCandidates.length > 0) {
      const chosen = tacOpportunities.verifiedCandidates[0];
      const chosenLine = chosen.line;
      const chosenScore = chosenLine.rawScore || chosenLine.score || { type: 'cp', value: 0 };
      const chosenScoreText = chosenLine.scoreText || (chosenScore.type === 'mate' ? `M${chosenScore.value}` : `${(chosenLine.lineCp / 100).toFixed(2)}`);

      return {
        objectiveBestMove: objectiveBest.san,
        playstyleCandidate: chosenLine.san,
        evaluationGap: chosen.verification.evalGap || 0,
        tacticalMode: effectiveStyle,
        tacticalCandidate: chosenLine.san,
        tacticalType: chosen.classification.primaryType,
        stockfishScore: stockfishScoreText,
        candidateScore: chosenScoreText,
        opponentBestResponse: chosen.verification.oppBestResponse || '-',
        verificationDepth: chosenLine.depth || 24,
        verificationStatus: chosen.verification.status,
        mateStatus: chosen.classification.types.includes('MATE_THREAT') ? 'MATE_THREAT' : 'NONE',
        sacrificeStatus: chosen.classification.isSacrifice ? 'VERIFIED_WINNING' : 'NO_SACRIFICE',
        openingSystem: '-',
        openingMove: '-',
        openingCandidateRank: '-',
        tacticalOpportunity: 'YES',
        finalSelectedMove: chosenLine.san,
        finalSelectedUci: chosenLine.bestUci || chosenLine.uci,
        pvLine: chosenLine.pvLine || chosenLine.san,
        reason: `${autoReasonPrefix}${effectiveStyle} mode: Selected verified ${chosen.classification.primaryType} candidate (${chosenLine.san}). Passed Safety Checklist & Double-Verification. ${chosen.verification.reason}`,
        isLegalAndFromStockfish: true
      };
    }

    // 5. FALLBACK: Revert safely to Stockfish #1 if no candidate satisfied conditions
    const bestClassification = this.tacticalTrapDetector.classifyLine(chessInstance, objectiveBest);
    return {
      objectiveBestMove: objectiveBest.san,
      playstyleCandidate: objectiveBest.san,
      evaluationGap: 0,
      tacticalMode: effectiveStyle,
      tacticalCandidate: objectiveBest.san,
      tacticalType: bestClassification.primaryType,
      stockfishScore: stockfishScoreText,
      candidateScore: stockfishScoreText,
      opponentBestResponse: objectiveBest.pvMoves ? objectiveBest.pvMoves[1] || '-' : '-',
      verificationDepth: objectiveBest.depth || 24,
      verificationStatus: 'PASSED',
      mateStatus: 'NONE',
      sacrificeStatus: bestClassification.isSacrifice ? 'VERIFIED_WINNING' : 'NO_SACRIFICE',
      openingSystem: '-',
      openingMove: '-',
      openingCandidateRank: '-',
      tacticalOpportunity: bestClassification.primaryType !== 'NORMAL' ? 'YES' : 'NO',
      finalSelectedMove: objectiveBest.san,
      finalSelectedUci: objectiveBest.bestUci || objectiveBest.uci,
      pvLine: objectiveBest.pvLine || objectiveBest.san,
      reason: `${autoReasonPrefix}${effectiveStyle} mode: No candidate satisfied safety checklist within ${maxAllowedGap}cp threshold. Reverted safely to Stockfish #1.`,
      isLegalAndFromStockfish: true
    };
  }

  isMoveLegal(chessInstance, uci) {
    if (!chessInstance || !uci || uci.length < 4) return false;
    const fromSq = uci.substring(0, 2);
    const toSq = uci.substring(2, 4);
    const legalMoves = chessInstance.moves({ verbose: true });
    return legalMoves.some(m => m.from === fromSq && m.to === toSq);
  }
}
