// Browser deflate via CompressionStream. Node's zlib is the fallback for tests.
// The wrapper is zlib-format deflate, the same bytes DecompressionStream('deflate') reads.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ScrollCompress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function hasStreams() {
    return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  }

  async function through(bytes, StreamCtor) {
    const stream = new Blob([bytes]).stream().pipeThrough(new StreamCtor('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function deflateUtf8(text) {
    const bytes = encoder.encode(text);
    if (hasStreams()) return through(bytes, CompressionStream);
    const zlib = require('node:zlib');
    return new Uint8Array(zlib.deflateSync(bytes));
  }

  async function inflateToString(bytes) {
    let inflated;
    if (hasStreams()) inflated = await through(bytes, DecompressionStream);
    else inflated = new Uint8Array(require('node:zlib').inflateSync(Buffer.from(bytes)));
    return decoder.decode(inflated);
  }

  return {
    deflateUtf8: deflateUtf8,
    inflateToString: inflateToString,
  };
});
