import { decodeModels, prefetchModels } from './models.js';

const query = new URLSearchParams(location.search);
const embedded = window.parent !== window && query.get('from') === 'surface';
try {
  const requested = embedded ? window.parent.getShallowModelPayload?.() : undefined;
  window.bikiniMeshes = await decodeModels(await (requested ?? prefetchModels()));
  await import('./bikini-layout.js');
  await import('./world.js');
  await import('./app.js');
} catch (error) {
  const status = document.querySelector('#status');
  status.textContent = '浅海素材未能加载，请重新打开此页。';
  status.hidden = false;
  if (embedded) window.parent.postMessage({ type: 'bikini-dive-error', boot: query.get('boot') }, location.origin);
  console.error('浅海加载失败', error);
}
