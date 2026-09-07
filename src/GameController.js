import { GameStates } from './StateMachine.js';
import { UIAnimationController } from './UIAnimationController.js';

export class GameController {
  constructor({ lottieController, stateMachine, inputAdapter, microphoneAdapter, audioManager }) {
    this.lottie = lottieController;
    this.stateMachine = stateMachine;
    this.input = inputAdapter;
    this.mic = microphoneAdapter;
    this.audioManager = audioManager || null;
    this.anim = new UIAnimationController();

    this.isMicActive = false;
    this._audioInitialized = false;

    // DOM Elements
    this.entryScreen = document.getElementById('entry-screen');
    this.gameplayScreen = document.getElementById('gameplay-screen');
    this.gameplayHud = document.getElementById('gameplay-hud');
    this.scoreModal = document.getElementById('score-modal');
    this.modalScrim = document.getElementById('modal-scrim');
    this.scoreCard = document.getElementById('score-card');

    this.entryTitle = document.querySelector('.entry-title-container');
    this.entryTagline = document.querySelector('.entry-tagline');
    this.entryBubbles = document.querySelectorAll('.entry-bubble-decor');
    this.btnStartBlowing = document.getElementById('btn-start-blowing');
    this.btnUseMic = document.getElementById('btn-use-mic');

    this.attemptBadge = document.getElementById('attempt-badge');
    this.attemptText = document.getElementById('attempt-counter-text');
    this.instructionHint = document.getElementById('instruction-hint');
    this.breathIndicator = document.getElementById('breath-indicator');

    this.modalHeader = document.getElementById('modal-header');
    this.modalScore = document.getElementById('modal-score');
    this.modalQuote = document.getElementById('modal-quote');
    this.cardDivider = document.querySelector('.card-divider');
    this.statsGrid = document.querySelector('.card-stats-vertical');
    this.statSizeVal = document.getElementById('stat-size-val');
    this.statControlVal = document.getElementById('stat-control-val');
    this.statOutcomeVal = document.getElementById('stat-outcome-val');
    this.modalCtaBtn = document.getElementById('modal-cta-btn');
    this.modalCtaLabel = document.getElementById('modal-cta-label');
    this.modalShareBtn = document.getElementById('modal-share-btn');

    this._bindEvents();
    this._initEntrance();
  }

  _initEntrance() {
    // 1. Entry Screen Entrance Animation via Motion
    if (this.entryScreen && this.entryScreen.classList.contains('active')) {
      this.anim.animateEntryEntrance({
        titleEl: this.entryTitle,
        taglineEl: this.entryTagline,
        startBtnEl: this.btnStartBlowing,
        micBtnEl: this.btnUseMic,
        bubbles: this.entryBubbles
      });
    }
  }

