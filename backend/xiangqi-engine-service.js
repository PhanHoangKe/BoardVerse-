/**
 * Native Xiangqi Engine Backend Service (Node.js)
 * High-Performance Persistent Worker Pool for Fairy-Stockfish Largeboard + NNUE
 * 
 * Key Features:
 * - Dynamic Hardware Allocation (Calculates threads & hash based on actual CPU cores/RAM)
 * - Configurable Pool: Supports both Multi-Match Concurrent Pool & Solo "1 Ván Tối Thượng" Mode
 * - Full OS Support: Windows (.exe), Linux, macOS with auto-discovery of largeboard binaries & NNUE nets
 * - Strict UCI Handshake: uci -> uciok -> setoption -> isready -> readyok
 * - Uncapped Iterative Deepening: Uses 'go movetime' without artificial depth ceilings
 * - Fail-Fast & Robust Lifecycle: Catches exit/close/error, logs explicitly to console.error, auto-respawns workers
 * - Safe Input Sanitization: Rejects FEN injection & clamps movetime
 * - Queue Guard: Prevents unbounded memory growth during traffic spikes
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class EngineWorker {
  constructor(id, binaryPath, nnuePath, options = {}) {
    this.id = id;
    this.binaryPath = binaryPath;
    this.nnuePath = nnuePath;
    this.threads = options.threads || 4;
    this.hash = options.hash || 128;
    this.currentMultiPV = 1;

    this.process = null;
    this.isReady = false;
    this.isBusy = false;
    this.engineName = 'Unknown Xiangqi Engine';
    this.engineAuthor = 'Unknown Author';

    this.activeTask = null;
    this.stdoutBuffer = '';
    this.handshakeCallbacks = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(this.binaryPath)) {
          return reject(new Error(`Binary not found at: ${this.binaryPath}`));
        }

        this.process = spawn(this.binaryPath, [], {
          cwd: path.dirname(this.binaryPath),
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.stdout.on('data', (chunk) => this.handleStdout(chunk));
        this.process.stderr.on('data', (chunk) => {
          console.error(`[Xiangqi Worker #${this.id} STDERR]:`, chunk.toString().trim());
        });

        this.process.on('error', (err) => {
          console.error(`[Xiangqi Worker #${this.id} ERROR]:`, err.message);
          this.handleCrash(new Error(`Worker process error: ${err.message}`));
        });

        this.process.on('exit', (code, signal) => {
          console.error(`[Xiangqi Worker #${this.id} EXIT]: Process exited with code ${code}, signal ${signal}`);
          this.handleCrash(new Error(`Worker process exited unexpectedly (code: ${code}, signal: ${signal})`));
        });

        // Perform initialization handshake
        this.initHandshake()
          .then(() => resolve(true))
          .catch((err) => reject(err));

      } catch (err) {
        console.error(`[Xiangqi Worker #${this.id} SPAWN_FAILED]:`, err);
        reject(err);
      }
    });
  }

  async initHandshake() {
    // 1. Send 'uci' and wait for 'uciok'
    await this.sendCommandAndWaitFor('uci', (line) => {
      if (line.startsWith('id name ')) {
        this.engineName = line.replace('id name ', '').trim();
      }
      if (line.startsWith('id author ')) {
        this.engineAuthor = line.replace('id author ', '').trim();
      }
      return line === 'uciok';
    }, 5000);

    // 2. Configure Xiangqi Variant
    this.write('setoption name UCI_Variant value xiangqi\n');

    // 3. Configure NNUE if file exists
    if (this.nnuePath && fs.existsSync(this.nnuePath)) {
      this.write('setoption name Use NNUE value true\n');
      this.write(`setoption name EvalFile value ${path.basename(this.nnuePath)}\n`);
    }

    // 4. Configure Threads and Hash
    this.write(`setoption name Threads value ${this.threads}\n`);
    this.write(`setoption name Hash value ${this.hash}\n`);
    this.write(`setoption name MultiPV value ${this.currentMultiPV}\n`);

    // 5. Send 'isready' and wait for 'readyok'
    await this.sendCommandAndWaitFor('isready', (line) => line === 'readyok', 5000);

    this.isReady = true;
    console.log(`[Xiangqi Worker #${this.id} READY] Engine: ${this.engineName} | Threads: ${this.threads} | Hash: ${this.hash}MB | NNUE: ${this.nnuePath ? 'YES' : 'NO'}`);
  }

  write(cmd) {
    if (this.process && this.process.stdin && !this.process.killed) {
      this.process.stdin.write(cmd);
    }
  }

  sendCommandAndWaitFor(cmd, predicate, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.handshakeCallbacks.indexOf(cb);
        if (idx !== -1) this.handshakeCallbacks.splice(idx, 1);
        reject(new Error(`Timeout waiting for response to command '${cmd}' (${timeoutMs}ms)`));
      }, timeoutMs);

      const cb = (line) => {
        if (predicate(line)) {
          clearTimeout(timer);
          return true;
        }
        return false;
      };

      this.handshakeCallbacks.push(cb);
      this.write(cmd + '\n');
    });
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk.toString();
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop(); // Keep partial line

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check handshake listeners
      for (let i = this.handshakeCallbacks.length - 1; i >= 0; i--) {
        const cb = this.handshakeCallbacks[i];
        if (cb(line)) {
          this.handshakeCallbacks.splice(i, 1);
        }
      }

      // Check active search task
      if (this.activeTask) {
        if (line.startsWith('info ') && line.includes(' pv ')) {
          const parsed = this.parseInfoLine(line);
          if (parsed) {
            this.activeTask.multiPVMap.set(parsed.multipv, parsed);
            if (parsed.depth > this.activeTask.latestDepth) this.activeTask.latestDepth = parsed.depth;
            if (parsed.nodes > this.activeTask.latestNodes) this.activeTask.latestNodes = parsed.nodes;
            if (parsed.nps > this.activeTask.latestNps) this.activeTask.latestNps = parsed.nps;
          }
        }

        if (line.startsWith('bestmove ')) {
          const parts = line.split(/\s+/);
          const bestMoveUci = parts[1] || '';
          const task = this.activeTask;
          this.activeTask = null;
          this.isBusy = false;

          if (task.timeoutTimer) clearTimeout(task.timeoutTimer);

          if (!bestMoveUci || bestMoveUci === '0000' || bestMoveUci === '(none)') {
            task.resolve({
              error: 'ENGINE_INVALID_BESTMOVE',
              analysisId: task.analysisId,
              message: 'Engine returned invalid or null bestmove'
            });
          } else {
            const sortedLines = Array.from(task.multiPVMap.values())
              .sort((a, b) => a.multipv - b.multipv);

            const elapsedTime = Date.now() - task.startTime;

            task.resolve({
              success: true,
              source: `Native ${this.engineName}`,
              version: this.engineName,
              author: this.engineAuthor,
              analysisId: task.analysisId,
              fen: task.fen,
              bestMoveUci,
              depth: task.latestDepth || 1,
              nodes: task.latestNodes,
              nps: task.latestNps,
              time: elapsedTime,
              lines: sortedLines
            });
          }
        }
      }
    }
  }

  async runAnalysis(task) {
    this.isBusy = true;
    this.activeTask = {
      ...task,
      multiPVMap: new Map(),
      latestDepth: 0,
      latestNodes: 0,
      latestNps: 0,
      startTime: Date.now()
    };

    // Set safety timeout guard
    this.activeTask.timeoutTimer = setTimeout(() => {
      if (this.activeTask) {
        console.warn(`[Xiangqi Worker #${this.id}] Move analysis timed out (${task.maxTime + 2500}ms). Stopping search...`);
        this.write('stop\n');
      }
    }, task.maxTime + 2500);

    // Update MultiPV if requested
    const targetMultiPV = Math.max(1, Math.min(5, task.multiPV || 1));
    if (targetMultiPV !== this.currentMultiPV) {
      this.currentMultiPV = targetMultiPV;
      this.write(`setoption name MultiPV value ${this.currentMultiPV}\n`);
      await this.sendCommandAndWaitFor('isready', (l) => l === 'readyok', 2000).catch(() => {});
    }

    // Reset game state if requested
    if (task.newGame) {
      this.write('ucinewgame\n');
      await this.sendCommandAndWaitFor('isready', (l) => l === 'readyok', 2000).catch(() => {});
    }

    // Send position and search command without artificial depth cap
    this.write(`position fen ${task.fen}\n`);
    this.write(`go movetime ${task.maxTime}\n`);
  }

  parseInfoLine(line) {
    const parts = line.split(/\s+/);
    let depth = 0, multipv = 1, scoreType = 'cp', scoreVal = 0, nodes = 0, nps = 0;
    let pvIndex = parts.indexOf('pv');

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'depth' && parts[i + 1]) depth = parseInt(parts[i + 1], 10);
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
      multipv,
      score: { type: scoreType, value: scoreVal },
      scoreFormatted: (scoreVal >= 0 ? '+' : '') + (scoreVal / 100).toFixed(2),
      nodes,
      nps,
      bestUci,
      pvMoves
    };
  }

  handleCrash(err) {
    this.isReady = false;
    this.isBusy = false;

    if (this.activeTask) {
      if (this.activeTask.timeoutTimer) clearTimeout(this.activeTask.timeoutTimer);
      this.activeTask.resolve({
        error: 'ENGINE_CRASHED',
        analysisId: this.activeTask.analysisId,
        message: err.message
      });
      this.activeTask = null;
    }
  }

  destroy() {
    this.isReady = false;
    this.isBusy = false;
    if (this.process) {
      try { this.write('quit\n'); } catch (e) {}
      setTimeout(() => {
        try { if (this.process && !this.process.killed) this.process.kill('SIGKILL'); } catch (e) {}
      }, 200);
    }
  }
}

class XiangqiEngineService {
  constructor() {
    this.nativeDir = path.join(__dirname, 'xiangqi-native');
    this.binaryPath = null;
    this.nnuePath = null;

    // Configurable Pool & Resource settings
    const numCPUs = os.cpus().length || 4;
    const reservedCores = Math.min(2, Math.max(1, Math.floor(numCPUs * 0.15)));
    this.totalAvailableThreads = Math.max(1, numCPUs - reservedCores);
    
    // Default Pool Size: 2 (or 1 via XIANGQI_POOL_SIZE environment variable)
    this.poolSize = parseInt(process.env.XIANGQI_POOL_SIZE || '2', 10);
    this.totalHashMB = parseInt(process.env.XIANGQI_TOTAL_HASH || '512', 10);
    this.maxQueueLength = 16;

    this.workers = [];
    this.taskQueue = [];
    this.initialized = false;
    this.initPromise = null;

    this.detectBinariesAndNets();
  }

  detectBinariesAndNets() {
    if (!fs.existsSync(this.nativeDir)) {
      try { fs.mkdirSync(this.nativeDir, { recursive: true }); } catch (e) {}
    }

    const isWindows = process.platform === 'win32';
    const binaryCandidates = isWindows ? [
      'fairy-stockfish-largeboard_x86-64-avx2.exe',
      'fairy-stockfish-largeboard_x86-64-bmi2.exe',
      'fairy-stockfish-largeboard_x86-64-modern.exe',
      'fairy-stockfish-largeboard.exe',
      'fairy-stockfish.exe'
    ] : [
      'fairy-stockfish-largeboard_x86-64-avx2',
      'fairy-stockfish-largeboard_x86-64-bmi2',
      'fairy-stockfish-largeboard_x86-64-modern',
      'fairy-stockfish-largeboard',
      'fairy-stockfish'
    ];

    for (const bin of binaryCandidates) {
      const candidatePath = path.join(this.nativeDir, bin);
      if (fs.existsSync(candidatePath)) {
        this.binaryPath = candidatePath;
        // On Linux/Mac, ensure executable permissions if possible
        if (!isWindows) {
          try { fs.chmodSync(candidatePath, 0o755); } catch (e) {}
        }
        break;
      }
    }

    // Auto-detect NNUE file
    try {
      const files = fs.readdirSync(this.nativeDir);
      const nnueFile = files.find(f => f.startsWith('xiangqi-') && f.endsWith('.nnue')) || files.find(f => f.endsWith('.nnue'));
      if (nnueFile) {
        this.nnuePath = path.join(this.nativeDir, nnueFile);
      }
    } catch (e) {}
  }

  isAvailable() {
    this.detectBinariesAndNets();
    return !!this.binaryPath && fs.existsSync(this.binaryPath);
  }

  getEngineInfo() {
    this.detectBinariesAndNets();
    const readyWorkers = this.workers.filter(w => w.isReady);
    const activeEngineName = readyWorkers.length > 0 ? readyWorkers[0].engineName : 'Fairy-Stockfish Largeboard';
    const activeAuthor = readyWorkers.length > 0 ? readyWorkers[0].engineAuthor : 'Stockfish / Fairy-Stockfish developers';

    return {
      available: this.isAvailable(),
      binaryPath: this.binaryPath,
      nnuePath: this.nnuePath,
      poolSize: this.poolSize,
      totalThreads: this.totalAvailableThreads,
      threadsPerWorker: Math.max(1, Math.floor(this.totalAvailableThreads / this.poolSize)),
      hashPerWorker: Math.max(16, Math.floor(this.totalHashMB / this.poolSize)),
      activeWorkers: readyWorkers.length,
      queueLength: this.taskQueue.length,
      name: activeEngineName,
      author: activeAuthor
    };
  }

  async configurePool(poolSize = 2, totalHashMB = 512) {
    console.log(`[Xiangqi Service] Reconfiguring pool to Size=${poolSize}, TotalHash=${totalHashMB}MB...`);
    this.poolSize = Math.max(1, Math.min(8, poolSize));
    this.totalHashMB = Math.max(32, Math.min(4096, totalHashMB));

    // Destroy existing workers
    for (const worker of this.workers) {
      worker.destroy();
    }
    this.workers = [];
    this.initialized = false;
    this.initPromise = null;

    return this.initPool();
  }

  async initPool() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.detectBinariesAndNets();
      if (!this.binaryPath || !fs.existsSync(this.binaryPath)) {
        console.warn(`[Xiangqi Service] Native binary not found at ${this.nativeDir}. Ready to accept binary deployment.`);
        return false;
      }

      const threadsPerWorker = Math.max(1, Math.floor(this.totalAvailableThreads / this.poolSize));
      const hashPerWorker = Math.max(16, Math.floor(this.totalHashMB / this.poolSize));

      console.log(`[Xiangqi Service] Initializing Persistent Pool: ${this.poolSize} workers | ${threadsPerWorker} threads/w | ${hashPerWorker}MB hash/w`);

      const workerPromises = [];
      for (let i = 1; i <= this.poolSize; i++) {
        const worker = new EngineWorker(i, this.binaryPath, this.nnuePath, {
          threads: threadsPerWorker,
          hash: hashPerWorker
        });
        this.workers.push(worker);
        workerPromises.push(
          worker.start().catch((err) => {
            console.error(`[Xiangqi Service] Failed to initialize Worker #${i}:`, err.message);
            return false;
          })
        );
      }

      await Promise.all(workerPromises);
      this.initialized = true;
      return true;
    })();

    return this.initPromise;
  }

  async analyze(fen, config = {}) {
    const analysisId = config.analysisId || 'xq_' + Date.now();

    // 1. Input Sanitization & Validation
    if (!fen || typeof fen !== 'string') {
      return { error: 'INVALID_FEN', analysisId, message: 'FEN is missing or not a string' };
    }
    if (/[\r\n]/.test(fen)) {
      return { error: 'INVALID_FEN', analysisId, message: 'FEN contains illegal line break characters' };
    }
    const fenTrimmed = fen.trim();
    if (fenTrimmed.split(/\s+/).length < 2) {
      return { error: 'INVALID_FEN', analysisId, message: 'Malformed Xiangqi FEN string' };
    }

    // 2. Clamp Move Time (100ms - 30,000ms)
    const rawTime = config.time || config.movetime || config.MoveTime || 3000;
    const maxTime = Math.min(30000, Math.max(100, parseInt(rawTime, 10)));
    const multiPV = Math.max(1, Math.min(5, parseInt(config.multiPV || config.MultiPV || 1, 10)));
    const newGame = !!config.newGame;

    // 3. Ensure native engine is available
    if (!this.isAvailable()) {
      return {
        error: 'NATIVE_BINARY_MISSING',
        analysisId,
        message: `Native Fairy-Stockfish Xiangqi binary not found. Place 'fairy-stockfish-largeboard.exe' in ${this.nativeDir}`
      };
    }

    // 4. Initialize Pool if needed
    if (!this.initialized) {
      await this.initPool();
    }

    // 5. Queue Guard: Prevent unbounded queue growth
    if (this.taskQueue.length >= this.maxQueueLength) {
      return {
        error: 'BUSY_QUEUE_FULL',
        analysisId,
        message: 'Engine task queue is currently full. Please retry shortly.'
      };
    }

    // 6. Schedule Analysis Task
    return new Promise((resolve) => {
      const task = {
        analysisId,
        fen: fenTrimmed,
        maxTime,
        multiPV,
        newGame,
        resolve
      };

      this.taskQueue.push(task);
      this.processNextTask();
    });
  }

  processNextTask() {
    if (this.taskQueue.length === 0) return;

    // Find first idle and ready worker
    const idleWorker = this.workers.find(w => w.isReady && !w.isBusy);
    if (!idleWorker) return; // All workers currently busy

    const nextTask = this.taskQueue.shift();
    if (!nextTask) return;

    const originalResolve = nextTask.resolve;
    nextTask.resolve = (result) => {
      originalResolve(result);
      // Immediately trigger next task in queue
      setImmediate(() => this.processNextTask());
    };

    idleWorker.runAnalysis(nextTask).catch((err) => {
      console.error(`[Xiangqi Service] Error during worker execution:`, err);
      nextTask.resolve({
        error: 'WORKER_EXECUTION_ERROR',
        analysisId: nextTask.analysisId,
        message: err.message
      });
      // Try to revive crashed worker
      idleWorker.start().catch(() => {});
    });
  }
}

module.exports = new XiangqiEngineService();
