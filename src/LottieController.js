import lottie from 'lottie-web';

export class LottieController {
  constructor(containerElement, audioManager = null) {
    this.container = containerElement;
    this.audioManager = audioManager;
    this.anim = null;
    this.isLoaded = false;
    this.currentSegment = null;
    this.isPlaying = false;
    this._onComplete = null;
    this._onEnterFrame = null;

    // Discovered semantic frame ranges
    this.segments = {
      IDLE: [0, 15],
      WAND_IN: [15, 60],
      READY: [60, 61],
      GROW_SMALL: [65, 100],
      GROW_MEDIUM: [105, 140],
      GROW_LARGE: [165, 200],
      BURST_SMALL: [154, 163],
      BURST_MEDIUM: [142, 151],
      BURST_LARGE: [201, 210],
      FLOAT_SMALL: [214, 236],
      FLOAT_MEDIUM: [239, 261],
      FLOAT_LARGE: [264, 286],
      WAND_EXIT: [290, 335]
    };
  }

  setAudioManager(audioManager) {
    this.audioManager = audioManager;
  }

  async load() {
    if (this.anim) return Promise.resolve();

    return new Promise((resolve, reject) => {
      try {
        this.anim = lottie.loadAnimation({
          container: this.container,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          path: '/Bubble Animation.json',
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice'
          }
        });

        this.anim.addEventListener('DOMLoaded', () => {
          this.isLoaded = true;
          this.anim.goToAndStop(60, true);
          this._initCloudDrift();
          this._initMotionTracking();
          resolve();
        });

        this.anim.addEventListener('data_failed', (err) => {
          reject(new Error('Failed to load Lottie animation data'));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  _clearCompleteListener() {
    if (this._onComplete && this.anim) {
      this.anim.removeEventListener('complete', this._onComplete);
      this._onComplete = null;
    }
  }

  _initMotionTracking() {
    if (!this.anim) return;

    this.anim.addEventListener('enterFrame', (e) => {
      if (!this.audioManager || !this.isPlaying || !this.currentSegment) return;

      const f = e.currentTime;
      if (this.currentSegment === 'WAND_IN') {
        // Fast entrance easing to steady rest at frame 60
        const p = Math.max(0, Math.min((f - 15) / 45, 1));
        const speed = Math.sin(p * Math.PI) * 0.75;
        this.audioManager.setFlightSpeed(speed);
      } else if (this.currentSegment.startsWith('FLOAT_')) {
        // Bubble lifts off and soars through breezy air
        const range = this.segments[this.currentSegment];
        const p = Math.max(0, Math.min((f - range[0]) / (range[1] - range[0]), 1));
        const speed = 0.3 + Math.sin(p * Math.PI) * 0.45;
        this.audioManager.setFlightSpeed(speed);
      } else if (this.currentSegment === 'WAND_EXIT') {
        const p = Math.max(0, Math.min((f - 290) / 45, 1));
        const speed = p * 0.6;
        this.audioManager.setFlightSpeed(speed);
      }
    });
  }

  goToAndStop(frameNumber) {
    this._clearCompleteListener();
    this.isPlaying = false;
    if (this.anim) {
      this.anim.resetSegments(true);
      this.anim.goToAndStop(frameNumber, true);
    }
    if (this.audioManager && !this.isPlaying) {
      this.audioManager.setFlightSpeed(0.0);
    }
  }

  playSegment(segmentName, onComplete) {
    if (!this.anim) {
      console.warn('LottieController: Animation not loaded');
      if (onComplete) onComplete();
      return;
    }

    const range = this.segments[segmentName];
    if (!range) {
      console.warn(`LottieController: Unknown segment "${segmentName}"`);
      if (onComplete) onComplete();
      return;
    }

    this._clearCompleteListener();
    this.currentSegment = segmentName;
    this.isPlaying = true;

    this._onComplete = () => {
      this._clearCompleteListener();
      this.isPlaying = false;
      if (this.anim) {
        this.anim.resetSegments(true);
      }
      if (this.audioManager) {
        this.audioManager.setFlightSpeed(0.0);
      }
      if (onComplete) {
        onComplete();
      }
    };

    this.anim.addEventListener('complete', this._onComplete);
    this.anim.playSegments(range, true);
  }

  _initCloudDrift() {
    if (!this.anim || !this.anim.renderer || !this.anim.renderer.elements) {
      return;
    }

    const cloudEls = this.anim.renderer.elements.filter(
      el => el.data && el.data.nm && el.data.nm.toLowerCase().includes('cloud')
    );

    if (cloudEls.length < 2) return;

    cloudEls.forEach(el => {
      el.renderFrame = function() {};
      if (el.layerElement) {
        el.layerElement.style.display = 'block';
        el.layerElement.style.opacity = '0.35';
      }
    });

    const g0 = cloudEls[1].layerElement; // 'Clouds'
    const g1 = cloudEls[0].layerElement; // 'Clouds 1'

    if (!g0 || !g1) return;

    const TILE_WIDTH = 768; // 480 * 1.6 scale
    let x0 = 0;
    let x1 = TILE_WIDTH;
    const speed = 0.45;

    const driftLoop = () => {
      x0 -= speed;
      x1 -= speed;

      if (x0 <= -TILE_WIDTH) {
        x0 = x1 + TILE_WIDTH;
      }
      if (x1 <= -TILE_WIDTH) {
        x1 = x0 + TILE_WIDTH;
      }

      g0.setAttribute('transform', `matrix(1.6, 0, 0, 1.52, ${x0}, 70.2)`);
      g1.setAttribute('transform', `matrix(1.6, 0, 0, 1.52, ${x1}, 70.2)`);

      this._cloudRaf = requestAnimationFrame(driftLoop);
    };

    if (this._cloudRaf) {
      cancelAnimationFrame(this._cloudRaf);
    }
    this._cloudRaf = requestAnimationFrame(driftLoop);
  }

  holdAt(frameNumber) {
    this.goToAndStop(frameNumber);
  }

  reset() {
    this._clearCompleteListener();
    this.isPlaying = false;
    this.currentSegment = null;
    if (this.anim) {
      // Stay on frame 60 (ready idle meadow) rather than frame 0 (blank blue splash)
      this.anim.goToAndStop(60, true);
    }
  }
}

