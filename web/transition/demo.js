import { bubbleSoundUrl, keyedVideoOffset, prepareBubbleVideo } from './bubble-media.js';

const preview = document.getElementById('preview');
const video = document.getElementById('bubbles');
const button = document.getElementById('play');
const status = document.getElementById('status');
const sound = new Audio(bubbleSoundUrl.href);
sound.preload = 'auto';
prepareBubbleVideo(video);

let playing = false;
let videoStarted = false;
let frame;

function finish(message = '') {
  playing = false;
  cancelAnimationFrame(frame);
  sound.pause();
  video.pause();
  video.hidden = true;
  button.textContent = 'Replay transition';
  button.disabled = false;
  status.textContent = message;
}

function playbackError() {
  if (playing) finish('The preview could not play.');
}

function syncPicture() {
  if (!playing) return;
  // Use the native soundtrack clock so buffering does not start the video early.
  if (!videoStarted && sound.currentTime >= keyedVideoOffset) {
    videoStarted = true;
    video.hidden = false;
    video.play().catch(playbackError);
  }
  if (sound.currentTime >= keyedVideoOffset + 0.50) preview.classList.add('arrived');
  frame = requestAnimationFrame(syncPicture);
}

button.addEventListener('click', async () => {
  if (playing) return;
  playing = true;
  videoStarted = false;
  button.disabled = true;
  button.textContent = 'Playing…';
  status.textContent = '';
  preview.classList.remove('arrived');
  if (sound.readyState) sound.currentTime = 0;
  if (video.readyState) video.currentTime = 0;
  try {
    await sound.play();
    if (playing) frame = requestAnimationFrame(syncPicture);
  } catch {
    playbackError();
  }
});

sound.addEventListener('ended', () => { if (playing) finish(); });
sound.addEventListener('error', playbackError);
video.addEventListener('error', playbackError);
video.addEventListener('ended', () => { video.hidden = true; });
button.disabled = false;
