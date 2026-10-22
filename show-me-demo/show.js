// A scripted /show-me for a fictional notes window called Fieldnote.
// The overview is rendered from structured steps. The diff is the patch
// those steps summarize. Token counts are a local rule, not a model tokenizer.
// No model is called. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ShowMe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DIFF = [
    'diff --git a/src/sidebar/Sidebar.tsx b/src/sidebar/Sidebar.tsx',
    'index 4c1a0e2..9b77d11 100644',
    '--- a/src/sidebar/Sidebar.tsx',
    '+++ b/src/sidebar/Sidebar.tsx',
    '@@ -1,29 +1,41 @@',
    ' import { useState } from "react";',
    ' import { FolderTree } from "./FolderTree";',
    '+import { ViewToggle } from "./ViewToggle";',
    '+import { InboxView } from "../inbox/InboxView";',
    ' import { readSidebarView, writeSidebarView } from "../state/sidebarView";',
    ' import { useNotes } from "../notes/useNotes";',
    ' ',
    ' export function Sidebar() {',
    '   const notes = useNotes();',
    '-  return (',
    '-    <aside className="sidebar">',
    '-      <header>',
    '-        <h2>Folders</h2>',
    '-        <p>{notes.length} notes on this machine</p>',
    '-      </header>',
    '-      <FolderTree notes={notes} />',
    '-      <footer>Drop a folder to pin it.</footer>',
    '-    </aside>',
    '-  );',
    '+  const [view, setView] = useState(readSidebarView());',
    '+  function choose(next) {',
    '+    setView(next);',
    '+    writeSidebarView(next);',
    '+  }',
    '+  return (',
    '+    <aside className="sidebar">',
    '+      <ViewToggle view={view} onChange={choose} />',
    '+      {view === "inbox" ? <InboxView notes={notes} /> : <FolderTree notes={notes} />}',
    '+    </aside>',
    '+  );',
    ' }',
    ' ',
    ' function unusedWidthHook() {',
    '   return 280;',
    ' }',
    'diff --git a/src/sidebar/ViewToggle.tsx b/src/sidebar/ViewToggle.tsx',
    'new file mode 100644',
    'index 0000000..c31aa90',
    '--- /dev/null',
    '+++ b/src/sidebar/ViewToggle.tsx',
    '@@ -0,0 +1,36 @@',
    '+import { useEffect } from "react";',
    '+',
    '+export function ViewToggle(props) {',
    '+  useEffect(function () {',
    '+    function onKey(event) {',
    '+      const meta = event.metaKey || event.ctrlKey;',
    '+      if (!meta || !event.shiftKey) return;',
    '+      const key = event.key.toLowerCase();',
    '+      if (key === "e") props.onChange("folders");',
    '+      if (key === "i") props.onChange("inbox");',
    '+    }',
    '+    window.addEventListener("keydown", onKey);',
    '+    return function () { window.removeEventListener("keydown", onKey); };',
    '+  }, [props.onChange]);',
    '+  return (',
    '+    <div role="group" aria-label="Sidebar view">',
    '+      <button type="button" aria-keyshortcuts="Meta+Shift+E" aria-pressed={props.view === "folders"} onClick={function () { props.onChange("folders"); }}>Folders</button>',
    '+      <button type="button" aria-keyshortcuts="Meta+Shift+I" aria-pressed={props.view === "inbox"} onClick={function () { props.onChange("inbox"); }}>Inbox</button>',
    '+    </div>',
    '+  );',
    '+}',
    'diff --git a/src/state/sidebarView.ts b/src/state/sidebarView.ts',
    'new file mode 100644',
    'index 0000000..e0a11b2',
    '--- /dev/null',
    '+++ b/src/state/sidebarView.ts',
    '@@ -0,0 +1,18 @@',
    '+const KEY = "ui.sidebarView";',
    '+',
    '+export function readSidebarView() {',
    '+  try {',
    '+    const stored = localStorage.getItem(KEY);',
    '+    if (stored === "inbox" || stored === "folders") return stored;',
    '+  } catch (err) {',
    '+    return "folders";',
    '+  }',
    '+  return "folders";',
    '+}',
    '+',
    '+export function writeSidebarView(view) {',
    '+  localStorage.setItem(KEY, view);',
    '+}',
    'diff --git a/src/inbox/groupByDay.ts b/src/inbox/groupByDay.ts',
    'new file mode 100644',
    'index 0000000..aa091c4',
    '--- /dev/null',
    '+++ b/src/inbox/groupByDay.ts',
    '@@ -0,0 +1,22 @@',
    '+export function groupByDay(notes) {',
    '+  const sorted = notes.slice().sort(function (a, b) {',
    '+    return b.modifiedAt - a.modifiedAt;',
    '+  });',
    '+  const groups = [];',
    '+  sorted.forEach(function (note) {',
    '+    const day = new Date(note.modifiedAt).toDateString();',
    '+    const last = groups[groups.length - 1];',
    '+    if (!last || last.day !== day) groups.push({ day: day, notes: [note] });',
    '+    else last.notes.push(note);',
    '+  });',
    '+  return groups;',
    '+}',
    'diff --git a/src/inbox/InboxView.tsx b/src/inbox/InboxView.tsx',
    'new file mode 100644',
    'index 0000000..b71de08',
    '--- /dev/null',
    '+++ b/src/inbox/InboxView.tsx',
    '@@ -0,0 +1,31 @@',
    '+import { groupByDay } from "./groupByDay";',
    '+import { InboxRows } from "./InboxRows";',
    '+import { loadPreviews } from "./previewCache";',
    '+import { useEffect, useState } from "react";',
    '+',
    '+export function InboxView(props) {',
    '+  const [previews, setPreviews] = useState({});',
    '+  useEffect(function () {',
    '+    let alive = true;',
    '+    loadPreviews(props.notes.map(function (note) { return note.path; })).then(function (heads) {',
    '+      if (!alive) return;',
    '+      const next = {};',
    '+      props.notes.forEach(function (note, index) { next[note.id] = heads[index]; });',
    '+      setPreviews(next);',
    '+    });',
    '+    return function () { alive = false; };',
    '+  }, [props.notes]);',
    '+  const groups = groupByDay(props.notes);',
    '+  return (',
    '+    <div className="inbox">',
    '+      {groups.map(function (group) {',
    '+        return (',
    '+          <section key={group.day}>',
    '+            <h3>{group.day}</h3>',
    '+            <InboxRows notes={group.notes} folders={props.folders} previews={previews} onOpen={props.onOpen} />',
    '+          </section>',
    '+        );',
    '+      })}',
    '+    </div>',
    '+  );',
    '+}',
    'diff --git a/src/inbox/InboxRows.tsx b/src/inbox/InboxRows.tsx',
    'new file mode 100644',
    'index 0000000..d4e22a1',
    '--- /dev/null',
    '+++ b/src/inbox/InboxRows.tsx',
    '@@ -0,0 +1,29 @@',
    '+import { memo } from "react";',
    '+',
    '+function firstTwoLines(text) {',
    '+  return String(text || "").split(/\\n/).map(function (line) { return line.trim(); }).filter(Boolean).slice(0, 2);',
    '+}',
    '+',
    '+export const InboxRows = memo(function InboxRows(props) {',
    '+  return (',
    '+    <ul>',
    '+      {props.notes.map(function (note) {',
    '+        const folder = props.folders.find(function (item) { return item.id === note.folderId; });',
    '+        const lines = firstTwoLines(props.previews[note.id]);',
    '+        return (',
    '+          <li key={note.id}>',
    '+            <button type="button" onClick={function () { props.onOpen(note); }}>',
    '+              <strong>{note.title}</strong>',
    '+              <span>{lines[0] || "Empty note"}</span>',
    '+              <span>{lines[1] || ""}</span>',
    '+              <em>{folder ? folder.name : "Loose"}</em>',
    '+            </button>',
    '+          </li>',
    '+        );',
    '+      })}',
    '+    </ul>',
    '+  );',
    '+});',
    'diff --git a/src/inbox/previewCache.ts b/src/inbox/previewCache.ts',
    'new file mode 100644',
    'index 0000000..f19c0ab',
    '--- /dev/null',
    '+++ b/src/inbox/previewCache.ts',
    '@@ -0,0 +1,32 @@',
    '+import { readHeads } from "../ipc/readHead";',
    '+',
    '+const BATCH = 200;',
    '+const HEAD = 4096;',
    '+const cache = new Map();',
    '+',
    '+function chunks(paths) {',
    '+  const out = [];',
    '+  for (let i = 0; i < paths.length; i += BATCH) out.push(paths.slice(i, i + BATCH));',
    '+  return out;',
    '+}',
    '+',
    '+export async function loadPreviews(paths) {',
    '+  const missing = paths.filter(function (path) { return !cache.has(path); });',
    '+  for (const chunk of chunks(missing)) {',
    '+    const heads = await readHeads(chunk, HEAD);',
    '+    heads.forEach(function (head) { cache.set(head.path, head.text); });',
    '+  }',
    '+  return paths.map(function (path) { return cache.get(path) || ""; });',
    '+}',
    '+',
    '+export function invalidatePreview(path) {',
    '+  cache.delete(path);',
    '+}',
    'diff --git a/src/ipc/readHead.ts b/src/ipc/readHead.ts',
    'new file mode 100644',
    'index 0000000..a44b190',
    '--- /dev/null',
    '+++ b/src/ipc/readHead.ts',
    '@@ -0,0 +1,27 @@',
    '+import { assertGranted } from "../access/grants";',
    '+import { readFile } from "node:fs/promises";',
    '+',
    '+export async function readHeads(paths, bytes) {',
    '+  const heads = [];',
    '+  for (const path of paths) {',
    '+    assertGranted(path);',
    '+    const handle = await readFile(path);',
    '+    heads.push({ path: path, text: handle.subarray(0, bytes).toString("utf8") });',
    '+  }',
    '+  return heads;',
    '+}',
    'diff --git a/src/note/LiveText.tsx b/src/note/LiveText.tsx',
    'new file mode 100644',
    'index 0000000..c88e331',
    '--- /dev/null',
    '+++ b/src/note/LiveText.tsx',
    '@@ -0,0 +1,18 @@',
    '+import { useEffect, useState } from "react";',
    '+',
    '+export function LiveText(props) {',
    '+  const [text, setText] = useState(props.note.body);',
    '+  useEffect(function () {',
    '+    return props.note.subscribe(function (next) { setText(next); });',
    '+  }, [props.note]);',
    '+  return <article className="live-text">{text}</article>;',
    '+}',
    'diff --git a/src/inbox/inbox.test.ts b/src/inbox/inbox.test.ts',
    'new file mode 100644',
    'index 0000000..91ab220',
    '--- /dev/null',
    '+++ b/src/inbox/inbox.test.ts',
    '@@ -0,0 +1,48 @@',
    '+import { groupByDay } from "./groupByDay";',
    '+import { loadPreviews, invalidatePreview } from "./previewCache";',
    '+',
    '+const fixtures = [',
    '+  { id: "n1", path: "/notes/kiln.md", title: "Kiln log", folderId: "shop", modifiedAt: 1720000000000, kind: "markdown" },',
    '+  { id: "n2", path: "/notes/glaze.md", title: "Glaze", folderId: "shop", modifiedAt: 1720000001000, kind: "markdown" },',
    '+  { id: "n3", path: "/apps/shelf.html", title: "Shelf", folderId: "apps", modifiedAt: 1710000000000, kind: "html" },',
    '+  { id: "n4", path: "/notes/cones.md", title: "Cones", folderId: "shop", modifiedAt: 1720000002000, kind: "markdown" },',
    '+  { id: "n5", path: "/notes/door.md", title: "Door", folderId: "house", modifiedAt: 1700000000000, kind: "markdown" },',
    '+  { id: "n6", path: "/apps/timer.html", title: "Timer", folderId: "apps", modifiedAt: 1720000003000, kind: "html" },',
    '+  { id: "n7", path: "/notes/slip.md", title: "Slip", folderId: "shop", modifiedAt: 1690000000000, kind: "markdown" },',
    '+  { id: "n8", path: "/notes/shelf.md", title: "Shelf clay", folderId: "shop", modifiedAt: 1720000004000, kind: "markdown" },',
    '+];',
    '+',
    '+test("groups newest day first", function () {',
    '+  const groups = groupByDay(fixtures);',
    '+  assert.equal(groups[0].notes[0].id, "n8");',
    '+  assert.ok(groups.length >= 2);',
    '+});',
    '+',
    '+test("preview cache batches and reuses", async function () {',
    '+  const paths = [];',
    '+  for (let i = 0; i < 450; i++) paths.push("/notes/batch-" + i + ".md");',
    '+  const first = await loadPreviews(paths);',
    '+  assert.equal(first.length, 450);',
    '+  const again = await loadPreviews(paths);',
    '+  assert.equal(again[0], first[0]);',
    '+  invalidatePreview(paths[3]);',
    '+  const third = await loadPreviews(paths);',
    '+  assert.equal(third.length, 450);',
    '+});',
  ].join('\n');

  const FILES = [
    'src/sidebar/Sidebar.tsx',
    'src/sidebar/ViewToggle.tsx',
    'src/state/sidebarView.ts',
    'src/inbox/groupByDay.ts',
    'src/inbox/InboxView.tsx',
    'src/inbox/InboxRows.tsx',
    'src/inbox/previewCache.ts',
    'src/ipc/readHead.ts',
    'src/note/LiveText.tsx',
    'src/inbox/inbox.test.ts',
  ];

  const BLOCKS = [
    {
      id: 'tree',
      title: 'Component tree',
      steps: [
        { op: 'line', text: '<AppShell>', depth: 0 },
        { op: 'line', text: '<Sidebar>', depth: 1 },
        { op: 'line', text: '<FolderTree>', depth: 2 },
        { op: 'add', text: '<ViewToggle>', depth: 2, note: 'folders | inbox' },
        { op: 'add', text: 'shortcut', depth: 3, note: '⌘⇧E folders, ⌘⇧I inbox' },
        { op: 'add', text: '<InboxView>', depth: 2, note: 'when the toggle is inbox' },
        { op: 'add', text: 'groupByDay(notes)', depth: 3, note: 'newest modified first' },
        { op: 'add', text: '<InboxRows memo>', depth: 3 },
        { op: 'add', text: 'title, first two lines, folder', depth: 4 },
        { op: 'line', text: '<NotePane>', depth: 1 },
        { op: 'add', text: '<LiveText>', depth: 2, note: 'the open note' },
      ],
    },
    {
      id: 'load',
      title: 'Preview load',
      steps: [
        { op: 'call', name: 'openInbox', args: '', depth: 0 },
        { op: 'call', name: 'listNotes', args: '', depth: 1, note: 'Markdown files and HTML apps' },
        { op: 'call', name: 'previewCache.load', args: 'paths', depth: 1 },
        { op: 'line', text: 'chunks of 200', depth: 2 },
        { op: 'call', name: 'readHead', args: 'path, 4096', depth: 2, note: 'main process' },
        { op: 'call', name: 'assertGranted', args: 'path', depth: 3 },
        { op: 'call', name: 'cache.set', args: 'path, head', depth: 2 },
        { op: 'line', text: 'paint a row only when its preview changed', depth: 1 },
      ],
    },
  ];

  const DRILLS = [
    {
      id: 'inbox-view',
      label: 'InboxView',
      command: '/show-me the InboxView',
      prose: 'InboxView groups every Markdown file and HTML app by the day it was modified, newest first, and hands each day to a memoized row list.',
      files: ['src/inbox/InboxView.tsx', 'src/inbox/groupByDay.ts', 'src/inbox/InboxRows.tsx'],
      aliases: ['inboxview', 'inbox view', 'inbox', 'the inbox'],
      steps: [
        { op: 'fn', name: 'InboxView', args: 'notes, folders, onOpen', depth: 0 },
        { op: 'bind', name: 'view', expr: 'read(ui.sidebarView)', depth: 1, note: 'falls back to folders' },
        { op: 'if', cond: 'view is not inbox', depth: 1 },
        { op: 'ret', expr: 'null', depth: 2 },
        { op: 'bind', name: 'groups', expr: 'groupByDay(notes, modifiedAt desc)', depth: 1 },
        { op: 'loop', name: 'group', expr: 'groups', depth: 1 },
        { op: 'line', text: '<DayHeading date=group.day>', depth: 2 },
        { op: 'line', text: '<InboxRows notes=group.notes memo>', depth: 2 },
        { op: 'line', text: 'title', depth: 3 },
        { op: 'line', text: 'firstTwoLines(preview)', depth: 3 },
        { op: 'line', text: 'folderName(folders, note.folderId)', depth: 3 },
        { op: 'call', name: 'onOpen', args: 'note', depth: 1 },
        { op: 'call', name: 'select', args: 'note.id', depth: 2 },
        { op: 'line', text: '<LiveText text=note.body>', depth: 2 },
      ],
    },
    {
      id: 'preview-cache',
      label: 'preview cache',
      command: '/show-me the preview cache',
      prose: 'The preview cache reads the first 4 KB of each file on the main process, 200 paths at a time, and keeps the head so a row can paint before the note is open.',
      files: ['src/inbox/previewCache.ts', 'src/ipc/readHead.ts'],
      aliases: ['preview cache', 'previewcache', 'preview batching', 'preview batch', 'the preview cache'],
      steps: [
        { op: 'bind', name: 'BATCH', expr: '200', depth: 0 },
        { op: 'bind', name: 'HEAD', expr: '4096', depth: 0, note: 'first 4 KB' },
        { op: 'fn', name: 'load', args: 'paths', depth: 0 },
        { op: 'bind', name: 'missing', expr: 'paths.filter(path => cache.has(path) is false)', depth: 1 },
        { op: 'loop', name: 'chunk', expr: 'chunks(missing, BATCH)', depth: 1 },
        { op: 'bind', name: 'heads', expr: 'ipc.readHeads(chunk, HEAD)', depth: 2 },
        { op: 'loop', name: 'head', expr: 'heads', depth: 2 },
        { op: 'call', name: 'cache.set', args: 'head.path, head.text', depth: 3 },
        { op: 'ret', expr: 'paths.map(path => cache.get(path))', depth: 1 },
        { op: 'fn', name: 'readHeads', args: 'paths, bytes', depth: 0, note: 'main process' },
        { op: 'loop', name: 'path', expr: 'paths', depth: 1 },
        { op: 'call', name: 'assertGranted', args: 'path', depth: 2 },
        { op: 'line', text: 'read path from 0 to bytes', depth: 2 },
        { op: 'fn', name: 'invalidate', args: 'path', depth: 0 },
        { op: 'call', name: 'cache.delete', args: 'path', depth: 1 },
      ],
    },
    {
      id: 'inbox-rows',
      label: 'InboxRows',
      command: '/show-me InboxRows',
      prose: 'InboxRows is memoized. A row paints again only when its preview text changes, and each row is the title, the first two lines, and the folder.',
      files: ['src/inbox/InboxRows.tsx'],
      aliases: ['inboxrows', 'inbox rows', 'rows'],
      steps: [
        { op: 'fn', name: 'InboxRows', args: 'notes, folders, previews', depth: 0, note: 'memo' },
        { op: 'loop', name: 'note', expr: 'notes', depth: 1 },
        { op: 'if', cond: 'preview is the same as the last paint', depth: 2 },
        { op: 'line', text: 'keep the row', depth: 3 },
        { op: 'line', text: 'paint title', depth: 2 },
        { op: 'line', text: 'paint firstTwoLines(preview)', depth: 2 },
        { op: 'line', text: 'paint folderName(folders, note.folderId)', depth: 2 },
      ],
    },
    {
      id: 'live-text',
      label: 'LiveText',
      command: '/show-me LiveText',
      prose: 'LiveText is the open note. It paints the body and replaces that text when the note changes.',
      files: ['src/note/LiveText.tsx'],
      aliases: ['livetext', 'live text'],
      steps: [
        { op: 'fn', name: 'LiveText', args: 'note', depth: 0 },
        { op: 'bind', name: 'text', expr: 'note.body', depth: 1 },
        { op: 'line', text: 'on(note.change)', depth: 1 },
        { op: 'bind', name: 'text', expr: 'next body', depth: 2 },
        { op: 'line', text: 'paint text', depth: 1 },
      ],
    },
    {
      id: 'view-toggle',
      label: 'ViewToggle',
      command: '/show-me the view toggle',
      prose: 'ViewToggle switches the sidebar between folders and inbox. ⌘⇧E and ⌘⇧I write ui.sidebarView, which falls back to folders.',
      files: ['src/sidebar/ViewToggle.tsx', 'src/state/sidebarView.ts'],
      aliases: ['viewtoggle', 'view toggle', 'toggle', 'folders inbox toggle'],
      steps: [
        { op: 'fn', name: 'ViewToggle', args: 'view, setView', depth: 0 },
        { op: 'line', text: '<button folders>', depth: 1, note: '⌘⇧E' },
        { op: 'line', text: '<button inbox>', depth: 1, note: '⌘⇧I' },
        { op: 'line', text: 'onShortcut(⌘⇧E)', depth: 1 },
        { op: 'call', name: 'setView', args: 'folders', depth: 2 },
        { op: 'call', name: 'write', args: 'ui.sidebarView', depth: 2 },
        { op: 'line', text: 'onShortcut(⌘⇧I)', depth: 1 },
        { op: 'call', name: 'setView', args: 'inbox', depth: 2 },
        { op: 'call', name: 'write', args: 'ui.sidebarView', depth: 2, note: 'falls back to folders' },
      ],
    },
  ];

  const CHANGE = {
    title: 'Inbox beside the folder tree',
    prose: 'The inbox lists every Markdown file and HTML app beside the folder tree, newest modified first, grouped by date. Each row shows the first two lines and the folder. Previews load from the main process in batches of 200, reading the first 4 KB.',
    door: 'two-way',
    doorNote: 'Nothing to migrate. The only new persisted state is ui.sidebarView in localStorage, which falls back to folders.',
    blast: 'The sidebar. InboxView, the preview cache, and the read-head IPC. The path is checked with assertGranted.',
    files: FILES,
    blocks: BLOCKS,
    drills: DRILLS,
  };

  const TARGETS = [{ id: null, command: '/show-me', label: 'Whole change' }].concat(DRILLS.map(function (drill) {
    return { id: drill.id, command: drill.command, label: drill.label };
  }));

  function countTokens(text) {
    const src = String(text || '');
    let tokens = 0;
    let i = 0;
    while (i < src.length) {
      const ch = src.charAt(i);
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (/[A-Za-z0-9_]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[A-Za-z0-9_]/.test(src.charAt(j))) j += 1;
        const len = j - i;
        tokens += len <= 6 ? 1 : Math.ceil(len / 6);
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < src.length && !/\s/.test(src.charAt(j)) && !/[A-Za-z0-9_]/.test(src.charAt(j))) j += 1;
      tokens += 1;
      i = j;
    }
    return tokens;
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^the\s+/, '');
  }

  function renderStep(step) {
    const pad = '  '.repeat(step.depth || 0);
    let core;
    if (step.op === 'line' || step.op === 'add' || step.op === 'del') core = step.text;
    else if (step.op === 'fn') core = 'function ' + step.name + '(' + (step.args || '') + ')';
    else if (step.op === 'call') core = step.name + '(' + (step.args || '') + ')';
    else if (step.op === 'bind') core = step.name + ' = ' + step.expr;
    else if (step.op === 'if') core = 'if ' + step.cond;
    else if (step.op === 'loop') core = 'for ' + step.name + ' of ' + step.expr;
    else if (step.op === 'ret') core = step.expr ? 'return ' + step.expr : 'return';
    else throw new Error('Unknown op ' + step.op);
    if (step.note) core += '    ' + step.note;
    if (step.op === 'add') return '+' + pad + core;
    if (step.op === 'del') return '-' + pad + core;
    return pad + core;
  }

  function renderSteps(steps) {
    return steps.map(renderStep).join('\n');
  }

  function renderBlock(block) {
    return block.title + '\n' + renderSteps(block.steps);
  }

  function drillById(id) {
    return DRILLS.filter(function (drill) { return drill.id === id; })[0] || null;
  }

  function aliasesOf(drill) {
    const label = normalize(drill.label);
    if (drill.aliases.indexOf(label) === -1) return drill.aliases.concat([label]);
    return drill.aliases;
  }

  function findDrill(normalized) {
    return DRILLS.filter(function (drill) {
      return aliasesOf(drill).indexOf(normalized) !== -1;
    })[0] || null;
  }

  function overviewText() {
    return BLOCKS.map(renderBlock).join('\n\n');
  }

  function viewFor(id) {
    if (!id) {
      return {
        id: null,
        label: 'Whole change',
        command: '/show-me',
        kind: 'overview',
        prose: CHANGE.prose,
        text: overviewText(),
        files: FILES.slice(),
        path: ['Fieldnote', 'whole change'],
      };
    }
    const drill = drillById(id);
    return {
      id: drill.id,
      label: drill.label,
      command: drill.command,
      kind: 'drill',
      prose: drill.prose,
      text: renderSteps(drill.steps),
      files: drill.files.slice(),
      path: ['Fieldnote', drill.label],
    };
  }

  function diffStats(text) {
    const src = text == null ? DIFF : String(text);
    const lines = src.length ? src.split('\n') : [];
    return {
      tokens: countTokens(src),
      lines: lines.length,
      files: lines.filter(function (line) { return line.indexOf('diff --git ') === 0; }).length,
    };
  }

  function present(id) {
    if (id != null && id !== '' && !drillById(id)) return null;
    const view = viewFor(id || null);
    const stats = diffStats(DIFF);
    const overviewTokens = countTokens(overviewText());
    const viewTokens = countTokens(view.text);
    view.tokens = {
      diff: stats.tokens,
      overview: overviewTokens,
      view: viewTokens,
      lines: stats.lines,
      files: stats.files,
      share: stats.tokens === 0 ? 0 : Math.round((viewTokens / stats.tokens) * 100),
    };
    return view;
  }

  function prDescription(id) {
    const view = present(id);
    if (!view) return null;
    const lines = [
      '## Summary',
      '',
      view.prose,
    ];
    if (view.id) lines.push('', 'Focus: ' + view.command + '.');
    lines.push(
      '',
      '```text',
      view.text,
      '```',
      '',
      '## Merge danger',
      '',
      '**Door:** ' + CHANGE.door + '. ' + CHANGE.doorNote,
      '**Blast radius:** ' + CHANGE.blast,
      '',
      'Tokens: this view ' + view.tokens.view + ', whole overview ' + view.tokens.overview + ', raw diff ' + view.tokens.diff + '.'
    );
    return lines.join('\n');
  }

  function parseCommand(input) {
    const raw = String(input || '').trim();
    if (!raw) return { ok: false, error: 'Type /show-me, or /show-me and a name.' };
    const stripped = raw.replace(/^\//, '');
    const match = stripped.match(/^show-me\b([\s\S]*)$/i);
    if (!match) return { ok: false, error: 'Start with /show-me.' };
    const rest = normalize(match[1]);
    if (!rest) return { ok: true, id: null };
    const drill = findDrill(rest);
    if (!drill) {
      const names = DRILLS.map(function (item) { return item.label; }).join(', ');
      return { ok: false, error: 'Nothing in this change is named that. Try ' + names + '.' };
    }
    return { ok: true, id: drill.id };
  }

  function run(input) {
    const parsed = parseCommand(input);
    if (!parsed.ok) return parsed;
    const view = present(parsed.id);
    return { ok: true, id: parsed.id, view: view, pr: prDescription(parsed.id) };
  }

  return {
    DIFF: DIFF,
    CHANGE: CHANGE,
    FILES: FILES,
    DRILLS: DRILLS,
    TARGETS: TARGETS,
    countTokens: countTokens,
    normalize: normalize,
    renderStep: renderStep,
    renderSteps: renderSteps,
    renderBlock: renderBlock,
    overviewText: overviewText,
    diffStats: diffStats,
    present: present,
    prDescription: prDescription,
    parseCommand: parseCommand,
    run: run,
  };
});
