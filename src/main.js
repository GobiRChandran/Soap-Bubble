import { AudioManager } from './AudioManager.js';
import { LottieController } from './LottieController.js';
import { MicrophoneAdapter } from './MicrophoneAdapter.js';
import { InputAdapter } from './InputAdapter.js';
import { StateMachine } from './StateMachine.js';
import { GameController } from './GameController.js';

window.addEventListener('DOMContentLoaded', async () => {
  const lottieContainer = document.getElementById('lottie-container');
  const gameStage = document.getElementById('game-stage');

  // 1. Initialize Audio Manager
  const audioManager = new AudioManager();

  // 2. Initialize Lottie Controller with Audio Manager
  const lottieController = new LottieController(lottieContainer, audioManager);

  // 3. Initialize Microphone Adapter
  const micAdapter = new MicrophoneAdapter();

  // 4. Initialize Input Adapter (Microphone-first with interactive button and stage fallback)
  const breathIndicator = document.getElementById('breath-indicator');
  const inputAdapter = new InputAdapter({
    blowButtonElement: breathIndicator,
    stageElement: gameStage,
    microphoneAdapter: micAdapter
  });

  // 5. Initialize State Machine
  let gameController = null;
  const stateMachine = new StateMachine({
    lottieController,
    inputAdapter,
    audioManager,
    onStateChange: (newState, data) => {
      if (gameController) {
        gameController.onStateTransition(newState, data);
      }
    },
    onLiveSizeChange: (label) => {
      if (gameController) {
        gameController.updateLiveSize(label);
      }
    },
    onChanceToast: (text) => {
      if (gameController) {
        gameController.showChanceToast(text);
      }
    }
  });

  // 6. Initialize Top-Level Game Controller
  gameController = new GameController({
    lottieController,
    stateMachine,
    inputAdapter,
    microphoneAdapter: micAdapter,
    audioManager
  });

  window.soapBubble = {
    stateMachine,
    gameController,
    lottieController,
    audioManager
  };

  // 6. Preload Lottie Animation (stays at frame 0 idle meadow for Entry screen)
  try {
    await lottieController.load();
    window.__lottieReady = true;
    console.log('Lottie Bubble Animation successfully loaded at idle meadow frame 0.');
  } catch (err) {
    console.error('Failed to load Lottie animation:', err);
  }

  // Mobile viewport height adjustment for legacy mobile browsers lacking dvh
  const updateViewportHeight = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  window.addEventListener('resize', updateViewportHeight);
  window.addEventListener('orientationchange', updateViewportHeight);
  updateViewportHeight();

  // Prevent accidental touch gestures like pull-to-refresh or zoom
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.scale !== 1) e.preventDefault();
  }, { passive: false });
});
