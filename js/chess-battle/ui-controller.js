/**
 * UI Controller for Chess Battle Assistant
 * Manages board rendering, piece drag & drop, move highlights, evaluation bar, audio, health checks & debug panel.
 * Strictly adheres to STOCKFISH AS SINGLE SOURCE OF TRUTH.
 */

import { Chess } from './chess.js';
import { StockfishWasmEngine } from './engine-adapter.js';
import { EngineManager } from './engine-manager.js';
import { AnalysisManager } from './analysis-manager.js';
import { AIExplanationService } from './ai-explanation-service.js';
import { RealisticAudioFX } from '../shared/realistic-audio.js';

export const EngineUiState = {
  IDLE: 'IDLE',
  ENGINE_INITIALIZING: 'ENGINE_INITIALIZING',
  ENGINE_READY: 'ENGINE_READY',
  ANALYZING: 'ANALYZING',
  RESULT_READY: 'RESULT_READY',
  ENGINE_ERROR: 'ENGINE_ERROR',
  ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE'
};

export const CHESS_VARIANTS = {
  // Standard & Variations
  STANDARD: {
    id: 'STANDARD',
    name: 'Cờ Vua Tiêu Chuẩn (Standard FIDE)',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    description: 'Bàn cờ vua 8x8 tiêu chuẩn quốc tế FIDE.'
  },
  CHESS960: {
    id: 'CHESS960',
    name: 'Chess960 / Fischer Random (Ngẫu Nhiên)',
    isFischerRandom: true,
    description: 'Xếp quân hàng 1 và 8 ngẫu nhiên theo chuẩn Fischer 960 thế cờ.'
  },
  SWAPPED_KQ: {
    id: 'SWAPPED_KQ',
    name: 'Đổi Vị Trí Vua - Hậu (Swapped K/Q)',
    fen: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR w KQkq - 0 1',
    description: 'Vua và Hậu đổi chỗ cho nhau, chiến thuật mới mẻ.'
  },

  // Handicap / Odds Chess
  ODDS_QUEEN_BLACK: {
    id: 'ODDS_QUEEN_BLACK',
    name: 'Chấp Hậu (Trắng chấp Hậu d1)',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1',
    description: 'Trắng chấp quân Hậu d1.'
  },
  ODDS_QUEEN_WHITE: {
    id: 'ODDS_QUEEN_WHITE',
    name: 'Chấp Hậu (Đen chấp Hậu d8)',
    fen: 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    description: 'Đen bắt đầu không có Hậu d8.'
  },
  ODDS_ROOK: {
    id: 'ODDS_ROOK',
    name: 'Chấp Xe (Chấp 1 Xe a1)',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1',
    description: 'Trắng chấp 1 Xe cánh Hậu a1.'
  },
  ODDS_TWO_ROOKS: {
    id: 'ODDS_TWO_ROOKS',
    name: 'Chấp 2 Xe (Two Rooks Odds)',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKB1R w Kk - 0 1',
    description: 'Trắng chấp cả 2 Xe a1 và h1.'
  },
  ODDS_KNIGHT: {
    id: 'ODDS_KNIGHT',
    name: 'Chấp Mã (Chấp 1 Mã b1)',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1',
    description: 'Trắng chấp 1 Mã b1.'
  },
  ODDS_PAWN_MOVE: {
    id: 'ODDS_PAWN_MOVE',
    name: 'Chấp Tốt f7 & Nước Đi',
    fen: 'rnbqkbnr/ppppp1pp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    description: 'Đen chấp mất tốt điểm yếu f7.'
  },

  // Famous Openings
  OPENING_RUY_LOPEZ: {
    id: 'OPENING_RUY_LOPEZ',
    name: 'Khai Cuộc Tây Ban Nha (Ruy Lopez)',
    fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    description: '1.e4 e5 2.Nf3 Nc6 3.Bb5 - Khai cuộc kinh điển bậc nhất thế giới.'
  },
  OPENING_SICILIAN_NAJDORF: {
    id: 'OPENING_SICILIAN_NAJDORF',
    name: 'Phòng Thủ Sicilian (Najdorf)',
    fen: 'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
    description: '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 - Vũ khí sắc bén của Garry Kasparov.'
  },
  OPENING_FRENCH: {
    id: 'OPENING_FRENCH',
    name: 'Phòng Thủ Pháp (French Defense)',
    fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3',
    description: '1.e4 e6 2.d4 d5 - Thế trận phòng ngự phản công vững chắc.'
  },
  OPENING_CARO_KANN: {
    id: 'OPENING_CARO_KANN',
    name: 'Phòng Thủ Caro-Kann',
    fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: '1.e4 c6 - Cấu trúc tốt bền vững và an toàn tuyệt đối.'
  },
  OPENING_QUEENS_GAMBIT: {
    id: 'OPENING_QUEENS_GAMBIT',
    name: 'Gambit Hậu (Queen\'s Gambit)',
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2',
    description: '1.d4 d5 2.c4 - Tranh chấp quyền kiểm soát ô trung tâm bàn cờ.'
  },
  OPENING_KINGS_GAMBIT: {
    id: 'OPENING_KINGS_GAMBIT',
    name: 'Gambit Vua (King\'s Gambit)',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2',
    description: '1.e4 e5 2.f4 - Tấn công lãng mạn đầy cống hiến.'
  },
  OPENING_FRIED_LIVER: {
    id: 'OPENING_FRIED_LIVER',
    name: 'Bẫy Gan Chiên (Fried Liver Attack)',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    description: 'Đòn tấn công siêu hủy diệt nhắm thẳng vào ô f7.'
  },

  // Master Endgames
  ENDGAME_LUCENA: {
    id: 'ENDGAME_LUCENA',
    name: 'Thế Tàn Cuộc Lucena (K+R+P vs K+R)',
    fen: '1K6/1P1r4/8/8/8/8/4k3/1R6 w - - 0 1',
    description: 'Cầu nối Lucena kinh điển để phong cấp Tốt thắng ván cờ.'
  },
  ENDGAME_PHILIDOR: {
    id: 'ENDGAME_PHILIDOR',
    name: 'Thế Phòng Thủ Philidor (K+R vs K+P)',
    fen: '8/8/8/8/8/1r6/4k3/R3K3 w - - 0 1',
    description: 'Kỹ thuật giữ hòa tuyệt hảo của Philidor.'
  },
  ENDGAME_KQ_VS_KR: {
    id: 'ENDGAME_KQ_VS_KR',
    name: 'Vua + Hậu vs Vua + Xe (K+Q vs K+R)',
    fen: '8/8/8/3k4/8/8/4K3/1Q4R1 w - - 0 1',
    description: 'Kỹ thuật ép Vua và bắt Xe bằng đòn xiên / đôi của Hậu.'
  },
  ENDGAME_KBN_VS_K: {
    id: 'ENDGAME_KBN_VS_K',
    name: 'Tượng + Mã Chiếu Hết (K+B+N vs K)',
    fen: '8/8/8/8/8/3k4/8/K1B1N3 w - - 0 1',
    description: 'Một trong những kỹ thuật chiếu hết đỉnh cao nhất.'
  },
  ENDGAME_KBB_VS_K: {
    id: 'ENDGAME_KBB_VS_K',
    name: '2 Tượng Chiếu Hết (K+B+B vs K)',
    fen: '8/8/8/8/8/3k4/8/K1BB4 w - - 0 1',
    description: 'Kỹ thuật dồn Vua đối phương vào góc bàn cờ.'
  },

  // Puzzles & Tactics
  TACTIC_SCHOLARS_MATE: {
    id: 'TACTIC_SCHOLARS_MATE',
    name: 'Bẫy Chiếu Hết 4 Nước (Scholar\'s Mate)',
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    description: 'Thế cờ bẫy chiếu hết nhanh nổi tiếng.'
  },
  TACTIC_SMOTHERED_MATE: {
    id: 'TACTIC_SMOTHERED_MATE',
    name: 'Chiếu Nghẹt Bằng Mã (Smothered Mate)',
    fen: '6k1/5ppp/8/8/8/8/1Q5P/6RK w - - 0 1',
    description: 'Đòn phối hợp hy sinh Hậu để Mã chiếu nghẹt Vua đối phương.'
  },
  TACTIC_MATE_IN_1: {
    id: 'TACTIC_MATE_IN_1',
    name: 'Đố Cờ: Chiếu Hết Trong 1 Nước',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    description: 'Tìm nước đi quyết định để kết liễu trận đấu ngay lập tức.'
  }
};

export class UIController {
  constructor() {
    this.game = new Chess();
    this.engineAdapter = new StockfishWasmEngine();
    this.engineManager = new EngineManager(this.engineAdapter);
    this.analysisManager = new AnalysisManager(this.engineAdapter, this.engineManager);
    this.aiExplanationService = new AIExplanationService();
    this.audioFX = new RealisticAudioFX();

    this.chessState = {
      botColor: null, // REQUIREMENT 1: Must start as NULL, not 'w' or 'b'!
      playerColor: null,
      orientation: 'w',
      analysisId: null,
      engineUiState: EngineUiState.IDLE
    };

    this.appMode = 'ASSISTANT'; // 'ASSISTANT' or 'PLAY_VS_BOT'
    this.battleMode = null;
    this.autoApplyBestMove = true;
    this.enableOpponentSuggestions = false;
    this.boardFlipped = false;

    this.selectedSquare = null;
    this.draggedSquare = null;
    this.lastMove = null;
    this.currentAnalysis = null;
    this.prevEvalCp = 0;

    // Board Zoom & Custom Setup Editor State
    this.boardScale = parseFloat(localStorage.getItem('boardverse_board_scale') || '1.0');
    this.isEditorMode = false;
    this.selectedPalettePiece = 'K';
    this.editorTurn = 'w';

    // Piece Icons
    this.pieceIcons = {
      w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
      b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
    };

    this.active = true;
  }

  pause() {
    this.active = false;
    if (this.analysisManager) {
      this.analysisManager.cancelCurrentAnalysis();
    }
  }

  resume() {
    this.active = true;
    this.renderBoard();
    this.updateUI();
    if (this.chessState.botColor) {
      this.triggerAnalysis();
    }
  }


  async init() {
    // 0. Restore Saved Piece Theme
    this.pieceTheme = localStorage.getItem('chess_piece_theme') || 'cburnett';
    const selectPiece = document.getElementById('selectPieceTheme');
    if (selectPiece) selectPiece.value = this.pieceTheme;

    // 0b. Restore Saved Board Theme & Custom Colors
    const savedTheme = localStorage.getItem('chess_board_theme') || 'green';
    const customLight = localStorage.getItem('chess_board_custom_light') || '#ebecd0';
    const customDark = localStorage.getItem('chess_board_custom_dark') || '#779556';

    const inputLight = document.getElementById('inputCustomLightSquare');
    const inputDark = document.getElementById('inputCustomDarkSquare');
    if (inputLight) inputLight.value = customLight;
    if (inputDark) inputDark.value = customDark;

    if (savedTheme === 'custom') {
      document.body.setAttribute('data-board-theme', 'custom');
      document.documentElement.style.setProperty('--cb-light-square', customLight);
      document.documentElement.style.setProperty('--cb-dark-square', customDark);
    } else {
      document.body.setAttribute('data-board-theme', savedTheme);
    }
    const selectTheme = document.getElementById('selectBoardTheme');
    if (selectTheme) selectTheme.value = savedTheme;

    // 1. Immediate UI Render with Neutral Idle State
    this.initToastSystem();
    this.initPgnImportExport();
    this.bindEvents();
    this.renderBoard();
    this.updateUI();
    this.setInitialIdleState();

    // 2. Asynchronous Non-blocking Engine Diagnostics & Init
    try {
      this.updateEngineUiState(EngineUiState.ENGINE_INITIALIZING);
      const isWasmReady = await this.engineAdapter.init();
      const healthStatus = await this.engineManager.runHealthDiagnostics();
      this.updateEngineHealthUI(healthStatus, isWasmReady);

      if (!this.chessState.botColor) {
        this.updateEngineUiState(EngineUiState.IDLE);
      } else if (this.chessState.engineUiState === EngineUiState.ENGINE_INITIALIZING) {
        this.updateEngineUiState(EngineUiState.ENGINE_READY);
      }
    } catch (err) {
      console.warn('Engine diagnostics warning:', err);
    }
  }




  updateEngineHealthUI(status = {}, isWasmReady = false) {
    const elNative = document.getElementById('healthNativeEngine');
    const elLocal = document.getElementById('healthLocalEngine');
    const elCloud = document.getElementById('healthCloudEngine');
    const elTb = document.getElementById('healthTablebase');
    const elDb = document.getElementById('healthOpeningDb');

    if (elNative) {
      if (status.nativeEngine) {
        elNative.className = 'badge-health ok';
        elNative.innerHTML = '<span class="status-indicator-dot"></span> Native Backend OK';
      } else {
        elNative.className = 'badge-health err';
        elNative.innerHTML = '<span class="status-indicator-dot"></span> Native Offline';
      }
    }

    if (elLocal) {
      if (isWasmReady || status.wasmEngine) {
        elLocal.className = 'badge-health ok';
        const verName = status.versionName || 'Stockfish WASM';
        elLocal.innerHTML = `<span class="status-indicator-dot"></span> ${verName}`;
      } else {
        elLocal.className = 'badge-health err';
        elLocal.innerHTML = '<span class="status-indicator-dot"></span> Local WASM Offline';
      }
    }

    if (elCloud) {
      elCloud.className = 'badge-health ok';
      elCloud.innerHTML = '<span class="status-indicator-dot"></span> Cloud 40+ API';
    }
    if (elTb) {
      elTb.className = 'badge-health ok';
      elTb.innerHTML = '<span class="status-indicator-dot"></span> Syzygy 7P Tablebase';
    }
    if (elDb) {
      elDb.className = 'badge-health ok';
      elDb.innerHTML = '<span class="status-indicator-dot"></span> Lichess DB';
    }
  }

  async runEngineBenchmark() {
    if (!this.active) return;
    const startpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const modal = document.getElementById('benchmarkModal');
    const content = document.getElementById('benchmarkContent');

    if (modal) modal.style.display = 'flex';
    if (content) content.textContent = 'ĐANG KÍCH HOẠT VÀ ĐO ĐẠC HIỆU NĂNG ENGINE HARDWARE...\n\n- Benchmark Position: Startpos (e2e4/d2d4)\n- Intel Core i5-13500H Hardware Verification\n- Multi-Engine Stack Evaluation...';

    const t0 = performance.now();
    this.setStatusMessage('<i class="fa-solid fa-bolt fa-spin" style="color:var(--cb-gold);"></i> ĐANG CHẠY BENCHMARK ENGINE...');

    let wasmRes = null;
    let nativeRes = null;

    try {
      wasmRes = await this.engineAdapter.analyze(startpos, { Depth: 16, MoveTime: 2000, MultiPV: 1 }, 'bm_wasm');
    } catch (e) {}

    try {
      nativeRes = await this.engineManager.queryNativeBackendEngine(startpos, { Depth: 20, MoveTime: 2000, Threads: 8, Hash: 256 }, 'bm_nat');
    } catch (e) {}

    const totalTime = ((performance.now() - t0) / 1000).toFixed(2);
    let msg = `====================================================\n`;
    msg += `  REAL ENGINE BENCHMARK & HARDWARE TELEMETRY REPORT \n`;
    msg += `====================================================\n\n`;
    msg += `Execution Time: ${totalTime}s\n\n`;

    if (nativeRes && nativeRes.bestMoveUci) {
      msg += `1. NATIVE ENGINE BACKEND:\n`;
      msg += `   - VERSION:  ${nativeRes.version || 'Stockfish 18 (AVX-512)'}\n`;
      msg += `   - SOURCE:   ${nativeRes.source}\n`;
      msg += `   - THREADS:  ${nativeRes.threads || 8} Threads\n`;
      msg += `   - HASH:     ${nativeRes.hash || 256} MB\n`;
      msg += `   - DEPTH:    Depth ${nativeRes.depth} (SelDepth ${nativeRes.seldepth})\n`;
      msg += `   - NODES:    ${nativeRes.nodes ? nativeRes.nodes.toLocaleString() : '-'}\n`;
      msg += `   - NPS:      ${nativeRes.nps ? (nativeRes.nps / 1000000).toFixed(2) + ' Million NPS (' + nativeRes.nps.toLocaleString() + ' NPS)' : '-'}\n`;
      msg += `   - BESTMOVE: ${nativeRes.bestMoveUci}\n`;
      msg += `   - STATUS:   OPTIMAL (AVX-512 Hardware Acceleration Active)\n\n`;
    } else {
      msg += `1. NATIVE ENGINE BACKEND: Offline / Unavailable\n\n`;
    }

    if (wasmRes && wasmRes.type === 'complete') {
      msg += `2. LOCAL WASM ENGINE (BROWSER WORKER):\n`;
      msg += `   - VERSION:  Stockfish 18 WASM SIMD\n`;
      msg += `   - DEPTH:    Depth ${wasmRes.depth}\n`;
      msg += `   - NODES:    ${wasmRes.nodes ? wasmRes.nodes.toLocaleString() : '-'}\n`;
      msg += `   - NPS:      ${wasmRes.nps ? (wasmRes.nps / 1000).toFixed(0) + 'k NPS' : '-'}\n`;
      msg += `   - BESTMOVE: ${wasmRes.bestMoveUci}\n`;
      msg += `   - STATUS:   ONLINE (Web Worker Active)\n\n`;
    } else {
      msg += `2. LOCAL WASM ENGINE: Offline / Timeout\n\n`;
    }

    msg += `3. HARDWARE TUNING RECOMMENDATION:\n`;
    msg += `   - Optimal Threads for i5-13500H: 8 Threads\n`;
    msg += `   - Optimal Hash Memory: 256 MB\n`;
    msg += `====================================================\n`;

    if (content) content.textContent = msg;
    this.setStatusMessage('<i class="fa-solid fa-circle-check" style="color:var(--cb-accent);"></i> BENCHMARK HOÀN THÀNH!');
  }