  _bindEvents() {
    // 1. Entry Screen: START BLOWING button with subtle tap feedback
    if (this.btnStartBlowing) {
      this.btnStartBlowing.addEventListener('pointerdown', () => {
        this.anim.animateTap(this.btnStartBlowing);
      });
      this.btnStartBlowing.addEventListener('click', () => {
        this.startSession(true);
      });
    }

    // 2. Entry Screen: USE MICROPHONE ribbon button with subtle tap feedback
    if (this.btnUseMic) {
      this.btnUseMic.addEventListener('pointerdown', () => {
        this.anim.animateTap(this.btnUseMic);
      });
      this.btnUseMic.addEventListener('click', () => {
        this.startSession(true);
      });
    }

    // Re-prompt microphone access if user taps mic indicator while inactive
    if (this.input) {
      this.input.onRequestMicHandler = async () => {
        if (!this.isMicActive) {
          const granted = await this.mic.requestPermission();
          if (granted) {
            this.isMicActive = true;
            this.input.attachMicrophone();
            this._updateHintText('Blow gently into microphone');
          } else {
            this._updateHintText('Microphone access needed • Tap mic below');
          }
        }
      };
    }

    // 3. Score Modal CTA: CONTINUE or PLAY AGAIN
    if (this.modalCtaBtn) {
      this.modalCtaBtn.addEventListener('pointerdown', () => {
        this.anim.animateTap(this.modalCtaBtn);
      });
      this.modalCtaBtn.addEventListener('click', async () => {
        if (this.audioManager && this.audioManager.playPopSound) {
          this.audioManager.playPopSound();
        }

        const isPlayAgain = this.modalCtaLabel && this.modalCtaLabel.textContent === 'PLAY AGAIN';

        // Animate modal exit via Motion (opacity 1 -> 0, scale 1 -> 0.95, translateY 0 -> 8px)
        await this.anim.animateModalExit({
          modalEl: this.scoreModal,
          cardEl: this.scoreCard,
          scrimEl: this.modalScrim
        });

        if (isPlayAgain) {
          this.stateMachine.playAgain();
        } else {
          this.stateMachine.nextAttempt();
        }
      });
    }

    // 4. Score Modal Share CTA with image generation & link
    if (this.modalShareBtn) {
      this.modalShareBtn.addEventListener('pointerdown', () => {
        this.anim.animateTap(this.modalShareBtn);
      });
      this.modalShareBtn.addEventListener('click', async () => {
        const score = this.modalScore ? this.modalScore.textContent : '78';
        const labelEl = this.modalShareBtn.querySelector('.share-btn-label') || this.modalShareBtn.querySelector('.card-share-label');
        const prevText = labelEl ? labelEl.textContent : 'SHARE';

        if (labelEl) labelEl.textContent = 'SHARING...';

        const shareUrl = window.location.href;
        const shareText = `I just scored ${score} in Soap Bubble! 🫧 Three beautiful bubbles floating into the sky.\nPlay here: ${shareUrl}`;

        try {
          // Generate score card image Blob via Canvas
          const imageBlob = await this.generateShareCardBlob();
          const fileName = `soap-bubble-score-${score}.png`;
          const imageFile = imageBlob ? new File([imageBlob], fileName, { type: 'image/png' }) : null;

          // Check if navigator.share can share files
          if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
            await navigator.share({
              title: 'Soap Bubble Score',
              text: shareText,
              url: shareUrl,
              files: [imageFile]
            });
            if (labelEl) {
              labelEl.textContent = 'SHARED!';
              setTimeout(() => { labelEl.textContent = prevText; }, 2000);
            }
            return;
          }

          // Native share without file fallback
          if (navigator.share) {
            await navigator.share({
              title: 'Soap Bubble Score',
              text: shareText,
              url: shareUrl
            });
            if (labelEl) {
              labelEl.textContent = 'SHARED!';
              setTimeout(() => { labelEl.textContent = prevText; }, 2000);
            }
            return;
          }

          // Desktop / Clipboard fallback: download image & copy link
          if (imageBlob) {
            const downloadUrl = URL.createObjectURL(imageBlob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
          }

          if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareText);
          }

          if (labelEl) {
            labelEl.textContent = 'SAVED & COPIED!';
            setTimeout(() => { labelEl.textContent = prevText; }, 2500);
          }
        } catch (err) {
          // Fallback to clipboard on cancel or error
          if (navigator.clipboard) {
            try { await navigator.clipboard.writeText(shareText); } catch (_) {}
          }
          if (labelEl) {
            labelEl.textContent = 'LINK COPIED!';
            setTimeout(() => { labelEl.textContent = prevText; }, 2000);
          }
        }
      });
    }
  }

  /**
   * Generates a high-resolution PNG Blob of the final score card for sharing.
   */
  async generateShareCardBlob() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 705;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Draw parchment background frame
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        bgImg.onload = resolve;
        bgImg.onerror = reject;
        bgImg.src = '/assets/current/screens/parchment-card-clean.png';
      });
      ctx.drawImage(bgImg, 0, 0, 705, 1024);

      // 2. Extract current score card data
      const header = (this.modalHeader?.textContent || 'WELL BLOWN!').toUpperCase();
      const score = this.modalScore?.textContent || '95';
      const quote = (this.modalQuote?.textContent || 'Beautiful bubble!').replace(/[“”"]/g, '');
      const size = document.getElementById('stat-size-val')?.textContent || 'Large';
      const control = document.getElementById('stat-control-val')?.textContent || 'Balanced';
      const outcome = document.getElementById('stat-outcome-val')?.textContent || 'Floated Away';

      // 3. Render Header
      ctx.textAlign = 'center';
      ctx.fillStyle = '#342013';
      ctx.font = '700 24px Fraunces, Georgia, serif';
      ctx.fillText(header, 352, 295);

      // 4. Render Score
      ctx.fillStyle = '#c83838';
      ctx.font = '800 88px Fraunces, Georgia, serif';
      ctx.fillText(score, 352, 385);

      // 5. Render Quote with wrapping
      ctx.fillStyle = '#342013';
      ctx.font = 'italic 500 20px "Nunito Sans", Georgia, serif';
      const words = quote.split(' ');
      let line = '“';
      let y = 432;
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 460 && n > 0) {
          ctx.fillText(line.trim(), 352, y);
          line = words[n] + ' ';
          y += 28;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim() + '”', 352, y);

      // 6. Render Divider
      y += 26;
      ctx.strokeStyle = 'rgba(140, 114, 92, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(565, y);
      ctx.stroke();

      // 7. Render Stats
      const stats = [
        { label: 'SIZE', val: size },
        { label: 'CONTROL', val: control },
        { label: 'OUTCOME', val: outcome }
      ];
      let statY = y + 42;
      for (const s of stats) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#7c624d';
        ctx.font = '700 18px "Nunito Sans", sans-serif';
        ctx.fillText(s.label, 140, statY);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#2e1d11';
        ctx.font = '700 20px "Nunito Sans", sans-serif';
        ctx.fillText(s.val, 565, statY);

        statY += 38;
      }

      // 8. Render Footer Branding with Link
      const host = window.location.host || 'soap-bubble.app';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5c422f';
      ctx.font = '700 16px "Nunito Sans", sans-serif';
      ctx.fillText('Soap Bubble • Play & Blow Your Own Bubbles', 352, 875);

      ctx.fillStyle = '#2a6875';
      ctx.font = '600 15px "Nunito Sans", sans-serif';
      ctx.fillText(host, 352, 902);

      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch (e) {
      console.warn('Could not generate share card image:', e);
      return null;
    }
  }

  _updateHintText(msg) {
    if (this.instructionHint) {
      const hintSpan = this.instructionHint.querySelector('.hint-text');
      if (hintSpan) hintSpan.textContent = msg;
    }
  }

  async startSession(requestMic = true) {
    // 1. Animate Entry Screen exit via Motion
    if (this.entryScreen) {
      this.anim.animateEntryExit(this.entryScreen);
    }
    if (this.gameplayHud) {
      this.gameplayHud.classList.add('active');
    }

    // 2. Start gameplay sequence (plays WAND_IN)
    this.stateMachine.startGameplay();

    // 3. Initialize Audio in background
    if (!this._audioInitialized && this.audioManager) {
      this._audioInitialized = true;
      try {
        await this.audioManager.init();
        if (this.audioManager.playStartSound) {
          this.audioManager.playStartSound();
        }
      } catch (e) {
        console.warn('Audio init error:', e);
      }
    }

    // 4. Request Mic access (exclusive blow mechanism)
    try {
      const granted = await this.mic.requestPermission();
      if (granted) {
        this.isMicActive = true;
        this.input.attachMicrophone();
        this._updateHintText('Blow gently into microphone');
      } else {
        this.isMicActive = false;
        this.input.detachMicrophone();
        this._updateHintText('Microphone access needed • Tap mic below');
      }
    } catch (e) {
      this.isMicActive = false;
      this.input.detachMicrophone();
      this._updateHintText('Microphone access needed • Tap mic below');
    }
  }

  onStateTransition(newState, data = {}) {
    if (newState === GameStates.READY) {
      const chance = data.chance || this.stateMachine.currentChance;
      
      // Attempt indicator transition via Motion
      if (this.attemptBadge && this.attemptText) {
        this.anim.animateAttemptTransition(this.attemptBadge, this.attemptText, `${chance}/3`);
      }

      if (this.scoreModal) {
        this.scoreModal.classList.remove('active');
      }
      if (this.gameplayHud) {
        this.gameplayHud.classList.add('active');
      }
      if (this.instructionHint) {
        this.instructionHint.style.opacity = '1';
        this._updateHintText(this.isMicActive ? 'Blow gently into microphone' : 'Microphone access needed • Tap mic below');
      }
      if (this.breathIndicator) {
        this.breathIndicator.classList.remove('active');
      }
    } else if (newState === GameStates.GROWING) {
      if (this.instructionHint) {
        this.instructionHint.style.opacity = '0';
      }
      if (this.breathIndicator) {
        this.breathIndicator.classList.add('active');
      }
    } else if (newState === GameStates.FLOATING || newState === GameStates.BURSTING) {
      if (this.breathIndicator) {
        this.breathIndicator.classList.remove('active');
      }
    } else if (newState === GameStates.RESULT) {
      // Intermediate Score Modal (Attempts 1 & 2)
      const attempt = data.attempt || {};
      if (this.modalHeader) this.modalHeader.textContent = 'YOUR SCORE';
      if (this.modalScore) this.modalScore.textContent = attempt.score || 78;
      if (this.modalQuote) this.modalQuote.textContent = '“Beautiful bubble! You’re doing wonderfully.”';
      if (this.statSizeVal) this.statSizeVal.textContent = attempt.bubbleSize || 'Large';
      if (this.statControlVal) this.statControlVal.textContent = attempt.controlRating || 'Great';
      if (this.statOutcomeVal) {
        this.statOutcomeVal.textContent = attempt.outcome || 'Floated Away';
      }
      if (this.modalCtaLabel) this.modalCtaLabel.textContent = 'CONTINUE';
      if (this.modalShareBtn) this.modalShareBtn.classList.add('hidden');

      if (this.scoreModal) {
        this.scoreModal.classList.add('active');
        // Trigger Result Modal entrance via Motion (opacity 0 -> 1, scale 0.94 -> 1, translateY 12px -> 0, 520ms)
        this.anim.animateResultModal({
          scrimEl: this.modalScrim,
          cardEl: this.scoreCard,
          headerEl: this.modalHeader,
          scoreEl: this.modalScore,
          quoteEl: this.modalQuote,
          dividerEl: this.cardDivider,
          statsEl: this.statsGrid,
          ctaBtnEl: this.modalCtaBtn
        });
      }
    } else if (newState === GameStates.END) {
      // Final Score Modal (Attempt 3 completed)
      const overall = data.overall || {};
      if (this.modalHeader) this.modalHeader.textContent = 'WELL BLOWN!';
      if (this.modalScore) this.modalScore.textContent = overall.score || 75;
      if (this.modalQuote) {
        this.modalQuote.textContent = overall.endSummary || 'Three beautiful bubbles, blown with patience & perfect control.';
      }
      if (this.statSizeVal) this.statSizeVal.textContent = overall.bubbleSize || 'Medium';
      if (this.statControlVal) this.statControlVal.textContent = overall.controlRating || 'Masterful';
      if (this.statOutcomeVal) this.statOutcomeVal.innerHTML = overall.outcome || '3 Floated';
      if (this.modalCtaLabel) this.modalCtaLabel.textContent = 'PLAY AGAIN';
      if (this.modalShareBtn) this.modalShareBtn.classList.remove('hidden');

      if (this.scoreModal) {
        this.scoreModal.classList.add('active');
        // Trigger Final Card entrance with subtle stagger for score, message, share CTA, and actions
        this.anim.animateFinalCard({
          scrimEl: this.modalScrim,
          cardEl: this.scoreCard,
          headerEl: this.modalHeader,
          scoreEl: this.modalScore,
          quoteEl: this.modalQuote,
          dividerEl: this.cardDivider,
          statsEl: this.statsGrid,
          shareBtnEl: this.modalShareBtn,
          ctaBtnEl: this.modalCtaBtn
        });
      }
    }
  }

  updateLiveSize(label) {}
  showChanceToast(text) {}
}
