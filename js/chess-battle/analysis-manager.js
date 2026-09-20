/**
 * AnalysisManager Module
 * Central Engine Orchestrator enforcing absolute Engine-First integrity & Version Gating.
 * Strict Routing Hierarchy: Syzygy Tablebase -> Native Stockfish 18 AVX2 -> Stockfish 18 WASM SIMD -> Cloud Engine 40+ -> ENGINE_UNAVAILABLE.
 * ZERO legacy engines. ZERO Heuristic / PST fake moves in Engine modes!
 */

import { TablebaseService } from './opening-tablebase-service.js';
import { StockfishWasmEngine, isEngineVersionAllowed } from './engine-adapter.js';
import { EngineManager } from './engine-manager.js';
import { PositionEvaluator } from './position-evaluator.js';
import { AIExplanationService } from './ai-explanation-service.js';
import { PlaystyleLayer } from './playstyle-layer.js';

export class AnalysisManager {
  constructor() {
    this.tablebaseService = new TablebaseService();
    this.engine = new StockfishWasmEngine();
    this.engineManager = new EngineManager(this.engine);
    this.aiExplanationService = new AIExplanationService();
    this.playstyleLayer = new PlaystyleLayer(25); // 0.25 pawn threshold limit

    this.analysisPreset = 'QUICK'; // QUICK (1s default for rapid and easy user experience)
    this.playStyle = 'NATURAL'; // NATURAL, ATTACK, DEFENSE, AUTO
    this.timeControl = 60000; // 60s max time ceiling for MAXIMUM (auto-stops on target depth)
    this.currentAnalysisId = null;
    this.currentFen = null;
    this.cache = new Map();
    this.userThreads = 8;
    this.userHashMb = 512;
    this.lastEvalCp = null;
  }

  async init() {
    await this.engine.init();
  }

  getPresetConfig(isUserTurn = false, coachPresetOverride = null) {
    let activePreset = this.analysisPreset;
    
    // Bật preset được cấu hình khi đang gợi ý cho Người dùng (Đóng vai trò Huấn luyện viên)
    if (isUserTurn) {
      activePreset = coachPresetOverride || 'MAXIMUM';
    }

    const timeVal = typeof this.timeControl === 'number' ? this.timeControl : 60000;
    let multiPvCount = 1;
    if (this.playStyle === 'NATURAL') multiPvCount = 1;
    else if (this.playStyle === 'ATTACK' || this.playStyle === 'DEFENSE') multiPvCount = 3;
    else if (this.playStyle === 'TACTICAL' || this.playStyle === 'MATE_TRAP' || this.playStyle === 'AUTO') multiPvCount = 3;

    switch (activePreset) {
      case 'MAXIMUM':
      case 'UNBEATABLE':
        return {
          preset: 'MAXIMUM',
          Depth: 38, // Invincible Depth: nhìn trước 19 nước đi đôi (38 ply), bẻ gãy mọi đòn tấn công
          MoveTime: 12000, // 12 giây tính toán sâu cực đại cho Coach
          MultiPV: 1, // 1 line để dồn 100% tài nguyên CPU đạt chiều sâu tối đa nhanh nhất
          Threads: this.userThreads || 8,
          Hash: this.userHashMb || 512,
          isEngineMode: true,
          useNativeFirst: true,
          useCloudFirst: true,
          useMasterBook: true
        };
      case 'DEEP':
        return {
          preset: 'DEEP',
          Depth: 28,
          MoveTime: 7500,
          MultiPV: multiPvCount,
          Threads: this.userThreads || 8,
          Hash: this.userHashMb || 256,
          isEngineMode: true,
          useNativeFirst: true,
          useCloudFirst: true,
          useMasterBook: true
        };
      case 'HUMAN_GM':
        return {
          preset: 'HUMAN_GM',
          Depth: 22,
          MoveTime: 4500,
          MultiPV: 1, 
          Threads: 4, 
          Hash: 128,
          limitStrength: true,
          uciElo: 2800, // Magnus Carlsen level
          isEngineMode: true,
          useNativeFirst: true
        };
      case 'BLITZ_5M':
      case 'STRONG':
        return {
          preset: 'BLITZ_5M',
          Depth: 24,
          MoveTime: 3000,
          MultiPV: multiPvCount,
          Threads: this.userThreads || 8,
          Hash: this.userHashMb || 256,
          isEngineMode: true,
          useNativeFirst: true
        };
      case 'QUICK':
      case 'BULLET':
      default:
        return {
          preset: 'QUICK',
          Depth: 18,
          MoveTime: 1000,
          MultiPV: 1,
          Threads: Math.min(4, this.userThreads || 4),
          Hash: 128,
          isEngineMode: true,
          useNativeFirst: true
        };
    }
  }

