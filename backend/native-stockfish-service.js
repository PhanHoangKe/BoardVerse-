/**
 * Native Stockfish Engine Backend Service (Node.js)
 * Executes Stockfish 18 Native Binary (AVX2 64-bit Windows) via C++ child process.
 * Integrated with Adaptive Time Manager (ATM) for dynamic thinking time optimization.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdaptiveTimeManager = require('./adaptive-time-manager.js');

class NativeStockfishService {
  constructor() {
    this.binaryPath = path.join(__dirname, 'stockfish-native/stockfish/stockfish-windows-x86-64-avx2.exe');
    this.engineVersion = 'Stockfish 18 (Native AVX2 Windows 64-bit)';
    this.engineAuthor = 'the Stockfish developers (see AUTHORS file)';
  }

  async analyze(fen, config = {}) {
    const targetDepth = config.depth || config.Depth || 32;
    const maxTime = config.time || config.MoveTime || 5000;
    const minTime = Math.max(350, config.minTime || Math.floor(maxTime * 0.25));
    const multiPV = config.multiPV || config.MultiPV || 1;
    const threads = config.threads || config.Threads || 8;
    const hash = config.hash || config.Hash || 256;
    const limitStrength = config.limitStrength || false;
    const uciElo = config.uciElo || 2800;
    const analysisId = config.analysisId || 'nat_' + Date.now();
    const useAdaptiveTime = config.useAdaptiveTime !== false; // Default enabled

    const atm = new AdaptiveTimeManager();

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutTimer = null;
      let stopSent = false;
      const multiPVMap = new Map();
      let bestMoveUci = '';
      let ponderUci = '';
      let latestDepth = 0;
      let latestSeldepth = 0;
      let latestNodes = 0;
      let latestNps = 0;
      let detectedVersion = this.engineVersion;
      const startTime = Date.now();
      let adaptiveExitReason = 'Search Completed';

      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (sfProcess) {
            try { sfProcess.kill(); } catch (e) {}
          }
          resolve({
            error: 'ENGINE_TIMEOUT',
            analysisId,
            message: 'Native Stockfish 18 analysis timed out'
          });
        }
      }, maxTime + 4000);

      const doResolve = (resultObj) => {
        if (!resolved) {
          resolved = true;
          if (timeoutTimer) clearTimeout(timeoutTimer);
          if (sfProcess) {
            try {
              sfProcess.stdin.write('quit\n');
              setTimeout(() => { try { sfProcess.kill(); } catch(e){} }, 100);
            } catch (e) {}
          }
          resolve(resultObj);
        }
      };

      if (!fs.existsSync(this.binaryPath)) {
        return resolve({
          error: 'ENGINE_UNAVAILABLE',
          analysisId,
          message: 'Native Stockfish binary not found at ' + this.binaryPath
        });
      }

      const sfProcess = spawn(this.binaryPath);
      let buffer = '';

      sfProcess.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep last unfinished line in buffer

        for (let rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          if (line.startsWith('id name ')) {
            detectedVersion = line.replace('id name ', '').trim() + ' (Native AVX2)';
          }

          if (line.startsWith('info ') && line.includes(' pv ')) {
            const parsed = this.parseInfoLine(line);
            if (parsed) {
              multiPVMap.set(parsed.multipv, parsed);
              if (parsed.depth > latestDepth) latestDepth = parsed.depth;
              if (parsed.seldepth > latestSeldepth) latestSeldepth = parsed.seldepth;
              if (parsed.nodes > latestNodes) latestNodes = parsed.nodes;
              if (parsed.nps > latestNps) latestNps = parsed.nps;

              // Calculate MultiPV Gap if multiPV >= 2
              if (parsed.multipv === 1 && multiPVMap.has(2)) {
                const p1 = parsed.score.type === 'cp' ? parsed.score.value : 10000;
                const p2Score = multiPVMap.get(2).score;
                const p2 = p2Score.type === 'cp' ? p2Score.value : 10000;
                parsed.pvGap = Math.abs(p1 - p2);
              }

              // Process iteration through Adaptive Time Manager
              if (parsed.multipv === 1) {
                atm.processIteration(parsed);

                // Check Early Exit if Adaptive Time is enabled
                if (useAdaptiveTime && !stopSent) {
                  const elapsedTime = Date.now() - startTime;
                  const exitCheck = atm.evaluateEarlyExit(elapsedTime, maxTime, minTime);
                  if (exitCheck.shouldStop) {
                    stopSent = true;
                    adaptiveExitReason = exitCheck.reason;
                    try { sfProcess.stdin.write('stop\n'); } catch (e) {}
                  }
                }
              }
            }
          }

          if (line.startsWith('bestmove ')) {
            const parts = line.split(/\s+/);
            bestMoveUci = parts[1] || '';
            ponderUci = parts[3] || '';

            const sortedLines = Array.from(multiPVMap.values())
              .sort((a, b) => a.multipv - b.multipv);

            const elapsedTime = Date.now() - startTime;

            if (!bestMoveUci || bestMoveUci === '0000' || bestMoveUci === '(none)') {
              doResolve({
                error: 'ENGINE_UNAVAILABLE',
                analysisId,
                message: 'Native Stockfish 18 returned invalid bestmove'
              });
            } else {
              doResolve({
                success: true,
                source: `Native ${detectedVersion}`,
                version: detectedVersion,
                analysisId,
                fen,
                bestMoveUci,
                ponderUci,
                depth: latestDepth || targetDepth,
                seldepth: latestSeldepth,
                nodes: latestNodes,
                nps: latestNps,
                threads,
                hash,
                time: elapsedTime,
                maxTime,
                stabilityIndex: atm.stabilityIndex,
                adaptiveExitReason,
                moveChangeCount: atm.moveChangeCount,
                lines: sortedLines
              });
            }
          }
        }
      });

      sfProcess.stderr.on('data', (errData) => {
        console.error('Stockfish Stderr:', errData.toString());
      });

      sfProcess.on('error', (err) => {
        doResolve({
          error: 'ENGINE_UNAVAILABLE',
          analysisId,
          message: err.message
        });
      });

      // Write UCI sequence to native executable stdin
      sfProcess.stdin.write('uci\n');
      sfProcess.stdin.write('isready\n');
      sfProcess.stdin.write(`setoption name Threads value ${threads}\n`);
      sfProcess.stdin.write(`setoption name Hash value ${hash}\n`);
      sfProcess.stdin.write(`setoption name MultiPV value ${multiPV}\n`);
      if (limitStrength) {
        sfProcess.stdin.write(`setoption name UCI_LimitStrength value true\n`);
        sfProcess.stdin.write(`setoption name UCI_Elo value ${uciElo}\n`);
      } else {
        sfProcess.stdin.write(`setoption name UCI_LimitStrength value false\n`);
      }
      sfProcess.stdin.write(`position fen ${fen}\n`);
      sfProcess.stdin.write(`go depth ${targetDepth} movetime ${maxTime}\n`);
    });
  }

  parseInfoLine(line) {
    const parts = line.split(/\s+/);
    let depth = 0;
    let seldepth = 0;
    let multipv = 1;
    let scoreType = 'cp';
    let scoreVal = 0;
    let nodes = 0;
    let nps = 0;
    let pvIndex = parts.indexOf('pv');

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'depth' && parts[i + 1]) depth = parseInt(parts[i + 1], 10);
      if (parts[i] === 'seldepth' && parts[i + 1]) seldepth = parseInt(parts[i + 1], 10);
      if (parts[i] === 'multipv' && parts[i + 1]) multipv = parseInt(parts[i + 1], 10);
      if (parts[i] === 'nodes' && parts[i + 1]) nodes = parseInt(parts[i + 1], 10);
      if (parts[i] === 'nps' && parts[i + 1]) nps = parseInt(parts[i + 1], 10);
      if (parts[i] === 'score' && parts[i + 1]) {
        scoreType = parts[i + 1];
        if (parts[i + 2]) scoreVal = parseInt(parts[i + 2], 10);
      }
    }

    const pvMoves = pvIndex !== -1 ? parts.slice(pvIndex + 1) : [];
    const bestUci = pvMoves[0] || '';

    return {
      depth,
      seldepth,
      multipv,
      score: { type: scoreType, value: scoreVal },
      nodes,
      nps,
      bestUci,
      pvMoves
    };
  }
}

module.exports = new NativeStockfishService();
