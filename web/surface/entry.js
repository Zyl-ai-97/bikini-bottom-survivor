import { createSeaAudio } from './sea-audio.js';

export async function mountSurface(options = {}) {
  const sound = createSeaAudio({ bubbleSoundUrl: options.bubbleSoundUrl });
  void sound.setEnabled(true);
  try {
    const { start } = await import('./app.js');
    await window.studioIntro?.painted;
    start(sound, options);
  } catch (error) {
    void sound.setEnabled(false);
    const surface = document.querySelector('.seascape');
    surface.dataset.renderer = 'unavailable';
    if (window.studioIntro) window.studioIntro.showRetry();
    else {
      surface.inert = false;
      document.getElementById('studio-intro')?.remove();
    }
    console.error('海面初始化失败', error);
  }
}