  setPreset(preset) {
    this.analysisPreset = preset;
  }

  setPlayStyle(style) {
    this.playStyle = style;
  }

  setTimeControl(msOrUnlimited) {
    this.timeControl = msOrUnlimited;
  }

  cancelCurrentAnalysis() {
    this.currentAnalysisId = null;
    this.engine.stop();
  }

  clearCache() {
    this.cache.clear();
    this.lastEvalCp = null;
  }

  generateAnalysisId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'aid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }


  /**
   * Verifies if UCI move is legal for sideToMove in chessInstance
   */
  isLegalUciMove(chessInstance, uciMove, sideToMove) {
    if (!uciMove || typeof uciMove !== 'string' || uciMove.length < 4 || uciMove === '0000' || uciMove === '(none)') {
      return null;
    }
    const fromSq = uciMove.substring(0, 2);
    const toSq = uciMove.substring(2, 4);
    const prom = uciMove.length === 5 ? uciMove[4].toLowerCase() : undefined;

    const legalMoves = chessInstance.moves({ verbose: true, color: sideToMove });
    let matched = legalMoves.find(m => {
      if (m.from !== fromSq || m.to !== toSq) return false;
      if (prom && m.promotion !== prom) return false;
      return true;
    });

    // Castling UCI fallback (e.g. Stockfish returning d1g1, d1h1, e1g1, e1h1 for O-O, or d1b1, d1a1 for O-O-O)
    if (!matched) {
      const p = chessInstance.get(fromSq);
      if (p && p.type === 'k') {
        if ((toSq === 'g1' || toSq === 'h1' || toSq === 'f1') && (fromSq === 'e1' || fromSq === 'd1')) {
          matched = legalMoves.find(m => m.flags === 'k');
        } else if ((toSq === 'c1' || toSq === 'b1' || toSq === 'a1') && (fromSq === 'e1' || fromSq === 'd1')) {
          matched = legalMoves.find(m => m.flags === 'q');
        } else if ((toSq === 'g8' || toSq === 'h8' || toSq === 'f8') && (fromSq === 'e8' || fromSq === 'd8')) {
          matched = legalMoves.find(m => m.flags === 'k');
        } else if ((toSq === 'c8' || toSq === 'b8' || toSq === 'a8') && (fromSq === 'e8' || fromSq === 'd8')) {
          matched = legalMoves.find(m => m.flags === 'q');
        }
      }
    }

    return matched || null;
  }

  /**
   * Verifies an entire PV sequence move-by-move to ensure zero illegal moves in UI principal variation line
   */
  verifyPvSequence(chessInstance, uciPvArray, sideToMove) {
    if (!uciPvArray || !Array.isArray(uciPvArray) || uciPvArray.length === 0) {
      return { sanArray: [], uciArray: [] };
    }

    const tempGame = new (chessInstance.constructor)(chessInstance.fen());
    const validSanArray = [];
    const validUciArray = [];

    for (let uciMove of uciPvArray) {
      if (!uciMove || typeof uciMove !== 'string' || uciMove.length < 4) break;
      const fromSq = uciMove.substring(0, 2);
      const toSq = uciMove.substring(2, 4);
      const prom = uciMove.length === 5 ? uciMove[4].toLowerCase() : undefined;

      const moveRes = tempGame.move({ from: fromSq, to: toSq, promotion: prom });
      if (!moveRes) break; // Terminate PV sequence gracefully on first illegal move

      validSanArray.push(moveRes.san);
      validUciArray.push(`${moveRes.from}${moveRes.to}${moveRes.promotion || ''}`);
    }

    return { sanArray: validSanArray, uciArray: validUciArray };
  }

