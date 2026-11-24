const SAMPLE_RATE = 24000;
const BUBBLE_SAMPLE_RATE = 44100;
const OUTPUT_GAIN = 2;
const TAU = 2 * Math.PI;
const between = (lo, hi) => lo + (hi - lo) * Math.random();
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function breezeNoise(context) {
  const buffer = context.createBuffer(2, SAMPLE_RATE * 5, SAMPLE_RATE);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < left.length; i++) {
    const shared = between(-0.28, 0.28);
    left[i] = shared + between(-0.72, 0.72);
    right[i] = shared + between(-0.72, 0.72);
  }
  return buffer;
}

function coastalSurf(context) {
  const buffer = context.createBuffer(2, SAMPLE_RATE * 9, SAMPLE_RATE);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    let undertow = 0;
    let foam = 0;
    for (let i = 0; i < samples.length; i++) {
      const cycle = TAU * i / samples.length + channel * 0.46;
      const wave = 0.52 + 0.30 * Math.sin(cycle + 0.9) + 0.16 * Math.sin(2 * cycle - 0.35);
      const noise = between(-1, 1);
      undertow += 0.056 * (noise - undertow);
      foam += 0.17 * (noise - foam);
      samples[i] = (undertow * 0.74 + (foam - undertow) * 0.35) * wave;
    }
    // Match the loop seam without a click at the end of the swell.
    const fade = Math.ceil(SAMPLE_RATE * 0.045);
    for (let i = 0; i < fade; i++) {
      const edge = samples.length - fade + i;
      samples[edge] += (samples[0] - samples[edge]) * (i / (fade - 1)) ** 2;
    }
  }
  return buffer;
}

function gullCall(context, descending) {
  const seconds = descending ? 0.48 : 0.36;
  const buffer = context.createBuffer(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  let phase = 0;
  let breath = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const u = t / seconds;
    const pitch = (descending ? 780 : 850) + 330 * (1 - Math.exp(-u * 8))
      - (descending ? 410 : 210) * u * u + 12 * Math.sin(TAU * 14 * t);
    phase += TAU * pitch / SAMPLE_RATE;
    breath += 0.30 * (between(-1, 1) - breath);
    const voice = Math.sin(phase + 0.18 * Math.sin(2 * phase))
      + 0.32 * Math.sin(2 * phase) + (0.22 - 0.12 * u) * Math.sin(3 * phase);
    const envelope = (1 - Math.exp(-t * 42)) * Math.sin(Math.PI * u) ** 1.7;
    samples[i] = (voice * 0.60 + breath * 0.12) * envelope;
  }
  return buffer;
}

function waterEntry(context, weight) {
  const seconds = 0.36 + weight * 0.38;
  const buffer = context.createBuffer(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  let core = 0;
  let spray = 0;
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const white = between(-1, 1);
    core += 0.15 * (white - core);
    spray += 0.52 * (white - spray);
    phase += TAU * (67 - weight * 18 + 70 * Math.exp(-t * 24)) / SAMPLE_RATE;
    const attack = 1 - Math.exp(-t * 230);
    const hollow = Math.sin(phase) * (0.34 + 0.16 * weight) * Math.exp(-t * (25 - 7 * weight));
    const slap = core * 0.9 * Math.exp(-t * 23);
    const spill = (spray - core) * (1 - Math.exp(-t * 29)) * Math.exp(-t * (15 - 5 * weight));
    samples[i] = attack * (hollow + slap + spill);
  }
  // Small, differently sized air cavities and returning droplets follow the initial slap.
  const drops = Math.round(3 + 6 * weight);
  for (let n = 0; n < drops; n++) {
    const start = Math.floor((0.045 + (n / drops) ** 1.3 * (seconds - 0.20) + between(0, 0.022)) * SAMPLE_RATE);
    const frequency = between(280, 910);
    const amplitude = between(0.055, 0.105) * (1 - n / drops * 0.66);
    let angle = 0;
    for (let j = start; j < Math.min(samples.length, start + SAMPLE_RATE * 0.105); j++) {
      const t = (j - start) / SAMPLE_RATE;
      angle += TAU * frequency * (1 + 0.22 * (1 - Math.exp(-t * 65))) / SAMPLE_RATE;
      samples[j] += amplitude * (1 - Math.exp(-t * 310)) * Math.exp(-t * 52) * Math.sin(angle);
    }
  }
  return buffer;
}

