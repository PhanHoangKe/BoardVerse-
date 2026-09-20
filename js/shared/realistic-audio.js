/**
 * BoardVerse Realistic Wood Audio FX
 * Physical Modeling Audio Synthesizer for tactile wood chess & xiangqi pieces.
 * 100% offline, zero latency, no external assets required.
 */
export class RealisticAudioFX {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.initContext();
  }

  initContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    } catch (e) {
      console.warn('AudioContext not supported:', e);
    }
  }

  ensureContext() {
    if (!this.ctx) {
      this.initContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.isMuted = !!muted;
  }

  /**
   * Generates a realistic physical wood knock sound
   */
  playWoodKnock(pitch = 280, duration = 0.09, volume = 0.25, sharpness = 0.8) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const t = this.ctx.currentTime;

      // Primary body resonance (sine wave decaying fast)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(pitch, t);
      osc1.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + duration);

      gain1.gain.setValueAtTime(volume, t);
      gain1.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(t);
      osc1.stop(t + duration);

      // Wood surface click (high-frequency tactile noise impulse)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(pitch * 3.2, t);
      osc2.frequency.exponentialRampToValueAtTime(pitch * 1.5, t + duration * 0.4);

      gain2.gain.setValueAtTime(volume * sharpness, t);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.35);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t);
      osc2.stop(t + duration * 0.4);

      // Low thump (wood board hollow resonance)
      const osc3 = this.ctx.createOscillator();
      const gain3 = this.ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(pitch * 0.6, t);
      osc3.frequency.exponentialRampToValueAtTime(80, t + duration * 1.2);

      gain3.gain.setValueAtTime(volume * 0.4, t);
      gain3.gain.exponentialRampToValueAtTime(0.0001, t + duration * 1.2);

      osc3.connect(gain3);
      gain3.connect(this.ctx.destination);
      osc3.start(t);
      osc3.stop(t + duration * 1.2);
    } catch (e) {
      // Ignore audio synthesis errors
    }
  }

  playMove() {
    // Crisp natural piece placement
    this.playWoodKnock(320, 0.08, 0.22, 0.9);
  }

  playCapture() {
    // Heavy sharp piece-on-piece collision
    this.playWoodKnock(460, 0.11, 0.35, 1.2);
    setTimeout(() => {
      this.playWoodKnock(220, 0.09, 0.18, 0.6);
    }, 28);
  }

  playCheck() {
    // Sharp knock + subtle warning ping
    this.playWoodKnock(520, 0.12, 0.35, 1.1);
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(440, t + 0.25);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    } catch (e) {}
  }

  playCastle() {
    // Double wood knock
    this.playWoodKnock(340, 0.07, 0.22, 0.8);
    setTimeout(() => {
      this.playWoodKnock(290, 0.08, 0.25, 0.9);
    }, 90);
  }

  playGameOver() {
    this.playWoodKnock(260, 0.15, 0.3, 0.8);
    setTimeout(() => {
      this.playWoodKnock(200, 0.25, 0.35, 0.7);
    }, 120);
  }

  playPuzzleSuccess() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, index) => {
        setTimeout(() => {
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.2);
        }, index * 60);
      });
    } catch (e) {}
  }

  playPuzzleFail() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const notes = [330, 260];
      notes.forEach((freq, index) => {
        setTimeout(() => {
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.18);
        }, index * 90);
      });
    } catch (e) {}
  }
}

export default RealisticAudioFX;
if (typeof window !== 'undefined') {
  window.RealisticAudioFX = RealisticAudioFX;
}
