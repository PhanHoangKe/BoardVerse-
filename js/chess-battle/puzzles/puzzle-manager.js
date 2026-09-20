import { PUZZLE_DATABASE } from './puzzle-database.js';

export class PuzzleManager {
  constructor(uiController) {
    this.ui = uiController;
    this.puzzles = PUZZLE_DATABASE;
    this.currentIndex = 0;
    this.stepIndex = 0;
    this.active = false;
    this.currentPuzzle = null;
    this.solvedCount = 0;
  }

  start() {
    this.active = true;
    this.currentIndex = 0;
    this.loadPuzzle(this.currentIndex);
  }

  stop() {
    this.active = false;
    this.currentPuzzle = null;
  }

  loadPuzzle(index) {
    if (index < 0 || index >= this.puzzles.length) {
      index = 0;
    }
    this.currentIndex = index;
    this.stepIndex = 0;
    this.currentPuzzle = this.puzzles[this.currentIndex];

    // Load FEN into game
    this.ui.game.load(this.currentPuzzle.fen);
    this.ui.board.position(this.currentPuzzle.fen, true);
    this.ui.board.orientation(this.currentPuzzle.turn === 'w' ? 'white' : 'black');
    
    // Update timeline & highlights
    this.ui.updateTimelinePgn();
    this.ui.clearHighlights();

    // Render puzzle prompt in UI
    this.renderPuzzleUI();
  }

  nextPuzzle() {
    this.currentIndex = (this.currentIndex + 1) % this.puzzles.length;
    this.loadPuzzle(this.currentIndex);
  }

  prevPuzzle() {
    this.currentIndex = (this.currentIndex - 1 + this.puzzles.length) % this.puzzles.length;
    this.loadPuzzle(this.currentIndex);
  }

  renderPuzzleUI() {
    const puz = this.currentPuzzle;
    if (!puz) return;

    const spotlightTitle = document.getElementById('lblSpotlightTitle');
    const spotlightVal = document.getElementById('recommendedBestMoveText');
    const aiExplanation = document.getElementById('aiExplanationTextContent');

    if (spotlightTitle) {
      spotlightTitle.innerHTML = `<i class="fa-solid fa-trophy" style="color:var(--cb-gold);"></i> BÀI ${this.currentIndex + 1}/${this.puzzles.length}: ELO ${puz.rating}`;
    }
    if (spotlightVal) {
      spotlightVal.textContent = puz.title;
      spotlightVal.style.fontSize = '15px';
    }
    if (aiExplanation) {
      aiExplanation.innerHTML = `
        <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); padding:10px; border-radius:var(--cb-radius); margin-bottom:8px;">
          <div style="color:var(--cb-gold); font-weight:800; font-size:0.88rem; margin-bottom:4px;">
            <i class="fa-solid fa-bullseye"></i> MỤC TIÊU CHIẾN THUẬT:
          </div>
          <div style="color:#ffffff; font-size:0.84rem; line-height:1.5;">
            ${puz.prompt}
          </div>
        </div>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button type="button" id="btnPuzzleHint" class="btn-cb-action" style="flex:1; padding:6px; font-size:11px;">
            <i class="fa-solid fa-lightbulb" style="color:var(--cb-gold);"></i> Gợi Ý
          </button>
          <button type="button" id="btnPuzzleNext" class="btn-cb-action btn-cb-action--primary" style="flex:1; padding:6px; font-size:11px;">
            <i class="fa-solid fa-forward"></i> Bài Tiếp
          </button>
        </div>
      `;

      const btnHint = document.getElementById('btnPuzzleHint');
      const btnNext = document.getElementById('btnPuzzleNext');
      if (btnHint) {
        btnHint.addEventListener('click', () => this.showHint());
      }
      if (btnNext) {
        btnNext.addEventListener('click', () => this.nextPuzzle());
      }
    }
  }

  showHint() {
    if (!this.currentPuzzle) return;
    const expectedMove = this.currentPuzzle.solution[this.stepIndex];
    if (expectedMove) {
      const fromSq = expectedMove.substring(0, 2);
      this.ui.highlightSquare(fromSq, 'cb-highlight--best');
      this.ui.showToast(`Gợi ý: Hãy quan sát kỹ quân cờ tại ô ${fromSq.toUpperCase()}!`, 'info');
    }
  }

  /**
   * Evaluates user move against puzzle solution
   */
  handleUserMove(uciMove) {
    if (!this.active || !this.currentPuzzle) return false;

    const expectedMove = this.currentPuzzle.solution[this.stepIndex];
    
    if (uciMove === expectedMove) {
      // User made the correct move!
      this.stepIndex++;

      if (this.stepIndex >= this.currentPuzzle.solution.length) {
        // Puzzle solved completely!
        this.solvedCount++;
        if (this.ui.audioFX) this.ui.audioFX.playPuzzleSuccess();
        this.showSuccessModal();
      } else {
        // Multi-step puzzle: Opponent auto-replies
        if (this.ui.audioFX) this.ui.audioFX.playMove();
        setTimeout(() => {
          const opponentMove = this.currentPuzzle.solution[this.stepIndex];
          if (opponentMove) {
            this.ui.game.move({
              from: opponentMove.substring(0, 2),
              to: opponentMove.substring(2, 4),
              promotion: opponentMove.length > 4 ? opponentMove[4] : 'q'
            });
            this.ui.board.position(this.ui.game.fen(), true);
            this.ui.updateTimelinePgn();
            if (this.ui.audioFX) this.ui.audioFX.playMove();
            this.stepIndex++;
          }
        }, 500);
      }
      return true;
    } else {
      // Incorrect move
      if (this.ui.audioFX) this.ui.audioFX.playPuzzleFail();
      this.ui.showToast('Nước đi chưa tối ưu! Hãy suy nghĩ và thử lại.', 'warning');
      
      // Undo user move after brief pause
      setTimeout(() => {
        this.ui.game.undo();
        this.ui.board.position(this.ui.game.fen(), true);
        this.ui.updateTimelinePgn();
      }, 450);
      return false;
    }
  }

  showSuccessModal() {
    const puz = this.currentPuzzle;
    const aiExplanation = document.getElementById('aiExplanationTextContent');
    if (aiExplanation) {
      aiExplanation.innerHTML = `
        <div style="background:rgba(16, 185, 129, 0.12); border:1px solid rgba(16, 185, 129, 0.4); padding:12px; border-radius:var(--cb-radius); margin-bottom:8px;">
          <div style="color:var(--cb-accent); font-weight:800; font-size:0.95rem; margin-bottom:6px;">
            <i class="fa-solid fa-circle-check"></i> XUẤT SẮC! ĐÃ GIẢI ĐÚNG THẾ CỜ
          </div>
          <div style="color:#ffffff; font-size:0.84rem; line-height:1.5;">
            ${puz.explanation}
          </div>
        </div>
        <button type="button" id="btnPuzzleSolveNext" class="btn-cb-action btn-cb-action--gold" style="width:100%; padding:8px; font-size:12px; font-weight:800;">
          <i class="fa-solid fa-circle-arrow-right"></i> THỬ THÁCH BÀI TIẾP THEO (+15 ELO)
        </button>
      `;

      const btnSolveNext = document.getElementById('btnPuzzleSolveNext');
      if (btnSolveNext) {
        btnSolveNext.addEventListener('click', () => this.nextPuzzle());
      }
    }
  }
}
