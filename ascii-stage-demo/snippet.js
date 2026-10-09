// Parse and rebuild the ascii.rest embed tag. The stage cues whatever
// this accepts. Unknown names are refused so a typo does not leave a
// blank well or a warning from the remote script.

(function (root, factory) {
  const pieces = typeof module === 'object' && module.exports ? require('./pieces.js') : root.AsciiPieces;
  const api = factory(pieces);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AsciiSnippet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (pieces) {
  function parseAttrs(raw) {
    const attrs = {};
    const re = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = re.exec(raw))) {
      const key = match[1].toLowerCase();
      if (match[2] != null) attrs[key] = match[2];
      else if (match[3] != null) attrs[key] = match[3];
      else if (match[4] != null) attrs[key] = match[4];
      else attrs[key] = '';
    }
    return attrs;
  }

  function parseSnippet(source) {
    const text = String(source || '');
    const tag = text.match(/<ascii-art\b([^>]*?)\/?>/i);
    if (!tag) return { ok: false, error: 'The snippet needs an <ascii-art> tag.' };
    const attrs = parseAttrs(tag[1]);
    if (attrs.piece == null || String(attrs.piece).trim() === '') {
      return { ok: false, error: 'Give the tag a piece attribute.' };
    }
    const piece = String(attrs.piece).trim().toLowerCase();
    if (!pieces.has(piece)) {
      return { ok: false, error: 'No piece named “' + piece + '” in this catalog.' };
    }
    let fps = null;
    if (attrs.fps != null && attrs.fps !== '') {
      const n = Number(attrs.fps);
      if (!Number.isFinite(n) || n < 1 || n > 60) {
        return { ok: false, error: 'fps needs a number from 1 to 60.' };
      }
      fps = n;
    }
    let options = null;
    if (attrs.options != null && attrs.options !== '') {
      try {
        options = JSON.parse(attrs.options);
      } catch (err) {
        return { ok: false, error: 'options has to be JSON.' };
      }
      if (!options || typeof options !== 'object' || Array.isArray(options)) {
        return { ok: false, error: 'options has to be a JSON object.' };
      }
    }
    return {
      ok: true,
      piece: piece,
      fps: fps,
      options: options,
      label: attrs.label ? String(attrs.label) : '',
      mono: Object.prototype.hasOwnProperty.call(attrs, 'mono'),
    };
  }

  function buildSnippet(spec) {
    const attrs = ['piece="' + spec.piece + '"'];
    if (spec.fps) attrs.push('fps="' + spec.fps + '"');
    if (spec.options && Object.keys(spec.options).length) {
      const json = JSON.stringify(spec.options).replace(/'/g, '\\u0027');
      attrs.push("options='" + json + "'");
    }
    if (spec.label) attrs.push('label="' + String(spec.label).replace(/"/g, '') + '"');
    if (spec.mono) attrs.push('mono');
    return '<script type="module" src="https://ascii.rest/ascii.js"><\/script>\n\n<ascii-art ' + attrs.join(' ') + '></ascii-art>\n';
  }

  return { parseSnippet: parseSnippet, buildSnippet: buildSnippet };
});
