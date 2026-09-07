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
    this.input.onBlowStartHandler = () => this.handleBlowStart();
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

  handleBlowStart() {
    if (this.state !== GameStates.READY) return;

    this.setState(GameStates.GROWING, { chance: this.currentChance });
    this.blowStartTime = performance.now();
    this._lastFrameTime = performance.now();
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

      const dt = Math.min((now - this._lastFrameTime) / 1000, 0.1);
      this._lastFrameTime = now;

      // Rate of expansion: ~2.8s for a full gentle breath to reach maximum large
      const speedMultiplier = 0.85 + (this.blowIntensity * 0.35);
      const growthRate = (1 / 2.7) * speedMultiplier;

      this.growthProgress = Math.min(this.growthProgress + dt * growthRate, 1.0);
      this.blowDuration = (now - this.blowStartTime) / 1000;

      // Update dynamic bubble growth sound
      if (this.audioManager) {
        this.audioManager.setBubbleGrowth(this.growthProgress, this.blowIntensity);
      }

      // Map progress smoothly: 0.0 -> 1.0 maps to frames 165 -> 199.5 (Layer 5: Continuous inflation)
      // Strictly clamped below 200 to prevent touching frame 201 (burst crack particles)
      const targetFrame = Math.min(165 + this.growthProgress * 34.5, 199.5);
      this.lottie.goToAndStop(targetFrame);

      // Real-time live size calculation:
      // Small: 0 to 0.35 (frame 165 to 177, scale ~69 to ~104)
      // Medium: 0.35 to 0.70 (frame 177 to 189, scale ~104 to ~135)
      // Large: 0.70 to 1.0 (frame 189 to 200, scale ~135 to 160)
      if (this.growthProgress < 0.35) {
        if (this.bubbleSize !== 'small') {
          this.bubbleSize = 'small';
          this.onLiveSizeChange('Small');
        }
      } else if (this.growthProgress < 0.70) {
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

      // Overblow detection: if reached maximum and player continues blowing past grace period -> burst!
      if (this.growthProgress >= 1.0) {
        if (!this._overblowTimeout) {
          this._overblowTimeout = setTimeout(() => {
            if (this.state === GameStates.GROWING && this.input.isBlowing) {
              this.triggerBurst('large');
            }
          }, 600);
        }
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
    if (this.bubbleSize === 'large') {
      this.triggerFloat('large');
    } else if (this.bubbleSize === 'medium') {
      this.triggerFloat('medium');
    } else {
      this.triggerFloat('small');
    }
  }

  triggerFloat(size) {
    this._clearGrowthLoop();
    this.input.disable();

    if (this.audioManager) {
      this.audioManager.stopBubbleGrowth();
      this.audioManager.playBubbleFloat(size);
    }

    this.setState(GameStates.FLOATING, { chance: this.currentChance });
    this.outcome = 'floated';

    const segmentName = size === 'large' ? 'FLOAT_LARGE' : (size === 'medium' ? 'FLOAT_MEDIUM' : 'FLOAT_SMALL');

    this.lottie.playSegment(segmentName, () => {
      this._onChanceComplete();
    });
  }

  triggerBurst(size) {
    this._clearGrowthLoop();
    this.input.disable();

    if (this.audioManager) {
      this.audioManager.stopBubbleGrowth();
      this.audioManager.playBubblePop(size);
    }

    this.setState(GameStates.BURSTING, { chance: this.currentChance });
    this.outcome = 'popped';

    const segmentName = size === 'large' ? 'BURST_LARGE' : (size === 'medium' ? 'BURST_MEDIUM' : 'BURST_SMALL');

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
