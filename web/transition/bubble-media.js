export const bubbleSoundUrl = new URL('./assets/dive-bubbles-original.m4a', import.meta.url);

// The transparency clip begins 0.30 seconds into the original soundtrack.
export const keyedVideoOffset = 0.30;

export function prepareBubbleVideo(video, softwareRenderer = false) {
  const asset = softwareRenderer ? './assets/dive-bubbles-software.webm' : './assets/dive-bubbles.webm';
  if (softwareRenderer) video.style.mixBlendMode = 'normal';
  video.src = new URL(asset, import.meta.url).href;
}

export function waitForBubbleVideo(video, timeout = 15000) {
  return new Promise(resolve => {
    function isComplete() {
      const { duration, buffered } = video;
      if (video.error || video.readyState < 2 || !Number.isFinite(duration) || duration <= 0) return false;
      // A WebM may end one decoded frame short of its declared duration.
      const frameTolerance = 0.05;
      for (let range = 0; range < buffered.length; range++) {
        if (buffered.start(range) <= frameTolerance && buffered.end(range) >= duration - frameTolerance) return true;
      }
      return false;
    }

    if (isComplete() || video.error) {
      resolve(isComplete());
      return;
    }
    const events = ['loadeddata', 'canplay', 'canplaythrough', 'progress', 'suspend', 'error'];
    const expiry = setTimeout(settle, timeout);
    function checkBuffer() {
      if (isComplete() || video.error) settle();
    }
    function settle() {
      clearTimeout(expiry);
      for (const event of events) video.removeEventListener(event, checkBuffer);
      resolve(isComplete());
    }
    for (const event of events) video.addEventListener(event, checkBuffer);
  });
}
