export class MicrophoneAdapter {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.source = null;
    this.dataArray = null;

    this.isListening = false;
    this.isBlowing = false;
    this.blowStartTime = 0;
    this.consecutiveQuietFrames = 0;
    this.consecutiveBlowFrames = 0;

    this.animFrameId = null;
    this.onBlowStartCallback = null;
    this.onBlowIntensityCallback = null;
    this.onBlowEndCallback = null;

    // Thresholds for blow sound detection
    this.BLOW_THRESHOLD = 0.08;
    this.RELEASE_THRESHOLD = 0.04;
    this.onAudioLevelCallback = null;
  }

  isSupported() {
    return Boolean(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      (window.AudioContext || window.webkitAudioContext)
    );
  }

  async requestPermission() {
    if (!this.isSupported()) return false;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      this.source.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      return true;
    } catch (err) {
      console.warn('Microphone permission denied or audio initialization failed:', err);
      return false;
    }
  }

  startListening(onBlowStart, onBlowIntensity, onBlowEnd, onAudioLevel) {
    if (!this.analyser) return;

    this.onBlowStartCallback = onBlowStart;
    this.onBlowIntensityCallback = onBlowIntensity;
    this.onBlowEndCallback = onBlowEnd;
    this.onAudioLevelCallback = onAudioLevel || null;
    this.isListening = true;
    this.isBlowing = false;

    const analyze = () => {
      if (!this.isListening) return;

      this.analyser.getByteTimeDomainData(this.dataArray);

      // Compute Root Mean Square (RMS) energy
      let sumSquares = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const normalized = (this.dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / this.dataArray.length);

      // Normalize intensity (0 to 1)
      const normalizedIntensity = Math.min(Math.max((rms - this.RELEASE_THRESHOLD) / (0.35 - this.RELEASE_THRESHOLD), 0), 1);

      if (this.onAudioLevelCallback) {
        this.onAudioLevelCallback(rms, normalizedIntensity);
      }

      if (rms > this.BLOW_THRESHOLD) {
        this.consecutiveBlowFrames++;
        this.consecutiveQuietFrames = 0;

        if (this.consecutiveBlowFrames >= 2 && !this.isBlowing) {
          this.isBlowing = true;
          this.blowStartTime = performance.now();
          if (this.onBlowStartCallback) this.onBlowStartCallback();
        }

        if (this.isBlowing && this.onBlowIntensityCallback) {
          this.onBlowIntensityCallback(normalizedIntensity);
        }
      } else if (rms < this.RELEASE_THRESHOLD) {
        this.consecutiveQuietFrames++;
        this.consecutiveBlowFrames = 0;

        if (this.isBlowing && this.consecutiveQuietFrames >= 4) {
          this.isBlowing = false;
          const duration = performance.now() - this.blowStartTime;
          if (this.onBlowEndCallback) this.onBlowEndCallback(duration);
        }
      }

      this.animFrameId = requestAnimationFrame(analyze);
    };

    analyze();
  }

  stopListening() {
    this.isListening = false;
    this.isBlowing = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  dispose() {
    this.stopListening();
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }
  }
}