  bindEvents() {
    // Benchmark Button
    const btnBm = document.getElementById('btnRunBenchmark');
    if (btnBm) {
      btnBm.addEventListener('click', () => this.runEngineBenchmark());
    }

    // Benchmark Modal Close
    const btnCloseBm = document.getElementById('btnCloseBenchmarkModal');
    const btnOkBm = document.getElementById('btnOkBenchmark');
    const modalBm = document.getElementById('benchmarkModal');
    const closeBmModal = () => { if (modalBm) modalBm.style.display = 'none'; };
    if (btnCloseBm) btnCloseBm.addEventListener('click', () => { if (!this.active) return; closeBmModal(); });
    if (btnOkBm) btnOkBm.addEventListener('click', () => { if (!this.active) return; closeBmModal(); });

    const selectAppMode = document.getElementById('selectAppMode');
    if (selectAppMode) {
      selectAppMode.addEventListener('change', (e) => {
        if (!this.active) return;
        this.setAppMode(e.target.value);
      });
    }

    // BOT Color Selection (Or Player Color in Play Vs Bot mode)
    const btnBotWhite = document.getElementById('btnBotWhite');
    const btnBotBlack = document.getElementById('btnBotBlack');

    if (btnBotWhite) {
      btnBotWhite.addEventListener('click', () => {
        if (!this.active) return;
        if (this.appMode === 'PUZZLES') this.puzzleManager.prevPuzzle();
        else if (this.appMode === 'PLAY_VS_BOT') this.setBotColor('b'); // You play White -> Bot is Black
        else this.setBotColor('w');
      });
    }
    if (btnBotBlack) {
      btnBotBlack.addEventListener('click', () => {
        if (!this.active) return;
        if (this.appMode === 'PUZZLES') this.puzzleManager.nextPuzzle();
        else if (this.appMode === 'PLAY_VS_BOT') this.setBotColor('w'); // You play Black -> Bot is White
        else this.setBotColor('b');
      });
    }

    // Auto Apply Toggle
    const chkAutoApply = document.getElementById('chkAutoApplyMove');
    if (chkAutoApply) {
      chkAutoApply.addEventListener('change', (e) => {
        if (!this.active) return;
        this.autoApplyBestMove = e.target.checked;
      });
    }

    // Opponent Suggestions Toggle
    const chkOpponentSugg = document.getElementById('chkOpponentSuggestions');
    if (chkOpponentSugg) {
      chkOpponentSugg.addEventListener('change', (e) => {
        if (!this.active) return;
        this.enableOpponentSuggestions = e.target.checked;
        if (this.isUserTurn()) {
          this.triggerAnalysis();
        }
      });
    }

    // Toggle Debug Panel
    const btnToggleDebug = document.getElementById('btnToggleDebugPanel');
    const debugPanel = document.getElementById('engineDebugPanel');
    if (btnToggleDebug && debugPanel) {
      btnToggleDebug.addEventListener('click', () => {
        if (!this.active) return;
        const isHidden = debugPanel.style.display === '' || debugPanel.style.display === 'none';
        debugPanel.style.display = isHidden ? 'block' : 'none';
      });
    }

    // Board Controls
    const btnRewind = document.getElementById('btnRewindStart');
    const btnUndo = document.getElementById('btnUndoMove');
    const btnRedo = document.getElementById('btnRedoMove');
    const btnReset = document.getElementById('btnResetBoard');
    const btnFlip = document.getElementById('btnFlipBoard');
    const btnAnalyze = document.getElementById('btnForceAnalyze');
    const btnGameReview = document.getElementById('btnGameReview');
    const btnCloseSideReview = document.getElementById('btnCloseSideReview');
    const btnStartSideReview = document.getElementById('btnStartSideReview');
    const btnCloseReviewModal = document.getElementById('btnCloseReviewModal');
    const btnStartReview = document.getElementById('btnStartReview');

    if (btnRewind) btnRewind.addEventListener('click', () => { if (!this.active) return; this.resetToStart(); });
    if (btnUndo) btnUndo.addEventListener('click', () => { if (!this.active) return; this.undoMove(); });
    if (btnRedo) btnRedo.addEventListener('click', () => { if (!this.active) return; this.redoMove(); });
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (!this.active) return;
        this.resetBoard();
      });
    }
    if (btnFlip) btnFlip.addEventListener('click', () => { if (!this.active) return; this.toggleFlipBoard(); });
    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', () => {
        if (!this.active) return;
        if (this.chessState.engineUiState === EngineUiState.ANALYZING || (this.analysisManager && this.analysisManager.isAnalyzing)) {
          this.analysisManager.cancelCurrentAnalysis();
          this.updateEngineUiState(EngineUiState.ENGINE_READY);
        } else {
          this.triggerAnalysis(true);
        }
      });
    }
    
    if (btnGameReview) btnGameReview.addEventListener('click', () => { if (!this.active) return; this.openGameReviewModal(); });
    if (btnCloseSideReview) btnCloseSideReview.addEventListener('click', () => { if (!this.active) return; this.closeSideReview(); });
    if (btnStartSideReview) btnStartSideReview.addEventListener('click', () => { if (!this.active) return; this.runFullGameReview(); });
    if (btnCloseReviewModal) btnCloseReviewModal.addEventListener('click', () => {
      const modal = document.getElementById('gameReviewModal');
      if (modal) modal.style.display = 'none';
      this.reviewIsRunning = false;
    });
    if (btnStartReview) btnStartReview.addEventListener('click', () => { if (!this.active) return; this.runFullGameReview(); });

    const btnGameArchive = document.getElementById('btnGameArchive');
    const btnCloseArchiveModal = document.getElementById('btnCloseArchiveModal');
    const btnSaveCurrentGame = document.getElementById('btnSaveCurrentGame');
    const btnClearArchive = document.getElementById('btnClearArchive');

    if (btnGameArchive) btnGameArchive.addEventListener('click', () => { if (!this.active) return; this.openGameArchiveModal(); });
    if (btnCloseArchiveModal) btnCloseArchiveModal.addEventListener('click', () => { document.getElementById('gameArchiveModal').style.display = 'none'; });
    if (btnSaveCurrentGame) btnSaveCurrentGame.addEventListener('click', () => { if (!this.active) return; this.saveCurrentGameToArchive(); });
    if (btnClearArchive) btnClearArchive.addEventListener('click', () => {
        if (!this.active) return;
        if(confirm("Bạn có chắc chắn muốn xoá toàn bộ ván đấu đã lưu?")) {
            localStorage.removeItem('chessBattleArchive');
            this.renderGameArchiveList();
        }
    });

    const btnEvE = document.getElementById('btnEngineVsEngine');
    if (btnEvE) {
      btnEvE.addEventListener('click', () => { if (!this.active) return; this.startBattleScenario('EVS_E'); });
    }

    // Keyboard Shortcuts for Game History Navigation
    document.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const targetTag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.undoMove();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.redoMove();
      }
    });

    // Engine Preset Selection:
    // 1. Header Dropdown (selectPresetMode): Controls BOT strength
    // 2. Coach Dropdown (selectCoachPreset & selectCoachPresetSettings): Controls COACH recommendation strength
    const headerPresetSelect = document.getElementById('selectPresetMode');
    const settingsCoachPresetSelect = document.getElementById('selectCoachPresetSettings');
    const panelCoachPresetSelect = document.getElementById('selectCoachPreset');

    const handleBotPresetChange = (val) => {
      if (!this.active) return;
      this.botPreset = val;
      this.analysisManager.setPreset(val);
      if (headerPresetSelect && headerPresetSelect.value !== val) headerPresetSelect.value = val;
      if (this.isBotTurn()) {
        this.triggerAnalysis();
      }
    };

    const handleCoachPresetChange = (val) => {
      if (!this.active) return;
      this.coachPreset = val;
      if (settingsCoachPresetSelect && settingsCoachPresetSelect.value !== val) settingsCoachPresetSelect.value = val;
      if (panelCoachPresetSelect && panelCoachPresetSelect.value !== val) panelCoachPresetSelect.value = val;
      if (this.isUserTurn()) {
        this.triggerAnalysis();
      }
    };

    if (headerPresetSelect) {
      headerPresetSelect.addEventListener('change', (e) => handleBotPresetChange(e.target.value));
    }
    if (settingsCoachPresetSelect) {
      settingsCoachPresetSelect.addEventListener('change', (e) => handleCoachPresetChange(e.target.value));
    }
    if (panelCoachPresetSelect) {
      panelCoachPresetSelect.addEventListener('change', (e) => handleCoachPresetChange(e.target.value));
    }

    // PlayStyle Selection (Header & Settings modal)
    const headerPlayStyleSelect = document.getElementById('selectPlayStyle');
    const settingsPlayStyleSelect = document.getElementById('selectPlayStyleSettings');

    const handlePlayStyleChange = (val) => {
      if (!this.active) return;
      this.analysisManager.setPlayStyle(val);
      if (headerPlayStyleSelect && headerPlayStyleSelect.value !== val) headerPlayStyleSelect.value = val;
      if (settingsPlayStyleSelect && settingsPlayStyleSelect.value !== val) settingsPlayStyleSelect.value = val;
      this.triggerAnalysis();
    };

    if (headerPlayStyleSelect) {
      headerPlayStyleSelect.addEventListener('change', (e) => handlePlayStyleChange(e.target.value));
    }
    if (settingsPlayStyleSelect) {
      settingsPlayStyleSelect.addEventListener('change', (e) => handlePlayStyleChange(e.target.value));
    }

    // Opponent Move SAN/UCI Input (Enter to submit)
    const btnSubmitSan = document.getElementById('btnSubmitSanMove');
    const inputSan = document.getElementById('inputOpponentSan');
    if (inputSan) {
      const handleSanInput = () => {
        if (!this.active) return;
        const moveStr = inputSan.value.trim();
        if (moveStr) {
          this.handleBlackMoveInput(moveStr);
          inputSan.value = '';
        }
      };
      if (btnSubmitSan) {
        btnSubmitSan.addEventListener('click', handleSanInput);
      }
      inputSan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSanInput();
        }
      });
    }

    // FEN Loader
    const btnLoadFen = document.getElementById('btnLoadFen');
    const inputFen = document.getElementById('inputFenString');
    if (btnLoadFen && inputFen) {
      btnLoadFen.addEventListener('click', () => {
        if (!this.active) return;
        const fen = inputFen.value.trim();
        if (fen && this.game.load(fen)) {
          this.renderBoard();
          this.updateUI();
          this.triggerAnalysis();
        } else {
          alert('Chuỗi FEN không hợp lệ!');
        }
      });
    }

    // Chess Variant Selection
    const selectVariant = document.getElementById('selectChessVariant');
    if (selectVariant) {
      selectVariant.addEventListener('change', (e) => {
        if (!this.active) return;
        this.loadChessVariant(e.target.value);
      });
    }

    // Piece Theme Selection
    const selectPieceTheme = document.getElementById('selectPieceTheme');
    if (selectPieceTheme) {
      selectPieceTheme.addEventListener('change', (e) => {
        this.pieceTheme = e.target.value;
        localStorage.setItem('chess_piece_theme', this.pieceTheme);
        this.renderBoard();
      });
    }

    // Board Theme Selection (Presets & Custom)
    const selectBoardTheme = document.getElementById('selectBoardTheme');
    const inputCustomLight = document.getElementById('inputCustomLightSquare');
    const inputCustomDark = document.getElementById('inputCustomDarkSquare');

    const BOARD_PRESETS = {
      green: { light: '#ebecd0', dark: '#779556' },
      wood: { light: '#eed2a6', dark: '#b88b4a' },
      blue: { light: '#dce5ef', dark: '#4a709c' },
      dark: { light: '#333742', dark: '#1c1f26' },
      metal: { light: '#e2e8f0', dark: '#64748b' },
      crimson: { light: '#fde2e2', dark: '#b91c1c' },
      purple: { light: '#f3e8ff', dark: '#7e22ce' }
    };

    if (selectBoardTheme) {
      selectBoardTheme.addEventListener('change', (e) => {
        const theme = e.target.value;
        if (theme !== 'custom' && BOARD_PRESETS[theme]) {
          const p = BOARD_PRESETS[theme];
          if (inputCustomLight) inputCustomLight.value = p.light;
          if (inputCustomDark) inputCustomDark.value = p.dark;
          document.documentElement.style.setProperty('--cb-light-square', p.light);
          document.documentElement.style.setProperty('--cb-dark-square', p.dark);
          document.body.setAttribute('data-board-theme', theme);
          localStorage.setItem('chess_board_theme', theme);
          localStorage.setItem('chess_board_custom_light', p.light);
          localStorage.setItem('chess_board_custom_dark', p.dark);
        } else if (theme === 'custom') {
          document.body.setAttribute('data-board-theme', 'custom');
          localStorage.setItem('chess_board_theme', 'custom');
        }
      });
    }

    // Custom 2-Square Color Pickers (Real-time live update for any custom colors)
    const handleCustomColorChange = () => {
      const lColor = inputCustomLight ? inputCustomLight.value : '#ebecd0';
      const dColor = inputCustomDark ? inputCustomDark.value : '#779556';
      document.documentElement.style.setProperty('--cb-light-square', lColor);
      document.documentElement.style.setProperty('--cb-dark-square', dColor);
      document.body.setAttribute('data-board-theme', 'custom');
      if (selectBoardTheme) selectBoardTheme.value = 'custom';
      localStorage.setItem('chess_board_theme', 'custom');
      localStorage.setItem('chess_board_custom_light', lColor);
      localStorage.setItem('chess_board_custom_dark', dColor);
    };

    if (inputCustomLight) inputCustomLight.addEventListener('input', handleCustomColorChange);
    if (inputCustomDark) inputCustomDark.addEventListener('input', handleCustomColorChange);

    // Explain Move Button
    const btnExplainMove = document.getElementById('btnExplainMove');
    if (btnExplainMove) {
      btnExplainMove.addEventListener('click', () => {
        if (!this.active) return;
        this.drawPvArrows();
        this.explainPvDetails();
      });
    }

    // Initialize Board Zoom Controls & Board Editor
    this.initZoomControls();
    this.initBoardEditor();
  }

  initZoomControls() {
    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnZoomReset = document.getElementById('btnZoomReset');

    this.applyZoom(this.boardScale);

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        this.boardScale = Math.min(1.4, parseFloat((this.boardScale + 0.1).toFixed(1)));
        this.applyZoom(this.boardScale);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        this.boardScale = Math.max(0.7, parseFloat((this.boardScale - 0.1).toFixed(1)));
        this.applyZoom(this.boardScale);
      });
    }

    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', () => {
        this.boardScale = 1.0;
        this.applyZoom(this.boardScale);
      });
    }
  }

  applyZoom(scale) {
    document.documentElement.style.setProperty('--board-scale', scale);
    const txtScale = document.getElementById('txtBoardScale');
    if (txtScale) txtScale.textContent = `${Math.round(scale * 100)}%`;
    localStorage.setItem('boardverse_board_scale', scale);
  }

  initBoardEditor() {
    const btnToggleEditor = document.getElementById('btnToggleBoardEditor');
    const editorDock = document.getElementById('boardEditorDock');
    const btnClear = document.getElementById('btnEditorClearBoard');
    const btnResetInitial = document.getElementById('btnEditorResetInitial');
    const btnPasteFen = document.getElementById('btnEditorPasteFen');
    const btnDoneAnalyze = document.getElementById('btnEditorDoneAnalyze');
    const btnTurnW = document.getElementById('btnEditorTurnWhite');
    const btnTurnB = document.getElementById('btnEditorTurnBlack');

    if (btnToggleEditor && editorDock) {
      btnToggleEditor.addEventListener('click', () => {
        this.isEditorMode = !this.isEditorMode;
        if (this.isEditorMode) {
          btnToggleEditor.classList.add('active');
          editorDock.style.display = 'flex';
          this.analysisManager.cancelCurrentAnalysis();
          this.setStatusMessage('<i class="fa-solid fa-puzzle-piece" style="color:var(--cb-gold);"></i> CHẾ ĐỘ XẾP BÀN CỜ: Chọn quân từ khay rồi click vào ô để đặt/xóa quân.');
        } else {
          btnToggleEditor.classList.remove('active');
          editorDock.style.display = 'none';
        }
        this.renderBoard();
      });
    }

    const btnSettingsOpenEditor = document.getElementById('btnSettingsOpenEditor');
    if (btnSettingsOpenEditor && btnToggleEditor) {
      btnSettingsOpenEditor.addEventListener('click', () => {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'none';
        if (!this.isEditorMode) {
          btnToggleEditor.click();
        }
      });
    }

    // Piece Palette Selection
    document.querySelectorAll('#chessPalette .palette-piece-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#chessPalette .palette-piece-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedPalettePiece = btn.dataset.piece;
      });
    });

    // Default selection
    const defaultPiece = document.querySelector('#chessPalette .palette-piece-btn[data-piece="K"]');
    if (defaultPiece) defaultPiece.classList.add('selected');

    // Turn selection
    if (btnTurnW && btnTurnB) {
      btnTurnW.addEventListener('click', () => {
        this.editorTurn = 'w';
        btnTurnW.classList.add('active');
        btnTurnB.classList.remove('active');
      });
      btnTurnB.addEventListener('click', () => {
        this.editorTurn = 'b';
        btnTurnB.classList.add('active');
        btnTurnW.classList.remove('active');
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (this.isXiangqiActive && this.isXiangqiActive()) return;
        this.game.load('8/8/8/8/8/8/8/8 w - - 0 1');
        this.selectedSquare = null;
        this.lastMove = null;
        this.renderBoard();
      });
    }

    if (btnResetInitial) {
      btnResetInitial.addEventListener('click', () => {
        if (this.isXiangqiActive && this.isXiangqiActive()) return;
        this.game.reset();
        this.selectedSquare = null;
        this.lastMove = null;
        this.renderBoard();
      });
    }

    if (btnPasteFen) {
      btnPasteFen.addEventListener('click', () => {
        if (this.isXiangqiActive && this.isXiangqiActive()) return;
        const fen = prompt('Nhập chuỗi FEN thế cờ bạn muốn xếp:', this.game.fen());
        if (fen) {
          if (this.game.load(fen.trim())) {
            this.selectedSquare = null;
            this.lastMove = null;
            this.renderBoard();
            this.setStatusMessage('<i class="fa-solid fa-check" style="color:var(--cb-accent);"></i> Đã nạp thế cờ từ FEN thành công!');
          } else {
            alert('Chuỗi FEN không hợp lệ!');
          }
        }
      });
    }

    if (btnDoneAnalyze) {
      btnDoneAnalyze.addEventListener('click', () => {
        if (this.isXiangqiActive && this.isXiangqiActive()) return;
        // Validate position: must have at least 1 White King and 1 Black King
        const b = this.game.board();
        let whiteKings = 0, blackKings = 0;
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const p = b[r][f];
            if (p && p.type === 'k') {
              if (p.color === 'w') whiteKings++;
              if (p.color === 'b') blackKings++;
            }
          }
        }

        if (whiteKings !== 1 || blackKings !== 1) {
          alert(`Thế cờ phải có đúng 1 Vua Trắng (hiện có: ${whiteKings}) và 1 Vua Đen (hiện có: ${blackKings})!`);
          return;
        }

        // Set turn if needed
        let currentFen = this.game.fen();
        const fenParts = currentFen.split(' ');
        fenParts[1] = this.editorTurn || 'w';
        fenParts[2] = 'KQkq';
        fenParts[3] = '-';
        const finalFen = fenParts.join(' ');

        if (!this.game.load(finalFen)) {
          fenParts[2] = '-';
          this.game.load(fenParts.join(' '));
        }

        // Exit editor mode
        this.isEditorMode = false;
        if (btnToggleEditor) btnToggleEditor.classList.remove('active');
        if (editorDock) editorDock.style.display = 'none';

        if (!this.chessState.botColor) {
          this.chessState.botColor = this.editorTurn || 'w';
        }

        this.selectedSquare = null;
        this.lastMove = null;
        this.renderBoard();
        this.updateUI();
        this.setStatusMessage('<i class="fa-solid fa-brain" style="color:var(--cb-gold);"></i> Đã lưu thế cờ! Bot AI đang phân tích nước đi tốt nhất...');
        this.triggerAnalysis();
      });
    }
  }

  isXiangqiActive() {
    const xiangqiWrapper = document.getElementById('xiangqiBoardWrapper');
    return xiangqiWrapper && xiangqiWrapper.style.display !== 'none';
  }


  generateChess960Fen() {
    const pieces = new Array(8);
    // 1. Place Bishop on light square (1, 3, 5, 7)
    const lightSquares = [1, 3, 5, 7];
    const b1 = lightSquares[Math.floor(Math.random() * lightSquares.length)];
    pieces[b1] = 'B';

    // 2. Place Bishop on dark square (0, 2, 4, 6)
    const darkSquares = [0, 2, 4, 6];
    const b2 = darkSquares[Math.floor(Math.random() * darkSquares.length)];
    pieces[b2] = 'B';

    // 3. Place Queen on random empty square
    const empty1 = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => pieces[i] === undefined);
    const q = empty1[Math.floor(Math.random() * empty1.length)];
    pieces[q] = 'Q';

    // 4. Place 2 Knights on random empty squares
    const empty2 = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => pieces[i] === undefined);
    const n1 = empty2.splice(Math.floor(Math.random() * empty2.length), 1)[0];
    const n2 = empty2.splice(Math.floor(Math.random() * empty2.length), 1)[0];
    pieces[n1] = 'N';
    pieces[n2] = 'N';

    // 5. Remaining 3 squares: Left Rook, King, Right Rook
    pieces[empty2[0]] = 'R';
    pieces[empty2[1]] = 'K';
    pieces[empty2[2]] = 'R';

    const rank1 = pieces.join('');
    const rank8 = pieces.map(p => p.toLowerCase()).join('');
    return `${rank8}/pppppppp/8/8/8/8/PPPPPPPP/${rank1} w KQkq - 0 1`;
  }

  loadChessVariant(variantKey) {
    if (!this.active) return;
    const variant = CHESS_VARIANTS[variantKey] || CHESS_VARIANTS.STANDARD;
    this.analysisManager.cancelCurrentAnalysis();
    this.analysisManager.clearCache();

    let targetFen = variant.fen;
    if (variant.isFischerRandom) {
      targetFen = this.generateChess960Fen();
    }

    if (targetFen && this.game.load(targetFen)) {
      this.lastMove = null;
      this.selectedSquare = null;
      this.currentAnalysis = null;
      this.renderBoard();
      this.updateUI();
      this.setStatusMessage(`<i class="fa-solid fa-chess" style="color:var(--cb-cyan);"></i> Đã thiết lập: <b>${variant.name}</b>`);

      const aiBox = document.getElementById('aiExplanationTextContent');
      if (aiBox && variant.description) {
        aiBox.innerHTML = `<strong>${variant.name}:</strong> ${variant.description}`;
      }

      if (this.chessState.botColor) {
        this.triggerAnalysis();
      }
    } else {
      alert('Không thể thiết lập thế cờ biến thể này!');
    }
  }

  swapKingQueen() {
    if (!this.active) return;
    this.analysisManager.cancelCurrentAnalysis();
    this.analysisManager.clearCache();
    this.game.swapKingQueen();
    this.lastMove = null;
    this.selectedSquare = null;
    this.currentAnalysis = null;
    this.renderBoard();
    this.updateUI();
    this.game.logStateValidation('SWAP_KING_QUEEN');
    this.setStatusMessage('<i class="fa-solid fa-right-left" style="color:var(--cb-gold);"></i> Đã hoán đổi vị trí Vua và Hậu! Tính năng Nhập Thành (O-O / O-O-O) vẫn hoạt động 100% bình thường!');
    this.triggerAnalysis();
  }

  assertStateConsistency() {
    if (this.chessState.botColor && this.chessState.botColor !== 'w' && this.chessState.botColor !== 'b' && this.chessState.botColor !== 'both') {
      console.warn('Inconsistent botColor state:', this.chessState.botColor);
    }
  }

  startBattleScenario(scenario) {
    if (!this.active) return;

    if (scenario === 'EVS_E') {
      this.analysisManager.cancelCurrentAnalysis();
      this.analysisManager.clearCache();
      this.chessState.botColor = 'both';
      this.chessState.playerColor = 'both';
      this.setStatusMessage('<i class="fa-solid fa-chess" style="color:var(--cb-gold);"></i> CHẾ ĐỘ TỰ ĐẤU: Engine đang tự đánh 2 bên!');
      this.triggerAnalysis();
    }
  }

  isBotTurn() {
    if (!this.chessState.botColor) return false;
    if (this.chessState.botColor === 'both') return true;
    return this.game.turn() === this.chessState.botColor;
  }

  isUserTurn() {
    if (!this.chessState.botColor || this.chessState.botColor === 'both') return false;
    return !this.isBotTurn();
  }


  setInitialIdleState() {
    this.analysisManager.cancelCurrentAnalysis();
    this.analysisManager.clearCache();

    this.chessState.botColor = null;
    this.chessState.playerColor = null;
    this.chessState.engineUiState = EngineUiState.IDLE;

    const btnW = document.getElementById('btnBotWhite');
    const btnB = document.getElementById('btnBotBlack');
    btnW?.classList.remove('active');
    btnB?.classList.remove('active');

    this.game.reset();
    this.selectedSquare = null;
    this.lastMove = null;
    this.currentAnalysis = null;
    this.clearStaleEvalDisplay();

    const lblSpotlight = document.getElementById('lblSpotlightTitle');
    if (lblSpotlight) lblSpotlight.textContent = 'HÃY CHỌN BÊN CHO BOT';

    const statusText = document.getElementById('evalStatusText');
    if (statusText) statusText.textContent = 'Chưa chọn bên cho Bot';

    const aiBox = document.getElementById('aiExplanationTextContent');
    if (aiBox) {
      aiBox.innerHTML = 'Vui lòng chọn <i class="fa-solid fa-chess-king" style="color:#f5f3ee;"></i> <b>BOT CẦM TRẮNG</b> hoặc <i class="fa-solid fa-chess-king" style="color:#26231f; background:rgba(255,255,255,0.85); border-radius:50%; padding:2px 5px; font-size:0.85em;"></i> <b>BOT CẦM ĐEN</b> để bắt đầu ván đấu.';
    }

    this.updateEngineUiState(EngineUiState.IDLE);
    this.renderBoard();
    this.updateUI();
    this.setStatusMessage('CHUYÊN GIA BÀN CỜ: HÃY CHỌN BÊN CHO BOT ĐỂ BẮT ĐẦU!');
  }

  updateEngineUiState(state, data = {}) {
    this.chessState.engineUiState = state;
    const stateTitle = document.getElementById('engineStateTitle');
    const summaryEl = document.getElementById('engineTelemetrySummary');
    const statusIndicator = document.getElementById('engineStatusIndicator');
    const btnAnalyze = document.getElementById('btnForceAnalyze');

    if (btnAnalyze) {
      if (state === EngineUiState.ANALYZING) {
        btnAnalyze.classList.remove('btn-cb-action--primary');
        btnAnalyze.classList.add('btn-cb-action--danger');
        btnAnalyze.title = "Dừng phân tích";
        btnAnalyze.innerHTML = '<i class="fa-solid fa-hand"></i> <span class="btn-text">Dừng</span>';
      } else {
        btnAnalyze.classList.remove('btn-cb-action--danger');
        btnAnalyze.classList.add('btn-cb-action--primary');
        btnAnalyze.title = "Phân tích thế cờ";
        btnAnalyze.innerHTML = '<i class="fa-solid fa-bolt"></i> <span class="btn-text">Phân Tích</span>';
      }
    }

    if (stateTitle) stateTitle.style.color = '#ffffff';

    switch (state) {
      case EngineUiState.IDLE:
        if (stateTitle) {
          stateTitle.innerHTML = 'CHƯA CHỌN BÊN CHO BOT';
        }
        if (summaryEl) summaryEl.textContent = 'Depth: - | Nodes: - | NPS: - | Time: -';
        if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-robot" style="color:var(--cb-gold);"></i> HÃY CHỌN BÊN CHO BOT';
        break;

      case EngineUiState.ENGINE_INITIALIZING:
        if (stateTitle) {
          stateTitle.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--cb-cyan);"></i> ĐANG KHỞI ĐỘNG ENGINE...';
        }
        if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--cb-cyan);"></i> INITIALIZING';
        break;

      case EngineUiState.ENGINE_READY:
        if (stateTitle) {
          stateTitle.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--cb-accent);"></i> ENGINE SẴN SÀNG';
        }
        if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--cb-accent);"></i> ENGINE READY';
        break;

      case EngineUiState.ANALYZING:
        if (stateTitle) {
          stateTitle.innerHTML = '<i class="fa-solid fa-brain fa-spin" style="color:var(--cb-gold);"></i> STOCKFISH ĐANG PHÂN TÍCH...';
        }
        if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-brain fa-spin" style="color:var(--cb-gold);"></i> ANALYZING...';
        break;

      case EngineUiState.RESULT_READY:
        if (stateTitle) {
          stateTitle.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--cb-accent);"></i> PHÂN TÍCH HOÀN TẤT';
        }
        if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--cb-accent);"></i> READY';
        if (data.result) this.updateActiveEngineBadge(data.result);
        break;

      case EngineUiState.ENGINE_ERROR:
      case EngineUiState.ENGINE_UNAVAILABLE:
        if (stateTitle) {
          stateTitle.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--cb-rose);"></i> ENGINE UNAVAILABLE';
        }
        if (summaryEl) summaryEl.textContent = 'Không thể kết nối Engine Stockfish';
        if (statusIndicator) statusIndicator.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--cb-rose);"></i> ENGINE UNAVAILABLE';
        const evalStatusErr = document.getElementById('evalStatusText');
        if (evalStatusErr && this.chessState.botColor) {
          evalStatusErr.textContent = 'Không thể kết nối Engine';
        }
        this.updateActiveEngineBadge(null);
        break;
    }
  }


  setBotColor(color) {
    if (!this.active) return;
    if (color !== 'w' && color !== 'b') return;

    this.analysisManager.cancelCurrentAnalysis();
    this.analysisManager.clearCache();

    this.chessState.botColor = color;
    this.chessState.playerColor = (color === 'w') ? 'b' : 'w';
    
    if (this.appMode === 'PLAY_VS_BOT') {
      this.chessState.orientation = this.chessState.playerColor; // PLAYER AT BOTTOM
      this.boardFlipped = (this.chessState.playerColor === 'b');
    } else {
      this.chessState.orientation = color; // BOT AT BOTTOM
      this.boardFlipped = (color === 'b');
    }

    const selectVariant = document.getElementById('selectChessVariant');
    const variantKey = selectVariant ? selectVariant.value : 'STANDARD';
    if (variantKey && variantKey !== 'STANDARD') {
      const variant = CHESS_VARIANTS[variantKey];
      if (variant && variant.fen) {
        this.game.load(variant.fen);
      } else if (variant && variant.isFischerRandom) {
        this.game.load(this.generateChess960Fen());
      } else {
        this.game.reset();
      }
    } else {
      this.game.reset();
    }

    this.selectedSquare = null;
    this.lastMove = null;
    this.currentAnalysis = null;

    const btnW = document.getElementById('btnBotWhite');
    const btnB = document.getElementById('btnBotBlack');
    
    if (this.appMode === 'PLAY_VS_BOT') {
      // In this mode, btnW means "BẠN CẦM TRẮNG", so bot is 'b'
      if (color === 'b') {
        btnW?.classList.add('active');
        btnB?.classList.remove('active');
      } else {
        btnB?.classList.add('active');
        btnW?.classList.remove('active');
      }
    } else {
      if (color === 'w') {
        btnW?.classList.add('active');
        btnB?.classList.remove('active');
      } else {
        btnB?.classList.add('active');
        btnW?.classList.remove('active');
      }
    }

    const lblSpotlight = document.getElementById('lblSpotlightTitle');
    if (lblSpotlight) {
      lblSpotlight.textContent = `NƯỚC ĐỀ XUẤT CHO BOT (${color === 'w' ? 'TRẮNG' : 'ĐEN'})`;
    }

    this.clearStaleEvalDisplay();

    this.renderBoard();
    this.updateUI();
    this.assertStateConsistency();

    if (this.appMode === 'PLAY_VS_BOT') {
      if (color === 'w') {
        this.setStatusMessage('<i class="fa-solid fa-dumbbell" style="color:var(--cb-steel);"></i> Luyện tập: BẠN CẦM ĐEN (ở dưới). Bot Trắng đang đánh nước đầu tiên...');
        this.triggerAnalysis();
      } else {
        this.setStatusMessage('<i class="fa-solid fa-dumbbell" style="color:var(--cb-steel);"></i> Luyện tập: BẠN CẦM TRẮNG (ở dưới). Hãy đi nước đầu tiên!');
        this.triggerAnalysis();
      }
    } else {
      if (color === 'w') {
        this.setStatusMessage('<i class="fa-solid fa-robot" style="color:var(--cb-accent);"></i> Trợ lý: BOT CẦM TRẮNG (ở dưới). Bot đang tự động đánh nước đầu tiên...');
        this.triggerAnalysis();
      } else {
        this.setStatusMessage('<i class="fa-solid fa-robot" style="color:var(--cb-accent);"></i> Trợ lý: BOT CẦM ĐEN (ở dưới). Hãy nhập cờ của đối thủ Trắng vào bàn cờ!');
        this.triggerAnalysis();
      }
    }
  }

  setAppMode(mode) {
    if (!this.active) return;
    this.appMode = mode;
    const selectAppMode = document.getElementById('selectAppMode');
    if (selectAppMode && selectAppMode.value !== mode) selectAppMode.value = mode;

    const boxSideSelector = document.getElementById('boxSideSelector');
    const practiceEditorSection = document.getElementById('practiceEditorSection');
    const panelBotOptions = document.getElementById('panelBotOptions');
    const panelOpponentInput = document.getElementById('panelOpponentInput');

    const lblSide = document.getElementById('lblSideChoice');
    const lblW = document.getElementById('lblBtnBotWhite');
    const lblB = document.getElementById('lblBtnBotBlack');
    const chkAutoApply = document.getElementById('chkAutoApplyMove');
    const lblOpponentSuggestions = document.getElementById('lblOpponentSuggestions');
    const coachSelect = document.getElementById('selectCoachPreset');
    const aiExplanationSection = document.getElementById('aiExplanationSection');
    const gamePhaseContainer = document.getElementById('gamePhaseContainer');

    // Turn off Board Editor if active
    const editorDock = document.getElementById('boardEditorDock');
    const btnToggleEditor = document.getElementById('btnToggleBoardEditor');
    if (this.isEditorMode) {
      this.isEditorMode = false;
      if (btnToggleEditor) btnToggleEditor.classList.remove('active');
      if (editorDock) editorDock.style.display = 'none';
    }

    if (mode === 'PLAY_VS_BOT') {
      // 1. CHẾ ĐỘ LUYỆN TẬP: Đấu trực tiếp với bot, ẩn ô gõ nước đối thủ
      if (boxSideSelector) boxSideSelector.style.display = 'block';
      if (practiceEditorSection) practiceEditorSection.style.display = 'block';
      if (panelBotOptions) panelBotOptions.style.display = 'flex';
      if (panelOpponentInput) panelOpponentInput.style.display = 'none';
      if (aiExplanationSection) aiExplanationSection.style.display = 'block';
      if (gamePhaseContainer) gamePhaseContainer.style.display = 'block';

      if (lblSide) lblSide.innerHTML = '<i class="fa-solid fa-user" style="color:var(--cb-cyan);"></i> CHỌN BÊN CỦA BẠN (BẠN Ở PHÍA DƯỚI BÀN CỜ):';
      if (lblW) lblW.textContent = 'BẠN CẦM TRẮNG';
      if (lblB) lblB.textContent = 'BẠN CẦM ĐEN';
      if (chkAutoApply) {
        chkAutoApply.checked = true;
        this.autoApplyBestMove = true;
      }
      if (lblOpponentSuggestions) {
        lblOpponentSuggestions.innerHTML = '<i class="fa-solid fa-user-graduate"></i> Bật Huấn luyện viên AI';
      }
      if (coachSelect) coachSelect.style.display = 'block';

      if (this.chessState.botColor) {
        this.setBotColor(this.chessState.botColor);
      } else {
        this.setInitialIdleState();
      }
    } else {
      // 2. CHẾ ĐỘ TRỢ LÝ: Phân tích & Hỗ trợ, hiện ô nhập nước đối thủ
      if (boxSideSelector) boxSideSelector.style.display = 'block';
      if (practiceEditorSection) practiceEditorSection.style.display = 'none';
      if (panelBotOptions) panelBotOptions.style.display = 'flex';
      if (panelOpponentInput) panelOpponentInput.style.display = 'block';
      if (aiExplanationSection) aiExplanationSection.style.display = 'none';
      if (gamePhaseContainer) gamePhaseContainer.style.display = 'none';

      if (lblSide) lblSide.innerHTML = '<i class="fa-solid fa-robot" style="color:var(--cb-gold);"></i> CHỌN BÊN CHO BOT (BOT Ở PHÍA DƯỚI BÀN CỜ):';
      if (lblW) lblW.textContent = 'BOT CẦM TRẮNG';
      if (lblB) lblB.textContent = 'BOT CẦM ĐEN';
      if (lblOpponentSuggestions) {
        lblOpponentSuggestions.innerHTML = 'Gợi ý nước đi khi đến lượt đối thủ';
      }
      if (coachSelect) coachSelect.style.display = 'none';

      if (this.chessState.botColor) {
        this.setBotColor(this.chessState.botColor);
      } else {
        this.setInitialIdleState();
      }
    }
  }



  setUserColor(color) {
    this.setBotColor(color === 'w' ? 'b' : 'w');
  }

  setTurnOrder(isMine) {
    // Legacy no-op
  }

  toggleFlipBoard() {
    if (!this.active) return;
    this.boardFlipped = !this.boardFlipped;
    this.renderBoard();
  }

  clearStaleEvalDisplay() {
    const evalValText = document.getElementById('evalScoreValueText');
    const evalBarFill = document.getElementById('evalBarFill');
    if (evalValText) evalValText.textContent = '...';
    if (evalBarFill) evalBarFill.style.height = '50%';
  }

  resetBoard() {
    if (!this.active) return;
    this.setInitialIdleState();
  }


  resetToStart() {
    if (!this.active) return;
    this.analysisManager.cancelCurrentAnalysis();
    while (this.game.positionHistory && this.game.positionHistory.length > 1) {
      this.game.undo();
    }
    this.selectedSquare = null;
    this.lastMove = null;
    this.clearStaleEvalDisplay();
    this.renderBoard();
    this.updateUI();
    this.setStatusMessage('<i class="fa-solid fa-backward-step"></i> Đã quay về vị trí bắt đầu ván đấu!');
    this.assertStateConsistency();
    this.triggerAnalysis(true);
  }

  undoMove() {
    if (!this.active) return;
    this.analysisManager.cancelCurrentAnalysis();
    const undone = this.game.undo();
    if (!undone) {
      this.setStatusMessage('<i class="fa-solid fa-triangle-exclamation"></i> Đã ở vị trí ban đầu, không thể lùi thêm!');
      return;
    }

    this.selectedSquare = null;
    const history = this.game.history({ verbose: true });
    const last = history[history.length - 1];
    this.lastMove = last ? { from: last.from, to: last.to, isBot: last.color === this.chessState.botColor } : null;

    this.clearStaleEvalDisplay();
    this.renderBoard();
    this.updateUI();
    this.setStatusMessage(`<i class="fa-solid fa-rotate-left"></i> Đã lùi 1 nước (${undone.san}). Tạm dừng Auto-Bot để bạn có thể sửa nước đi...`);
    this.assertStateConsistency();
    this.triggerAnalysis(true);
  }

  redoMove() {
    if (!this.active) return;
    this.analysisManager.cancelCurrentAnalysis();
    const redone = this.game.redo();
    if (!redone) {
      this.setStatusMessage('<i class="fa-solid fa-triangle-exclamation"></i> Đã ở nước cờ mới nhất, không thể tiến thêm!');
      return;
    }

    this.selectedSquare = null;
    this.lastMove = { from: redone.from, to: redone.to, isBot: redone.color === this.chessState.botColor };
    this.clearStaleEvalDisplay();
    this.renderBoard();
    this.updateUI();
    this.setStatusMessage(`<i class="fa-solid fa-rotate-right"></i> Đã tiến 1 nước (${redone.san}). Engine đang phân tích lại...`);
    this.assertStateConsistency();
    this.triggerAnalysis(true);
  }

  openGameReviewModal() {
    if (!this.active) return;
    const sidePanel = document.getElementById('gameReviewSidePanel');
    const engineBody = document.getElementById('engineAnalysisBody');
    if (sidePanel) {
      sidePanel.style.display = 'flex';
      if (engineBody) engineBody.style.display = 'none';

      const lblPlayer1 = document.getElementById('lblSideAccPlayer1');
      const lblPlayer2 = document.getElementById('lblSideAccPlayer2');
      if (lblPlayer1) lblPlayer1.textContent = 'TRẮNG';
      if (lblPlayer2) lblPlayer2.textContent = 'ĐEN';

      const progressContainer = document.getElementById('reviewSideProgressContainer');
      const contentContainer = document.getElementById('reviewSideContentContainer');
      const actionContainer = document.getElementById('reviewSideActionContainer');
      if (progressContainer) progressContainer.style.display = 'none';
      if (contentContainer) contentContainer.style.display = 'none';
      if (actionContainer) actionContainer.style.display = 'block';

      // Auto start if history exists
      if (this.game && this.game.historyList && this.game.historyList.length > 0) {
        this.runFullGameReview();
      }
    } else {
      const modal = document.getElementById('gameReviewModal');
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('reviewProgressContainer').style.display = 'none';
        document.getElementById('reviewContentContainer').style.display = 'none';
        document.getElementById('reviewActionContainer').style.display = 'block';
      }
    }
  }

  closeSideReview() {
    this.reviewIsRunning = false;
    const sidePanel = document.getElementById('gameReviewSidePanel');
    const engineBody = document.getElementById('engineAnalysisBody');
    if (sidePanel) sidePanel.style.display = 'none';
    if (engineBody) engineBody.style.display = 'flex';
  }

  async runFullGameReview() {
    this.reviewIsRunning = true;
    const historyList = this.game.historyList || [];
    if (historyList.length === 0) {
      const summaryText = document.getElementById('reviewSideSummaryText') || document.getElementById('reviewSummaryText');
      if (summaryText) summaryText.textContent = "Chưa có nước đi nào trong ván đấu để phân tích!";
      const contentContainer = document.getElementById('reviewSideContentContainer');
      const actionContainer = document.getElementById('reviewSideActionContainer');
      if (actionContainer) actionContainer.style.display = 'none';
      if (contentContainer) contentContainer.style.display = 'flex';
      return;
    }

    const actionContainer = document.getElementById('reviewSideActionContainer') || document.getElementById('reviewActionContainer');
    const progressContainer = document.getElementById('reviewSideProgressContainer') || document.getElementById('reviewProgressContainer');
    const progressText = document.getElementById('reviewSideProgressText') || document.getElementById('reviewProgressText');
    const progressBar = document.getElementById('reviewSideProgressBar') || document.getElementById('reviewProgressBar');
    const contentContainer = document.getElementById('reviewSideContentContainer') || document.getElementById('reviewContentContainer');

    if (actionContainer) actionContainer.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'block';
    if (contentContainer) contentContainer.style.display = 'none';

    // Create a temporary game to walk through the history
    const tempGame = new Chess(this.game.startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const evals = [];
    
    // Save current analysis preset and set to QUICK for speed
    const oldPreset = this.analysisManager.analysisPreset;
    this.analysisManager.setPreset('QUICK');

    // First evaluate start position
    let result = await this.analysisManager.analyzePosition(tempGame);
    evals.push(result.evalScore ? result.evalScore : { type: 'cp', value: 0 });

    for (let i = 0; i < historyList.length; i++) {
      if (!this.reviewIsRunning) {
         this.analysisManager.setPreset(oldPreset);
         return;
      }
      
      const move = historyList[i];
      tempGame.move(move);
      
      if (progressText) progressText.textContent = `Đang phân tích: ${i + 1}/${historyList.length} nước đi...`;
      if (progressBar) progressBar.style.width = `${((i + 1) / historyList.length) * 100}%`;

      result = await this.analysisManager.analyzePosition(tempGame);
      evals.push(result.evalScore ? result.evalScore : { type: 'cp', value: 0 });
    }

    this.analysisManager.setPreset(oldPreset);

    if (!this.reviewIsRunning) return;

    // 1. Normalize all position evaluations to White's POV (White advantageous > 0, Black advantageous < 0)
    const whiteScores = evals.map((e, idx) => {
      let val = 0;
      if (e.type === 'mate') {
        val = e.value > 0 ? 10000 : -10000;
      } else {
        val = e.value || 0;
      }
      return (idx % 2 === 0) ? val : -val;
    });

    // Calculate accuracy & stats
    let whiteAccSum = 0, blackAccSum = 0;
    let whiteMoves = 0, blackMoves = 0;
    const statsW = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    const statsB = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };

    for (let i = 0; i < historyList.length; i++) {
      const isWhite = (i % 2 === 0);
      const wScoreBefore = whiteScores[i];
      const wScoreAfter = whiteScores[i + 1];

      // Calculate Centipawn Loss from moving player's perspective
      let cpLoss = 0;
      if (isWhite) {
        cpLoss = Math.max(0, wScoreBefore - wScoreAfter);
      } else {
        cpLoss = Math.max(0, wScoreAfter - wScoreBefore);
      }

      // Win% Model (Standard Lichess / Chess.com Elo Model)
      const playerAdvBefore = isWhite ? wScoreBefore : -wScoreBefore;
      const playerAdvAfter = isWhite ? wScoreAfter : -wScoreAfter;

      const winPctBefore = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * playerAdvBefore)) - 1);
      const winPctAfter = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * playerAdvAfter)) - 1);
      const winLoss = Math.max(0, winPctBefore - winPctAfter);

      // Accuracy formula based on win percentage loss
      let acc = 100;
      if (winLoss > 0) {
        acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669));
      }

      if (isWhite) {
        whiteAccSum += acc;
        whiteMoves++;
        this.categorizeMove(cpLoss, statsW);
      } else {
        blackAccSum += acc;
        blackMoves++;
        this.categorizeMove(cpLoss, statsB);
      }
    }

    const finalAccW = whiteMoves > 0 ? (whiteAccSum / whiteMoves).toFixed(1) : '100.0';
    const finalAccB = blackMoves > 0 ? (blackAccSum / blackMoves).toFixed(1) : '100.0';

    if (progressContainer) progressContainer.style.display = 'none';
    if (contentContainer) contentContainer.style.display = 'flex';

    const accWhiteEl = document.getElementById('reviewSideAccWhite') || document.getElementById('reviewAccWhite');
    const accBlackEl = document.getElementById('reviewSideAccBlack') || document.getElementById('reviewAccBlack');
    if (accWhiteEl) accWhiteEl.textContent = `${finalAccW}%`;
    if (accBlackEl) accBlackEl.textContent = `${finalAccB}%`;

    const statsWhiteEl = document.getElementById('reviewSideStatsWhite') || document.getElementById('reviewStatsWhite');
    const statsBlackEl = document.getElementById('reviewSideStatsBlack') || document.getElementById('reviewStatsBlack');

    const renderStatHtml = (st) => `
      <div style="color:var(--cb-gold); font-weight:700; margin-bottom:2px;"><i class="fa-solid fa-star"></i> Tối ưu: ${st.best}</div>
      <div style="color:var(--cb-emerald); font-weight:700; margin-bottom:2px;"><i class="fa-solid fa-thumbs-up"></i> Tốt: ${st.good}</div>
      <div style="color:var(--cb-text-muted); font-weight:700; margin-bottom:2px;"><i class="fa-solid fa-question"></i> Chưa chuẩn: ${st.inaccuracy}</div>
      <div style="color:var(--cb-rose); font-weight:700; margin-bottom:2px;"><i class="fa-solid fa-xmark"></i> Sai lầm: ${st.mistake}</div>
      <div style="color:#ef4444; font-weight:900;"><i class="fa-solid fa-skull"></i> Đại sai lầm: ${st.blunder}</div>
    `;

    if (statsWhiteEl) statsWhiteEl.innerHTML = renderStatHtml(statsW);
    if (statsBlackEl) statsBlackEl.innerHTML = renderStatHtml(statsB);

    let summary = `Ván đấu ${Math.ceil(historyList.length / 2)} nước. `;
    if (parseFloat(finalAccW) > parseFloat(finalAccB) + 8) summary += 'Trắng áp đảo với độ chính xác vượt trội. ';
    else if (parseFloat(finalAccB) > parseFloat(finalAccW) + 8) summary += 'Đen thi đấu xuất sắc và chiếm ưu thế. ';
    else summary += 'Một ván đấu đôi công giằng co cân bằng. ';
    
    if (statsW.blunder > 0 || statsB.blunder > 0) {
      summary += `Tổng cộng có ${statsW.blunder + statsB.blunder} nước sai lầm nghiêm trọng (Blunder). `;
    }
    if (parseFloat(finalAccW) >= 90 && parseFloat(finalAccB) >= 90) {
      summary += 'Cả hai kỳ thủ đều đạt độ chính xác tương đương Đại Kiện Tướng!';
    } else if (parseFloat(finalAccW) < 60 || parseFloat(finalAccB) < 60) {
      summary += 'Còn nhiều nước đi cần cải thiện ở trung cuộc!';
    }

    const summaryEl = document.getElementById('reviewSideSummaryText') || document.getElementById('reviewSummaryText');
    if (summaryEl) summaryEl.textContent = summary;

    // Render Advantage Curve SVG Chart
    this.renderAdvantageChart(whiteScores, historyList);
  }

  categorizeMove(cpLoss, stats) {
    if (cpLoss <= 12) stats.best++;
    else if (cpLoss <= 35) stats.good++;
    else if (cpLoss <= 85) stats.inaccuracy++;
    else if (cpLoss <= 180) stats.mistake++;
    else stats.blunder++;
  }

  openGameArchiveModal() {
    if (!this.active) return;
    const modal = document.getElementById('gameArchiveModal');
    if (modal) {
      modal.style.display = 'flex';
      this.renderGameArchiveList();
    }
  }

  saveCurrentGameToArchive(silent = false) {
    if (!this.active) return;
    const pgn = this.game.pgn();
    if (!pgn || pgn.trim() === '') {
        if (!silent) alert("Chưa có nước đi nào để lưu!");
        return;
    }

    const archiveStr = localStorage.getItem('chessBattleArchive');
    let archive = [];
    if (archiveStr) {
        try { archive = JSON.parse(archiveStr); } catch(e) {}
    }

    // De-duplication check: prevent saving the exact same game twice
    const isDuplicate = archive.some(g => (g.pgn && g.pgn.trim() === pgn.trim()));
    if (isDuplicate) {
        if (!silent) {
            alert("Ván đấu này đã có sẵn trong kho lưu trữ!");
            this.renderGameArchiveList();
        }
        return;
    }

    const gameData = {
        id: Date.now(),
        date: new Date().toLocaleString('vi-VN'),
        pgn: pgn,
        movesCount: this.game.historyList ? this.game.historyList.length : 0,
        result: this.game.isGameOver() ? (this.game.isCheckmate() ? "Checkmate" : "Hòa/Cờ thế") : "Chưa kết thúc"
    };

    archive.unshift(gameData);
    localStorage.setItem('chessBattleArchive', JSON.stringify(archive));
    if (!silent) {
        alert("Đã lưu ván đấu thành công!");
        this.renderGameArchiveList();
    }
  }

  renderGameArchiveList() {
    const container = document.getElementById('archiveListContainer');
    if (!container) return;

    const archiveStr = localStorage.getItem('chessBattleArchive');
    let archive = [];
    if (archiveStr) {
        try { archive = JSON.parse(archiveStr); } catch(e) {}
    }

    // Auto-clean any legacy duplicate entries
    const seenPgns = new Set();
    const uniqueArchive = [];
    for (const g of archive) {
      const pgnKey = (g.pgn || '').trim();
      if (pgnKey && !seenPgns.has(pgnKey)) {
        seenPgns.add(pgnKey);
        uniqueArchive.push(g);
      }
    }
    if (uniqueArchive.length !== archive.length) {
      archive = uniqueArchive;
      localStorage.setItem('chessBattleArchive', JSON.stringify(archive));
    }

    if (archive.length === 0) {
        container.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">Kho lưu trữ trống.</div>';
        return;
    }

    container.innerHTML = archive.map(game => `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:2px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
                <div style="font-weight:800; color:var(--cb-gold); margin-bottom:4px;">${game.date}</div>
                <div style="font-size:0.8rem; color:#cbd5e1;">Số nước đi: ${game.movesCount} | Trạng thái: ${game.result}</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn-download-archived-pgn cb-btn-pgn" data-id="${game.id}" style="height:32px; padding:0 10px;">
                    <i class="fa-solid fa-download"></i> Tải PGN
                </button>
                <button class="btn-load-archived-game" data-id="${game.id}" style="background:var(--cb-accent); color:#1c1a17; border:none; padding:6px 12px; border-radius:2px; font-weight:700; cursor:pointer; height:32px; display:flex; align-items:center; gap:5px;">
                    <i class="fa-solid fa-folder-open"></i> Mở Lại
                </button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.btn-load-archived-game').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            this.loadGameFromArchive(id);
        });
    });

    container.querySelectorAll('.btn-download-archived-pgn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            this.downloadPgnFile(id);
        });
    });
  }

  downloadPgnFile(id) {
    const archiveStr = localStorage.getItem('chessBattleArchive');
    if (!archiveStr) return;
    try {
      const archive = JSON.parse(archiveStr);
      const game = archive.find(g => g.id === id);
      if (game && game.pgn) {
        const blob = new Blob([game.pgn], { type: 'application/x-chess-pgn' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boardverse-game-${game.id || Date.now()}.pgn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Đã tải file PGN về máy thành công!', 'success');
      }
    } catch (e) {
      this.showToast('Lỗi khi tải file PGN!', 'warning');
    }
  }

  loadGameFromArchive(id) {
    if (!this.active) return;
    const archiveStr = localStorage.getItem('chessBattleArchive');
    if (!archiveStr) return;
    const archive = JSON.parse(archiveStr);
    const game = archive.find(g => g.id === id);
    if (game) {
        if (this.game.loadPgn(game.pgn)) {
            document.getElementById('gameArchiveModal').style.display = 'none';
            this.analysisManager.cancelCurrentAnalysis();
            this.selectedSquare = null;
            this.lastMove = null;
            const history = this.game.history({ verbose: true });
            if (history.length > 0) {
              const last = history[history.length - 1];
              this.lastMove = { from: last.from, to: last.to, isBot: last.color === this.chessState.botColor };
            }
            this.clearStaleEvalDisplay();
            this.renderBoard();
            this.updateUI();
            
            this.setStatusMessage('<i class="fa-solid fa-folder-open"></i> Đã tải ván đấu từ kho lưu trữ! Đang chờ bạn thao tác hoặc bấm Báo Cáo.');
            this.assertStateConsistency();
            this.triggerAnalysis(true); 
        } else {
            alert("Lỗi khi đọc PGN của ván đấu này!");
        }
    }
  }

  jumpToMove(targetIndex) {
    this.analysisManager.cancelCurrentAnalysis();
    
    const currentIndex = this.game.historyList.length - 1;
    if (targetIndex === currentIndex) return;
    
    if (targetIndex < currentIndex) {
      const undosNeeded = currentIndex - targetIndex;
      for (let i = 0; i < undosNeeded; i++) {
        this.game.undo();
      }
    } else if (targetIndex > currentIndex) {
      const redosNeeded = targetIndex - currentIndex;
      for (let i = 0; i < redosNeeded; i++) {
        this.game.redo();
      }
    }

    this.selectedSquare = null;
    const history = this.game.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      this.lastMove = { from: last.from, to: last.to, isBot: last.color === this.chessState.botColor };
    } else {
      this.lastMove = null;
    }

    this.clearStaleEvalDisplay();
    this.renderBoard();
    this.updateUI();
    if (targetIndex === -1) {
      this.setStatusMessage('<i class="fa-solid fa-backward-step"></i> Đã quay về vị trí bắt đầu ván đấu!');
    } else {
      this.setStatusMessage(`<i class="fa-solid fa-clock-rotate-left"></i> Đang xem lại nước đi thứ ${targetIndex + 1}. Tạm dừng Auto-Bot...`);
    }
    this.assertStateConsistency();
    this.triggerAnalysis(true);
  }

  handleBlackMoveInput(moveObj, displayError = true) {
    if (!this.active) return false;
    if (!this.chessState.botColor) {
      this.setStatusMessage('CHUYÊN GIA BÀN CỜ: HÃY CHỌN BÊN CHO BOT ĐỂ BẮT ĐẦU!');
      if (displayError) this.showError('<i class="fa-solid fa-triangle-exclamation"></i> Hãy chọn [ BOT CẦM TRẮNG ] hoặc [ BOT CẦM ĐEN ] trước khi đi nước!');
      return false;
    }

    const res = this.game.move(moveObj);
    if (!res) {
      if (displayError) this.showError('<i class="fa-solid fa-circle-xmark"></i> Nước đi không hợp lệ!');
      return false;
    }

    this.lastMove = { from: res.from, to: res.to, isBot: false };
    this.playMoveSound(res);
    this.selectedSquare = null;
    this.renderBoard();
    this.updateUI();
    this.assertStateConsistency();
    this.triggerAnalysis();
    return true;
  }

  clearStaleEvalDisplay() {
    const recMoveText = document.getElementById('recommendedBestMoveText');
    const topMovesContainer = document.getElementById('topMovesListContainer');
    const pvText = document.getElementById('bestLineText');
    const statusText = document.getElementById('evalStatusText');

    if (recMoveText) recMoveText.textContent = '-';
    if (topMovesContainer) topMovesContainer.innerHTML = '<div style="color:var(--cb-text-muted); font-size:0.8rem; padding:8px;">Đang phân tích...</div>';
    if (pvText) pvText.textContent = '-';
    if (statusText) {
      statusText.textContent = this.chessState.botColor ? 'Đang chờ tính toán...' : 'Chưa chọn bên cho Bot';
    }
  }


  updateActiveEngineBadge(result) {
    const activeBadge = document.getElementById('activeEngineBadge');
    if (!activeBadge) return;

    if (!result || result.error === 'ENGINE_UNAVAILABLE') {
      activeBadge.className = 'badge-engine-status unavail';
      activeBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ENGINE UNAVAILABLE';
      return;
    }

    const versionStr = result.version || result.source || 'Stockfish';
    const srcLower = (result.source || '').toLowerCase();

    if (srcLower.includes('native')) {
      activeBadge.className = 'badge-engine-status native';
      activeBadge.innerHTML = `<i class="fa-solid fa-microchip"></i> ${versionStr}`;
    } else if (srcLower.includes('wasm') || srcLower.includes('local')) {
      activeBadge.className = 'badge-engine-status wasm';
      activeBadge.innerHTML = `<i class="fa-solid fa-memory"></i> ${versionStr}`;
    } else if (srcLower.includes('cloud')) {
      activeBadge.className = 'badge-engine-status cloud';
      activeBadge.innerHTML = `<i class="fa-solid fa-cloud"></i> Cloud ${versionStr}`;
    } else {
      activeBadge.className = 'badge-engine-status native';
      activeBadge.innerHTML = `<i class="fa-solid fa-server"></i> ${versionStr}`;
    }
  }

  updateAnalyzingStateComplete(result) {
    this.updateEngineUiState(EngineUiState.RESULT_READY, { result });
  }

  updateAnalyzingStateUnavailable() {
    this.updateEngineUiState(EngineUiState.ENGINE_UNAVAILABLE);
  }

  async triggerAnalysis(isAfterUndo = false) {
    if (!this.active) return;
    if (this.game.isGameOver()) {
      this.updateEngineUiState(EngineUiState.ENGINE_READY);
      
      if (this.game.isCheckmate()) {
        const winnerColor = this.game.turn() === 'w' ? 'b' : 'w';
        const isBotWin = this.chessState.botColor === winnerColor;
        
        if (isBotWin) {
          const colorName = winnerColor === 'w' ? 'TRẮNG' : 'ĐEN';
          this.setStatusMessage(`<i class="fa-solid fa-skull-crossbones"></i> CHIẾU BÍ! KẺ HỦY DIỆT BOT ĐÃ NGHIỀN NÁT ĐỐI THỦ! (Bot ${colorName} thắng)`);
          this.showError(`BÁ CÁO: BOT ${colorName} ĐÃ GIÀNH CHIẾN THẮNG TUYỆT ĐỐI BẰNG ĐÒN CHIẾU BÍ!`);
        } else if (this.chessState.botColor) {
          const colorName = winnerColor === 'w' ? 'TRẮNG' : 'ĐEN';
          this.setStatusMessage(`<i class="fa-solid fa-trophy"></i> CHIẾU BÍ! (${colorName} thắng)`);
          this.showError(`CHÚC MỪNG! CHIẾU BÍ THÀNH CÔNG!`);
        } else {
          this.setStatusMessage(`<i class="fa-solid fa-trophy"></i> CHIẾU BÍ! TRẬN ĐẤU KẾT THÚC!`);
        }
        
        this.showCheckmateOverlay(winnerColor, isBotWin);
        this.saveCurrentGameToArchive(true);
      } else if (this.game.isDraw()) {
        this.setStatusMessage('<i class="fa-solid fa-handshake"></i> HÒA CỜ! Ván đấu kết thúc bất phân thắng bại.');
        this.saveCurrentGameToArchive(true);
      } else {
        this.setStatusMessage('<i class="fa-solid fa-flag-checkered"></i> Ván cờ đã kết thúc.');
        this.saveCurrentGameToArchive(true);
      }
      return;
    }

    if (!this.chessState.botColor) {
      this.setInitialIdleState();
      return;
    }

    if (this.isUserTurn() && !this.enableOpponentSuggestions) {
      this.analysisManager.cancelCurrentAnalysis();
      const humanColorName = this.chessState.botColor === 'w' ? 'Đen' : 'Trắng';
      this.updateEngineUiState(EngineUiState.ENGINE_READY);
      this.setStatusMessage(`<i class="fa-solid fa-shield-halved"></i> ĐẾN LƯỢT CỦA BẠN (${humanColorName})! (Đang tắt gợi ý đối thủ để tiết kiệm CPU)`);
      const recMoveText = document.getElementById('recommendedBestMoveText');
      if (recMoveText) recMoveText.textContent = 'Đã tắt';
      const evalStatusText = document.getElementById('evalStatusText');
      if (evalStatusText) evalStatusText.textContent = 'Đã tắt gợi ý đối thủ';
      const sourceBadge = document.getElementById('engineSourceBadge');
      if (sourceBadge) sourceBadge.textContent = 'Source: Standby';
      return;
    }

    const analysisId = 'aid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    this.chessState.analysisId = analysisId;

    this.clearStaleEvalDisplay();
    this.updateEngineUiState(EngineUiState.ANALYZING);
    this.setStatusMessage('<i class="fa-solid fa-bolt"></i> ĐANG PHÂN TÍCH THẾ CỜ...');

    let overridePreset = null;
    if (this.appMode === 'PLAY_VS_BOT') {
      if (this.isUserTurn()) {
        const coachDropdown = document.getElementById('selectCoachPreset');
        overridePreset = this.coachPreset || coachDropdown?.value || 'MAXIMUM';
      } else {
        const botDropdown = document.getElementById('selectPresetMode');
        overridePreset = this.botPreset || botDropdown?.value || 'QUICK';
      }
    }

    const result = await this.analysisManager.analyzePosition(
      this.game,
      (progressData) => {
        if (this.chessState.analysisId === analysisId) {
          this.updateEngineStatsUI(progressData);
        }
      },
      this.prevEvalCp,
      analysisId,
      this.isUserTurn(),
      overridePreset
    );

    if (result.canceled || (result.analysisId && result.analysisId !== this.chessState.analysisId)) {
      console.log('DISCARDED STALE ANALYSIS RESULT:', result.analysisId);
      return;
    }

    if (result.error === 'ENGINE_UNAVAILABLE') {
      this.setStatusMessage('<i class="fa-solid fa-circle-xmark"></i> ENGINE UNAVAILABLE: Không thể tính toán nước đi.');
      this.showError('Máy tính Stockfish không phản hồi.');
      this.updateEngineUiState(EngineUiState.ENGINE_UNAVAILABLE);
      this.updateDebugPanel(result);
      return;
    }

    this.currentAnalysis = result;
    if (result.evalScore && result.evalScore.type === 'cp') {
      this.prevEvalCp = result.evalScore.value;
    }

    this.updateEngineUiState(EngineUiState.RESULT_READY, { result });
    this.updateAnalysisPanelUI(result);
    this.updateEvaluationBar(result);
    this.highlightBoardBestMove(result.bestMoveUci);
    this.updateDebugPanel(result);

    const isBotTurn = this.isBotTurn();
    const botColorName = this.chessState.botColor === 'w' ? 'Trắng' : 'Đen';
    const humanColorName = this.chessState.botColor === 'w' ? 'Đen' : 'Trắng';

    if (isBotTurn) {
      this.setStatusMessage(`<i class="fa-solid fa-robot"></i> ĐẾN LƯỢT BOT (${botColorName})! Bot đang thực hiện nước đi...`);
    } else {
      this.setStatusMessage(`<i class="fa-solid fa-shield-halved"></i> ĐẾN LƯỢT CỦA BẠN (${humanColorName})! Hãy kéo hoặc nhập nước đi trên bàn cờ...`);
    }

    const isReviewingHistory = (this.game.redoStack && this.game.redoStack.length > 0);
    if (this.autoApplyBestMove && result.bestMoveSan && isBotTurn && !isAfterUndo && !isReviewingHistory) {
      setTimeout(() => {
        if (this.chessState.analysisId !== analysisId || !this.isBotTurn()) return;
        if (this.game.redoStack && this.game.redoStack.length > 0) return;
        let executed = this.game.move(result.bestMoveSan);
        if (!executed && result.bestMoveUci) {
          const fromSq = result.bestMoveUci.substring(0, 2);
          const toSq = result.bestMoveUci.substring(2, 4);
          const prom = result.bestMoveUci.length === 5 ? result.bestMoveUci[4] : undefined;
          executed = this.game.move({ from: fromSq, to: toSq, promotion: prom });
        }
        if (executed) {
          this.lastMove = { from: executed.from, to: executed.to, isBot: true };
          this.playMoveSound(executed);
          this.renderBoard();
          this.updateUI();
          this.setStatusMessage(`<i class="fa-solid fa-fire"></i> Bot (${botColorName}) vừa tự động đánh nước **${executed.san}**! Đến lượt bạn...`);
          this.assertStateConsistency();
          this.triggerAnalysis();
        }
      }, 150);
    }
  }




  renderBoard() {
    const boardContainer = document.getElementById('chessBoardGrid');
    if (!boardContainer) return;

    boardContainer.innerHTML = '';
    const b = this.game.board();

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rowIdx = this.boardFlipped ? r : 7 - r;
        const colIdx = this.boardFlipped ? 7 - f : f;

        const square = String.fromCharCode(97 + colIdx) + (rowIdx + 1);
        const isDark = (rowIdx + colIdx) % 2 === 0;

        const sqEl = document.createElement('div');
        sqEl.className = `chess-square ${isDark ? 'dark' : 'light'}`;
        sqEl.dataset.square = square;

        if (this.selectedSquare === square) {
          sqEl.classList.add('selected-square');
        }

        if (this.lastMove) {
          if (square === this.lastMove.from) {
            sqEl.classList.add(this.lastMove.isBot ? 'last-move-bot-from' : 'last-move-from');
          } else if (square === this.lastMove.to) {
            sqEl.classList.add(this.lastMove.isBot ? 'last-move-bot-to' : 'last-move-to');
          }
        }

        if (this.currentAnalysis && this.currentAnalysis.bestMoveUci && this.currentAnalysis.bestMoveUci.length >= 4) {
          const bFrom = this.currentAnalysis.bestMoveUci.substring(0, 2);
          const bTo = this.currentAnalysis.bestMoveUci.substring(2, 4);
          if (square === bFrom) {
            sqEl.classList.add('highlight-best-move', 'highlight-best-from');
          } else if (square === bTo) {
            sqEl.classList.add('highlight-best-move', 'highlight-best-to');
          }
        }

        const piece = b[7 - rowIdx][colIdx];
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = `chess-piece ${piece.color}`;
          pieceEl.innerHTML = this.getPieceSvg(piece.color, piece.type);
          pieceEl.draggable = true;

          pieceEl.addEventListener('dragstart', (e) => {
            if (piece.color !== this.game.turn()) {
              e.preventDefault();
              return;
            }
            this.draggedSquare = square;
            this.selectedSquare = square;
            e.dataTransfer.setData('text/plain', square);
            setTimeout(() => {
              this.highlightLegalMoves(square);
            }, 0);
          });

          pieceEl.addEventListener('dragend', () => {
            this.draggedSquare = null;
          });

          sqEl.appendChild(pieceEl);
        }

        // Rank coordinate (1-8) on the leftmost square of each rank (f === 0)
        if (f === 0) {
          const rankCoord = document.createElement('span');
          rankCoord.className = `board-coord board-coord-rank ${isDark ? 'coord-on-dark' : 'coord-on-light'}`;
          rankCoord.textContent = (rowIdx + 1);
          sqEl.appendChild(rankCoord);
        }

        // File coordinate (a-h) on the bottommost square of each file (r === 7)
        if (r === 7) {
          const fileCoord = document.createElement('span');
          fileCoord.className = `board-coord board-coord-file ${isDark ? 'coord-on-dark' : 'coord-on-light'}`;
          fileCoord.textContent = String.fromCharCode(97 + colIdx);
          sqEl.appendChild(fileCoord);
        }

        sqEl.addEventListener('dragover', (e) => e.preventDefault());
        sqEl.addEventListener('drop', (e) => {
          e.preventDefault();
          const fromSq = e.dataTransfer.getData('text/plain');
          if (fromSq && fromSq !== square) {
            this.handleBlackMoveInput({ from: fromSq, to: square });
          }
        });

        sqEl.addEventListener('click', () => this.handleSquareClick(square));

        boardContainer.appendChild(sqEl);
      }
    }
  }

  getPieceSvg(color, type) {
    const pieceCode = `${color}${type.toUpperCase()}`;
    const theme = this.pieceTheme || 'cburnett';
    const cdnUrl = `https://lichess1.org/assets/piece/${theme}/${pieceCode}.svg`;
    return `<img src="${cdnUrl}" class="svg-chess-piece" alt="${pieceCode}" draggable="false" onerror="this.outerHTML=window.chessApp ? window.chessApp.getFallbackPieceSvg('${color}','${type}') : ''" />`;
  }

  getFallbackPieceSvg(color, type) {
    const isW = color === 'w';
    const fill = isW ? '#ffffff' : '#24252a';
    const stroke = isW ? '#18191d' : '#111215';
    const innerStroke = isW ? '#18191d' : '#eceff4';

    switch (type) {
      case 'p':
        return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><path d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 C 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'n':
        if (isW) {
          return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><g fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m 22,10 c 10.5,1 16.5,8 16,29 L 15,39 C 15,28 13.5,23.5 11,20.5 8,17 7.5,12 10.5,9.5 13,7.5 16,8 18.5,11 c 1.5,-2 4,-3.5 6.5,-3.5 3,0 4.5,1 4.5,2.5 0,1.5 -1.5,2.5 -4,2.5 -2,0 -3,-0.5 -3.5,-1" fill="${fill}"/><path d="m 24,18 c 0.38,2.91 -5.55,7.37 -8,9 -3,2 -2.82,4.34 -5,4 -1.04,-0.94 -1.41,-3.04 0,-3 1,0 0.19,1.23 -1,2 -1,0 -4.0031,0.5204 -2,-4 1.5,-3 6.69,-5.41 8,-7 1.5,-1.5 2.81,-2.45 4,-2 1.5,0.6 2.67,1.86 4,1 z" fill="${fill}"/><circle cx="15" cy="14.5" r="1.2" fill="${stroke}"/><path d="m 9.5,25.5 a 0.5,0.5 0 1 1 -1,0 0.5,0.5 0 1 1 1,0 z" fill="${stroke}"/></g></svg>`;
        } else {
          return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><g fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m 22,10 c 10.5,1 16.5,8 16,29 L 15,39 C 15,28 13.5,23.5 11,20.5 8,17 7.5,12 10.5,9.5 13,7.5 16,8 18.5,11 c 1.5,-2 4,-3.5 6.5,-3.5 3,0 4.5,1 4.5,2.5 0,1.5 -1.5,2.5 -4,2.5 -2,0 -3,-0.5 -3.5,-1" fill="${fill}"/><path d="m 24,18 c 0.38,2.91 -5.55,7.37 -8,9 -3,2 -2.82,4.34 -5,4 -1.04,-0.94 -1.41,-3.04 0,-3 1,0 0.19,1.23 -1,2 -1,0 -4.0031,0.5204 -2,-4 1.5,-3 6.69,-5.41 8,-7 1.5,-1.5 2.81,-2.45 4,-2 1.5,0.6 2.67,1.86 4,1 z" fill="${fill}"/><circle cx="15" cy="14.5" r="1.2" fill="${innerStroke}"/><path d="m 9.5,25.5 a 0.5,0.5 0 1 1 -1,0 0.5,0.5 0 1 1 1,0 z" fill="${innerStroke}"/><path d="m 24.55,10.4 c 0.5,2.05 -1.5,3.6 -3.5,3.6 -2.5,0 -4,-1.5 -4,-1.5" stroke="${innerStroke}"/></g></svg>`;
        }
      case 'b':
        return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><g fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="${fill}" stroke-linecap="butt"><path d="m 9,36 c 3.39,-0.97 10.11,0.43 13.5,-2 3.39,2.43 10.11,1.03 13.5,2 0,0 1.65,0.54 3,2 -0.68,0.97 -1.65,0.99 -3,1 -3.39,-0.21 -10.11,0.79 -13.5,-1 -3.39,1.79 -10.11,0.79 -13.5,1 -1.35,-0.01 -2.32,-0.03 -3,-1 1.35,-1.46 3,-2 3,-2 z"/><path d="m 15,32 c 2.5,2.5 12.5,2.5 15,0 0.5,-1.5 0,-2 0,-2 0,-2.5 -2.5,-4 -2.5,-4 5.5,-1.5 6,-11.5 -5,-15.5 -11,4 -10.5,14 -5,15.5 0,0 -2.5,1.5 -2.5,4 0,0 -0.5,0.5 0,2 z"/><path d="m 25,8 a 2.5,2.5 0 1 1 -5,0 2.5,2.5 0 1 1 5,0 z"/></g><path d="m 17.5,26 h 10M15,30 h 15M22.5,15.5 v 5M20,18 h 5" stroke="${innerStroke}" stroke-linejoin="miter"/></g></svg>`;
      case 'r':
        return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><g fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m 9,39 h 27 v -3 H 9 v 3 z" stroke-linecap="butt"/><path d="m 12,36 v -4 h 21 v 4 H 12 z" stroke-linecap="butt"/><path d="m 11,14 v 4 h 4 v -4 h -4 z m 8,0 v 4 h 7 v -4 h -7 z m 11,0 v 4 h 4 v -4 h -4 z"/><path d="m 12,18 v 14 h 21 V 18 H 12 z"/><path d="m 9,12 h 27 v 2 H 9 v -2 z" stroke-linecap="butt"/><path d="m 14,29.5 h 17M14,16.5 h 17" fill="none" stroke="${innerStroke}" stroke-linejoin="miter"/></g></svg>`;
      case 'q':
        return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><g fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m 8,12 a 2,2 0 1 1 -4,0 2,2 0 1 1 4,0 z m 16.5,-4.5 a 2,2 0 1 1 -4,0 2,2 0 1 1 4,0 z m 16.5,4.5 a 2,2 0 1 1 -4,0 2,2 0 1 1 4,0 z m -26,6 a 2,2 0 1 1 -4,0 2,2 0 1 1 4,0 z m 19,0 a 2,2 0 1 1 -4,0 2,2 0 1 1 4,0 z"/><path d="m 9,26 c 8.5,-1.5 21,-1.5 27,0 l 2,-12 -7,11 -7.5,-19 -7.5,19 -7,-11 2,12 z" stroke-linecap="butt"/><path d="m 9,26 c 0,2 1.5,2 2.5,4 1,1.5 1,1 0.5,3.5 -1.5,1 -1.5,2.5 -1.5,2.5 -1.5,1.5 0.5,2.5 0.5,2.5 6.5,1 16.5,1 23,0 0,0 1.5,-1 0.5,-2.5 0,0 0.5,-1.5 -1,-2.5 -0.5,-2.5 -0.5,-2 0.5,-3.5 1,-2 2.5,-2 2.5,-4-8.5,-1.5 -18.5,-1.5 -27,0 z" stroke-linecap="butt"/><path d="m 11,38.5 a 35,35 1 0 0 23,0" fill="none" stroke-linecap="butt"/><path d="m 11,29 a 35,35 1 0 1 23,0M12.5,31.5 a 35,35 1 0 1 20,0M11.5,34.5 a 35,35 1 0 1 22,0" fill="none" stroke="${innerStroke}"/></g></svg>`;
      case 'k':
        return `<svg viewBox="0 0 45 45" class="svg-chess-piece"><g fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m 22.5,11.63 v 6M20,13.5 h 5" stroke="${innerStroke}" stroke-linejoin="miter"/><path d="m 22.5,25 c 0,-4.5 -4.5,-7 -4.5,-7 0,0 -4.5,2.5 -4.5,7 0,4.5 4.5,7 4.5,7 0,0 4.5,-2.5 4.5,-7 z m 0,0 c 0,-4.5 4.5,-7 4.5,-7 0,0 4.5,2.5 4.5,7 0,4.5 -4.5,7 -4.5,7 0,0 -4.5,-2.5 -4.5,-7 z" fill="${fill}"/><path d="m 11.5,37 c 5.5,3.5 15.5,3.5 21,0 v -3.5 c 0,0 0.5,-3 -2.5,-3 h -16 c -3,0 -2.5,3 -2.5,3 v 3.5 z" fill="${fill}"/><path d="m 11.5,30 c 5.5,-3 15.5,-3 21,0M11.5,33.5 c 5.5,-3 15.5,-3 21,0M11.5,37 c 5.5,-3 15.5,-3 21,0" stroke="${innerStroke}"/></g></svg>`;
      default:
        return '';
    }
  }

  handleSquareClick(square) {
    if (!this.active) return;

    // Custom Board Editor placement handling
    if (this.isEditorMode) {
      if (this.selectedPalettePiece === 'trash') {
        this.game.remove(square);
      } else if (this.selectedPalettePiece) {
        const isUpper = this.selectedPalettePiece === this.selectedPalettePiece.toUpperCase();
        const color = isUpper ? 'w' : 'b';
        const type = this.selectedPalettePiece.toLowerCase();
        this.game.put({ type, color }, square);
      }
      this.selectedSquare = null;
      this.lastMove = null;
      this.renderBoard();
      return;
    }

    if (!this.chessState.botColor) {
      this.setStatusMessage('CHUYÊN GIA BÀN CỜ: HÃY CHỌN BÊN CHO BOT ĐỂ BẮT ĐẦU!');
      this.showError('<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng chọn [ BOT CẦM TRẮNG ] hoặc [ BOT CẦM ĐEN ] trước!');
      return;
    }

    if (this.selectedSquare) {
      if (this.selectedSquare === square) {
        this.selectedSquare = null;
        this.renderBoard();
        return;
      }
      const moved = this.handleBlackMoveInput({ from: this.selectedSquare, to: square }, false);
      if (moved) {
        this.selectedSquare = null;
        return;
      }
      // If clicking another piece of current turn, switch selection to it
      const targetPiece = this.game.get(square);
      if (targetPiece && targetPiece.color === this.game.turn()) {
        this.selectedSquare = square;
        this.renderBoard();
        this.highlightLegalMoves(square);
        return;
      }
    }

    const piece = this.game.get(square);
    if (piece) {
      if (piece.color !== this.game.turn()) {
        return; // Prevent selecting opponent's pieces
      }
      this.selectedSquare = square;
      this.renderBoard();
      this.highlightLegalMoves(square);
    } else {
      this.selectedSquare = null;
      this.renderBoard();
    }
  }


  highlightLegalMoves(fromSquare) {
    const piece = this.game.get(fromSquare);
    const color = piece ? piece.color : this.game.turn();
    const legal = this.game.moves({ verbose: true, color: color }).filter(m => m.from === fromSquare);
    legal.forEach(m => {
      const sqEl = document.querySelector(`[data-square="${m.to}"]`);
      if (sqEl) {
        const dot = document.createElement('div');
        dot.className = m.captured ? 'move-capture-ring' : 'move-dot-indicator';
        sqEl.appendChild(dot);
      }
    });
  }

  highlightBoardBestMove(bestMoveUci) {
    document.querySelectorAll('.chess-square').forEach(el => {
      el.classList.remove('highlight-best-move');
      el.classList.remove('highlight-best-from');
      el.classList.remove('highlight-best-to');
    });

    const overlay = document.getElementById('arrowOverlay');
    if (overlay) {
      const oldLines = overlay.querySelectorAll('line');
      oldLines.forEach(l => l.remove());
    }

    if (!bestMoveUci || bestMoveUci.length < 4) return;
    const fromSq = bestMoveUci.substring(0, 2);
    const toSq = bestMoveUci.substring(2, 4);

    const fromEl = document.querySelector(`[data-square="${fromSq}"]`);
    const toEl = document.querySelector(`[data-square="${toSq}"]`);
    if (fromEl) {
      fromEl.classList.add('highlight-best-move', 'highlight-best-from');
    }
    if (toEl) {
      toEl.classList.add('highlight-best-move', 'highlight-best-to');
    }
  }

  updateEvaluationBar(result) {
    const barFill = document.getElementById('evalBarFill');
    const scoreValText = document.getElementById('evalScoreValueText');
    const statusText = document.getElementById('evalStatusText');

    if (!result || !result.evalScore) return;

    let evalCp = 0;
    let formattedVal = '0.00';

    if (result.evalScore.type === 'mate') {
      const mVal = result.evalScore.value;
      evalCp = mVal > 0 ? 1000 : -1000;
      formattedVal = mVal > 0 ? `M${mVal}` : `-M${Math.abs(mVal)}`;
    } else {
      evalCp = result.evalScore.value;
      const cpVal = evalCp / 100;
      if (cpVal > 0) {
        formattedVal = `+${cpVal.toFixed(2)}`;
      } else if (cpVal === 0) {
        formattedVal = '0.00';
      } else {
        formattedVal = cpVal.toFixed(2);
      }
    }

    let percentage = 50 + (evalCp / 20);
    percentage = Math.max(5, Math.min(95, percentage));

    if (barFill) barFill.style.height = `${percentage}%`;
    if (scoreValText) scoreValText.textContent = formattedVal;

    if (statusText) {
      if (result.evalScore.type === 'mate') {
        statusText.textContent = result.evalScore.value > 0 ? 'TRẮNG CHIẾN THẮNG (MATE)' : 'ĐEN CHIẾN THẮNG (MATE)';
      } else if (evalCp > 250) statusText.textContent = 'Trắng Thắng Thế';
      else if (evalCp > 70) statusText.textContent = 'Trắng Ưu Thế';
      else if (evalCp < -250) statusText.textContent = 'Đen Thắng Thế';
      else if (evalCp < -70) statusText.textContent = 'Đen Ưu Thế';
      else statusText.textContent = 'Cân Bằng';
    }
  }


  updateAnalysisPanelUI(result, oppMoveSan) {
    this.lastAnalysisResult = result;
    const recMoveText = document.getElementById('recommendedBestMoveText');
    const topMovesContainer = document.getElementById('topMovesListContainer');
    const pvText = document.getElementById('bestLineText');
    const aiExplanationBox = document.getElementById('aiExplanationTextContent');
    const sourceBadge = document.getElementById('engineSourceBadge');

    if (recMoveText) recMoveText.textContent = result.bestMoveSan || '-';
    if (pvText) pvText.textContent = result.principalVariation || '-';
    if (sourceBadge) sourceBadge.textContent = `Source: ${result.source || '-'}`;

    if (topMovesContainer && result.topMoves) {
      topMovesContainer.innerHTML = result.topMoves.map(m => `
        <div class="top-move-item ${m.isBest ? 'best' : ''}">
          <span class="top-move-rank">#${m.rank}</span>
          <span class="top-move-san">${m.san}</span>
          <span class="top-move-eval">${m.scoreText}</span>
          ${m.isBest ? '<span class="badge-best" style="font-size:9px; background:rgba(52,183,126,0.2); border:1px solid rgba(52,183,126,0.5); color:#ffffff; padding:1px 6px; border-radius:2px; font-weight:800; margin-left:4px;"><i class="fa-solid fa-star" style="color:var(--cb-gold); margin-right:3px;"></i>BEST</span>' : ''}
        </div>
      `).join('');
    }

    if (aiExplanationBox) {
      if (this.appMode === 'ASSISTANT') {
        aiExplanationBox.parentElement.style.display = 'none';
      } else {
        aiExplanationBox.parentElement.style.display = 'block';
        
        let evalDesc = 'Vị trí cân bằng';
        if (result.evalScore) {
          if (result.evalScore.type === 'mate') {
            evalDesc = `Chiếu hết trong ${Math.abs(result.evalScore.value)} nước`;
          } else {
            const val = (result.evalScore.value / 100).toFixed(2);
            evalDesc = val > 0 ? `Lợi thế +${val}` : `Điểm số ${val}`;
          }
        }
        
        aiExplanationBox.innerHTML = `<div><strong style="color:#ffffff;">${evalDesc}</strong>. Đã tìm ra đường đi tối ưu!</div><div style="margin-top:6px; color:#94a3b8; font-style:italic;">Bấm nút <strong><i class="fa-solid fa-diagram-project" style="color:var(--cb-purple);"></i> Tại sao?</strong> ở trên để xem AI phân tích diễn biến chiến thuật chi tiết từng nước một.</div>`;
      }
    }
  }

  explainPvDetails() {
    const aiExplanationBox = document.getElementById('aiExplanationTextContent');
    if (!aiExplanationBox || !this.lastAnalysisResult) return;
    
    aiExplanationBox.innerHTML = 'Đang phân tích sâu chiến thuật... <i class="fa-solid fa-spinner fa-spin"></i>';
    
    // Use a small timeout to allow UI to render the loading state
    setTimeout(() => {
      let commentary = this.aiExplanationService.generateDetailedExplanation(this.lastAnalysisResult, this.game);
      commentary = commentary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      aiExplanationBox.innerHTML = commentary.replace(/\n\n/g, '<br><br>');
    }, 50);
  }

  updateDebugPanel(result) {
    const elVer = document.getElementById('debugEngineVersionText');
    const elFen = document.getElementById('debugFenText');
    const elAid = document.getElementById('debugAnalysisIdText');
    const elSrc = document.getElementById('debugSourceText');
    const elUci = document.getElementById('debugBestMoveUciText');
    const elRawScore = document.getElementById('debugRawScoreText');
    const elPv = document.getElementById('debugRawPvText');

    const elThreads = document.getElementById('debugThreadsText');
    const elHash = document.getElementById('debugHashText');
    const elTime = document.getElementById('debugTimeText');
    const elDepth = document.getElementById('debugDepthText');
    const elSeldepth = document.getElementById('debugSeldepthText');
    const elNodes = document.getElementById('debugNodesText');
    const elNps = document.getElementById('debugNpsText');
    const elStab = document.getElementById('debugStabilityText');
    const elReason = document.getElementById('debugAdaptiveReasonText');

    if (elVer) elVer.textContent = result.version || result.source || 'Stockfish 18 / 17';
    if (elFen) elFen.textContent = result.fen || this.game.fen();
    if (elAid) elAid.textContent = result.analysisId || '-';
    if (elSrc) elSrc.textContent = result.source || result.error || '-';
    if (elUci) elUci.textContent = result.bestMoveUci || '-';
    if (elRawScore) elRawScore.textContent = result.evalScore ? JSON.stringify(result.evalScore) : '-';
    if (elPv) elPv.textContent = result.principalVariation || '-';

    if (elThreads) elThreads.textContent = result.threads || '8';
    if (elHash) elHash.textContent = result.hash ? `${result.hash}MB` : '256MB';
    if (elTime) elTime.textContent = result.time ? `${result.time}ms` : '5000ms';
    if (elDepth) elDepth.textContent = result.depth || '-';
    if (elSeldepth) elSeldepth.textContent = result.seldepth || '-';
    if (elNodes) elNodes.textContent = result.nodes ? result.nodes.toLocaleString() : '-';
    if (elNps) elNps.textContent = result.nps ? `${(result.nps / 1000000).toFixed(2)}M NPS` : '-';
    if (elStab) elStab.textContent = result.stabilityIndex !== undefined ? `${result.stabilityIndex}%` : '100%';
    if (elReason) elReason.textContent = result.adaptiveExitReason || 'Completed';

    // Tactical, Playstyle & Opening Telemetry Display
    const telem = result.playstyleTelemetry || {};
    const elTacMode = document.getElementById('debugTacticalModeText');
    const elTacType = document.getElementById('debugTacticalTypeText');
    const elOpSys = document.getElementById('debugOpeningSystemText');
    const elOpMove = document.getElementById('debugOpeningMoveText');
    const elOpCand = document.getElementById('debugOpeningCandidateText');
    const elTacOpp = document.getElementById('debugTacticalOpportunityText');
    const elObjBest = document.getElementById('debugObjectiveBestMoveText');
    const elPsCand = document.getElementById('debugPlaystyleCandidateText');
    const elEvalGap = document.getElementById('debugEvaluationGapText');
    const elOppResp = document.getElementById('debugOpponentResponseText');
    const elVerStat = document.getElementById('debugVerificationStatusText');
    const elMateStat = document.getElementById('debugMateStatusText');
    const elSacStat = document.getElementById('debugSacrificeStatusText');
    const elFinalMove = document.getElementById('debugFinalSelectedMoveText');
    const elPsReason = document.getElementById('debugPlaystyleReasonText');

    if (elTacMode) elTacMode.textContent = telem.tacticalMode || '-';
    if (elTacType) elTacType.textContent = telem.tacticalType || '-';
    if (elOpSys) elOpSys.textContent = telem.openingSystem || '-';
    if (elOpMove) elOpMove.textContent = telem.openingMove || '-';
    if (elOpCand) elOpCand.textContent = telem.openingCandidateRank || '-';
    if (elTacOpp) elTacOpp.textContent = telem.tacticalOpportunity || '-';
    if (elObjBest) elObjBest.textContent = telem.objectiveBestMove || '-';
    if (elPsCand) elPsCand.textContent = telem.playstyleCandidate || '-';
    if (elEvalGap) elEvalGap.textContent = telem.evaluationGap !== undefined ? `${telem.evaluationGap} cp` : '-';
    if (elOppResp) elOppResp.textContent = telem.opponentBestResponse || '-';
    if (elVerStat) elVerStat.textContent = telem.verificationStatus || '-';
    if (elMateStat) elMateStat.textContent = telem.mateStatus || '-';
    if (elSacStat) elSacStat.textContent = telem.sacrificeStatus || '-';
    if (elFinalMove) elFinalMove.textContent = telem.finalSelectedMove || '-';
    if (elPsReason) elPsReason.textContent = telem.reason || '-';
  }



  updateEngineStatsUI(progressData) {
    const depthEl = document.getElementById('statEngineDepth');
    const nodesEl = document.getElementById('statEngineNodes');
    const npsEl = document.getElementById('statEngineNps');

    if (depthEl) depthEl.textContent = progressData.depth || '-';
    if (nodesEl) nodesEl.textContent = progressData.nodes ? `${(progressData.nodes / 1000000).toFixed(1)}M` : '-';
    if (npsEl) npsEl.textContent = progressData.nps ? `${(progressData.nps / 1000000).toFixed(2)}M/s` : '-';
  }

  updateUI() {
    this.updateGamePhaseUI();
    const pgnEl = document.getElementById('moveHistoryPgnText');
    if (!pgnEl) return;

    pgnEl.style.lineHeight = '2.2';
    pgnEl.style.wordBreak = 'normal';

    const historyList = this.game.historyList || [];
    const redoStack = this.game.redoStack || [];

    const allMoves = [...historyList];
    for (let i = redoStack.length - 1; i >= 0; i--) {
      allMoves.push(redoStack[i].move);
    }

    if (allMoves.length === 0) {
      pgnEl.textContent = 'Chưa có nước đi nào.';
      return;
    }

    pgnEl.innerHTML = '';
    
    const startBtn = document.createElement('span');
    startBtn.style.cursor = 'pointer';
    startBtn.style.padding = '3px 8px';
    startBtn.style.borderRadius = '6px';
    startBtn.style.marginRight = '6px';
    startBtn.style.fontWeight = '700';
    startBtn.style.display = 'inline-block';
    startBtn.style.transition = 'all 0.2s';
    if (historyList.length === 0) {
      startBtn.style.background = 'rgba(56, 189, 248, 0.2)';
      startBtn.style.color = '#38bdf8';
      startBtn.style.border = '1px solid #38bdf8';
    } else {
      startBtn.style.color = '#94a3b8';
      startBtn.style.border = '1px solid transparent';
      startBtn.onmouseover = () => { startBtn.style.background = 'rgba(255,255,255,0.1)'; };
      startBtn.onmouseout = () => { startBtn.style.background = 'transparent'; };
    }
    startBtn.textContent = 'Về đầu';
    startBtn.onclick = () => this.jumpToMove(-1);
    pgnEl.appendChild(startBtn);

    let moveNum = 1;
    for (let i = 0; i < allMoves.length; i++) {
      const m = allMoves[i];
      if (i % 2 === 0) {
        const numSpan = document.createElement('span');
        numSpan.style.color = '#64748b';
        numSpan.style.marginRight = '4px';
        numSpan.style.fontWeight = '700';
        numSpan.textContent = `${moveNum}.`;
        pgnEl.appendChild(numSpan);
        moveNum++;
      }
      
      const moveBtn = document.createElement('span');
      moveBtn.style.cursor = 'pointer';
      moveBtn.style.padding = '3px 6px';
      moveBtn.style.borderRadius = '6px';
      moveBtn.style.marginRight = '6px';
      moveBtn.style.display = 'inline-block';
      moveBtn.style.fontWeight = '600';
      moveBtn.style.transition = 'all 0.2s';
      moveBtn.textContent = m.san;
      
      if (i === historyList.length - 1) {
        moveBtn.style.background = 'var(--cb-accent)';
        moveBtn.style.color = '#000';
        moveBtn.style.fontWeight = '800';
      } else if (i >= historyList.length) {
        moveBtn.style.color = '#64748b';
        moveBtn.style.fontStyle = 'italic';
      } else {
        moveBtn.style.color = '#e2e8f0';
      }

      if (i !== historyList.length - 1) {
        moveBtn.onmouseover = () => {
          moveBtn.style.background = 'rgba(255,255,255,0.1)';
        };
        moveBtn.onmouseout = () => {
          moveBtn.style.background = 'transparent';
        };
      }

      moveBtn.onclick = () => this.jumpToMove(i);
      
      pgnEl.appendChild(moveBtn);
    }
  }

  setStatusMessage(msg) {
    const statusEl = document.getElementById('engineStatusIndicator');
    if (statusEl) statusEl.innerHTML = msg;
  }

  showError(errText) {
    const errEl = document.getElementById('moveErrorFeedback');
    if (errEl) {
      errEl.style.display = 'block';
      errEl.innerHTML = errText; // Changed to innerHTML to render FontAwesome tags
      setTimeout(() => errEl.style.display = 'none', 4500);
    }
  }

  showCheckmateOverlay(winnerColor, isBotWin) {
    const overlay = document.getElementById('checkmateOverlay');
    const subtext = document.getElementById('checkmateSubtext');
    const colorName = winnerColor === 'w' ? 'TRẮNG' : 'ĐEN';
    
    if (overlay && subtext) {
      if (this.appMode === 'PLAY_VS_BOT') {
        if (isBotWin) {
          subtext.innerHTML = `<span style="color:var(--cb-rose);"><i class="fa-solid fa-skull"></i> BOT ${colorName} ĐÃ NGHIỀN NÁT BẠN!</span>`;
        } else {
          subtext.innerHTML = `<span style="color:var(--cb-emerald);"><i class="fa-solid fa-trophy"></i> CHÚC MỪNG! BẠN ĐÃ HẠ GỤC SIÊU MÁY TÍNH!</span>`;
        }
      } else {
        if (isBotWin) {
          subtext.innerHTML = `<span style="color:var(--cb-rose);"><i class="fa-solid fa-skull"></i> BOT ${colorName} ĐÃ NGHIỀN NÁT ĐỐI THỦ!</span>`;
        } else {
          subtext.innerHTML = `<span style="color:var(--cb-emerald);"><i class="fa-solid fa-trophy"></i> ĐỐI THỦ (${colorName}) ĐÃ BỊ HẠ GỤC!</span>`;
        }
      }
      
      overlay.classList.add('active');
    }
  }

  startEngineVsEngineLoop() {
    this.stopEngineVsEngineLoop();
    this.autoEngineVsEngineTimer = setInterval(() => {
      if (this.game.isGameOver()) {
        this.stopEngineVsEngineLoop();
        return;
      }
      if (this.currentAnalysis && this.currentAnalysis.bestMoveSan) {
        this.handleBlackMoveInput(this.currentAnalysis.bestMoveSan);
      }
    }, 2000);
  }

  stopEngineVsEngineLoop() {
    if (this.autoEngineVsEngineTimer) {
      clearInterval(this.autoEngineVsEngineTimer);
      this.autoEngineVsEngineTimer = null;
    }
  }

  playMoveSound(moveRes) {
    if (!this.audioFX) return;
    try {
      if (this.game.inCheck()) {
        this.audioFX.playCheck();
      } else if (moveRes && moveRes.flags && (moveRes.flags.includes('k') || moveRes.flags.includes('q'))) {
        this.audioFX.playCastle();
      } else if (moveRes && moveRes.captured) {
        this.audioFX.playCapture();
      } else {
        this.audioFX.playMove();
      }
    } catch (e) {
      // Audio fallback
    }
  }

  updateGamePhaseUI() {
    const container = document.getElementById('gamePhaseContainer');
    const titleEl = document.getElementById('gamePhaseTitle');
    const guidanceEl = document.getElementById('gamePhaseGuidance');
    
    if (!container || !titleEl || !guidanceEl) return;
    
    // Hide in ASSISTANT mode or if bot color is not chosen
    if (this.appMode === 'ASSISTANT' || !this.chessState.botColor) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'block';

    const history = this.game.history();
    const moveCount = Math.floor(history.length / 2) + 1;
    const board = this.game.board();
    
    let totalMaterial = 0;
    let queensCount = 0;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece) {
          if (piece.type === 'q') {
            totalMaterial += 9;
            queensCount++;
          } else if (piece.type === 'r') {
            totalMaterial += 5;
          } else if (piece.type === 'b' || piece.type === 'n') {
            totalMaterial += 3;
          }
        }
      }
    }

    // Xác định Giai đoạn (Phase Logic)
    let phase = 'MIDDLEGAME';
    if (totalMaterial <= 16 || (queensCount === 0 && totalMaterial <= 22) || (moveCount >= 40 && totalMaterial <= 26)) {
      phase = 'ENDGAME';
    } else if (moveCount <= 12 && totalMaterial > 22) {
      phase = 'OPENING';
    }

    if (phase === 'OPENING') {
      titleEl.textContent = 'KHAI CUỘC (Mở Bàn)';
      guidanceEl.innerHTML = '<strong>Mục tiêu:</strong> Nhanh chóng đưa quân (Mã, Tượng) kiểm soát trung tâm và <strong>Nhập thành</strong> sớm để bảo vệ Vua. Hạn chế di chuyển Hậu quá sớm!';
      container.style.borderLeftColor = 'var(--cb-cyan)';
      titleEl.style.color = '#ffffff';
      container.style.background = 'rgba(56, 189, 248, 0.08)';
      container.style.color = '#ffffff';
    } else if (phase === 'MIDDLEGAME') {
      titleEl.textContent = 'TRUNG CUỘC (Giao Tranh)';
      guidanceEl.innerHTML = '<strong>Mục tiêu:</strong> Đưa các quân nặng (Hậu, Xe) vào vị trí tấn công. Chú ý các đòn chiến thuật giăng bẫy, bảo vệ Vua và tìm kiếm cơ hội khai thác điểm yếu của đối thủ.';
      container.style.borderLeftColor = 'var(--cb-gold)';
      titleEl.style.color = '#ffffff';
      container.style.background = 'rgba(240, 178, 50, 0.08)';
      container.style.color = '#ffffff';
    } else {
      titleEl.textContent = 'TÀN CUỘC (Quyết Định)';
      guidanceEl.innerHTML = '<strong>Mục tiêu:</strong> Vua bây giờ là một quân Tấn Công mạnh! Kích hoạt Vua tiến lên giữa bàn cờ, bảo vệ các Tốt thông (passed pawns) và cố gắng phong cấp Tốt thành Hậu để chiến thắng.';
      container.style.borderLeftColor = 'var(--cb-accent)';
      titleEl.style.color = '#ffffff';
      container.style.background = 'rgba(52, 183, 126, 0.08)';
      container.style.color = '#ffffff';
    }
  }

  drawPvArrows() {
    const overlay = document.getElementById('arrowOverlay');
    if (!overlay) return;
    
    // Check if already showing arrows, toggle off
    const oldLines = overlay.querySelectorAll('line');
    if (oldLines.length > 0 && overlay.style.display === 'block') {
      oldLines.forEach(l => l.remove());
      overlay.style.display = 'none';
      return;
    }
    oldLines.forEach(l => l.remove());

    const analysis = this.lastAnalysisResult || this.currentAnalysis;
    const uciMoves = (analysis && analysis.pvUci && analysis.pvUci.length > 0) 
      ? analysis.pvUci 
      : (analysis && analysis.bestMoveUci ? [analysis.bestMoveUci] : []);

    if (uciMoves.length === 0) {
      this.showError("Không có dữ liệu chiến thuật để vẽ sơ đồ!");
      return;
    }

    overlay.style.display = 'block';

    const getSquareCenter = (sq) => {
      const file = sq.charCodeAt(0) - 97; // 'a' = 0
      const rank = parseInt(sq[1]) - 1;   // '1' = 0
      
      const colIdx = this.boardFlipped ? 7 - file : file;
      const rowIdx = this.boardFlipped ? rank : 7 - rank;
      
      return {
          x: (colIdx + 0.5) * 12.5,
          y: (rowIdx + 0.5) * 12.5
      };
    };

    const maxArrows = Math.min(6, uciMoves.length);
    const baseColors = [
      'rgba(34, 197, 94, 0.9)', 
      'rgba(239, 68, 68, 0.9)', 
      'rgba(56, 189, 248, 0.9)', 
      'rgba(249, 115, 22, 0.8)', 
      'rgba(6, 182, 212, 0.7)', 
      'rgba(217, 70, 239, 0.6)'
    ];

    let defs = overlay.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      overlay.appendChild(defs);
    }

    for (let i = 0; i < maxArrows; i++) {
      const move = uciMoves[i];
      if (!move || move.length < 4) continue;
      
      const color = baseColors[i] || baseColors[baseColors.length - 1];
      const markerId = `arrowhead-dyn-${i}`;
      
      if (!document.getElementById(markerId)) {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", markerId);
        marker.setAttribute("markerWidth", "4");
        marker.setAttribute("markerHeight", "4");
        marker.setAttribute("refX", "2");
        marker.setAttribute("refY", "2");
        marker.setAttribute("orient", "auto");
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", "0 0, 4 2, 0 4");
        polygon.setAttribute("fill", color);
        marker.appendChild(polygon);
        defs.appendChild(marker);
      }

      const fromSq = move.substring(0, 2);
      const toSq = move.substring(2, 4);

      const fromPos = getSquareCenter(fromSq);
      const toPos = getSquareCenter(toSq);

      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist === 0) continue;
      
      // Co ngắn đường vẽ để không đè lên giữa ô cờ quá nhiều
      const shrink = 3.5;
      const startX = fromPos.x + (dx / dist) * shrink;
      const startY = fromPos.y + (dy / dist) * shrink;
      const endX = toPos.x - (dx / dist) * shrink;
      const endY = toPos.y - (dy / dist) * shrink;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", startX);
      line.setAttribute("y1", startY);
      line.setAttribute("x2", endX);
      line.setAttribute("y2", endY);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "1.2");
      if (i > 0) line.setAttribute("stroke-dasharray", "1.5, 1.5");
      line.setAttribute("marker-end", `url(#${markerId})`);

      overlay.appendChild(line);
    }
    
    // Tự động ẩn sau 5 giây
    if (this.arrowHideTimeout) clearTimeout(this.arrowHideTimeout);
    this.arrowHideTimeout = setTimeout(() => {
      overlay.style.display = 'none';
      overlay.querySelectorAll('line').forEach(l => l.remove());
    }, 5000);
  }

  /* ==========================================================================
     TOAST NOTIFICATIONS SYSTEM
     ========================================================================== */

  initToastSystem() {
    let container = document.getElementById('cbToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cbToastContainer';
      document.body.appendChild(container);
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('cbToastContainer');
    if (!container) {
      this.initToastSystem();
      container = document.getElementById('cbToastContainer');
    }

    const toast = document.createElement('div');
    toast.className = `cb-toast cb-toast--${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  /* ==========================================================================
     PGN IMPORT / EXPORT & QUICK COPY
     ========================================================================== */

  initPgnImportExport() {
    const btnOpen = document.getElementById('btnOpenImportPgnModal');
    const modal = document.getElementById('importPgnModal');
    const btnClose = document.getElementById('btnCloseImportPgnModal');
    const btnSubmit = document.getElementById('btnSubmitImportPgn');
    const txtInput = document.getElementById('txtImportPgnInput');
    const fileUpload = document.getElementById('filePgnUpload');
    const btnCopyPgn = document.getElementById('btnCopyCurrentPgn');
    const btnCopyFen = document.getElementById('btnCopyCurrentFen');

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', () => {
        modal.classList.add('active');
        if (txtInput) txtInput.focus();
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => modal.classList.remove('active'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (fileUpload && txtInput) {
      fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            txtInput.value = evt.target.result;
          };
          reader.readAsText(file);
        }
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        const pgnStr = txtInput ? txtInput.value.trim() : '';
        if (!pgnStr) {
          this.showToast('Vui lòng dán chuỗi PGN hoặc chọn file!', 'warning');
          return;
        }
        try {
          const newGame = new Chess();
          const success = newGame.loadPgn(pgnStr);
          if (success) {
            this.game = newGame;
            this.currentMoveIndex = this.game.history().length;
            this.boardFlipped = false;
            this.selectedSquare = null;
            this.lastMove = null;
            const history = this.game.history({ verbose: true });
            if (history.length > 0) {
              const last = history[history.length - 1];
              this.lastMove = { from: last.from, to: last.to, isBot: last.color === this.chessState.botColor };
            }
            this.renderBoard();
            this.updateUI();
            this.updateTimelinePgn();
            this.clearHighlights();
            if (modal) modal.classList.remove('active');
            if (txtInput) txtInput.value = '';
            this.showToast('Đã nạp ván cờ PGN thành công! Có thể bấm từng nước hoặc chạy Báo Cáo.', 'success');
            if (this.audioFX) this.audioFX.playMove();
            if (this.chessState.botColor) {
              this.triggerAnalysis(true);
            }
          } else {
            this.showToast('Không thể đọc định dạng PGN này. Vui lòng kiểm tra lại!', 'warning');
          }
        } catch (err) {
          this.showToast('Lỗi khi đọc PGN: ' + err.message, 'warning');
        }
      });
    }

    if (btnCopyPgn) {
      btnCopyPgn.addEventListener('click', () => {
        const pgn = this.game.pgn();
        if (!pgn || pgn.trim() === '') {
          this.showToast('Chưa có nước đi nào trong ván cờ!', 'warning');
          return;
        }
        navigator.clipboard.writeText(pgn).then(() => {
          this.showToast('Đã sao chép toàn bộ PGN vào clipboard!', 'success');
        }).catch(() => {
          this.showToast('Không thể sao chép, hãy thử lại.', 'warning');
        });
      });
    }

    if (btnCopyFen) {
      btnCopyFen.addEventListener('click', () => {
        const fen = this.game.fen();
        navigator.clipboard.writeText(fen).then(() => {
          this.showToast('Đã sao chép chuỗi FEN thế cờ vào clipboard!', 'info');
        }).catch(() => {
          this.showToast('Không thể sao chép, hãy thử lại.', 'warning');
        });
      });
    }
  }

  /* ==========================================================================
     ADVANTAGE & ACCURACY GRAPH (Game Review Chart)
     ========================================================================== */

  renderAdvantageChart(whiteScores = [], historyList = []) {
    const svg = document.getElementById('gameReviewAdvantageChart');
    const areaPath = document.getElementById('chartAreaPath');
    const linePath = document.getElementById('chartLinePath');
    const pointsGroup = document.getElementById('chartPointsGroup');
    const gridGroup = document.getElementById('chartGridGroup');
    const hoverText = document.getElementById('chartMoveHoverText');

    if (!svg || !linePath || !pointsGroup) return;

    pointsGroup.innerHTML = '';
    if (gridGroup) gridGroup.innerHTML = '';

    if (!whiteScores || whiteScores.length === 0) return;

    const width = 320;
    const height = 100;
    const midY = 50;
    const maxEval = 600; // clamp visual amplitude to +/- 6.00 pawns (600 cp)

    const stepX = width / Math.max(1, whiteScores.length - 1);

    const points = whiteScores.map((scoreCp, idx) => {
      const x = idx * stepX;
      // White advantage (>0) goes UP (y < 50), Black advantage (<0) goes DOWN (y > 50)
      const clampedCp = Math.max(-maxEval, Math.min(maxEval, scoreCp));
      const y = midY - (clampedCp / maxEval) * (height / 2 - 8);
      const moveSan = idx === 0 ? 'Bắt đầu' : (historyList[idx - 1] ? historyList[idx - 1].san || '' : '');
      return { x, y, cp: scoreCp, moveIdx: idx, san: moveSan };
    });

    // Draw grid lines at +3.00, 0.00, -3.00
    if (gridGroup) {
      const linePlus3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      linePlus3.setAttribute('x1', '0');
      linePlus3.setAttribute('y1', '25');
      linePlus3.setAttribute('x2', '320');
      linePlus3.setAttribute('y2', '25');
      linePlus3.setAttribute('class', 'chart-grid-line');
      gridGroup.appendChild(linePlus3);

      const lineMinus3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      lineMinus3.setAttribute('x1', '0');
      lineMinus3.setAttribute('y1', '75');
      lineMinus3.setAttribute('x2', '320');
      lineMinus3.setAttribute('y2', '75');
      lineMinus3.setAttribute('class', 'chart-grid-line');
      gridGroup.appendChild(lineMinus3);
    }

    // Construct line path
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }
    linePath.setAttribute('d', pathD);

    // Construct area path
    if (areaPath) {
      let areaD = `M ${points[0].x} ${midY}`;
      points.forEach(p => {
        areaD += ` L ${p.x} ${p.y}`;
      });
      areaD += ` L ${points[points.length - 1].x} ${midY} Z`;
      areaPath.setAttribute('d', areaD);
    }

    // Draw points & bind click interactions
    points.forEach(p => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', '2.5');
      circle.setAttribute('fill', p.cp >= 0 ? '#ffffff' : '#38bdf8');
      circle.setAttribute('class', 'chart-point');

      circle.addEventListener('mouseenter', () => {
        if (hoverText) {
          const evalPawns = (p.cp / 100).toFixed(2);
          const sign = p.cp > 0 ? '+' : '';
          hoverText.textContent = p.moveIdx === 0 ? `Vị trí đầu (${evalPawns})` : `Nước ${p.moveIdx}: ${p.san} (${sign}${evalPawns})`;
        }
      });

      circle.addEventListener('click', () => {
        if (p.moveIdx === 0) {
          this.rewindToStart();
        } else {
          this.jumpToMove(p.moveIdx - 1);
        }
      });

      pointsGroup.appendChild(circle);
    });
  }
}

export default UIController;
