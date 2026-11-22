(() => {
  'use strict';

  const Audio = window.AudioContext || window.webkitAudioContext;
  const DecodeContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const listeners = new Set();
  let context;
  let mix;
  let activated = false;
  let pageActive = true;
  let announcedRunning = false;

  function isVisible() {
    return pageActive && !document.hidden;
  }

  function announceRunning() {
    const running = context?.state === 'running' && isVisible();
    if (running === announcedRunning) return;
    announcedRunning = running;
    if (running) for (const listener of listeners) listener(context);
  }

  async function acquire() {
    if (!Audio || !isVisible()) return null;
    const canStart = activated || navigator.userActivation?.hasBeenActive;
    try {
      if (!context) {
        const policy = navigator.getAutoplayPolicy?.('audiocontext');
        if (!canStart && policy && policy !== 'allowed') return null;
        context = new Audio({ latencyHint: 'interactive' });
        context.addEventListener('statechange', announceRunning);
      }
      if (context.state !== 'running') {
        if (!canStart) return null;
        await context.resume();
      }
      announceRunning();
      return context.state === 'running' && isVisible() ? context : null;
    } catch {
      return null;
    }
  }

  function output() {
    if (mix) return mix;
    if (!context.createWaveShaper) return context.destination;
    mix = context.createGain();
    mix.gain.value = 0.5;
    const guard = context.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const input = 4 * i / (curve.length - 1) - 2;
      const magnitude = Math.abs(input);
      // Keep the mix linear until a loud overlap risks clipping the output.
      const safe = magnitude <= 0.94 ? magnitude
        : 0.94 + 0.059 * (1 - Math.exp(-(magnitude - 0.94) / 0.059));
      curve[i] = Math.sign(input) * safe;
    }
    guard.curve = curve;
    mix.connect(guard).connect(context.destination);
    return mix;
  }

  function decode(bytes, sourceRate) {
    const decoder = context && context.state !== 'closed' ? context
      : DecodeContext ? new DecodeContext(2, 1, sourceRate) : null;
    return decoder?.decodeAudioData(bytes) ?? null;
  }

  function unlock(event) {
    if (!event.isTrusted || (event.type === 'pointerdown' && event.pointerType !== 'mouse')) return;
    activated = true;
    if (!announcedRunning) void acquire();
  }

  for (const action of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
    document.addEventListener(action, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) announceRunning();
    else void acquire();
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    announceRunning();
  });
  window.addEventListener('pageshow', () => { pageActive = true; void acquire(); });

  window.studioAudio = {
    available: Boolean(Audio),
    acquire,
    decode,
    output,
    onRunning(listener) {
      listeners.add(listener);
      if (announcedRunning) listener(context);
      return () => listeners.delete(listener);
    },
  };
  void acquire();
})();
