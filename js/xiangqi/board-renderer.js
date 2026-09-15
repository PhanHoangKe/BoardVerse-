/**
 * Xiangqi Board Renderer
 * Handles visual rendering of 9x10 Xiangqi grid, 90 intersections, River, Palaces, pieces, highlights, and animations.
 * Supports UI orientation mapping without altering absolute logic coordinates.
 */

(function(exports) {
  'use strict';

  const PIECE_CHARS = {
    r: { k: '帥', a: '仕', b: '相', n: '馬', r: '車', c: '炮', p: '兵' },
    b: { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' }
  };

  class XiangqiBoardRenderer {
    constructor(containerElement, options = {}) {
      this.container = containerElement;
      this.onIntersectionClick = options.onIntersectionClick || (() => {});
      this.onDragDropMove = options.onDragDropMove || (() => {});
      this.selectedPos = null;
      this.legalMoveTargets = [];
      this.lastMove = null;
      this.orientation = 'r'; // 'r' or 'b'
      this.checkPos = null;
      this.lastGameState = null;
      this.pieceTheme = options.pieceTheme || 'classic_gold';
      this.bestMoveHighlight = null;
      this.initDom();
    }

    setOrientation(orientation) {
      this.orientation = orientation === 'b' ? 'b' : 'r';
    }

    setBestMoveHighlight(highlight) {
      this.bestMoveHighlight = highlight;
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    clearBestMoveHighlight() {
      this.bestMoveHighlight = null;
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    setPieceTheme(theme) {
      this.pieceTheme = theme || 'classic_gold';
      if (this.container) {
        this.container.setAttribute('data-piece-theme', this.pieceTheme);
      }
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    setBoardTheme(theme) {
      this.boardTheme = theme || 'lacquer_dark';
      if (this.container) {
        this.container.setAttribute('data-board-theme', this.boardTheme);
      }
      const gradStop1 = this.container ? this.container.querySelector('#boardGradStop1') : null;
      const gradStop2 = this.container ? this.container.querySelector('#boardGradStop2') : null;
      const outerBorder = this.container ? this.container.querySelector('#boardOuterBorder') : null;
      const innerBorder = this.container ? this.container.querySelector('#boardInnerBorder') : null;
      if (theme === 'classic_wood') {
        if (gradStop1) gradStop1.setAttribute('stop-color', '#4a2c16');
        if (gradStop2) gradStop2.setAttribute('stop-color', '#2d180a');
        if (outerBorder) outerBorder.setAttribute('stroke', '#e6be8a');
        if (innerBorder) innerBorder.setAttribute('stroke', '#b8824f');
      } else if (theme === 'bamboo_green') {
        if (gradStop1) gradStop1.setAttribute('stop-color', '#1e382b');
        if (gradStop2) gradStop2.setAttribute('stop-color', '#0f2017');
        if (outerBorder) outerBorder.setAttribute('stroke', '#85d996');
        if (innerBorder) innerBorder.setAttribute('stroke', '#4e9960');
      } else {
        if (gradStop1) gradStop1.setAttribute('stop-color', '#2a2421');
        if (gradStop2) gradStop2.setAttribute('stop-color', '#191512');
        if (outerBorder) outerBorder.setAttribute('stroke', '#d4af37');
        if (innerBorder) innerBorder.setAttribute('stroke', '#8b6b23');
      }
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    // Logic coordinate -> Display grid coordinate mapping
    logicToDisplay(col, row) {
      if (typeof CoordinateMapper !== 'undefined' && CoordinateMapper.boardToDisplay) {
        const res = CoordinateMapper.boardToDisplay(col, row, this.orientation);
        return { col: res.visCol, row: res.visRow };
      }
      if (this.orientation === 'b') {
        return { col: 8 - col, row: 9 - row };
      }
      return { col, row };
    }

    // Display grid coordinate -> Logic coordinate mapping
    displayToLogic(displayCol, displayRow) {
      if (typeof CoordinateMapper !== 'undefined' && CoordinateMapper.displayToBoard) {
        return CoordinateMapper.displayToBoard(displayCol, displayRow, this.orientation);
      }
      if (this.orientation === 'b') {
        return { col: 8 - displayCol, row: 9 - displayRow };
      }
      return { col: displayCol, row: displayRow };
    }

    initDom() {
      this.container.innerHTML = '';
      this.container.classList.add('xiangqi-board-container');
      this.container.setAttribute('data-piece-theme', this.pieceTheme);
      this.container.setAttribute('data-board-theme', this.boardTheme);

      // Create main board SVG/HTML canvas wrapper
      const boardWrapper = document.createElement('div');
      boardWrapper.className = 'xiangqi-board-wrapper';

      // SVG Grid lines, River, and Palaces
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 900 1000');
      svg.setAttribute('class', 'xiangqi-board-svg');

      // Background grid lines (8x9 inner rectangles formed by 9x10 grid)
      let svgContent = `
        <defs>
          <linearGradient id="boardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2a2421" id="boardGradStop1"/>
            <stop offset="100%" stop-color="#191512" id="boardGradStop2"/>
          </linearGradient>
          <filter id="pieceGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <!-- Board Outer Background -->
        <rect width="900" height="1000" fill="url(#boardGrad)" rx="16" />
        <rect id="boardOuterBorder" x="30" y="30" width="840" height="940" fill="none" stroke="#d4af37" stroke-width="4" rx="8" />
        <rect id="boardInnerBorder" x="40" y="40" width="820" height="920" fill="none" stroke="#8b6b23" stroke-width="2" />
      `;

      // Draw grid lines
      // Vertical lines (Top half: rows 0-4, Bottom half: rows 5-9)
      for (let c = 0; c < 9; c++) {
        const x = 50 + c * 100;
        if (c === 0 || c === 8) {
          // Full outer border vertical lines
          svgContent += `<line x1="${x}" y1="50" x2="${x}" y2="950" stroke="#d4af37" stroke-width="2" />`;
        } else {
          // Inner vertical lines interrupted by river (row 4 to row 5)
          svgContent += `<line x1="${x}" y1="50" x2="${x}" y2="450" stroke="#b89343" stroke-width="2" />`;
          svgContent += `<line x1="${x}" y1="550" x2="${x}" y2="950" stroke="#b89343" stroke-width="2" />`;
        }
      }

      // Horizontal lines (rows 0 to 9)
      for (let r = 0; r < 10; r++) {
        const y = 50 + r * 100;
        svgContent += `<line x1="50" y1="${y}" x2="850" y2="${y}" stroke="#b89343" stroke-width="2" />`;
      }

      // Draw Palaces (Cung) diagonal X lines
      // Top Palace (cols 3..5, rows 0..2)
      svgContent += `<line x1="350" y1="50" x2="550" y2="250" stroke="#d4af37" stroke-width="2" stroke-dasharray="6,4"/>`;
      svgContent += `<line x1="550" y1="50" x2="350" y2="250" stroke="#d4af37" stroke-width="2" stroke-dasharray="6,4"/>`;

      // Bottom Palace (cols 3..5, rows 7..9)
      svgContent += `<line x1="350" y1="750" x2="550" y2="950" stroke="#d4af37" stroke-width="2" stroke-dasharray="6,4"/>`;
      svgContent += `<line x1="550" y1="750" x2="350" y2="950" stroke="#d4af37" stroke-width="2" stroke-dasharray="6,4"/>`;

      // River Text (Sông / 楚 河 漢 界)
      svgContent += `
        <rect x="50" y="452" width="800" height="96" fill="#1f1a17" opacity="0.8"/>
        <text x="250" y="515" fill="#d4af37" font-family="'Times New Roman', serif" font-size="38" font-weight="bold" text-anchor="middle" letter-spacing="12">楚 河</text>
        <text x="650" y="515" fill="#d4af37" font-family="'Times New Roman', serif" font-size="38" font-weight="bold" text-anchor="middle" letter-spacing="12">漢 界</text>
      `;

      svg.innerHTML = svgContent;
      boardWrapper.appendChild(svg);

      // Layer for 90 Intersections and Pieces
      const piecesLayer = document.createElement('div');
      piecesLayer.className = 'xiangqi-pieces-layer';
      boardWrapper.appendChild(piecesLayer);

      this.container.appendChild(boardWrapper);
      this.piecesLayer = piecesLayer;
    }

    render(gameState) {
      if (!gameState || !gameState.board) return;
      this.lastGameState = gameState;

      this.setOrientation(gameState.orientation || 'r');
      this.piecesLayer.innerHTML = '';

      const board = gameState.board;
      const lastMove = gameState.getCurrentMove();
      const MoveGenerator = typeof window !== 'undefined' && window.MoveGeneratorModule
        ? window.MoveGeneratorModule.MoveGenerator
        : (typeof require !== 'undefined' ? require('./move-generator.js').MoveGenerator : null);

      // Validate selectedPos against current state: clear selection if no piece or piece doesn't belong to sideToMove
      if (this.selectedPos) {
        const selPiece = board[this.selectedPos.row] ? board[this.selectedPos.row][this.selectedPos.col] : null;
        if (!selPiece || selPiece.color !== gameState.sideToMove) {
          this.selectedPos = null;
          this.legalMoveTargets = [];
        }
      }

      this.checkPos = gameState.checkState && gameState.checkState.isCheck && MoveGenerator
        ? MoveGenerator.findKingPosition(board, gameState.checkState.checkedSide)
        : null;

      // Create 90 intersection clickable hitboxes & drag targets
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          const displayPos = this.logicToDisplay(c, r);
          const cell = document.createElement('div');
          cell.className = 'xiangqi-intersection';
          const leftPct = ((50 + displayPos.col * 100) / 900) * 100;
          const topPct = ((50 + displayPos.row * 100) / 1000) * 100;
          cell.style.left = `${leftPct}%`;
          cell.style.top = `${topPct}%`;

          cell.setAttribute('data-col', c);
          cell.setAttribute('data-row', r);

          // Selected highlight
          if (this.selectedPos && this.selectedPos.col === c && this.selectedPos.row === r) {
            cell.classList.add('selected');
          }

          // Last move highlight ring (under piece & dots)
          if (lastMove && ((lastMove.from.col === c && lastMove.from.row === r) || (lastMove.to.col === c && lastMove.to.row === r))) {
            const lastMoveRing = document.createElement('div');
            lastMoveRing.className = 'last-move-ring';
            cell.appendChild(lastMoveRing);
          }

          // Engine Best Move Glow
          if (this.bestMoveHighlight) {
            if (this.bestMoveHighlight.from && this.bestMoveHighlight.from.col === c && this.bestMoveHighlight.from.row === r) {
              cell.classList.add('highlight-best-from');
            }
            if (this.bestMoveHighlight.to && this.bestMoveHighlight.to.col === c && this.bestMoveHighlight.to.row === r) {
              cell.classList.add('highlight-best-to');
            }
          }

          // Check highlight on King
          if (this.checkPos && this.checkPos.col === c && this.checkPos.row === r) {
            cell.classList.add('king-in-check');
          }

          // Legal move target highlight
          const isLegalTarget = this.legalMoveTargets.some(m => m.to.col === c && m.to.row === r);
          if (isLegalTarget) {
            const dot = document.createElement('div');
            dot.className = 'legal-move-dot';
            dot.setAttribute('data-col', c);
            dot.setAttribute('data-row', r);
            if (board[r][c]) dot.classList.add('capture-hint');
            cell.appendChild(dot);
          }

          // HTML5 Drag & Drop Handlers on Intersection Cell
          cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drag-over');
          });

          cell.addEventListener('dragenter', (e) => {
            e.preventDefault();
            cell.classList.add('drag-over');
          });

          cell.addEventListener('dragleave', () => {
            cell.classList.remove('drag-over');
          });

          cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drag-over');
            let fromPos = this.selectedPos;
            try {
              const rawData = e.dataTransfer.getData('text/plain');
              if (rawData) fromPos = JSON.parse(rawData);
            } catch (err) {}

            if (fromPos && (fromPos.col !== c || fromPos.row !== r)) {
              if (this.onDragDropMove) {
                this.onDragDropMove(fromPos, { col: c, row: r });
              } else {
                this.onIntersectionClick({ col: c, row: r });
              }
            }
          });

          // Piece rendering
          const piece = board[r][c];
          if (piece) {
            const pieceEl = document.createElement('div');
            const colorClass = piece.color === 'r' ? 'red piece-r' : 'black piece-b';
            pieceEl.className = `xiangqi-piece ${colorClass}`;
            pieceEl.setAttribute('data-col', c);
            pieceEl.setAttribute('data-row', r);
            if (this.selectedPos && this.selectedPos.col === c && this.selectedPos.row === r) {
              pieceEl.classList.add('selected');
            }

            // Click handler for ALL pieces (player and opponent) - single unified handler
            pieceEl.addEventListener('click', (e) => {
              e.stopPropagation();
              this.onIntersectionClick({ col: c, row: r });
            });

            // Drop handlers on piece elements - ensures drops on pieces (higher z-index) are handled
            pieceEl.addEventListener('dragover', (e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              cell.classList.add('drag-over');
            });

            pieceEl.addEventListener('dragenter', (e) => {
              e.preventDefault();
              cell.classList.add('drag-over');
            });

            pieceEl.addEventListener('dragleave', () => {
              cell.classList.remove('drag-over');
            });

            pieceEl.addEventListener('drop', (e) => {
              e.preventDefault();
              e.stopPropagation();
              cell.classList.remove('drag-over');
              let fromPos = null;
              try {
                const rawData = e.dataTransfer.getData('text/plain');
                if (rawData) fromPos = JSON.parse(rawData);
              } catch (err) {}
              if (fromPos && (fromPos.col !== c || fromPos.row !== r)) {
                if (this.onDragDropMove) {
                  this.onDragDropMove(fromPos, { col: c, row: r });
                } else {
                  this.onIntersectionClick({ col: c, row: r });
                }
              }
            });

            // Drag & Drop configuration (Mouse & Touch) - only for current side pieces
            const isPlayerTurnPiece = piece.color === gameState.sideToMove;
            if (isPlayerTurnPiece) {
              pieceEl.setAttribute('draggable', 'true');

              pieceEl.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                pieceEl.classList.add('dragging');
                if (e.dataTransfer) {
                  e.dataTransfer.setData('text/plain', JSON.stringify({ col: c, row: r }));
                  e.dataTransfer.effectAllowed = 'move';
                }
              });

              pieceEl.addEventListener('dragend', () => {
                pieceEl.classList.remove('dragging');
                document.querySelectorAll('.xiangqi-intersection.drag-over').forEach(el => el.classList.remove('drag-over'));
              });

              // Mobile Touch Drag Support
              let touchClone = null;

              pieceEl.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                const touch = e.touches[0];

                this.onIntersectionClick({ col: c, row: r });

                touchClone = pieceEl.cloneNode(true);
                touchClone.classList.add('xiangqi-piece-touch-clone');
                touchClone.style.left = `${touch.clientX}px`;
                touchClone.style.top = `${touch.clientY}px`;
                document.body.appendChild(touchClone);
              }, { passive: true });

              pieceEl.addEventListener('touchmove', (e) => {
                if (!touchClone || e.touches.length !== 1) return;
                const touch = e.touches[0];
                touchClone.style.left = `${touch.clientX}px`;
                touchClone.style.top = `${touch.clientY}px`;

                const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                document.querySelectorAll('.xiangqi-intersection.drag-over').forEach(el => el.classList.remove('drag-over'));
                if (targetEl) {
                  const intersectionCell = targetEl.closest('.xiangqi-intersection');
                  if (intersectionCell) intersectionCell.classList.add('drag-over');
                }
              }, { passive: true });

              pieceEl.addEventListener('touchend', (e) => {
                if (touchClone) {
                  touchClone.remove();
                  touchClone = null;
                }
                document.querySelectorAll('.xiangqi-intersection.drag-over').forEach(el => el.classList.remove('drag-over'));

                if (e.changedTouches.length === 1) {
                  const touch = e.changedTouches[0];
                  const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                  if (targetEl) {
                    const intersectionCell = targetEl.closest('.xiangqi-intersection');
                    if (intersectionCell) {
                      const targetC = parseInt(intersectionCell.getAttribute('data-col'), 10);
                      const targetR = parseInt(intersectionCell.getAttribute('data-row'), 10);
                      if (!isNaN(targetC) && !isNaN(targetR) && (targetC !== c || targetR !== r)) {
                        if (this.onDragDropMove) {
                          this.onDragDropMove({ col: c, row: r }, { col: targetC, row: targetR });
                        } else {
                          this.onIntersectionClick({ col: targetC, row: targetR });
                        }
                      }
                    }
                  }
                }
              });
            }

            const innerRing = document.createElement('div');
            innerRing.className = 'piece-inner-ring';

            const charEl = document.createElement('span');
            charEl.className = 'piece-char';
            charEl.textContent = PIECE_CHARS[piece.color][piece.type] || piece.type.toUpperCase();

            innerRing.appendChild(charEl);
            pieceEl.appendChild(innerRing);
            cell.appendChild(pieceEl);
          }

          // Direct click handler on cell
          cell.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onIntersectionClick({ col: c, row: r });
          });

          this.piecesLayer.appendChild(cell);
        }
      }
    }

    setSelectedPosition(pos, legalMoves = []) {
      this.selectedPos = pos;
      this.legalMoveTargets = legalMoves;
    }

    selectPiece(pos, legalMoves = []) {
      this.setSelectedPosition(pos, legalMoves);
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    clearSelection() {
      this.selectedPos = null;
      this.legalMoveTargets = [];
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    setBestMoveHighlight(highlight) {
      this.bestMoveHighlight = highlight;
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }

    clearBestMoveHighlight() {
      this.bestMoveHighlight = null;
      if (this.lastGameState) {
        this.render(this.lastGameState);
      }
    }
  }

  exports.XiangqiBoardRenderer = XiangqiBoardRenderer;
})(typeof exports !== 'undefined' ? exports : (window.BoardRendererModule = {}));
