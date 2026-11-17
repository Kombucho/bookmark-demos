// A canvas illustration of a post renderer.
// Line breaks come from a measure function the caller supplies.
// Nothing here reads the clock, the network, the filesystem, or the DOM.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PostRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FAMILY = '"Segoe UI", system-ui, sans-serif';
  const WIDTHS = [390, 600];
  const SCALES = [1, 2, 3];
  const SHOW_MORE_LINES = 4;
  const TEXT_CAP = 2000;
  const PAD_X = 16;
  const PAD_Y = 12;
  const AVATAR = 40;
  const COL_GAP = 12;
  const LINE = 20;
  const MEDIA_GAP = 12;
  const MEDIA_RADIUS = 16;
  const ACTION_GAP = 12;

  const FONT = {
    name: { size: 15, weight: 700 },
    meta: { size: 15, weight: 400 },
    body: { size: 15, weight: 400 },
    action: { size: 13, weight: 400 },
    initial: { size: 14, weight: 700 },
    media: { size: 13, weight: 600 },
  };

  const MEDIA_FILLS = ['#1d9bf0', '#7856ff', '#17bf63', '#f91880'];

  const THEMES = {
    light: {
      id: 'light',
      bg: '#ffffff',
      text: '#0f1419',
      secondary: '#536471',
      link: '#1d9bf0',
      border: '#eff3f4',
      badgeInk: '#ffffff',
    },
    dark: {
      id: 'dark',
      bg: '#000000',
      text: '#e7e9ea',
      secondary: '#71767b',
      link: '#1d9bf0',
      border: '#2f3336',
      badgeInk: '#ffffff',
    },
  };

  const DEFAULT_COUNTS = {
    replies: 18,
    reposts: 64,
    likes: 1204,
    views: 18420,
  };

  const SAMPLE = {
    name: 'Ada North',
    handle: 'northglass',
    text: '✨ @rauchg #xeet https://github.com/rauchg/xeet\nA post, painted without a browser. The page measures the text, breaks the lines, and fills a PNG. xeet does this in safe Rust so the bytes can match on every machine. This page is only the picture of that idea, and a second pass hashes the pixels.',
    theme: 'light',
    width: 390,
    scale: 2,
    media: 1,
    showMore: true,
    verified: true,
    stamp: '3h',
  };

  function fontCss(weight, size) {
    return weight + ' ' + size + 'px ' + FAMILY;
  }

  function fnv1a(bytes) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function comma(v) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function trim1(n) {
    return n.toFixed(1).replace(/\.0$/, '');
  }

  function compactCount(n) {
    const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
    if (v < 10000) return comma(v);
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (let i = 0; i < units.length; i++) {
      const div = units[i][0];
      const suffix = units[i][1];
      if (v >= div) {
        const scaled = v / div;
        const text = scaled >= 100 ? String(Math.round(scaled)) : trim1(scaled);
        return text + suffix;
      }
    }
    return comma(v);
  }

  function graphemeRanges(text) {
    const ranges = [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const parts = seg.segment(text);
      for (const part of parts) {
        ranges.push([part.index, part.index + part.segment.length]);
      }
      return ranges;
    }
    for (let i = 0; i < text.length;) {
      const cp = text.codePointAt(i);
      const len = cp > 0xffff ? 2 : 1;
      ranges.push([i, i + len]);
      i += len;
    }
    return ranges;
  }

  function isSpace(grapheme) {
    return /^[\t \u00a0]+$/u.test(grapheme);
  }

  function makeLine(raw, start) {
    const text = raw.replace(/[\t \u00a0]+$/u, '');
    return {
      text: text,
      start: start,
      end: start + text.length,
      showMore: false,
    };
  }

  function wrapParagraph(text, base, measure, maxWidth) {
    const ranges = graphemeRanges(text);
    const lines = [];
    if (!ranges.length) {
      lines.push(makeLine('', base));
      return lines;
    }
    let i = 0;
    while (i < ranges.length) {
      let end = i;
      let lastSpace = -1;
      while (end < ranges.length) {
        const gStart = ranges[end][0];
        const gEnd = ranges[end][1];
        const g = text.slice(gStart, gEnd);
        const candidate = text.slice(ranges[i][0], gEnd);
        if (measure(candidate) <= maxWidth) {
          if (isSpace(g)) lastSpace = end;
          end += 1;
          continue;
        }
        if (isSpace(g)) lastSpace = end;
        break;
      }

      if (end === i) {
        const from = ranges[i][0];
        const to = ranges[i][1];
        lines.push(makeLine(text.slice(from, to), base + from));
        i += 1;
        continue;
      }

      let lineEnd = end;
      let next = end;
      if (end < ranges.length && lastSpace >= i) {
        const spaceAtEnd = lastSpace === end;
        if (spaceAtEnd || lastSpace < end) {
          lineEnd = lastSpace;
          next = lastSpace;
          while (next < ranges.length && isSpace(text.slice(ranges[next][0], ranges[next][1]))) {
            next += 1;
          }
        }
      }

      if (lineEnd <= i) {
        lineEnd = i + 1;
        next = lineEnd;
      }

      const from = ranges[i][0];
      const to = ranges[lineEnd - 1][1];
      lines.push(makeLine(text.slice(from, to), base + from));
      if (next <= i) next = i + 1;
      i = next;
    }
    return lines;
  }

  function wrapText(text, measure, maxWidth) {
    const width = Math.max(1, maxWidth);
    const source = String(text || '').replace(/\r\n/g, '\n');
    if (source.trim() === '') return [];
    const parts = source.split('\n');
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    const lines = [];
    let base = 0;
    for (let p = 0; p < parts.length; p++) {
      const paragraph = parts[p];
      const wrapped = wrapParagraph(paragraph, base, measure, width);
      for (let i = 0; i < wrapped.length; i++) lines.push(wrapped[i]);
      base += paragraph.length + 1;
    }
    return lines;
  }

  function popGrapheme(text) {
    const ranges = graphemeRanges(text);
    if (!ranges.length) return '';
    return text.slice(0, ranges[ranges.length - 1][0]);
  }

  function findEntities(text) {
    const re = /https?:\/\/[^\s]+|www\.[^\s]+|@[A-Za-z0-9_]{1,15}|#[A-Za-z0-9_]+/g;
    const entities = [];
    let match;
    while ((match = re.exec(text))) {
      let raw = match[0];
      let start = match.index;
      let kind = 'url';
      if (raw[0] === '@') kind = 'mention';
      else if (raw[0] === '#') kind = 'hashtag';
      if (kind === 'url') {
        const trimmed = raw.replace(/[.,!?;:)\]}'"]+$/u, '');
        raw = trimmed;
      }
      if (!raw) continue;
      entities.push({
        kind: kind,
        start: start,
        end: start + raw.length,
        text: raw,
      });
    }
    return entities;
  }

  function segmentsFor(line, entities) {
    const spans = [];
    const local = [];
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const start = Math.max(entity.start, line.start) - line.start;
      const end = Math.min(entity.end, line.end) - line.start;
      if (end > start) local.push({ start: start, end: end, kind: entity.kind });
    }
    local.sort(function (a, b) { return a.start - b.start; });
    let cursor = 0;
    for (let i = 0; i < local.length; i++) {
      const entity = local[i];
      if (entity.start > cursor) {
        spans.push({ text: line.text.slice(cursor, entity.start), kind: 'text' });
      }
      spans.push({ text: line.text.slice(entity.start, entity.end), kind: entity.kind });
      cursor = entity.end;
    }
    if (cursor < line.text.length) {
      spans.push({ text: line.text.slice(cursor), kind: 'text' });
    }
    if (!spans.length) spans.push({ text: line.text, kind: 'text' });
    return spans;
  }

  function applyShowMore(lines, measure, maxWidth) {
    if (lines.length <= SHOW_MORE_LINES) {
      return { lines: lines, truncated: false };
    }
    const kept = lines.slice(0, SHOW_MORE_LINES).map(function (line) {
      return {
        text: line.text,
        start: line.start,
        end: line.end,
        showMore: false,
      };
    });
    const label = 'Show more';
    const last = kept[kept.length - 1];
    let text = last.text;
    const gap = text ? measure(' ') : 0;
    while (text && measure(text) + gap + measure(label) > maxWidth) {
      text = popGrapheme(text).replace(/[\t \u00a0]+$/u, '');
    }
    kept[kept.length - 1] = {
      text: text,
      start: last.start,
      end: last.start + text.length,
      showMore: true,
    };
    return { lines: kept, truncated: true };
  }

  function sanitizeHandle(value) {
    const cleaned = String(value || '').replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 15);
    return cleaned || 'handle';
  }

  function sanitizeName(value) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    return cleaned || 'Name';
  }

  function sanitizeStamp(value) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    return cleaned || '3h';
  }

  function normalize(input) {
    const source = input || {};
    const theme = THEMES[source.theme] ? source.theme : 'light';
    const width = WIDTHS.indexOf(Number(source.width)) >= 0 ? Number(source.width) : 390;
    const scale = SCALES.indexOf(Number(source.scale)) >= 0 ? Number(source.scale) : 2;
    let media = Math.round(Number(source.media));
    if (!Number.isFinite(media)) media = 0;
    media = Math.max(0, Math.min(4, media));
    const rawText = String(source.text == null ? '' : source.text).replace(/\r\n/g, '\n');
    const counts = Object.assign({}, DEFAULT_COUNTS, source.counts || {});
    return {
      name: sanitizeName(source.name),
      handle: sanitizeHandle(source.handle),
      text: rawText.slice(0, TEXT_CAP),
      clipped: rawText.length > TEXT_CAP,
      theme: theme,
      width: width,
      scale: scale,
      media: media,
      showMore: Boolean(source.showMore),
      verified: Boolean(source.verified),
      stamp: sanitizeStamp(source.stamp),
      counts: {
        replies: counts.replies,
        reposts: counts.reposts,
        likes: counts.likes,
        views: counts.views,
      },
    };
  }

  function initials(name) {
    const parts = name.trim().split(' ').filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function avatarColor(handle) {
    const palette = ['#1d9bf0', '#7856ff', '#00ba7c', '#f91880', '#ff7a00', '#5b4b8a'];
    let hash = 0;
    for (let i = 0; i < handle.length; i++) hash = (hash + handle.charCodeAt(i)) % palette.length;
    return palette[hash];
  }

  function fitName(name, measure, maxWidth, badgeW) {
    const gap = 4;
    let shown = name;
    function widthOf(value) {
      return measure(value, FONT.name) + badgeW + gap;
    }
    if (widthOf(shown) <= maxWidth) return shown;
    while (shown && widthOf(shown + '…') > maxWidth) shown = popGrapheme(shown);
    return (shown || '') + '…';
  }

  function mediaHeight(contentW, count) {
    if (count <= 0) return 0;
    if (count === 1) return Math.round(contentW * 0.56);
    if (count === 2) return Math.round(contentW * 0.5);
    return Math.round(contentW * 0.62);
  }

  function mediaCells(x, y, w, h, count) {
    const g = 2;
    if (count === 1) return [{ x: x, y: y, w: w, h: h }];
    if (count === 2) {
      const c = (w - g) / 2;
      return [
        { x: x, y: y, w: c, h: h },
        { x: x + c + g, y: y, w: w - c - g, h: h },
      ];
    }
    if (count === 3) {
      const leftW = Math.round((w - g) * 0.62);
      const rightW = w - g - leftW;
      const topH = Math.round((h - g) / 2);
      return [
        { x: x, y: y, w: leftW, h: h },
        { x: x + leftW + g, y: y, w: rightW, h: topH },
        { x: x + leftW + g, y: y + topH + g, w: rightW, h: h - topH - g },
      ];
    }
    const leftW = Math.round((w - g) / 2);
    const topH = Math.round((h - g) / 2);
    const rightX = x + leftW + g;
    const bottomY = y + topH + g;
    return [
      { x: x, y: y, w: leftW, h: topH },
      { x: rightX, y: y, w: w - leftW - g, h: topH },
      { x: x, y: bottomY, w: leftW, h: h - topH - g },
      { x: rightX, y: bottomY, w: w - leftW - g, h: h - topH - g },
    ];
  }

  function pushText(ops, spec) {
    ops.push({
      type: 'text',
      x: spec.x,
      y: spec.y,
      text: spec.text,
      fill: spec.fill,
      size: spec.size,
      weight: spec.weight,
      align: spec.align || 'left',
    });
  }

  function layoutPost(input, measure) {
    if (typeof measure !== 'function') throw new Error('layoutPost needs a measure function');
    const post = normalize(input);
    const theme = THEMES[post.theme];
    const colX = PAD_X + AVATAR + COL_GAP;
    const contentW = post.width - colX - PAD_X;
    const bodyMeasure = function (text) { return measure(text, FONT.body); };
    const entities = findEntities(post.text);
    let lines = wrapText(post.text, bodyMeasure, contentW);
    let truncated = false;
    if (post.showMore) {
      const cut = applyShowMore(lines, bodyMeasure, contentW);
      lines = cut.lines;
      truncated = cut.truncated;
    }

    const ops = [];
    let y = PAD_Y;
    const nameTop = y;
    const badge = post.verified ? 18 : 0;
    const meta = '@' + post.handle + ' · ' + post.stamp;
    const metaW = measure(meta, FONT.meta);
    const nameMax = Math.max(8, contentW - metaW - 4);
    const name = fitName(post.name, measure, nameMax, badge);
    const nameW = measure(name, FONT.name);
    const nameY = nameTop + LINE / 2;

    ops.push({ type: 'rect', x: 0, y: 0, w: post.width, h: 0, fill: theme.bg, radius: 0 });
    ops.push({
      type: 'circle',
      x: PAD_X + AVATAR / 2,
      y: PAD_Y + AVATAR / 2,
      r: AVATAR / 2,
      fill: avatarColor(post.handle),
    });
    pushText(ops, {
      x: PAD_X + AVATAR / 2,
      y: PAD_Y + AVATAR / 2,
      text: initials(post.name),
      fill: '#ffffff',
      size: FONT.initial.size,
      weight: FONT.initial.weight,
      align: 'center',
    });

    let cursor = colX;
    pushText(ops, {
      x: cursor,
      y: nameY,
      text: name,
      fill: theme.text,
      size: FONT.name.size,
      weight: FONT.name.weight,
    });
    cursor += nameW;
    if (post.verified) {
      ops.push({
        type: 'badge',
        x: cursor + 4,
        y: nameTop + (LINE - 16) / 2,
        size: 16,
        fill: theme.link,
        ink: theme.badgeInk,
      });
      cursor += badge;
    }
    pushText(ops, {
      x: cursor + 4,
      y: nameY,
      text: meta,
      fill: theme.secondary,
      size: FONT.meta.size,
      weight: FONT.meta.weight,
    });

    y = nameTop + LINE;
    const bodyTop = y;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mid = y + LINE / 2;
      let x = colX;
      const spans = segmentsFor(line, entities);
      for (let s = 0; s < spans.length; s++) {
        const span = spans[s];
        if (!span.text) continue;
        const fill = span.kind === 'text' ? theme.text : theme.link;
        pushText(ops, {
          x: x,
          y: mid,
          text: span.text,
          fill: fill,
          size: FONT.body.size,
          weight: FONT.body.weight,
        });
        x += bodyMeasure(span.text);
      }
      if (line.showMore) {
        if (line.text) x += bodyMeasure(' ');
        pushText(ops, {
          x: x,
          y: mid,
          text: 'Show more',
          fill: theme.link,
          size: FONT.body.size,
          weight: FONT.body.weight,
        });
      }
      y += LINE;
    }

    let mediaOp = null;
    if (post.media > 0) {
      const gap = lines.length ? MEDIA_GAP : 4;
      const h = mediaHeight(contentW, post.media);
      const cells = mediaCells(colX, y + gap, contentW, h, post.media);
      mediaOp = {
        type: 'media',
        x: colX,
        y: y + gap,
        w: contentW,
        h: h,
        radius: MEDIA_RADIUS,
        cells: cells.map(function (cell, index) {
          return {
            x: cell.x,
            y: cell.y,
            w: cell.w,
            h: cell.h,
            fill: MEDIA_FILLS[index % MEDIA_FILLS.length],
            label: cell.w >= 120 ? 'Media ' + (index + 1) : String(index + 1),
          };
        }),
      };
      ops.push(mediaOp);
      y += gap + h;
    }

    y += ACTION_GAP;
    const actionTop = y;
    const actions = [
      { icon: 'reply', label: 'Replies', count: compactCount(post.counts.replies) },
      { icon: 'repost', label: 'Reposts', count: compactCount(post.counts.reposts) },
      { icon: 'like', label: 'Likes', count: compactCount(post.counts.likes) },
      { icon: 'views', label: 'Views', count: compactCount(post.counts.views) },
    ];
    const slot = contentW / 4;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const x = colX + slot * i;
      ops.push({
        type: 'icon',
        name: action.icon,
        x: x,
        y: actionTop,
        size: 18,
        fill: theme.secondary,
        label: action.label,
      });
      pushText(ops, {
        x: x + 22,
        y: actionTop + 9,
        text: action.count,
        fill: theme.secondary,
        size: FONT.action.size,
        weight: FONT.action.weight,
      });
    }
    y = actionTop + 18 + PAD_Y;

    const height = Math.ceil(y);
    ops[0].h = height;
    ops.push({
      type: 'stroke',
      x: 0.5,
      y: 0.5,
      w: post.width - 1,
      h: height - 1,
      color: theme.border,
    });

    return {
      width: post.width,
      height: height,
      scale: post.scale,
      pixelWidth: post.width * post.scale,
      pixelHeight: height * post.scale,
      theme: theme.id,
      truncated: truncated,
      clipped: post.clipped,
      lines: lines.map(function (line) {
        return { text: line.text, showMore: line.showMore };
      }),
      lineCount: lines.length,
      entities: entities,
      media: post.media,
      ops: ops,
      bodyTop: bodyTop,
      contentW: contentW,
      colX: colX,
      post: post,
    };
  }

  return {
    FAMILY: FAMILY,
    WIDTHS: WIDTHS,
    SCALES: SCALES,
    SHOW_MORE_LINES: SHOW_MORE_LINES,
    TEXT_CAP: TEXT_CAP,
    THEMES: THEMES,
    FONT: FONT,
    SAMPLE: SAMPLE,
    DEFAULT_COUNTS: DEFAULT_COUNTS,
    fontCss: fontCss,
    fnv1a: fnv1a,
    compactCount: compactCount,
    graphemeRanges: graphemeRanges,
    wrapText: wrapText,
    findEntities: findEntities,
    normalize: normalize,
    layoutPost: layoutPost,
    initials: initials,
  };
});
