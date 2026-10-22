const assert = require('node:assert/strict');
const test = require('node:test');
const show = require('./show.js');

test('the local token rule ignores space and charges long words and punctuation', function () {
  assert.equal(show.countTokens(''), 0);
  assert.equal(show.countTokens('   \n\t'), 0);
  assert.equal(show.countTokens('open'), 1);
  assert.equal(show.countTokens('folder'), 1);
  assert.equal(show.countTokens('InboxView'), 2);
  assert.equal(show.countTokens('a, b'), 3);
  assert.equal(show.countTokens('()'), 1);
  assert.equal(show.countTokens('cache.set'), 3);
  assert.equal(show.countTokens('open\nopen'), 2);
});

test('the overview is rendered from the structured blocks, not a second copy of the text', function () {
  const view = show.present(null);
  const built = show.CHANGE.blocks.map(show.renderBlock).join('\n\n');
  assert.equal(view.text, built);
  assert.equal(view.kind, 'overview');
  assert.match(view.text, /\+    <InboxView>/);
  assert.match(view.text, /chunks of 200/);
  assert.match(view.text, /readHead\(path, 4096\)/);
  assert.match(view.text, /assertGranted\(path\)/);
  assert.match(view.text, /first two lines/);
  assert.match(view.prose, /4 KB/);
  assert.equal(view.tokens.files, 10);
  assert.deepEqual(view.files, show.FILES);
});

test('a drill renders only that node, and the same command is stable', function () {
  const inbox = show.run('/show-me the InboxView');
  const again = show.run('/SHOW-ME   the   inbox view');
  assert.equal(inbox.ok, true);
  assert.equal(inbox.id, 'inbox-view');
  assert.equal(inbox.view.text, again.view.text);
  assert.match(inbox.view.text, /function InboxView\(notes, folders, onOpen\)/);
  assert.match(inbox.view.text, /groupByDay\(notes, modifiedAt desc\)/);
  assert.match(inbox.view.text, /<LiveText text=note.body>/);
  assert.doesNotMatch(inbox.view.text, /BATCH = 200/);
  assert.doesNotMatch(inbox.view.text, /assertGranted/);

  const cache = show.run('/show-me the preview cache');
  assert.equal(cache.id, 'preview-cache');
  assert.match(cache.view.text, /BATCH = 200/);
  assert.match(cache.view.text, /HEAD = 4096    first 4 KB/);
  assert.match(cache.view.text, /assertGranted\(path\)/);
  assert.match(cache.view.text, /function readHeads\(paths, bytes\)    main process/);
  assert.doesNotMatch(cache.view.text, /ViewToggle/);
  assert.deepEqual(cache.view.files, ['src/inbox/previewCache.ts', 'src/ipc/readHead.ts']);

  const bare = show.run('show-me previewcache');
  assert.equal(bare.id, 'preview-cache');
  const rows = show.run('/show-me InboxRows');
  assert.equal(rows.id, 'inbox-rows');
  assert.match(rows.view.text, /memo/);
  assert.match(rows.view.text, /keep the row/);
});

test('the pseudo-code is much smaller than the raw diff', function () {
  const view = show.present(null);
  const drill = show.present('preview-cache');
  assert.ok(view.tokens.diff > view.tokens.overview * 2);
  assert.ok(view.tokens.overview < view.tokens.diff);
  assert.ok(drill.tokens.view < drill.tokens.diff);
  assert.equal(view.tokens.share, Math.round((view.tokens.view / view.tokens.diff) * 100));
  assert.ok(view.tokens.share < 50);
  assert.equal(view.tokens.view, view.tokens.overview);
  assert.equal(show.diffStats().tokens, view.tokens.diff);
  assert.equal(show.diffStats().files, 10);
  assert.match(show.DIFF, /BATCH = 200/);
  assert.match(show.DIFF, /assertGranted/);
  assert.match(show.DIFF, /ui\.sidebarView/);
  assert.ok(show.DIFF.split('\n').length > 150);
});

test('unknown commands fail and a bare /show-me returns the whole change', function () {
  const whole = show.run('/show-me');
  assert.equal(whole.ok, true);
  assert.equal(whole.id, null);
  assert.equal(whole.view.kind, 'overview');
  const empty = show.run('   ');
  assert.equal(empty.ok, false);
  const other = show.run('/review the inbox');
  assert.equal(other.ok, false);
  assert.match(other.error, /Start with \/show-me/);
  const missing = show.run('/show-me the moon');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /InboxView/);
  assert.match(missing.error, /preview cache/);
  assert.equal(show.present('nope'), null);
  assert.equal(show.prDescription('nope'), null);
});

test('the PR description embeds the rendered pseudo-code and the merge danger', function () {
  const whole = show.prDescription(null);
  assert.match(whole, /^## Summary/);
  assert.match(whole, /```text/);
  assert.match(whole, /\+    <InboxView>/);
  assert.match(whole, /\*\*Door:\*\* two-way/);
  assert.match(whole, /ui\.sidebarView/);
  assert.match(whole, /\*\*Blast radius:\*\*/);
  assert.match(whole, /Tokens: this view \d+, whole overview \d+, raw diff \d+\./);
  assert.doesNotMatch(whole, /Focus:/);

  const drill = show.prDescription('inbox-view');
  assert.match(drill, /Focus: \/show-me the InboxView\./);
  assert.match(drill, /function InboxView/);
  assert.equal(drill, show.run('/show-me the InboxView').pr);
  assert.ok(show.countTokens(drill) < show.present(null).tokens.diff);
});

test('renderSteps follows the op, the depth, and the note', function () {
  assert.equal(show.renderSteps([
    { op: 'fn', name: 'load', args: 'paths', depth: 0 },
    { op: 'bind', name: 'missing', expr: 'paths.filter(not cached)', depth: 1 },
    { op: 'loop', name: 'chunk', expr: 'chunks(missing, BATCH)', depth: 1 },
    { op: 'call', name: 'assertGranted', args: 'path', depth: 2, note: 'main process' },
    { op: 'add', text: '<InboxView>', depth: 1, note: 'inbox' },
    { op: 'del', text: '<FolderTree>', depth: 1 },
  ]), [
    'function load(paths)',
    '  missing = paths.filter(not cached)',
    '  for chunk of chunks(missing, BATCH)',
    '    assertGranted(path)    main process',
    '+  <InboxView>    inbox',
    '-  <FolderTree>',
  ].join('\n'));
});
