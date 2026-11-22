(() => {
  'use strict';

  const overlay = document.getElementById('studio-intro');
  if (!overlay) return;
  const cast = document.getElementById('studio-cast');
  const loading = document.getElementById('studio-loading');
  const enableSound = document.getElementById('studio-unlock');
  const audio = window.studioAudio;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // These crop boundaries are in the transparent gaps of the single 2400px atlas.
  const cuts = [0, 278, 837, 1251, 1791, 2400];
  const hopDuration = 380;
  const hopStagger = 120;
  const roundDuration = hopDuration + (cuts.length - 2) * hopStagger + 220;
  let closing = false;
  let closed = false;
  let castReady = false;
  let hops = [];
  let soundReady = false;
  let dissolve;
  let closeTimer;
  let resolvePainted;
  let resolveFinished;
  const painted = new Promise(resolve => { resolvePainted = resolve; });
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const paintTimer = setTimeout(reportPainted, 320);
  const soundPrompt = setTimeout(() => {
    if (audio?.available && !soundReady && !closing && enableSound) enableSound.hidden = false;
  }, 650);

  const detachAudio = audio?.onRunning(() => {
    soundReady = true;
    if (enableSound) enableSound.hidden = true;
  });

  enableSound?.addEventListener('click', () => { void audio?.acquire(); });

  function reportPainted() {
    clearTimeout(paintTimer);
    resolvePainted();
  }

  function complete() {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer);
    reportPainted();
    document.removeEventListener('visibilitychange', onVisibility);
    cast?.removeEventListener('load', decodeCast);
    cast?.removeEventListener('error', reportPainted);
    overlay.dataset.phase = 'done';
    overlay.remove();
    for (const { motion } of hops) motion.cancel();
    dissolve?.cancel();
    resolveFinished();
  }

  function fade() {
    if (closed || overlay.dataset.phase === 'fading') return;
    clearTimeout(closeTimer);
    window.dispatchEvent(new Event('bikini-studio-reveal'));
    if (document.hidden || typeof overlay.animate !== 'function') {
      complete();
      return;
    }
    overlay.dataset.phase = 'fading';
    const duration = reduced ? 200 : castReady ? 900 : 420;
    closeTimer = setTimeout(complete, duration + 120);
    try {
      dissolve = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration, easing: 'cubic-bezier(.26,.12,.40,1)', fill: 'forwards',
      });
      dissolve.finished.then(complete, complete);
    } catch {
      complete();
    }
  }

  function finish() {
    if (closing) return finished;
    closing = true;
    closeSoundPrompt();
    if (document.hidden) {
      complete();
    } else if (hops.length) {
      closeTimer = setTimeout(fade, 210);
      try {
        const settling = [];
        for (const { motion, delay } of hops) {
          const elapsed = Number(motion.currentTime ?? 0) - delay;
          const phase = elapsed % roundDuration;
          if (elapsed < 0 || phase >= hopDuration || motion.pending) {
            motion.cancel();
            continue;
          }
          motion.effect.updateTiming({ iterations: Math.floor(elapsed / roundDuration) + hopDuration / roundDuration });
          motion.updatePlaybackRate(Math.max(1, (hopDuration - phase) / 160));
          settling.push(motion.finished.catch(() => {}));
        }
        void Promise.all(settling).then(fade);
      } catch {
        for (const { motion } of hops) motion.cancel();
        fade();
      }
    } else {
      fade();
    }
    return finished;
  }

  function showRetry() {
    closing = true;
    closeSoundPrompt();
    for (const { motion } of hops) motion.cancel();
    overlay.dataset.phase = 'error';
    overlay.setAttribute('aria-label', 'Unable to load');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry loading';
    retry.addEventListener('click', () => location.reload());
    loading.replaceChildren(retry);
    loading.removeAttribute('aria-hidden');
  }

  window.studioIntro = { painted, finish, showRetry };
  overlay.dataset.phase = 'waiting';

  function closeSoundPrompt() {
    clearTimeout(soundPrompt);
    detachAudio?.();
    if (enableSound) enableSound.hidden = true;
  }

  function animateHops() {
    const layer = document.createElement('div');
    layer.className = 'studio-cast-pieces';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.setProperty('--studio-source', `url(${JSON.stringify(cast.currentSrc || cast.src)})`);
    const fullWidth = cuts.at(-1);
    const pieces = cuts.slice(0, -1).map((start, index) => {
      const width = cuts[index + 1] - start;
      const piece = document.createElement('span');
      piece.className = 'studio-cast-piece';
      piece.style.left = `${100 * start / fullWidth}%`;
      piece.style.width = `${100 * width / fullWidth}%`;
      piece.style.backgroundSize = `${100 * fullWidth / width}% 100%`;
      piece.style.backgroundPosition = `${100 * start / (fullWidth - width)}% 0`;
      layer.append(piece);
      return piece;
    });
    overlay.append(layer);
    const frames = [
      { transform: 'translate3d(0,0,0) scaleY(1)', offset: 0, easing: 'ease-out' },
      { transform: 'translate3d(0,0,0) scaleY(.984)', offset: .14, easing: 'cubic-bezier(.18,.58,.28,1)' },
      { transform: 'translate3d(0,-4.2%,0) scaleY(1)', offset: .49, easing: 'cubic-bezier(.42,0,.77,.47)' },
      { transform: 'translate3d(0,0,0) scaleY(1)', offset: 1 },
    ].map(frame => ({ ...frame, offset: frame.offset * hopDuration / roundDuration }));
    frames.push({ transform: 'translate3d(0,0,0) scaleY(1)', offset: 1 });
    try {
      pieces.forEach((piece, index) => {
        const delay = index * hopStagger;
        const motion = piece.animate(frames, { duration: roundDuration, delay, iterations: Infinity });
        hops.push({ motion, delay });
      });
      overlay.dataset.castPieces = '';
    } catch {
      for (const { motion } of hops) motion.cancel();
      hops = [];
      layer.remove();
    }
  }

  function showCast() {
    if (closing || castReady) return;
    castReady = true;
    overlay.style.setProperty('--studio-cast-ratio', String(cast.naturalWidth / cast.naturalHeight));
    overlay.dataset.castReady = '';
    overlay.dataset.phase = 'presenting';
    if (!reduced && !document.hidden && typeof cast.animate === 'function') {
      animateHops();
    }
    if (document.hidden) reportPainted();
    else requestAnimationFrame(() => requestAnimationFrame(reportPainted));
  }

  async function decodeCast() {
    if (!cast?.naturalWidth) {
      reportPainted();
      return;
    }
    try {
      await cast.decode?.();
      showCast();
    } catch {
      reportPainted();
    }
  }

  function onVisibility() {
    if (!document.hidden) return;
    reportPainted();
    if (closing) complete();
  }

  document.addEventListener('visibilitychange', onVisibility);
  if (cast?.complete) void decodeCast();
  else if (cast) {
    cast.addEventListener('load', decodeCast, { once: true });
    cast.addEventListener('error', reportPainted, { once: true });
  } else {
    reportPainted();
  }
  if (document.hidden) reportPainted();
})();
