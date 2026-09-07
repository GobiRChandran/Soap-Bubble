import { ScoreManager } from './ScoreManager.js';

export const GameStates = {
  START: 'START',
  WAND_IN: 'WAND_IN',
  READY: 'READY',
  GROWING: 'GROWING',
  BURSTING: 'BURSTING',
  FLOATING: 'FLOATING',
  INTERMISSION: 'INTERMISSION',
  WAND_OUT: 'WAND_OUT',
  RESULT: 'RESULT',
  END: 'END'
};

export class StateMachine {
  constructor({ lottieController, inputAdapter, audioManager, onStateChange, onLiveSizeChange, onChanceToast }) {
    this.lottie = lottieController;
    this.input = inputAdapter;
    this.audioManager = audioManager || null;
    this.onStateChange = onStateChange || (() => {});
    this.onLiveSizeChange = onLiveSizeChange || (() => {});
    this.onChanceToast = onChanceToast || (() => {});

    this.state = GameStates.START;
    this.totalChances = 3;
    this.currentChance = 1;
    this.attempts = [];

    this.bubbleSize = 'none'; // 'none' | 'small' | 'medium' | 'large'
    this.outcome = 'floated'; // 'floated' | 'popped'

    this.blowStartTime = 0;
    this.blowDuration = 0;
    this.blowIntensity = 0.5;
    this.growthProgress = 0; // 0 to 1

    this._growAnimFrame = null;
    this._overblowTimeout = null;
    this._intermissionTimer = null;
    this._lastFrameTime = 0;

    this._bindInputEvents();
  }

  setAudioManager(audioManager) {
    this.audioManager = audioManager;
  }

  _bindInputEvents() {
    this.input.onBlowStartHandler = (initialIntensity) => this.handleBlowStart(initialIntensity);
    this.input.onBlowProgressHandler = (data) => this.handleBlowProgress(data);
    this.input.onBlowReleaseHandler = (data) => this.handleBlowRelease(data);
  }

  setState(newState, data = {}) {
    this.state = newState;
    this.onStateChange(newState, data);
  }

  startGameplay() {
    this.currentChance = 1;
    this.attempts = [];
    this.bubbleSize = 'none';
    this.outcome = 'floated';
    this.growthProgress = 0;
    this.blowStartTime = 0;
    this.blowDuration = 0;

    this._clearGrowthLoop();
    clearTimeout(this._intermissionTimer);

    // Gentle music fade-in + wind ambience
    if (this.audioManager) {
      this.audioManager.startMusic();
      this.audioManager.startWindAmbience();
    }

    // Session begins at ready state with wand held in hand
    this.setState(GameStates.READY, { chance: 1, total: this.totalChances });
    this.lottie.holdAt(60);
    this.input.enable();
  }

  handleBlowStart(initialIntensity = 0.3) {
    if (this.state !== GameStates.READY) return;

    this.setState(GameStates.GROWING, { chance: this.currentChance });
    this.blowStartTime = performance.now();
    this._lastFrameTime = performance.now();
    this.blowIntensity = typeof initialIntensity === 'number' ? initialIntensity : 0.3;
    this.growthProgress = 0;
    this.bubbleSize = 'small';
    this.onLiveSizeChange('Small');

    if (this.audioManager) {
      this.audioManager.setBubbleGrowth(0, this.blowIntensity);
    }

    this._startGrowthLoop();
  }

