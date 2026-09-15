/**
 * Official Stockfish Engine Web Worker (UCI Protocol Engine - Stockfish 18 SIMD)
 * Loads local Stockfish 18 WebAssembly Engine directly into background Worker thread.
 * Strict UCI Protocol Implementation with Version Gating and Analysis ID locking.
 */

let engine = null;
let currentAnalysisId = null;
let currentPVs = [];
let currentDepth = 0;
let currentNodes = 0;
let currentNps = 0;
let engineReady = false;
let engineVersion = 'Stockfish 18 WASM SIMD';

const REJECTED_PATTERNS = [/2019/i, /multi-variant/i, /stockfish\s*(10|9|8|7|6|5|4|3|2|1)\b/i];

function isVersionAllowed(ver) {
  if (!ver) return false;
  for (let p of REJECTED_PATTERNS) {
    if (p.test(ver)) return false;
  }
  return true;
}

try {
  importScripts('stockfish-18-simd.js');
  if (typeof Stockfish === 'function') {
    engine = Stockfish();
  }
} catch (err) {
  console.error('Failed to load local stockfish-18-simd.js:', err);
}

if (engine) {
  engine.onmessage = function(event) {
    const line = typeof event === 'object' ? (event.data || event) : event;
    if (typeof line === 'string') {
      if (line.startsWith('id name ')) {
        const name = line.replace('id name ', '').trim();
        if (!isVersionAllowed(name)) {
          console.error('[VERSION GATING REJECTED WORKER ENGINE]:', name);
          engineReady = false;
          engine = null;
          self.postMessage({ type: 'error', error: 'ENGINE_REJECTED', message: `Rejected legacy engine: ${name}` });
          return;
        }
        engineVersion = `${name} WASM SIMD`;
      }
      parseUciLine(line);
    }
  };
  engine.postMessage('uci');
  engine.postMessage('isready');
}

self.onmessage = function(e) {
  const { command, fen, depth, time, multiPV, analysisId, threads, hash } = e.data;

  if (command === 'init') {
    self.postMessage({ type: 'ready', engineReady: !!engine && engineReady, version: engineVersion });
  } else if (command === 'analyze') {
    currentAnalysisId = analysisId;
    runStockfishAnalysis(fen, depth || 20, time || 3000, multiPV || 1, analysisId, threads, hash);
  } else if (command === 'stop') {
    if (engine) engine.postMessage('stop');
    self.postMessage({ type: 'stopped', analysisId: currentAnalysisId });
  }
};

function runStockfishAnalysis(fen, targetDepth, targetTimeLimit, multiPV, analysisId, threads, hash) {
  currentPVs = [];
  currentDepth = 0;
  currentNodes = 0;
  currentNps = 0;

  if (!engine || !engineReady) {
    self.postMessage({
      type: 'error',
      error: 'ENGINE_UNAVAILABLE',
      analysisId,
      message: 'Stockfish 18 WASM Worker is unavailable or rejected'
    });
    return;
  }

  engine.postMessage('stop');
  engine.postMessage('ucinewgame');
  if (threads) engine.postMessage(`setoption name Threads value ${threads}`);
  if (hash) engine.postMessage(`setoption name Hash value ${hash}`);
  engine.postMessage(`setoption name MultiPV value ${multiPV}`);
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage(`go depth ${targetDepth} movetime ${targetTimeLimit}`);
}

function parseUciLine(line) {
  if (line === 'readyok') {
    engineReady = true;
    self.postMessage({ type: 'ready', engineReady: true, version: engineVersion });
    return;
  }

  if (line.startsWith('info') && line.includes('score')) {
    const depthMatch = line.match(/depth (\d+)/);
    const nodesMatch = line.match(/nodes (\d+)/);
    const npsMatch = line.match(/nps (\d+)/);
    const multiPvMatch = line.match(/multipv (\d+)/);
    const pvMatch = line.match(/ pv (.+)/);

    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
    const nodes = nodesMatch ? parseInt(nodesMatch[1], 10) : 0;
    const nps = npsMatch ? parseInt(npsMatch[1], 10) : 0;
    const pvIndex = multiPvMatch ? parseInt(multiPvMatch[1], 10) : 1;

    let scoreObj = { type: 'cp', value: 0 };
    if (line.includes('score cp')) {
      const cpMatch = line.match(/score cp (-?\d+)/);
      if (cpMatch) scoreObj = { type: 'cp', value: parseInt(cpMatch[1], 10) };
    } else if (line.includes('score mate')) {
      const mateMatch = line.match(/score mate (-?\d+)/);
      if (mateMatch) scoreObj = { type: 'mate', value: parseInt(mateMatch[1], 10) };
    }

    const pvMoves = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

    if (depth > currentDepth) currentDepth = depth;
    if (nodes > currentNodes) currentNodes = nodes;
    if (nps > currentNps) currentNps = nps;

    const pvInfo = {
      multipv: pvIndex,
      depth,
      score: scoreObj,
      nodes,
      nps,
      bestUci: pvMoves[0] || '',
      pvMoves
    };

    const existingIdx = currentPVs.findIndex(p => p.multipv === pvIndex);
    if (existingIdx !== -1) {
      currentPVs[existingIdx] = pvInfo;
    } else {
      currentPVs.push(pvInfo);
    }

    currentPVs.sort((a, b) => a.multipv - b.multipv);

    self.postMessage({
      type: 'progress',
      analysisId: currentAnalysisId,
      depth: currentDepth,
      nodes: currentNodes,
      nps: currentNps,
      lines: currentPVs,
      version: engineVersion
    });
  }

  if (line.startsWith('bestmove')) {
    const parts = line.split(/\s+/);
    const bestMoveUci = parts[1] || '';
    const ponderUci = parts[3] || '';

    self.postMessage({
      type: 'complete',
      analysisId: currentAnalysisId,
      bestMoveUci,
      ponderUci,
      depth: currentDepth,
      nodes: currentNodes,
      nps: currentNps,
      lines: currentPVs,
      version: engineVersion
    });
  }
}
