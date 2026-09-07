export class ScoreManager {
  static calculateSingle({ size = 'small', outcome = 'floated', duration = 1.0, intensity = 0.6 }) {
    let baseScore = 65;
    let sizeLabel = size.charAt(0).toUpperCase() + size.slice(1);
    let outcomeLabel = outcome === 'floated' ? 'Floated Away' : 'Popped';
    let controlRating = 'Gentle';

    if (size === 'medium') {
      baseScore = 78;
    } else if (size === 'large') {
      baseScore = 90;
    }

    if (outcome === 'popped') {
      controlRating = 'Overblown';
      const score = Math.max(45, baseScore - 18 + Math.round(intensity * 4));
      return { score, bubbleSize: sizeLabel, controlRating, outcome: outcomeLabel };
    }

    // Floated
    if (size === 'large') {
      controlRating = 'Masterful';
      const score = Math.min(99, baseScore + Math.round(Math.random() * 5) + 3);
      return { score, bubbleSize: sizeLabel, controlRating, outcome: outcomeLabel };
    } else if (size === 'medium') {
      controlRating = 'Balanced';
      const score = Math.min(89, baseScore + Math.round(Math.random() * 6) + 2);
      return { score, bubbleSize: sizeLabel, controlRating, outcome: outcomeLabel };
    } else {
      controlRating = 'Gentle';
      const score = Math.min(78, baseScore + Math.round(Math.random() * 5) + 2);
      return { score, bubbleSize: sizeLabel, controlRating, outcome: outcomeLabel };
    }
  }

  static calculateOverall(attempts = []) {
    if (!attempts.length) {
      return {
        score: 75,
        feedbackTitle: 'Soap Bubble Whisperer',
        bubbleSize: 'Medium',
        controlRating: 'Gentle',
        outcome: '3 Floated',
        feedbackMessage: 'Delicate spheres of light dancing through the summer clouds.'
      };
    }

    const totalScore = attempts.reduce((sum, a) => sum + (a.score || 70), 0);
    const avgScore = Math.round(totalScore / attempts.length);

    const floatedCount = attempts.filter(a => a.outcome === 'Floated Away' || a.outcome === 'floated').length;
    const poppedCount = attempts.length - floatedCount;

    // Best size
    const sizes = attempts.map(a => (a.bubbleSize || a.size || '').toLowerCase());
    let bestSize = 'Small';
    if (sizes.includes('large')) bestSize = 'Large';
    else if (sizes.includes('medium')) bestSize = 'Medium';

    let feedbackTitle = 'Splendid Bubble Crafter!';
    let controlRating = 'Masterful';
    let outcomeText = `${floatedCount} Floated`;
    let feedbackMessage = '';
    let endSummary = '';

    if (floatedCount === 3) {
      if (bestSize === 'Large') {
        feedbackTitle = 'Master Bubble Whisperer!';
        controlRating = 'Flawless';
        feedbackMessage = 'All three bubbles soared gracefully into the sky, crowned by a giant sphere.';
        endSummary = 'A wondrous flight! All three bubbles danced into the endless blue sky.';
      } else {
        feedbackTitle = 'Harmonious Trio!';
        controlRating = 'Gentle';
        feedbackMessage = 'Three beautiful bubbles floated in unbroken harmony, carried softly by the breeze.';
        endSummary = 'Three gentle spheres floated in calm harmony across the summer air.';
      }
    } else if (floatedCount === 2) {
      feedbackTitle = 'Delightful Blowing!';
      controlRating = 'Balanced';
      outcomeText = '2 Floated';
      feedbackMessage = 'Two bubbles danced far into the blue clouds, with one playful pop along the way.';
      endSummary = 'Two glistening bubbles soared high, leaving a trace of wonder in the breeze.';
    } else {
      feedbackTitle = 'Spirited Breaths!';
      controlRating = 'Energetic';
      outcomeText = floatedCount > 0 ? `${floatedCount} Floated` : 'All Popped';
      feedbackMessage = 'A lively shower of soapy droplets! A touch gentler breath will send them soaring.';
      endSummary = 'A playful shower of sparkling droplets! Every breath brings softer wonder.';
    }

    return {
      score: avgScore,
      feedbackTitle,
      bubbleSize: bestSize,
      controlRating,
      outcome: outcomeText,
      feedbackMessage,
      endSummary,
      attempts
    };
  }
}
