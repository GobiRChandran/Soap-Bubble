/**
 * AudioManager
 * Procedural Web Audio API soundscape engine for Soap Bubble Whisper.
 * Provides subtle, polished, playful audio synthesis adhering to the prioritized mix:
 * 1. Interaction sounds (Intro cue, UI)
 * 2. Air / wind ambience (dynamically modulated by flying & wand movement)
 * 3. Bubble burst sounds (delicate, satisfying pop with pitch variation) & movement
 * 4. Cloud passing sounds (soft airy whooshes with natural variation)
 * 5. Background music (gentle, warm, floating pentatonic bed low in the mix)
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.reducedMotion = false;

    // Mix Busses (Gain Nodes)
    this.masterGain = null;
    this.interactionGain = null;
    this.windGain = null;
    this.bubbleGain = null;
    this.cloudGain = null;
    this.musicGain = null;

    // Wind Ambience State
    this.windNoiseSource = null;
    this.windFilter1 = null;
    this.windFilter2 = null;
    this.windLfo = null;
    this.windLfoGain = null;
    this.currentWindSpeed = 0.15;
    this.targetWindSpeed = 0.15;
    this.windAnimFrame = null;
    this.isWindActive = false;

    // Bubble Growth Modulation State
    this.bubbleGrowthOsc = null;
    this.bubbleGrowthGain = null;
    this.bubbleGrowthFilter = null;
    this.isBubbleGrowing = false;

    // Music State
    this.musicInterval = null;
    this.isMusicPlaying = false;
    this.musicChordIndex = 0;
    this.activeMusicNodes = new Set();

    // Cloud whoosh throttling
    this.lastCloudWhooshTime = 0;

    // UI Sound Buffers & Playback State
    this.soundBuffers = {
      entry: null,
      start: null,
      microphone: null,
      score: null,
      continue: null,
      final: null,
      replay: null
    };
    this.activeUISources = {};
    this.lastPlayTimes = {};
    this._soundsLoaded = false;

    // Check accessibility reduced-motion preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = motionQuery.matches;
      motionQuery.addEventListener('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }

    // Eagerly instantiate AudioContext in suspended state to preload and decode sound buffers
    try {
      const AudioCtxClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
        this._setupMixer();
        this.loadSounds();
      }
    } catch (e) {
      // Handled gracefully in init() upon user gesture
    }
  }

  /**
   * Initializes or resumes the AudioContext upon user gesture
   */
  async init() {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx) {
        this.ctx = new AudioCtxClass();
        this._setupMixer();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (!this._soundsLoaded) {
        this.loadSounds();
      }

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.warn('AudioManager: Web Audio API initialization failed:', err);
      return false;
    }
  }

  /**
   * Asynchronously loads and decodes the UI sound files.
   * Missing audio files fail gracefully without throwing or breaking the game.
   */
  async loadSounds() {
    if (!this.ctx || this._soundsLoaded) return;
    this._soundsLoaded = true;

    const soundList = ['entry', 'start', 'microphone', 'score', 'continue', 'final', 'replay'];
    await Promise.all(
      soundList.map(async (name) => {
        try {
          const res = await fetch(`/sounds/${name}.mp3`);
          if (!res.ok) {
            this.soundBuffers[name] = null;
            return;
          }
          const arrayBuffer = await res.arrayBuffer();
          this.soundBuffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
          // Graceful fallback: missing audio never breaks the game
          this.soundBuffers[name] = null;
        }
      })
    );
  }

  /**
   * Plays a UI sound with debouncing, anti-stacking, and clean lifecycle management.
   * @param {string} name - Sound key in this.soundBuffers
   * @param {Object} options - { volume, cooldown, offset, duration }
   */
  playUISound(name, options = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const buffer = this.soundBuffers[name];
    if (!buffer) return; // Missing audio never breaks the game

    const now = performance.now();
    const lastTime = this.lastPlayTimes[name] || 0;
    const cooldown = options.cooldown ?? 180; // ms to prevent rapid click stacking
    if (now - lastTime < cooldown) return;
    this.lastPlayTimes[name] = now;

    // Gracefully stop any active instance of this specific sound to avoid stacking
    if (this.activeUISources[name]) {
      try {
        const prev = this.activeUISources[name];
        prev.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02);
        setTimeout(() => {
          try {
            prev.source.stop();
            prev.source.disconnect();
            prev.gain.disconnect();
          } catch (e) {}
        }, 25);
      } catch (e) {}
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.ctx.createGain();
      const gainValue = options.volume ?? 0.6;
      gainNode.gain.setValueAtTime(gainValue, this.ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(this.uiGain || this.interactionGain);

      this.activeUISources[name] = { source, gain: gainNode };

      source.onended = () => {
        if (this.activeUISources[name]?.source === source) {
          delete this.activeUISources[name];
        }
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch (e) {}
      };

      if (options.duration) {
        source.start(0, options.offset || 0, options.duration);
      } else {
        source.start(0, options.offset || 0);
      }
    } catch (err) {
      console.warn(`AudioManager: failed to play UI sound "${name}":`, err);
    }
  }

  /* Specific UI Trigger Methods */

  playEntrySound() {
    // ENTRY is intentionally silent per specification - do not force an entry sound
  }

  playStartSound() {
    // START BLOWING: gentle bubble-pop (~48ms), tactile bubble interaction
    this.playUISound('start', { volume: 0.11, cooldown: 250 });
  }

  playMicrophoneSound() {
    // USE MICROPHONE: subtle confirmation click (first clean transient)
    this.playUISound('microphone', { volume: 0.10, duration: 0.25, cooldown: 250 });
  }

  playScoreSound() {
    // SCORE / RESULT: warm musical chime when result card appears
    this.playUISound('score', { volume: 0.11, cooldown: 300 });
  }

  playContinueSound() {
    // CONTINUE: clean tactile progression click
    this.playUISound('continue', { volume: 0.10, cooldown: 250 });
  }

  playFinalSound() {
    // WELL BLOWN / FINAL: resolution chime, slightly louder than score (0.13 vs 0.11)
    this.playUISound('final', { volume: 0.13, cooldown: 300 });
  }

  playReplaySound() {
    // PLAY AGAIN: gentle restart cue
    this.playUISound('replay', { volume: 0.08, cooldown: 250 });
  }

  /**
   * Sets up the gain nodes following the specified priority hierarchy
   */
  _setupMixer() {
    const now = this.ctx.currentTime;

    // Master Bus - calibrated to keep overall levels clean and prevent clipping
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, now);
    this.masterGain.connect(this.ctx.destination);

    // Dynamics compressor for clean, cohesive mastering
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(3, now);
    compressor.attack.setValueAtTime(0.005, now);
    compressor.release.setValueAtTime(0.15, now);
    compressor.connect(this.masterGain);

    // UI SFX Bus - calibrated unity gain for recorded UI assets
    this.uiGain = this.ctx.createGain();
    this.uiGain.gain.setValueAtTime(1.0, now);
    this.uiGain.connect(compressor);

    // Priority 1: Interaction Sounds (crisp, prominent, delicate)
    this.interactionGain = this.ctx.createGain();
    this.interactionGain.gain.setValueAtTime(0.35, now);
    this.interactionGain.connect(compressor);

    // Priority 2: Air/Wind Ambience (responsive, subtle background air)
    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.20, now);
    this.windGain.connect(compressor);

    // Priority 3: Bubble Burst & Movement (satisfying, delicate pop & shimmer)
    this.bubbleGain = this.ctx.createGain();
    this.bubbleGain.gain.setValueAtTime(0.30, now);
    this.bubbleGain.connect(compressor);

    // Priority 4: Cloud Passing Sounds (soft, airy, low-frequency whooshes)
    this.cloudGain = this.ctx.createGain();
    this.cloudGain.gain.setValueAtTime(0.16, now);
    this.cloudGain.connect(compressor);

    // Priority 5: Background Music (very subtle bed, supporting without dominating)
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.09, now);
    this.musicGain.connect(compressor);
  }

  /* =========================================================================
   * 1. PLAY BUTTON / GAME INTRO CUE
   * ========================================================================= */

  /**
   * Plays a subtle, polished game-intro sound cue at the exact moment Play is clicked.
   * Crystalline, warm harmonic chime (C5 + G5 + E6) with soft bell harmonics.
   */
  playIntroCue() {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const t = this.ctx.currentTime;
    const notes = [
      { freq: 523.25, gain: 0.18, type: 'sine', decay: 0.55 },   // C5
      { freq: 783.99, gain: 0.14, type: 'sine', decay: 0.65 },   // G5
      { freq: 1318.51, gain: 0.08, type: 'sine', decay: 0.45 },  // E6
      { freq: 1567.98, gain: 0.04, type: 'triangle', decay: 0.35 } // G6 harmonic
    ];

    notes.forEach((n, i) => {
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, t);

      // Micro detune for celestial shimmer
      osc.detune.setValueAtTime((i - 1.5) * 4, t);

      // Delicate envelope: instant soft attack, gentle exponential decay
      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.exponentialRampToValueAtTime(n.gain, t + 0.015);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t + n.decay);

      osc.connect(noteGain);
      noteGain.connect(this.interactionGain);

      osc.start(t);
      osc.stop(t + n.decay + 0.05);
    });
  }

  /**
   * Subtle, soft button tap for UI interactions
   */
  playButtonTap() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.04);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.interactionGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  /* =========================================================================
   * 2. AIR / WIND AMBIENCE
   * ========================================================================= */

  /**
   * Generates a 2-second looped pink-noise buffer for natural airy wind
   */
  _createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.07;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  /**
   * Starts the subtle airy wind ambience throughout the flying/air sequence.
   */
  startWindAmbience() {
    if (!this.ctx || this.isWindActive) return;

    const t = this.ctx.currentTime;
    const noiseBuffer = this._createNoiseBuffer();

    this.windNoiseSource = this.ctx.createBufferSource();
    this.windNoiseSource.buffer = noiseBuffer;
    this.windNoiseSource.loop = true;

    // Dual-stage resonant filters for airy open-sky wind
    this.windFilter1 = this.ctx.createBiquadFilter();
    this.windFilter1.type = 'bandpass';
    this.windFilter1.frequency.setValueAtTime(380, t);
    this.windFilter1.Q.setValueAtTime(1.2, t);

    this.windFilter2 = this.ctx.createBiquadFilter();
    this.windFilter2.type = 'lowpass';
    this.windFilter2.frequency.setValueAtTime(900, t);
    this.windFilter2.Q.setValueAtTime(0.7, t);

    // Gentle LFO for natural outdoor breeze breathing (0.35 Hz)
    this.windLfo = this.ctx.createOscillator();
    this.windLfo.frequency.setValueAtTime(0.35, t);

    this.windLfoGain = this.ctx.createGain();
    this.windLfoGain.gain.setValueAtTime(60, t);

    this.windLfo.connect(this.windLfoGain);
    this.windLfoGain.connect(this.windFilter1.frequency);

    // Initial wind volume fade-in
    const entryGain = this.ctx.createGain();
    entryGain.gain.setValueAtTime(0.0001, t);
    entryGain.gain.exponentialRampToValueAtTime(0.22, t + 1.2);

    this.windNoiseSource.connect(this.windFilter1);
    this.windFilter1.connect(this.windFilter2);
    this.windFilter2.connect(entryGain);
    entryGain.connect(this.windGain);

    this.windNoiseSource.start(t);
    this.windLfo.start(t);
    this.isWindActive = true;

    this._startWindLerpLoop();
  }

  /**
   * Smoothly updates wind speed (0.0 = calm breeze, 1.0 = swift flight)
   */
  setWindSpeed(speed) {
    this.targetWindSpeed = Math.max(0.08, Math.min(speed, 1.0));
  }

  _startWindLerpLoop() {
    const update = () => {
      if (!this.isWindActive || !this.ctx) return;

      // Smooth interpolation
      this.currentWindSpeed += (this.targetWindSpeed - this.currentWindSpeed) * 0.08;

      const t = this.ctx.currentTime;
      if (this.windFilter1 && this.windFilter2 && this.windGain) {
        // Higher speed raises filter cutoff and slightly increases air intensity
        const centerFreq = 300 + this.currentWindSpeed * 650;
        const lowpassFreq = 750 + this.currentWindSpeed * 1200;
        const targetVol = 0.12 + this.currentWindSpeed * 0.18;

        this.windFilter1.frequency.setTargetAtTime(centerFreq, t, 0.1);
        this.windFilter2.frequency.setTargetAtTime(lowpassFreq, t, 0.1);
        this.windGain.gain.setTargetAtTime(targetVol, t, 0.1);
      }

      this.windAnimFrame = requestAnimationFrame(update);
    };

    if (this.windAnimFrame) cancelAnimationFrame(this.windAnimFrame);
    this.windAnimFrame = requestAnimationFrame(update);
  }

  stopWindAmbience(fadeDuration = 1.5) {
    if (!this.isWindActive || !this.ctx) return;

    if (this.windAnimFrame) {
      cancelAnimationFrame(this.windAnimFrame);
      this.windAnimFrame = null;
    }

    const t = this.ctx.currentTime;
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.0001, t, fadeDuration * 0.3);
    }

    setTimeout(() => {
      try {
        if (this.windNoiseSource) {
          this.windNoiseSource.stop();
          this.windNoiseSource.disconnect();
          this.windNoiseSource = null;
        }
        if (this.windLfo) {
          this.windLfo.stop();
          this.windLfo.disconnect();
          this.windLfo = null;
        }
      } catch (e) {}
      this.isWindActive = false;
    }, fadeDuration * 1000);
  }

  /* =========================================================================
   * 3. CLOUDS WHOOSH
   * ========================================================================= */

  /**
   * Triggered when an existing cloud passes close to the camera/foreground.
   * Very soft airy whoosh with organic variation in timing, pitch, and intensity.
   */
  playCloudWhoosh({ pan = 0, intensity = 0.5 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const now = performance.now();
    // Throttle to ensure multiple clouds do not create repetitive obvious sounds
    if (now - this.lastCloudWhooshTime < 850) return;
    this.lastCloudWhooshTime = now;

    const t = this.ctx.currentTime;
    const duration = 1.2 + Math.random() * 0.5; // 1.2s - 1.7s natural swell

    // Filtered noise swoosh
    const buffer = this._createNoiseBuffer();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Resonant bandpass filter that sweeps smoothly upwards and then back down
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(1.1 + Math.random() * 0.4, t);

    const baseFreq = 240 + Math.random() * 60;
    const peakFreq = 480 + Math.random() * 120 + intensity * 80;

    filter.frequency.setValueAtTime(baseFreq, t);
    filter.frequency.exponentialRampToValueAtTime(peakFreq, t + duration * 0.45);
    filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, t + duration);

    // Very soft volume envelope
    const whooshGain = this.ctx.createGain();
    const maxGain = 0.12 + Math.random() * 0.06;
    whooshGain.gain.setValueAtTime(0.0001, t);
    whooshGain.gain.exponentialRampToValueAtTime(maxGain, t + duration * 0.4);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    // Stereo panning if supported
    let outputNode = whooshGain;
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.6, Math.min(pan, 0.6)), t);
      whooshGain.connect(panner);
      outputNode = panner;
    }

    source.connect(filter);
    filter.connect(whooshGain);
    outputNode.connect(this.cloudGain);

    source.start(t);
    source.stop(t + duration + 0.1);
  }

  /* =========================================================================
   * 4. BUBBLES
   * ========================================================================= */

  /**
   * Continuous gentle liquid bubble inflation sound responding to blowing
   */
  setBubbleGrowth(progress, intensity = 0.5) {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const t = this.ctx.currentTime;

    if (!this.isBubbleGrowing) {
      // Start bubble growth oscillator
      this.bubbleGrowthOsc = this.ctx.createOscillator();
      this.bubbleGrowthOsc.type = 'sine';

      this.bubbleGrowthFilter = this.ctx.createBiquadFilter();
      this.bubbleGrowthFilter.type = 'lowpass';
      this.bubbleGrowthFilter.frequency.setValueAtTime(650, t);

      this.bubbleGrowthGain = this.ctx.createGain();
      this.bubbleGrowthGain.gain.setValueAtTime(0.0001, t);
      this.bubbleGrowthGain.gain.exponentialRampToValueAtTime(0.08, t + 0.1);

      this.bubbleGrowthOsc.connect(this.bubbleGrowthFilter);
      this.bubbleGrowthFilter.connect(this.bubbleGrowthGain);
      this.bubbleGrowthGain.connect(this.bubbleGain);

      this.bubbleGrowthOsc.start(t);
      this.isBubbleGrowing = true;
    }

    // Dynamic pitch rise as bubble expands: 220Hz -> 480Hz
    const targetFreq = 220 + progress * 240 + (intensity * 40);
    this.bubbleGrowthOsc.frequency.setTargetAtTime(targetFreq, t, 0.08);

    // Gentle breath air intensity
    const targetGain = 0.05 + intensity * 0.07;
    this.bubbleGrowthGain.gain.setTargetAtTime(targetGain, t, 0.08);
  }

  stopBubbleGrowth() {
    if (!this.isBubbleGrowing || !this.ctx) return;

    const t = this.ctx.currentTime;
    if (this.bubbleGrowthGain) {
      this.bubbleGrowthGain.gain.setTargetAtTime(0.0001, t, 0.06);
    }

    setTimeout(() => {
      try {
        if (this.bubbleGrowthOsc) {
          this.bubbleGrowthOsc.stop();
          this.bubbleGrowthOsc.disconnect();
          this.bubbleGrowthOsc = null;
        }
      } catch (e) {}
      this.isBubbleGrowing = false;
    }, 80);
  }

  /**
   * Tiny soft bubble-pop sound exactly synchronized with the burst.
   * Delicate, satisfying, organic. Slightly varies pitch/timing so consecutive bursts never sound identical.
   */
  playBubblePop(size = 'large') {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const t = this.ctx.currentTime;
    this.stopBubbleGrowth();

    // Base pitch depends on size (large bubbles have slightly lower pop, small have higher delicate pop)
    let basePitch = 480;
    if (size === 'small') basePitch = 620;
    else if (size === 'medium') basePitch = 530;

    // Subtle natural variation (±10%)
    const pitchRandom = 1.0 + (Math.random() * 0.2 - 0.1);
    const startFreq = basePitch * pitchRandom;
    const endFreq = startFreq * 0.28;
    const duration = 0.045 + Math.random() * 0.015; // 45ms - 60ms quick pop

    // 1. Swept sine body for the liquid pop
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    oscGain.gain.setValueAtTime(0.24, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(oscGain);
    oscGain.connect(this.bubbleGain);

    osc.start(t);
    osc.stop(t + duration + 0.01);

    // 2. Tiny soft noise burst for the delicate water droplet snap
    const noiseBuffer = this._createNoiseBuffer();
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(startFreq * 1.5, t);
    noiseFilter.Q.setValueAtTime(2.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.bubbleGain);

    noise.start(t);
    noise.stop(t + 0.04);
  }

  /**
   * Delicate floating harmonic shimmer when bubble detaches and begins flight
   */
  playBubbleFloat(size = 'large') {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const t = this.ctx.currentTime;
    this.stopBubbleGrowth();

    const baseNote = size === 'large' ? 440 : (size === 'medium' ? 554.37 : 659.25);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseNote * 0.9, t);
    osc.frequency.exponentialRampToValueAtTime(baseNote * 1.25, t + 0.45);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);

    osc.connect(gain);
    gain.connect(this.bubbleGain);

    osc.start(t);
    osc.stop(t + 0.65);
  }

  /* =========================================================================
   * 5. FLYING SEQUENCE AUDIO
   * ========================================================================= */

  /**
   * Responds to the flying animation speed (wand swing and bubble flight)
   */
  setFlightSpeed(normalizedSpeed) {
    // normalizedSpeed: 0.0 (still) to 1.0 (fast flight)
    this.setWindSpeed(0.15 + normalizedSpeed * 0.75);
  }

  /* =========================================================================
   * 6. BACKGROUND MUSIC BED
   * ========================================================================= */

  /**
   * Starts a very subtle, tranquil, floating pentatonic chord bed.
   * Low in the mix (~0.08 - 0.10 gain), gentle warm tones, calm and playful.
   */
  startMusic() {
    if (this.isMusicPlaying || !this.ctx) return;
    this.isMusicPlaying = true;

    // Gentle fade-in of the music bus
    const t = this.ctx.currentTime;
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(0.0001, t);
      this.musicGain.gain.exponentialRampToValueAtTime(0.085, t + 2.5);
    }

    // Floating pentatonic progression: Cmaj9 -> Fmaj7 -> Am9 -> Gsus4
    const chords = [
      [261.63, 329.63, 392.00, 493.88, 587.33], // C, E, G, B, D
      [220.00, 261.63, 329.63, 392.00, 440.00], // A, C, E, G, A
      [174.61, 261.63, 329.63, 392.00, 523.25], // F, C, E, G, C
      [196.00, 261.63, 293.66, 392.00, 493.88]  // G, C, D, G, B
    ];

    this.musicChordIndex = 0;

    const playChordStep = () => {
      if (!this.isMusicPlaying || !this.ctx || this.ctx.state !== 'running') return;

      const chord = chords[this.musicChordIndex % chords.length];
      this.musicChordIndex++;

      const stepTime = this.ctx.currentTime;
      const chordDuration = 3.6; // Soft, slow breathing chords

      chord.forEach((freq, idx) => {
        // Stagger note arrival slightly for celestial arpeggio bloom
        const noteDelay = idx * 0.08;
        const noteTime = stepTime + noteDelay;

        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        // Warm lowpass filter to remove harshness
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(750, noteTime);
        filter.Q.setValueAtTime(0.5, noteTime);

        // Soft envelope: 0.4s attack, long 2.2s gentle decay
        const noteVol = 0.045 / (idx * 0.4 + 1);
        noteGain.gain.setValueAtTime(0.0001, noteTime);
        noteGain.gain.exponentialRampToValueAtTime(noteVol, noteTime + 0.35);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + chordDuration - 0.2);

        osc.connect(filter);
        filter.connect(noteGain);
        noteGain.connect(this.musicGain);

        osc.start(noteTime);
        osc.stop(noteTime + chordDuration);

        this.activeMusicNodes.add(osc);
        osc.onended = () => {
          this.activeMusicNodes.delete(osc);
        };
      });
    };

    // First chord plays immediately as Play is clicked
    playChordStep();
    this.musicInterval = setInterval(playChordStep, 3500);
  }

  fadeMusicOut(duration = 2.0) {
    if (!this.isMusicPlaying || !this.ctx) return;

    const t = this.ctx.currentTime;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.0001, t, duration * 0.3);
    }

    setTimeout(() => {
      this.stopMusic();
    }, duration * 1000);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }

    this.activeMusicNodes.forEach(node => {
      try {
        node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this.activeMusicNodes.clear();
    this.isMusicPlaying = false;
  }

  /* =========================================================================
   * RESET & LIFECYCLE
   * ========================================================================= */

  reset() {
    this.stopBubbleGrowth();
    this.setWindSpeed(0.15);

    // Stop all active UI sounds so repeated Play Again cycles don't accumulate audio nodes
    if (this.ctx && this.activeUISources) {
      Object.keys(this.activeUISources).forEach((name) => {
        try {
          const item = this.activeUISources[name];
          if (item) {
            item.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
            setTimeout(() => {
              try {
                item.source.stop();
                item.source.disconnect();
                item.gain.disconnect();
              } catch (e) {}
            }, 60);
          }
        } catch (e) {}
      });
      this.activeUISources = {};
    }
    this.lastPlayTimes = {};

    // Keep wind and music ready for immediate restart
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(0.085, this.ctx.currentTime);
    }
  }
}