export function createSeaAudio({ bubbleSoundUrl } = {}) {
  const studio = window.studioAudio;
  let available = Boolean(studio?.available);
  let context, master, ambient, wind, fronds, windFilter, calls, entries;
  let bubbleVolume;
  let enabled = false;
  let sceneRunning = false;
  let pageActive = true;
  let submerged = false;
  let night = 0;
  let visibilityRevision = 0;
  let weatherTimer, nextBird;
  const playing = new Set();
  const bubbleSources = new Set();
  // Preload and decode the unmodified AAC even if autoplay has not unlocked
  // the output device. The opening can wait for this without playing anything.
  const bubbleTrack = available && bubbleSoundUrl ? fetch(bubbleSoundUrl, {
    signal: AbortSignal.timeout?.(12000),
  })
    .then(response => response.ok ? response.arrayBuffer() : null)
    .then(bytes => bytes && studio.decode(bytes, BUBBLE_SAMPLE_RATE))
    .catch(() => null) : Promise.resolve(null);

  function makeBreeze(noise, frequency, resonance, level) {
    const filtering = context.createBiquadFilter();
    filtering.type = 'bandpass';
    filtering.frequency.value = frequency;
    filtering.Q.value = resonance;
    const gain = context.createGain();
    gain.gain.value = level;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = between(0.87, 1.07);
    source.connect(filtering).connect(gain).connect(ambient);
    source.start(0, between(0, 3));
    return { gain: gain.gain, filter: filtering.frequency };
  }

  function initialize() {
    master = context.createGain();
    master.gain.value = 0;
    master.connect(studio.output());
    ambient = context.createGain();
    ambient.gain.value = submerged ? 0 : 1;
    ambient.connect(master);
    const surf = context.createBufferSource();
    surf.buffer = coastalSurf(context);
    surf.loop = true;
    const surfLevel = context.createGain();
    surfLevel.gain.value = 0.3;
    surf.connect(surfLevel).connect(ambient);
    surf.start();
    const noise = breezeNoise(context);
    const breeze = makeBreeze(noise, 475, 0.48, 0.095);
    wind = breeze.gain;
    windFilter = breeze.filter;
    fronds = makeBreeze(noise, 1950, 0.66, 0.022).gain;
    calls = [gullCall(context, false), gullCall(context, true)];
    entries = [waterEntry(context, 0.15), waterEntry(context, 0.95)];
  }

  function play(buffer, level, pan, rate, at, destination = master) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = level;
    const stereo = context.createStereoPanner?.();
    source.connect(gain);
    if (stereo) {
      stereo.pan.value = pan;
      gain.connect(stereo).connect(destination);
    } else {
      gain.connect(destination);
    }
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      gain.disconnect();
      stereo?.disconnect();
    };
    source.start(at);
  }

  function weather() {
    const now = context.currentTime;
    const gust = Math.random();
    wind.setTargetAtTime(0.075 + gust * 0.052, now, 1.25);
    windFilter.setTargetAtTime(365 + 245 * gust, now, 1.8);
    fronds.setTargetAtTime((0.013 + gust * gust * 0.035) * (1 - 0.19 * night), now, 0.85);
    if (now >= nextBird) {
      const pan = between(-0.76, -0.38);
      const rate = between(0.88, 1.05);
      const level = between(0.024, 0.042) * (1 - 0.86 * night);
      play(calls[1], level, pan, rate, now, ambient);
      if (Math.random() > 0.45) {
        play(calls[0], level * 0.68, pan + 0.06, rate * 1.04, now + between(0.54, 0.86), ambient);
      }
      nextBird = now + between(11, 23) * (1 + 1.5 * night);
    }
    weatherTimer = setTimeout(weather, between(1400, 3200));
  }

  function fadeGain(gain, target, seconds) {
    const now = context.currentTime;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else {
      const value = gain.value;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(value, now);
    }
    gain.linearRampToValueAtTime(target, now + seconds);
  }

  function canPlay() {
    return enabled && Boolean(master) && isVisible() && context?.state === 'running';
  }

  function isVisible() {
    return pageActive && !document.hidden;
  }

  function updateAmbience() {
    clearTimeout(weatherTimer);
    if (!ambient) return;
    fadeGain(ambient.gain, submerged ? 0 : 1, 0.25);
    if (!submerged && canPlay()) {
      nextBird = context.currentTime + between(14, 22);
      weather();
    }
  }

  function stopScene(background) {
    sceneRunning = false;
    clearTimeout(weatherTimer);
    if (!master || context.state === 'closed') return;
    const fade = background ? 0 : 0.075;
    fadeGain(master.gain, 0, fade);
    for (const source of playing) source.stop(context.currentTime + fade);
  }

  function useContext(running) {
    if (!running || !isVisible()) return;
    context = running;
    if (!enabled || sceneRunning) return;
    try {
      if (!master) initialize();
      sceneRunning = true;
      fadeGain(master.gain, 0.88 * OUTPUT_GAIN, 0.18);
      updateAmbience();
    } catch {
      enabled = false;
      available = false;
    }
  }

  function checkVisibility() {
    if (isVisible()) {
      void studio?.acquire().then(useContext);
      return;
    }
    visibilityRevision++;
    stopScene(true);
    for (const source of bubbleSources) source.stop();
  }

  studio?.onRunning(useContext);
  document.addEventListener('visibilitychange', checkVisibility);
  window.addEventListener('pagehide', () => { pageActive = false; checkVisibility(); });
  window.addEventListener('pageshow', () => { pageActive = true; checkVisibility(); });

  return {
    get available() { return available; },
    get enabled() { return enabled; },
    get ambientPlaying() { return sceneRunning && !submerged && canPlay(); },
    prepareDiveAudio() { return bubbleTrack.then(Boolean); },
    async setEnabled(value) {
      enabled = Boolean(value) && available;
      if (enabled) useContext(await studio.acquire());
      else stopScene(false);
      return enabled;
    },
    setNight(value) { night = clamp(value, 0, 1); },
    setSubmerged(value) {
      if (submerged === Boolean(value)) return;
      submerged = Boolean(value);
      updateAmbience();
    },
    gullEntrance() {
      if (submerged || !canPlay()) return;
      const now = context.currentTime;
      play(calls[1], 0.25, -0.65, 0.96, now);
      play(calls[0], 0.13, -0.51, 1.01, now + 0.30);
    },
    async dive() {
      if (!studio?.available || !isVisible()) return;
      const revision = visibilityRevision;
      const running = context?.state === 'running' ? context : await studio.acquire();
      if (!running || revision !== visibilityRevision || !isVisible()) return;
      const buffer = await bubbleTrack;
      if (!buffer || revision !== visibilityRevision || !isVisible() || running.state !== 'running') return;
      if (!bubbleVolume) {
        bubbleVolume = running.createGain();
        bubbleVolume.gain.value = OUTPUT_GAIN;
        bubbleVolume.connect(studio.output());
      }
      const source = running.createBufferSource();
      source.buffer = buffer;
      // Keep the transition's amplified original track independent of scene mute.
      source.connect(bubbleVolume);
      bubbleSources.add(source);
      source.onended = () => {
        bubbleSources.delete(source);
        source.disconnect();
      };
      source.start();
    },
    impact(strength, lateral, depth) {
      if (submerged || !canPlay()) return;
      const power = clamp(strength, 0, 1);
      const distance = Math.max(1, Math.hypot(lateral, depth));
      const pan = clamp(lateral / distance * 1.65, -0.90, 0.90);
      const level = (0.055 + 0.76 * power ** 0.78) / (1 + Math.max(0, distance - 4) * 0.077);
      const rate = between(0.94, 1.07);
      const at = context.currentTime;
      if (power < 1) play(entries[0], level * (1 - power), pan, rate, at);
      if (power > 0) play(entries[1], level * power, pan, rate, at);
    },
  };
}
