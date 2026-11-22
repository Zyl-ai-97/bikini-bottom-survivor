const source = new URL('./assets/models.json.gz', import.meta.url);
let pending;

export function prefetchModels() {
  if (!pending) {
    pending = fetch(source, { priority: 'low', signal: AbortSignal.timeout?.(110000) })
      .then(response => {
        if (!response.ok) throw new Error(`Shallow model data returned HTTP ${response.status}`);
        return response.blob();
      })
      .catch(error => {
        pending = undefined;
        throw error;
      });
  }
  return pending;
}

export async function decodeModels(payload) {
  const signature = new Uint8Array(await payload.slice(0, 2).arrayBuffer());
  const compressed = signature[0] === 31 && signature[1] === 139;
  const stream = compressed ? payload.stream().pipeThrough(new DecompressionStream('gzip')) : payload.stream();
  return new Response(stream).json();
}
