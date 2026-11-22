import { keyedVideoOffset, prepareBubbleVideo, waitForBubbleVideo } from './bubble-media.js';

export { bubbleSoundUrl } from './bubble-media.js';

const soundtrackCue = 0.08;
const videoLead = soundtrackCue + keyedVideoOffset;
const playbackTimeout = 1750;
const destinationTimeout = 10000;
const coldDestinationTimeout = 60000;

function ease(value, start, end) {
  const x = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return x * x * (3 - 2 * x);
}

export function createDiveTransition(viewport, motion, {
  pauseSurface, resumeSurface, onScene, onFinished, playBubbles, softwareRenderer = false, filmMode = false,
}) {
  const frame = viewport.querySelector('#dive-view');
  const wash = viewport.querySelector('#dive-wash');
  const bubbles = viewport.querySelector('#dive-bubbles');
  const status = viewport.querySelector('#dive-status');
  const destination = new URL('../underwater/index.html?from=surface', import.meta.url);
  if (filmMode) destination.searchParams.set('capture', '1');
  let prepared = false;
  let destinationOpened = false;
  let ready = false;
  let failed = false;
  let boot = 0;
  let openingWarmup;
  let resolveOpening;
  let openingTimer;
  let mediaWarmup;
  let scene = 'surface';
  let crossing = null;

  function openShallows(enter) {
    if (destinationOpened && !failed) return false;
    ready = failed = false;
    destinationOpened = true;
    const url = new URL(destination);
    url.searchParams.set('boot', String(++boot));
    if (enter) url.searchParams.set('enter', '1');
    frame.src = url.href;
    return true;
  }

  function prepare() {
    if (prepared) return;
    prepared = true;
    // On software drivers use the lighter transparent encode and let its
    // nearly white bubbles composite directly through their alpha channel.
    prepareBubbleVideo(bubbles, softwareRenderer);
  }

  function finishWarmup(success) {
    if (!resolveOpening) return;
    clearTimeout(openingTimer);
    resolveOpening(success);
    resolveOpening = undefined;
  }

  function warmOpening(timeout = coldDestinationTimeout) {
    if (!openingWarmup) openingWarmup = new Promise(resolve => {
      if (ready && !failed) {
        resolve(true);
        return;
      }
      resolveOpening = resolve;
      openShallows(false);
      openingTimer = setTimeout(() => {
        if (!crossing) {
          destinationOpened = false;
          ready = false;
          failed = true;
          boot++;
          frame.removeAttribute('src');
        }
        finishWarmup(false);
      }, timeout);
    });
    return openingWarmup;
  }

  function warmMedia() {
    prepare();
    mediaWarmup ??= waitForBubbleVideo(bubbles);
    return mediaWarmup;
  }

  function notifyFrame(type) {
    frame.contentWindow?.postMessage({ type, boot: String(boot) }, location.origin);
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.boot !== String(boot)) return;
    switch (event.data?.type) {
      case 'bikini-dive-ready':
        if (!failed) {
          ready = true;
          finishWarmup(true);
        }
        break;
      case 'bikini-dive-error':
        ready = false;
        failed = true;
        finishWarmup(false);
        break;
      case 'bikini-dive-presented':
        if (crossing?.direction === 'down' && crossing.requested && !crossing.recovering) {
          ready = true;
          crossing.presented = 'shallow';
        }
        break;
      case 'bikini-dive-return': begin('up'); break;
    }
  });

  function begin(direction = 'down') {
    if (crossing || (direction === 'down' ? scene !== 'surface' : scene !== 'shallow')) return false;
    if (direction === 'down') {
      prepare();
      status.hidden = true;
    }

    crossing = {
      direction, reduced: motion.matches, age: 0, lastTick: null, audioAt: null, bubbleAt: null,
      coveredAt: null, destinationDeadline: null, requested: false, recovering: false, presented: null, shownAt: null,
    };
    bubbles.hidden = false;
    wash.style.opacity = 0;
    viewport.dataset.crossing = direction;
    requestAnimationFrame(tick);
    return true;
  }

  function show(next) {
    scene = next;
    const shallow = scene === 'shallow';
    viewport.dataset.scene = scene;
    viewport.setAttribute('aria-label', shallow ? '比奇堡浅海漫游' : '比奇堡上方的海面');
    frame.inert = !shallow;
    if (shallow) {
      frame.removeAttribute('aria-hidden');
      frame.removeAttribute('tabindex');
    } else {
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
    }
    onScene(scene);
  }

  function restoreSurface(trip) {
    notifyFrame('bikini-dive-leave');
    resumeSurface(() => { if (crossing === trip) trip.presented = 'surface'; });
  }

  function tick(now) {
    const trip = crossing;
    if (trip.lastTick !== null) trip.age += Math.min(0.25, (now - trip.lastTick) / 1000);
    trip.lastTick = now;
    const coverAt = trip.reduced ? 0.19 : videoLead + 0.50;
    const fadeMs = trip.reduced ? 250 : 440;

    if (trip.audioAt === null && trip.age >= soundtrackCue) {
      trip.audioAt = now;
      playBubbles();
    }
    if (!trip.reduced && trip.bubbleAt === null && trip.audioAt !== null
      && now - trip.audioAt >= keyedVideoOffset * 1000) {
      trip.bubbleAt = now;
      // The descent has already lowered the camera. Keep that frame behind
      // the incoming bubbles so video compositing has the GPU to itself.
      if (trip.direction === 'down') pauseSurface();
      bubbles.play().catch(() => { bubbles.hidden = true; });
    }
    if (!trip.reduced && trip.bubbleAt !== null) {
      const mediaAge = Math.max(bubbles.currentTime, (now - trip.bubbleAt) / 1000 - 0.18);
      trip.age = Math.max(trip.age, videoLead + mediaAge);
    }

    if (trip.coveredAt === null) {
      wash.style.opacity = ease(trip.age, trip.reduced ? 0 : videoLead + 0.12, coverAt);
      if (trip.age >= coverAt) trip.coveredAt = now;
    } else if (trip.direction === 'down' && trip.destinationDeadline === null) {
      // Model parsing and WebGL startup can block the main thread. Let the
      // full wash paint first so neither the gull nor the falling sign freezes.
      pauseSurface();
      const cold = openShallows(true);
      trip.destinationDeadline = now + (cold || !ready ? coldDestinationTimeout : destinationTimeout);
      // A cold iframe renders the requested opening camera directly. Reuse an
      // already loaded iframe by asking it for a new frame at the same pose.
      if (cold || ready) {
        trip.requested = true;
        if (!cold) notifyFrame('bikini-dive-enter');
      }
    } else if (trip.direction === 'down' && !trip.presented && !trip.recovering
      && (failed || now > trip.destinationDeadline)) {
      failed = true;
      trip.recovering = true;
      restoreSurface(trip);
    } else if (!trip.requested && !trip.recovering && (trip.direction === 'up' || ready)) {
      // The opaque wash has already been painted before either scene changes.
      trip.requested = true;
      if (trip.direction === 'up') restoreSurface(trip);
      else {
        trip.destinationDeadline = now + destinationTimeout;
        notifyFrame('bikini-dive-enter');
      }
    }

    if (trip.direction === 'down' && !trip.presented && !trip.recovering
      && trip.coveredAt !== null && now - trip.coveredAt > 650 && status.hidden) {
      status.textContent = '正在加载浅海…';
      status.hidden = false;
    }
    if (trip.presented && trip.shownAt === null) {
      status.hidden = true;
      show(trip.presented);
      trip.shownAt = now;
    }
    if (trip.shownAt !== null) {
      // Keep a compositor frame of full coverage over the new, already drawn view.
      const sinceShown = now - trip.shownAt;
      wash.style.opacity = 1 - ease(sinceShown, 32, 32 + fadeMs);
      const clipCleared = trip.reduced || bubbles.ended || bubbles.hidden || bubbles.error
        || (trip.bubbleAt !== null && now - trip.bubbleAt >= playbackTimeout);
      if (sinceShown >= 32 + fadeMs && clipCleared) {
        crossing = null;
        delete viewport.dataset.crossing;
        bubbles.pause();
        if (bubbles.readyState) bubbles.currentTime = 0;
        if (trip.recovering) {
          status.textContent = '浅海暂时无法打开，可以稍后再点木牌重试。';
          status.hidden = false;
        }
        if (scene === 'shallow') notifyFrame('bikini-dive-controls');
        onFinished(scene);
        return;
      }
    }
    requestAnimationFrame(tick);
  }

  return {
    prepare, warmOpening, warmMedia, begin,
    get active() { return crossing !== null; },
    get descent() {
      return crossing?.direction === 'down' && !crossing.reduced && !crossing.recovering
        ? ease(crossing.age, 0.03, videoLead) : 0;
    },
  };
}
