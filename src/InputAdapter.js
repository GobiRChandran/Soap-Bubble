export class InputAdapter {
  constructor({ blowButtonElement = null, stageElement = null, microphoneAdapter }) {
    this.blowButton = blowButtonElement;
    this.stageElement = stageElement;
    this.micAdapter = microphoneAdapter;

    this.enabled = false;
    this.isBlowing = false;
    this.blowStartTime = 0;
    this.peakIntensity = 0;
    this.activeSource = null; // 'touch' | 'mic'

    this.onBlowStartHandler = null;
    this.onBlowProgressHandler = null;
    this.onBlowReleaseHandler = null;
    this.onAudioLevelHandler = null;

    this._progressInterval = null;

    this._bindButtonEvents();
    this._bindStageFallback();
  }

  _bindButtonEvents() {
    if (!this.blowButton) return;

    const handleStart = (e) => {
      e.preventDefault();
      if (!this.enabled || this.isBlowing) return;
      this.activeSource = 'touch';
      this.triggerBlowStart(0.7);
    };

    const handleEnd = (e) => {
      e.preventDefault();
      if (this.activeSource === 'touch' && this.isBlowing) {
        this.triggerBlowRelease();
      }
    };

    // Pointer / Touch events
    this.blowButton.addEventListener('pointerdown', (e) => {
      handleStart(e);
    });
    window.addEventListener('pointerup', (e) => {
      if (this.activeSource === 'touch' && this.isBlowing) handleEnd(e);
    });
    window.addEventListener('pointercancel', (e) => {
      if (this.activeSource === 'touch' && this.isBlowing) handleEnd(e);
    });

    // Keyboard support (Space or Enter)
    this.blowButton.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        handleStart(e);
      }
    });
    this.blowButton.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        handleEnd(e);
      }
    });
  }

  _bindStageFallback() {
    if (!this.stageElement) return;

    const handleStart = (e) => {
      // Only use screen tap if microphone is NOT actively blowing and user interacts
      if (!this.enabled || this.isBlowing) return;
      // Do not intercept clicks on buttons or interactive overlays
      if (e.target && (e.target.closest('button') || e.target.closest('.card-container'))) return;

      this.activeSource = 'touch';
      this.triggerBlowStart(0.65);
    };

    const handleEnd = (e) => {
      if (this.activeSource === 'touch' && this.isBlowing) {
        this.triggerBlowRelease();
      }
    };

    this.stageElement.addEventListener('pointerdown', handleStart);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
  }

  attachMicrophone() {
    if (!this.micAdapter) return;

    this.micAdapter.startListening(
      // onBlowStart
      () => {
        if (!this.enabled || this.isBlowing) return;
        this.activeSource = 'mic';
        this.triggerBlowStart(0.5);
      },
      // onBlowIntensity
      (intensity) => {
        if (this.activeSource === 'mic' && this.isBlowing) {
          if (intensity > this.peakIntensity) {
            this.peakIntensity = intensity;
          }
        }
      },
      // onBlowEnd
      (duration) => {
        if (this.activeSource === 'mic' && this.isBlowing) {
          this.triggerBlowRelease();
        }
      },
      // onAudioLevel
      (rms, intensity) => {
        if (this.onAudioLevelHandler) {
          this.onAudioLevelHandler(rms, intensity);
        }
      }
    );
  }

  detachMicrophone() {
    if (this.micAdapter) {
      this.micAdapter.stopListening();
    }
  }

  triggerBlowStart(initialIntensity = 0.5) {
    this.isBlowing = true;
    this.blowStartTime = performance.now();
    this.peakIntensity = initialIntensity;

    if (this.blowButton) {
      this.blowButton.classList.add('blowing');
    }

    if (this.onBlowStartHandler) {
      this.onBlowStartHandler();
    }

    // Monitor progress duration
    clearInterval(this._progressInterval);
    this._progressInterval = setInterval(() => {
      if (!this.isBlowing) return;
      const duration = (performance.now() - this.blowStartTime) / 1000;
      if (this.onBlowProgressHandler) {
        this.onBlowProgressHandler({ duration, intensity: this.peakIntensity });
      }
    }, 50);
  }

  triggerBlowRelease() {
    if (!this.isBlowing) return;

    clearInterval(this._progressInterval);
    this._progressInterval = null;

    const duration = (performance.now() - this.blowStartTime) / 1000;
    const intensity = this.peakIntensity;

    this.isBlowing = false;
    this.activeSource = null;

    if (this.blowButton) {
      this.blowButton.classList.remove('blowing');
    }

    if (this.onBlowReleaseHandler) {
      this.onBlowReleaseHandler({ duration, intensity });
    }
  }

  enable() {
    this.enabled = true;
    if (this.blowButton) {
      this.blowButton.disabled = false;
    }
  }

  disable() {
    this.enabled = false;
    if (this.isBlowing) {
      this.triggerBlowRelease();
    }
    if (this.blowButton) {
      this.blowButton.disabled = true;
    }
  }

  reset() {
    this.disable();
    this.activeSource = null;
    this.peakIntensity = 0;
    this.blowStartTime = 0;
  }
}
