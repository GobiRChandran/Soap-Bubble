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
        this.startSession(false);
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

    // 4. Score Modal Share CTA with subtle tap feedback
    if (this.modalShareBtn) {
      this.modalShareBtn.addEventListener('pointerdown', () => {
        this.anim.animateTap(this.modalShareBtn);
      });
      this.modalShareBtn.addEventListener('click', async () => {
        const score = this.modalScore ? this.modalScore.textContent : '78';
        const shareData = {
          title: 'Soap Bubble Whisper',
          text: `I just scored ${score} in Soap Bubble! Three beautiful bubbles floating into the sky.`,
          url: window.location.href
        };

        if (navigator.share) {
          try {
            await navigator.share(shareData);
          } catch (e) {
            // User cancelled share
          }
        } else if (navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
            const originalLabel = this.modalShareBtn.querySelector('.card-share-label');
            if (originalLabel) {
              const prevText = originalLabel.textContent;
              originalLabel.textContent = 'COPIED!';
              setTimeout(() => {
                originalLabel.textContent = prevText;
              }, 1800);
            }
          } catch (err) {}
        }
      });
    }
  }

  async startSession(requestMic = false) {
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

    // 4. Request Mic in background without blocking interaction
    if (requestMic || !this.isMicActive) {
      try {
        const granted = await this.mic.requestPermission();
        if (granted) {
          this.isMicActive = true;
          this.input.attachMicrophone();
        } else {
          this.isMicActive = false;
          this.input.detachMicrophone();
        }
      } catch (e) {
        this.isMicActive = false;
        this.input.detachMicrophone();
      }
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