  _startGrowthLoop() {
    this._clearGrowthLoop();

    const loop = (now) => {
      if (this.state !== GameStates.GROWING) return;

      const dt = Math.min((now - this._lastFrameTime) / 1000, 0.05);
      this._lastFrameTime = now;

      // Realistic capacity ceiling dynamically governed by airflow strength:
      // Gentle breath (~0.15 - 0.38): caps at Small (0.18 - 0.34)
      // Steady breath (~0.39 - 0.72): caps at Medium (0.42 - 0.70)
      // Strong breath (~0.73 - 0.88): caps at Large (0.75 - 1.00)
      let targetCeiling = 0.32;
      if (this.blowIntensity > 0.72) {
        targetCeiling = 1.0;
      } else if (this.blowIntensity > 0.38) {
        const t = (this.blowIntensity - 0.38) / (0.72 - 0.38);
        targetCeiling = 0.42 + t * 0.28;
      } else {
        const t = Math.max(0, (this.blowIntensity - 0.12) / (0.38 - 0.12));
        targetCeiling = 0.18 + t * 0.14;
      }

      // Expansion rate calibrated to natural human breathing rhythm
      const breathForce = 0.72 + (this.blowIntensity * 0.42);
      const headroom = targetCeiling - this.growthProgress;
      if (headroom > 0.003) {
        const ease = Math.max(0.24, Math.min(headroom / 0.22, 1.0));
        this.growthProgress = Math.min(this.growthProgress + dt * breathForce * ease, targetCeiling);
      }

      this.blowDuration = (now - this.blowStartTime) / 1000;

      // Update dynamic bubble growth sound
      if (this.audioManager) {
        this.audioManager.setBubbleGrowth(this.growthProgress, this.blowIntensity);
      }

      // Subtle organic breathing wobble while holding wand
      const wobble = Math.sin(now * 0.007) * 0.3;
      const targetFrame = Math.min(165 + this.growthProgress * 34.5 + wobble, 199.5);
      this.lottie.goToAndStop(targetFrame);

      // Real-time live size staging:
      // Small: < 0.36
      // Medium: 0.36 to 0.72
      // Large: >= 0.72
      if (this.growthProgress < 0.36) {
        if (this.bubbleSize !== 'small') {
          this.bubbleSize = 'small';
          this.onLiveSizeChange('Small');
        }
      } else if (this.growthProgress < 0.72) {
        if (this.bubbleSize !== 'medium') {
          this.bubbleSize = 'medium';
          this.onLiveSizeChange('Medium');
        }
      } else {
        if (this.bubbleSize !== 'large') {
          this.bubbleSize = 'large';
          this.onLiveSizeChange('Large');
        }
      }

      // Overblow detection: continuing to push air past max large pops the bubble!
      if (this.growthProgress >= 0.96) {
        if (!this._overblowTimeout) {
          this._overblowTimeout = setTimeout(() => {
            if (this.state === GameStates.GROWING && this.input.isBlowing) {
              this.triggerBurst('large');
            }
          }, 380);
        }
      } else if (this._overblowTimeout) {
        clearTimeout(this._overblowTimeout);
        this._overblowTimeout = null;
      }

      this._growAnimFrame = requestAnimationFrame(loop);
    };

    this._growAnimFrame = requestAnimationFrame(loop);
  }

  _clearGrowthLoop() {
    if (this._growAnimFrame) {
      cancelAnimationFrame(this._growAnimFrame);
      this._growAnimFrame = null;
    }
    if (this._overblowTimeout) {
      clearTimeout(this._overblowTimeout);
      this._overblowTimeout = null;
    }
  }

  handleBlowProgress({ duration, intensity }) {
    this.blowIntensity = intensity;

    // Sudden violent gust rupture: real soap film bursts if blown too violently at any size
    if (intensity >= 0.90 && this.growthProgress > 0.05 && this.state === GameStates.GROWING) {
      this.triggerBurst(this.bubbleSize);
      return;
    }

    if (this.audioManager && this.state === GameStates.GROWING) {
      this.audioManager.setBubbleGrowth(this.growthProgress, intensity);
    }
  }

  handleBlowRelease({ duration, intensity }) {
    this.blowDuration = duration;
    this.blowIntensity = intensity;

    if (this.state !== GameStates.GROWING) return;

    this._clearGrowthLoop();
    if (this.audioManager) {
      this.audioManager.stopBubbleGrowth();
    }

    // Trigger float matching the exact size reached:
    if (this.bubbleSize === 'large' || this.growthProgress >= 0.72) {
      this.triggerFloat('large');
    } else if (this.bubbleSize === 'medium' || this.growthProgress >= 0.36) {
      this.triggerFloat('medium');
    } else {
      this.triggerFloat('small');
    }
  }