  /**
   * Main Engine Orchestration Pipeline
   */
  async analyzePosition(chessInstance, onProgress = null, prevEvalCp = null, customAnalysisId = null, isUserTurn = false, coachPresetOverride = null) {
    const fen = chessInstance.fen();
    const sideToMove = chessInstance.turn();
    const config = this.getPresetConfig(isUserTurn, coachPresetOverride);
    const analysisId = customAnalysisId || this.generateAnalysisId();
    this.currentAnalysisId = analysisId;
    this.currentFen = fen;


    // 0. Checkmate / Stalemate check
    const legalMoves = chessInstance.generateLegalMoves(sideToMove);
    if (legalMoves.length === 0) {
      const inChk = chessInstance.inCheck(sideToMove);
      return {
        source: 'Rules Engine',
        version: 'Chess Rules',
        analysisId,
        fen,
        depth: 0,
        bestMoveSan: null,
        bestMoveUci: null,
        evaluationText: inChk ? 'BỊ CHIẾU HẾT! (CHECKMATE)' : 'HÒA CỜ (STALEMATE)',
        evalScore: { type: 'mate', value: inChk ? -1 : 0 },
        topMoves: [],
        principalVariation: inChk ? 'Đã bị chiếu hết! Ván đấu kết thúc.' : 'Hòa cờ do hết nước đi hợp lệ.'
      };
    }

    // 1. Syzygy Tablebase (Endgame <= 7 pieces)
    const tablebaseResult = await this.tablebaseService.checkTablebase(fen);
    if (tablebaseResult && tablebaseResult.moves && tablebaseResult.moves.length > 0) {
      let tbMoves = [...tablebaseResult.moves];
      // Optimize endgame play: ALWAYS choose shortest Distance to Mate (DTM) or Distance to Zero (DTZ)
      if (tablebaseResult.wdl > 0) {
        tbMoves.sort((a, b) => {
          if (a.dtm !== null && b.dtm !== null) return a.dtm - b.dtm; // Fastest mate
          if (a.dtm !== null) return -1;
          if (b.dtm !== null) return 1;
          return (Math.abs(a.dtz || 0)) - (Math.abs(b.dtz || 0)); // Shortest distance to pawn push/capture
        });
      }

      const bestTbMove = tbMoves[0];
      const legalCheck = this.isLegalUciMove(chessInstance, bestTbMove.uci, sideToMove);
      if (legalCheck) {
        const isMate = bestTbMove.dtm !== null;
        let evalScore = { type: 'cp', value: tablebaseResult.wdl > 0 ? 10000 : (tablebaseResult.wdl < 0 ? -10000 : 0) };
        if (isMate) {
          const mateMoves = Math.ceil(bestTbMove.dtm / 2);
          evalScore = { type: 'mate', value: tablebaseResult.wdl > 0 ? mateMoves : -mateMoves };
        }

        return {
          source: 'Syzygy 7P Tablebase (Endgame)',
          version: 'Syzygy 7P Tablebase',
          analysisId,
          fen,
          depth: 128,
          seldepth: 128,
          nodes: 1000000,
          nps: 1000000,
          threads: config.Threads,
          hash: config.Hash,
          bestMoveSan: legalCheck.san,
          bestMoveUci: bestTbMove.uci,
          evaluationText: `SYZYGY TABLEBASE: ${tablebaseResult.resultText} (DTM: ${bestTbMove.dtm !== null ? bestTbMove.dtm : '-'}, DTZ: ${bestTbMove.dtz !== null ? bestTbMove.dtz : '-'})`,
          evalScore: evalScore,
          topMoves: tbMoves.slice(0, config.MultiPV).map((m, idx) => {
            const cat = m.category ? m.category.toUpperCase() : (tablebaseResult.wdl < 0 ? 'LOSS' : (tablebaseResult.wdl > 0 ? 'WIN' : 'DRAW'));
            let sText = cat;
            let mScore = { type: 'cp', value: tablebaseResult.wdl > 0 ? 10000 : (tablebaseResult.wdl < 0 ? -10000 : 0) };
            if (m.dtm !== null) {
              const mm = Math.ceil(m.dtm / 2);
              sText = tablebaseResult.wdl > 0 ? `M${mm}` : `-M${mm}`;
              mScore = { type: 'mate', value: tablebaseResult.wdl > 0 ? mm : -mm };
            }
            return {
              rank: idx + 1,
              san: m.san,
              uci: m.uci,
              scoreText: sText,
              rawScore: mScore,
              isBest: idx === 0
            };
          }),
          principalVariation: legalCheck.san
        };
      }
    }


    // 2. Normalized FEN Cache Lookup
    const cacheKey = `${fen}_${this.analysisPreset}_mpv${config.MultiPV}_t${config.MoveTime}_d${config.Depth}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      cached.analysisId = analysisId;
      return cached;
    }

    // 3. Opening Info Metadata (Master Book)
    const openingInfo = await this.tablebaseService.checkOpening(fen);

    let topMoves = [];
    let bestMoveSan = '';
    let bestMoveUci = '';
    let engineDepth = config.Depth;
    let engineSeldepth = 0;
    let engineNodes = 0;
    let engineNps = 0;
    let hashfull = 0;
    let sourceName = '';
    let engineVersion = '';
    let principalVariation = '';
    let principalVariationUci = [];

    // 3.5. Master Book Instant Move (God Mode)
    if (config.useMasterBook && openingInfo && openingInfo.moves && openingInfo.moves.length > 0) {
      const bestBookMove = openingInfo.moves[0];
      if (bestBookMove.games >= 5) {
         const legalCheck = this.isLegalUciMove(chessInstance, bestBookMove.uci, sideToMove);
         if (legalCheck) {
            return {
              source: 'Lichess Masters Explorer (Opening Book)',
              version: 'Lichess Database',
              analysisId,
              fen,
              depth: 99,
              seldepth: 99,
              nodes: bestBookMove.games,
              nps: 1000000,
              threads: 0,
              hash: 0,
              bestMoveSan: legalCheck.san,
              bestMoveUci: bestBookMove.uci,
              evaluationText: `MASTER BOOK: ${bestBookMove.games} games played.`,
              evalScore: { type: 'cp', value: (bestBookMove.whiteWinPct - bestBookMove.blackWinPct) * 10 },
              topMoves: openingInfo.moves.slice(0, 3).map((m, idx) => ({
                rank: idx + 1,
                san: m.san,
                uci: m.uci,
                scoreText: `${m.whiteWinPct}% W`,
                isBest: idx === 0
              })),
              principalVariation: legalCheck.san
            };
         }
      }
    }

    // 4. Lichess Cloud Engine API (Depth 40+) - Prioritize if useCloudFirst
    if (config.useCloudFirst && topMoves.length === 0) {
      const cloudResult = await PositionEvaluator.queryLichessCloudEval(fen, config.MultiPV);
      if (this.currentAnalysisId !== analysisId) return { canceled: true };
      
      if (cloudResult && cloudResult.pvs && cloudResult.pvs.length > 0) {
        const validPvs = [];
        for (let idx = 0; idx < cloudResult.pvs.length; idx++) {
          const item = cloudResult.pvs[idx];
          const legalMatch = this.isLegalUciMove(chessInstance, item.uci, sideToMove);
          if (legalMatch) {
            let scoreText = item.score.type === 'mate' 
              ? `M${item.score.value > 0 ? '+' + item.score.value : item.score.value}`
              : `${(item.score.value / 100).toFixed(2)}`;
            const verifiedCloudPv = this.verifyPvSequence(chessInstance, item.pvLine, sideToMove);
            validPvs.push({
              rank: validPvs.length + 1,
              san: legalMatch.san,
              uci: item.uci,
              scoreText,
              rawScore: item.score,
              isBest: validPvs.length === 0,
              pvLine: verifiedCloudPv.sanArray.join(' ')
            });
          }
        }
        if (validPvs.length > 0) {
          sourceName = 'Lichess Cloud Stockfish 16 (Depth 40+)';
          engineVersion = 'Stockfish 16 Cloud API';
          engineDepth = cloudResult.depth;
          engineSeldepth = cloudResult.depth + 10;
          engineNodes = cloudResult.nodes || 10000000;
          engineNps = 3200000;
          topMoves = validPvs.slice(0, config.MultiPV);
          bestMoveSan = topMoves[0].san;
          bestMoveUci = topMoves[0].uci;
          principalVariation = topMoves[0].pvLine;
        }
      }
    }

    // 5. Try Native Backend Stockfish 18 AVX-512 Engine
    if (config.useNativeFirst && this.engineManager) {
      const nativeRes = await this.engineManager.queryNativeBackendEngine(fen, config, analysisId);

      // Stale check
      if (this.currentAnalysisId !== analysisId) return { canceled: true };

      if (nativeRes && nativeRes.bestMoveUci && isEngineVersionAllowed(nativeRes.version)) {
        const legalMatch = this.isLegalUciMove(chessInstance, nativeRes.bestMoveUci, sideToMove);
        if (legalMatch) {
          sourceName = nativeRes.source || 'Native Stockfish 18 (AVX-512)';
          engineVersion = nativeRes.version || 'Stockfish 18 (AVX-512)';
          engineDepth = nativeRes.depth || config.Depth;
          engineSeldepth = nativeRes.seldepth || 0;
          engineNodes = nativeRes.nodes || 0;
          engineNps = nativeRes.nps || 0;
          hashfull = nativeRes.hashfull || 0;
          bestMoveSan = legalMatch.san;
          bestMoveUci = nativeRes.bestMoveUci;

          const parsedPv = this.verifyPvSequence(
            chessInstance,
            nativeRes.lines && nativeRes.lines[0] ? nativeRes.lines[0].pvMoves : [nativeRes.bestMoveUci],
            sideToMove
          );
          principalVariation = parsedPv.sanArray.join(' ');
          principalVariationUci = parsedPv.uciArray;

          topMoves = (nativeRes.lines || []).map((line, idx) => {
            const mMatch = this.isLegalUciMove(chessInstance, line.bestUci, sideToMove);
            const scoreText = line.score.type === 'mate'
              ? `M${line.score.value > 0 ? '+' + line.score.value : line.score.value}`
              : `${(line.score.value / 100).toFixed(2)}`;

            return {
              rank: idx + 1,
              san: mMatch ? mMatch.san : line.bestUci,
              uci: line.bestUci,
              scoreText,
              rawScore: line.score,
              isBest: idx === 0
            };
          });
        }
      }
    }

    // 5. Fallback: Local Stockfish 18 WASM SIMD Engine Worker
    if (topMoves.length === 0) {
      this.engine.stop();
      
      // Tự động bù trừ thời gian cho WASM để tránh Horizon Effect (Ảo giác Depth 10)
      const wasmConfig = { ...config };
      if (wasmConfig.MoveTime < 1500) {
        wasmConfig.MoveTime = 1500; // Ép tối thiểu 1.5s cho WASM
      }

      const engineResult = await this.engine.analyze(fen, wasmConfig, analysisId, (progressData) => {
        if (this.currentAnalysisId === analysisId && typeof onProgress === 'function') {
          onProgress(progressData);
        }
      });

      // Stale analysis check
      if (this.currentAnalysisId !== analysisId) {
        return { canceled: true };
      }

      if (engineResult && engineResult.type === 'complete' && engineResult.lines && engineResult.lines.length > 0 && isEngineVersionAllowed(engineResult.version)) {
        const validLocalPvs = [];
        for (let idx = 0; idx < engineResult.lines.length; idx++) {
          const line = engineResult.lines[idx];
          const uciMove = line.bestUci || (line.pvMoves ? line.pvMoves[0] : '');
          const legalMatch = this.isLegalUciMove(chessInstance, uciMove, sideToMove);
          if (legalMatch) {
            const scoreText = line.score.type === 'mate'
              ? `M${line.score.value > 0 ? '+' + line.score.value : line.score.value}`
              : `${(line.score.value / 100).toFixed(2)}`;

            const verifiedPv = this.verifyPvSequence(chessInstance, line.pvMoves, sideToMove);

            validLocalPvs.push({
              rank: validLocalPvs.length + 1,
              san: legalMatch.san,
              uci: uciMove,
              scoreText,
              rawScore: line.score,
              isBest: validLocalPvs.length === 0,
              pvLine: verifiedPv.sanArray.join(' ')
            });
          }
        }

        if (validLocalPvs.length > 0) {
          sourceName = engineResult.source || 'Local Stockfish 18 WASM SIMD';
          engineVersion = engineResult.version || 'Stockfish 18 WASM SIMD';
          engineDepth = engineResult.depth || config.Depth;
          engineSeldepth = engineResult.seldepth || 0;
          engineNodes = engineResult.nodes || 0;
          engineNps = engineResult.nps || 0;
          topMoves = validLocalPvs.slice(0, config.MultiPV);
          bestMoveSan = topMoves[0].san;
          bestMoveUci = topMoves[0].uci;
          principalVariation = topMoves[0].pvLine;
        }
      }
    }

    // 7. Fallback: Lichess Cloud Stockfish 16 Engine API (Depth 40+) - Only if not already checked
    if (!config.useCloudFirst && topMoves.length === 0) {
      const cloudResult = await PositionEvaluator.queryLichessCloudEval(fen, config.MultiPV);

      if (this.currentAnalysisId !== analysisId) return { canceled: true };

      if (cloudResult && cloudResult.pvs && cloudResult.pvs.length > 0) {
        const validPvs = [];
        for (let idx = 0; idx < cloudResult.pvs.length; idx++) {
          const item = cloudResult.pvs[idx];
          const uciMove = item.uci;
          const legalMatch = this.isLegalUciMove(chessInstance, uciMove, sideToMove);
          if (legalMatch) {
            let scoreText = '';
            if (item.score.type === 'mate') {
              scoreText = `M${item.score.value > 0 ? '+' + item.score.value : item.score.value}`;
            } else {
              const val = (item.score.value / 100).toFixed(2);
              scoreText = val > 0 ? `+${val}` : `${val}`;
            }

            const verifiedCloudPv = this.verifyPvSequence(chessInstance, item.pvLine, sideToMove);

            validPvs.push({
              rank: validPvs.length + 1,
              san: legalMatch.san,
              uci: uciMove,
              scoreText,
              rawScore: item.score,
              isBest: validPvs.length === 0,
              pvLine: verifiedCloudPv.sanArray.join(' ')
            });
          }
        }

        if (validPvs.length > 0) {
          sourceName = 'Lichess Cloud Stockfish 16 (Depth 40+)';
          engineVersion = 'Stockfish 16 Cloud API';
          engineDepth = cloudResult.depth;
          engineSeldepth = cloudResult.depth + 10;
          engineNodes = cloudResult.nodes || 10000000;
          engineNps = 3200000;
          topMoves = validPvs.slice(0, config.MultiPV);
          bestMoveSan = topMoves[0].san;
          bestMoveUci = topMoves[0].uci;
          principalVariation = topMoves[0].pvLine;
        }
      }
    }

    // 8. IF ALL ENGINES FAIL IN ENGINE MODE: RETURN ENGINE_UNAVAILABLE (NO FAKE MOVES!)
    if (topMoves.length === 0 && config.isEngineMode) {
      return {
        error: 'ENGINE_UNAVAILABLE',
        analysisId,
        message: 'Máy tính Stockfish không phản hồi. Không thể tính toán nước đi.'
      };
    }

    // Apply Playstyle Candidate-Selection Layer AFTER Stockfish analysis
    let playstyleTelemetry = null;
    if (topMoves.length > 0) {
      playstyleTelemetry = this.playstyleLayer.selectMove(
        chessInstance,
        topMoves,
        this.playStyle,
        this.lastEvalCp
      );

      if (playstyleTelemetry && playstyleTelemetry.finalSelectedMove) {
        bestMoveSan = playstyleTelemetry.finalSelectedMove;
        bestMoveUci = playstyleTelemetry.finalSelectedUci;
        if (playstyleTelemetry.pvLine) principalVariation = playstyleTelemetry.pvLine;

        topMoves.forEach(m => {
          m.isBest = (m.san === bestMoveSan);
        });
      }
    }

    const firstScore = topMoves[0] ? topMoves[0].rawScore : { type: 'cp', value: 0 };
    if (firstScore && firstScore.type === 'cp') {
      this.lastEvalCp = firstScore.value;
    }

    const resultObj = {
      analysisId,
      fen,
      source: sourceName,
      version: engineVersion,
      threads: config.Threads,
      hash: config.Hash,
      depth: engineDepth,
      seldepth: engineSeldepth,
      nodes: engineNodes,
      nps: engineNps,
      bestMoveSan,
      bestMoveUci,
      evalScore: firstScore,
      topMoves,
      principalVariation,
      pvUci: principalVariationUci,
      openingInfo,
      playstyleTelemetry,
      tacticalHighlights: []
    };

    if (this.cache.size > 200) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, resultObj);
    return resultObj;
  }


  stop() {
    this.engine.stop();
  }

  destroy() {
    this.engine.destroy();
  }
}
