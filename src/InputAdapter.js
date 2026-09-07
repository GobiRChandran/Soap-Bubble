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

    this.onRequestMicHandler = null;

    this._bindButtonEvents();
  }

  _bindButtonEvents() {
    if (!this.blowButton) return;

    // Tapping the microphone indicator requests/re-prompts microphone access if inactive
    this.blowButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.onRequestMicHandler) {
        this.onRequestMicHandler();
      }
    });
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