  triggerFloat(size = null) {
    this._clearGrowthLoop();
    this.input.disable();

    let floatSize = size || this.bubbleSize;
    if (!floatSize || floatSize === 'none') {
      if (this.growthProgress < 0.36) floatSize = 'small';
      else if (this.growthProgress < 0.72) floatSize = 'medium';
      else floatSize = 'large';
    }
    this.bubbleSize = floatSize;

    if (this.audioManager) {
      this.audioManager.stopBubbleGrowth();
      this.audioManager.playBubbleFloat(floatSize);
    }

    this.setState(GameStates.FLOATING, { chance: this.currentChance, size: floatSize });
    this.outcome = 'floated';

    const segmentName = floatSize === 'large' ? 'FLOAT_LARGE' : (floatSize === 'medium' ? 'FLOAT_MEDIUM' : 'FLOAT_SMALL');

    this.lottie.playSegment(segmentName, () => {
      this._onChanceComplete();
    });
  }

  triggerBurst(size = null) {
    this._clearGrowthLoop();
    this.input.disable();

    let burstSize = size || this.bubbleSize;
    if (!burstSize || burstSize === 'none') {
      if (this.growthProgress < 0.36) burstSize = 'small';
      else if (this.growthProgress < 0.72) burstSize = 'medium';
      else burstSize = 'large';
    }
    this.bubbleSize = burstSize;

    if (this.audioManager) {
      this.audioManager.stopBubbleGrowth();
      this.audioManager.playBubblePop(burstSize);
    }

    this.setState(GameStates.BURSTING, { chance: this.currentChance, size: burstSize });
    this.outcome = 'popped';

    const segmentName = burstSize === 'large' ? 'BURST_LARGE' : (burstSize === 'medium' ? 'BURST_MEDIUM' : 'BURST_SMALL');

    this.lottie.playSegment(segmentName, () => {
      this._onChanceComplete();
    });
  }

  _onChanceComplete() {
    const attemptData = ScoreManager.calculateSingle({
      size: this.bubbleSize,
      outcome: this.outcome,
      duration: this.blowDuration / 1000,
      intensity: this.blowIntensity
    });
    this.attempts.push(attemptData);

    if (this.currentChance < this.totalChances) {
      this.setState(GameStates.RESULT, {
        chance: this.currentChance,
        total: this.totalChances,
        attempt: attemptData,
        isFinal: false
      });
    } else {
      const overallData = ScoreManager.calculateOverall(this.attempts);
      this.setState(GameStates.END, {
        chance: this.currentChance,
        total: this.totalChances,
        overall: overallData,
        isFinal: true
      });
    }
  }

  nextAttempt() {
    this.currentChance++;
    this.bubbleSize = 'none';
    this.growthProgress = 0;
    this.blowDuration = 0;

    // Hold wand steady at frame 60 and ready input
    this.lottie.holdAt(60);
    this.setState(GameStates.READY, { chance: this.currentChance, total: this.totalChances });
    this.input.enable();
  }

  playAgain() {
    this._clearGrowthLoop();
    clearTimeout(this._intermissionTimer);
    if (this.audioManager) {
      this.audioManager.reset();
      this.audioManager.startMusic();
    }
    this.input.reset();
    this.currentChance = 1;
    this.attempts = [];
    this.bubbleSize = 'none';
    this.outcome = 'floated';
    this.growthProgress = 0;
    this.blowDuration = 0;
    this.blowStartTime = 0;

    this.lottie.holdAt(60);
    this.setState(GameStates.READY, { chance: 1, total: this.totalChances });
    this.input.enable();
  }
}
