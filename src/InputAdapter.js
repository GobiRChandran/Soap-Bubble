export class InputAdapter {
  constructor({ blowButtonElement = null, stageElement = null, microphoneAdapter }) {
    this.blowButton = blowButtonElement;
    this.stageElement = stageElement;
    this.micAdapter = microphoneAdapter;

    this.enabled = false;
    this.isBlowing = false;
    this.blowStartTime = 0;
    this.currentIntensity = 0;
    this.peakIntensity = 0;
    this.activeSource = null; // 'touch' | 'mic' | 'sim'

    this.onBlowStartHandler = null;
    this.onBlowProgressHandler = null;
    this.onBlowReleaseHandler = null;
    this.onAudioLevelHandler = null;

    this._progressInterval = null;
    this.onRequestMicHandler = null;

    this._bindButtonEvents();
    this._bindDevShortcuts();
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

  _bindDevShortcuts() {
    if (typeof window === 'undefined') return;

    window.simulateBlow = (type = 'gentle', durationMs = 1500) => {
      if (!this.enabled) return;
      this.activeSource = 'sim';
      let intensity = 0.3;
      if (type === 'medium') intensity = 0.58;
      else if (type === 'large') intensity = 0.82;
      else if (type === 'violent' || type === 'burst') intensity = 0.96;

      this.triggerBlowStart(intensity);

      const interval = setInterval(() => {
        if (!this.isBlowing) {
          clearInterval(interval);
          return;
        }
        this.currentIntensity = intensity;
        this.peakIntensity = Math.max(this.peakIntensity, intensity);
      }, 40);

      setTimeout(() => {
        clearInterval(interval);
        if (this.isBlowing && this.activeSource === 'sim') {
          this.triggerBlowRelease();
        }
      }, durationMs);
    };

    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === '1') {
        window.simulateBlow('gentle', 1200);
      } else if (e.key === '2') {
        window.simulateBlow('medium', 1800);
      } else if (e.key === '3') {
        window.simulateBlow('large', 2600);
      } else if (e.key === '4') {
        window.simulateBlow('burst', 1000);
      }
    });
  }

  attachMicrophone() {
    if (!this.micAdapter) return;

    this.micAdapter.startListening(
      // onBlowStart
      (initialIntensity) => {
        if (!this.enabled || this.isBlowing) return;
        this.activeSource = 'mic';
        const startInt = typeof initialIntensity === 'number' && initialIntensity > 0 ? initialIntensity : 0.25;
        this.triggerBlowStart(startInt);
      },
      // onBlowIntensity
      (intensity) => {
        if (this.activeSource === 'mic' && this.isBlowing) {
          this.currentIntensity = intensity;
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

  triggerBlowStart(initialIntensity = 0.3) {
    this.isBlowing = true;
    this.blowStartTime = performance.now();
    this.currentIntensity = initialIntensity;
    this.peakIntensity = initialIntensity;

    if (this.blowButton) {
      this.blowButton.classList.add('blowing');
    }

    if (this.onBlowStartHandler) {
      this.onBlowStartHandler(initialIntensity);
    }

    // Monitor progress duration & continuous intensity
    clearInterval(this._progressInterval);
    this._progressInterval = setInterval(() => {
      if (!this.isBlowing) return;
      const duration = (performance.now() - this.blowStartTime) / 1000;
      if (this.onBlowProgressHandler) {
        this.onBlowProgressHandler({
          duration,
          intensity: this.currentIntensity,
          peakIntensity: this.peakIntensity
        });
      }
    }, 40);
  }

  triggerBlowRelease() {
    if (!this.isBlowing) return;

    clearInterval(this._progressInterval);
    this._progressInterval = null;

    const duration = (performance.now() - this.blowStartTime) / 1000;
    const finalIntensity = this.currentIntensity;
    const peak = this.peakIntensity;

    this.isBlowing = false;
    this.activeSource = null;

    if (this.blowButton) {
      this.blowButton.classList.remove('blowing');
    }

    if (this.onBlowReleaseHandler) {
      this.onBlowReleaseHandler({
        duration,
        intensity: finalIntensity,
        peakIntensity: peak
      });
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
