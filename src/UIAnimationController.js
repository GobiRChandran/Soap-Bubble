/**
 * UIAnimationController
 * Orchestrates calm, storybook-style UI transitions using Motion (Framer Motion).
 * Adheres strictly to the motion requirements:
 * - UI transitions only.
 * - Lottie animation is NOT controlled or recreated here.
 * - Result modal: opacity 0 -> 1, scale 0.94 -> 1, translateY 12px -> 0, 450-600ms, soft ease.
 * - Final card: soft fade + scale entrance, subtle stagger for score/message/actions + share CTA.
 * - Entry title & CTAs entrance.
 * - Attempt indicator transitions.
 * - Subtle tap feedback.
 * - Calm, organic, premium; no arcade bounce.
 * - Respects prefers-reduced-motion.
 */
import { animate } from 'motion';

export class UIAnimationController {
  constructor() {
    this.reducedMotion = false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mq.matches;
      mq.addEventListener('change', (e) => {
        this.reducedMotion = e.matches;
      });
    }

    // Soft organic ease curve
    this.softEase = [0.16, 1, 0.3, 1];
  }

  /**
   * 1. Entry Screen Entrance
   * Animates title, tagline, primary button, and secondary ribbon in calm sequence
   */
  animateEntryEntrance({ titleEl, taglineEl, startBtnEl, micBtnEl, bubbles = [] }) {
    if (this.reducedMotion) {
      [titleEl, taglineEl, startBtnEl, micBtnEl, ...bubbles].forEach((el) => {
        if (el) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
      return;
    }

    // Title Entrance
    if (titleEl) {
      animate(
        titleEl,
        { opacity: [0, 1], y: [-12, 0], scale: [0.97, 1] },
        { duration: 0.65, easing: this.softEase }
      );
    }

    // Tagline Entrance
    if (taglineEl) {
      animate(
        taglineEl,
        { opacity: [0, 1], y: [8, 0] },
        { delay: 0.18, duration: 0.5, easing: this.softEase }
      );
    }

    // Primary CTA (START BLOWING)
    if (startBtnEl) {
      animate(
        startBtnEl,
        { opacity: [0, 1], y: [12, 0], scale: [0.96, 1] },
        { delay: 0.28, duration: 0.55, easing: this.softEase }
      );
    }

    // Secondary CTA (USE MICROPHONE Ribbon)
    if (micBtnEl) {
      animate(
        micBtnEl,
        { opacity: [0, 1], y: [8, 0] },
        { delay: 0.38, duration: 0.5, easing: this.softEase }
      );
    }

    // Decorative Bubbles
    if (bubbles && bubbles.length) {
      bubbles.forEach((b, i) => {
        if (!b) return;
        animate(
          b,
          { opacity: [0, 0.85], scale: [0.8, 1] },
          { delay: 0.1 + i * 0.08, duration: 0.6, easing: this.softEase }
        );
      });
    }
  }

  /**
   * Exit Entry Screen when starting gameplay
   */
  async animateEntryExit(entryEl) {
    if (!entryEl) return;
    if (this.reducedMotion) {
      entryEl.classList.remove('active');
      return;
    }

    await animate(
      entryEl,
      { opacity: [1, 0], y: [0, -8] },
      { duration: 0.35, easing: [0.4, 0, 0.2, 1] }
    ).finished;

    entryEl.classList.remove('active');
    entryEl.style.opacity = '';
    entryEl.style.transform = '';
  }

  /**
   * 2. Attempt Indicator Transition (1/3 -> 2/3 -> 3/3)
   * Soft badge refresh and counter text update
   */
  animateAttemptTransition(badgeEl, textEl, newText) {
    if (!badgeEl) return;

    if (this.reducedMotion) {
      if (textEl && newText) textEl.textContent = newText;
      return;
    }

    // Soft scale pulse on badge
    animate(
      badgeEl,
      { scale: [1, 1.06, 1] },
      { duration: 0.34, easing: this.softEase }
    );

    // Text transition
    if (textEl && newText) {
      animate(
        textEl,
        { opacity: [1, 0.3], y: [0, -3] },
        { duration: 0.12, easing: 'ease-in' }
      ).finished.then(() => {
        textEl.textContent = newText;
        animate(
          textEl,
          { opacity: [0.3, 1], y: [3, 0] },
          { duration: 0.18, easing: this.softEase }
        );
      });
    }
  }

  /**
   * 3. Result Modal Entrance (opacity 0 -> 1, scale 0.94 -> 1, translateY 12px -> 0, 450-600ms)
   * Content revealed with calm subtle stagger
   */
  animateResultModal({ scrimEl, cardEl, headerEl, scoreEl, quoteEl, dividerEl, statsEl, ctaBtnEl }) {
    if (!cardEl) return;

    if (this.reducedMotion) {
      if (scrimEl) scrimEl.style.opacity = '1';
      cardEl.style.opacity = '1';
      cardEl.style.transform = 'none';
      [headerEl, scoreEl, quoteEl, dividerEl, statsEl, ctaBtnEl].forEach(el => {
        if (el) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
      return;
    }

    // Scrim fade in
    if (scrimEl) {
      animate(
        scrimEl,
        { opacity: [0, 1] },
        { duration: 0.4, easing: 'ease-out' }
      );
    }

    // Modal Card entrance (opacity 0 -> 1, scale 0.94 -> 1, translateY 12px -> 0, 520ms)
    animate(
      cardEl,
      { opacity: [0, 1], scale: [0.94, 1], y: [12, 0] },
      { duration: 0.52, easing: this.softEase }
    );

    // Staggered Content Reveal
    const items = [headerEl, scoreEl, quoteEl, dividerEl, statsEl, ctaBtnEl].filter(Boolean);
    items.forEach((item, index) => {
      const delay = 0.12 + index * 0.045; // 45ms soft stagger
      animate(
        item,
        { opacity: [0, 1], y: [6, 0] },
        { delay, duration: 0.38, easing: this.softEase }
      );
    });
  }

  /**
   * 4. Final Card Entrance (WELL BLOWN! + Stagger + Share CTA + Play Again)
   */
  animateFinalCard({ scrimEl, cardEl, headerEl, scoreEl, quoteEl, dividerEl, statsEl, shareBtnEl, ctaBtnEl }) {
    if (!cardEl) return;

    if (this.reducedMotion) {
      if (scrimEl) scrimEl.style.opacity = '1';
      cardEl.style.opacity = '1';
      cardEl.style.transform = 'none';
      [headerEl, scoreEl, quoteEl, dividerEl, statsEl, shareBtnEl, ctaBtnEl].forEach(el => {
        if (el) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
      return;
    }

    // Scrim fade in
    if (scrimEl) {
      animate(
        scrimEl,
        { opacity: [0, 1] },
        { duration: 0.4, easing: 'ease-out' }
      );
    }

    // Final Card entrance (540ms)
    animate(
      cardEl,
      { opacity: [0, 1], scale: [0.94, 1], y: [12, 0] },
      { duration: 0.54, easing: this.softEase }
    );

    // Staggered items: Header, score, quote, divider, stats, Play Again CTA, then Share CTA
    const items = [headerEl, scoreEl, quoteEl, dividerEl, statsEl, ctaBtnEl, shareBtnEl].filter(Boolean);
    items.forEach((item, index) => {
      const delay = 0.14 + index * 0.045;
      animate(
        item,
        { opacity: [0, 1], y: [6, 0] },
        { delay, duration: 0.38, easing: this.softEase }
      );
    });
  }

  /**
   * Modal Exit (when CONTINUE or PLAY AGAIN is clicked)
   */
  async animateModalExit({ modalEl, cardEl, scrimEl }) {
    if (!modalEl) return;

    if (this.reducedMotion) {
      modalEl.classList.remove('active');
      return;
    }

    const animations = [];

    if (cardEl) {
      animations.push(
        animate(
          cardEl,
          { opacity: [1, 0], scale: [1, 0.95], y: [0, 8] },
          { duration: 0.24, easing: [0.4, 0, 0.2, 1] }
        ).finished
      );
    }

    if (scrimEl) {
      animations.push(
        animate(
          scrimEl,
          { opacity: [1, 0] },
          { duration: 0.22, easing: 'ease-out' }
        ).finished
      );
    }

    await Promise.all(animations);

    modalEl.classList.remove('active');
    if (cardEl) {
      cardEl.style.opacity = '';
      cardEl.style.transform = '';
    }
    if (scrimEl) {
      scrimEl.style.opacity = '';
    }
  }

  /**
   * Subtle Tactile Tap Feedback for Buttons
   */
  animateTap(btnEl) {
    if (!btnEl || this.reducedMotion) return;
    animate(
      btnEl,
      { scale: [1, 0.965, 1] },
      { duration: 0.14, easing: 'ease-out' }
    );
  }
}
