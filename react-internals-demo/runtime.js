// A toy scheduler and reconciler. It does not load React.
// The shape follows Alexandre Trotel's "Understanding React internals":
// fibers walked one unit at a time, lanes, a render that can be thrown away,
// and a commit that hands effects to a host config.
// https://www.alexandretrotel.org/articles/understanding-react-internals

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ToyReact = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Rightmost bit is the most urgent, as in the article's lane word.
  // SyncLane matches the bit the article shows. TransitionLane is one
  // stand-in for the transition lanes; the article has a whole range of them.
  const SyncLane = 0b0000000000000000000000000000010;
  const TransitionLane = 0b0000000000000000000000010000000;

  const NoFlags = 0;
  const Placement = 0b0000000000000000000000000000010;
  const Update = 0b0000000000000000000000000000100;
  const ChildDeletion = 0b0000000000000000000000000010000;
  const Passive = 0b0000000000000000000100000000000;

  const HostRoot = 'host-root';
  const TEXT = 'text';

  const FLAG_LIST = [
    [Placement, 'Placement'],
    [Update, 'Update'],
    [ChildDeletion, 'ChildDeletion'],
    [Passive, 'Passive'],
  ];

  const SPECIMENS = [
    { id: 'amber', title: 'Amber vial' },
    { id: 'cedar', title: 'Cedar rule' },
    { id: 'linen', title: 'Linen swatch' },
    { id: 'cobalt', title: 'Cobalt chip' },
    { id: 'oak', title: 'Oak sample' },
    { id: 'reed', title: 'Reed pen' },
  ];

  let nextId = 1;
  let dispatcher = refuseHooks();
  let eventLane = SyncLane;

  function refuseHooks() {
    function refuse() {
      throw new Error('Invalid hook call. Hooks only run while a component is rendering.');
    }
    return { useState: refuse, useEffect: refuse };
  }

  function getHighestPriorityLane(lanes) {
    return lanes & -lanes;
  }

  function laneName(lane) {
    if (lane === SyncLane) return 'SyncLane';
    if (lane === TransitionLane) return 'TransitionLane';
    if (!lane) return '';
    return 'lane';
  }

  function isBlockingLane(lane) {
    return lane === SyncLane;
  }

  function flagNames(flags) {
    const names = [];
    for (let i = 0; i < FLAG_LIST.length; i++) {
      if (flags & FLAG_LIST[i][0]) names.push(FLAG_LIST[i][1]);
    }
    return names;
  }

  function isHostElement(fiber) {
    return typeof fiber.type === 'string' && fiber.type !== HostRoot && fiber.type !== TEXT;
  }

  function isTextFiber(fiber) {
    return fiber.type === TEXT;
  }

  function fiberName(fiber) {
    if (!fiber) return '';
    if (fiber.type === HostRoot) return 'HostRoot';
    if (fiber.type === TEXT) {
      const value = fiber.pendingProps && fiber.pendingProps.nodeValue != null
        ? String(fiber.pendingProps.nodeValue)
        : '';
      return '“' + value.slice(0, 28) + '”';
    }
    if (typeof fiber.type === 'function') return fiber.type.name || 'Component';
    let name = fiber.type;
    const props = fiber.pendingProps || {};
    if (props.className) name += '.' + props.className;
    return name;
  }

  function createFiber(type, key, pendingProps) {
    return {
      id: nextId++,
      type: type,
      key: key == null ? null : key,
      pendingProps: pendingProps,
      memoizedProps: null,
      memoizedState: null,
      lanes: 0,
      childLanes: 0,
      flags: NoFlags,
      subtreeFlags: NoFlags,
      deletions: null,
      stateNodes: null,
      child: null,
      sibling: null,
      return: null,
      alternate: null,
      began: false,
      completed: false,
      skipped: false,
      passive: null,
      epoch: 0,
    };
  }

  function h(type, props) {
    const outProps = {};
    const children = [];
    let key = null;
    if (props != null && typeof props === 'object') {
      const keys = Object.keys(props);
      for (let i = 0; i < keys.length; i++) {
        const name = keys[i];
        if (name === 'key') key = props.key;
        else if (name === 'children') pushChild(children, props.children);
        else outProps[name] = props[name];
      }
    }
    for (let i = 2; i < arguments.length; i++) pushChild(children, arguments[i]);
    outProps.children = children;
    return { type: type, key: key, props: outProps };
  }

  function pushChild(list, child) {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) pushChild(list, child[i]);
      return;
    }
    if (typeof child === 'object' && child.type) {
      list.push(child);
      return;
    }
    list.push({
      type: TEXT,
      key: null,
      props: { nodeValue: String(child), children: [] },
    });
  }

  function normalizeList(children) {
    const out = [];
    pushChild(out, children);
    return out;
  }

  function propsChanged(prev, next) {
    const a = prev || {};
    const b = next || {};
    const map = {};
    Object.keys(a).forEach(function (key) { map[key] = true; });
    Object.keys(b).forEach(function (key) { map[key] = true; });
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === 'children' || key === 'key') continue;
      if (!Object.is(a[key], b[key])) return true;
    }
    return false;
  }

  function publicProps(props) {
    const out = {};
    if (!props) return out;
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === 'children' || key === 'key' || key === 'nodeValue') continue;
      out[key] = props[key];
    }
    return out;
  }

  function useState(initial) {
    return dispatcher.useState(initial);
  }

  function useEffect(fn, deps) {
    return dispatcher.useEffect(fn, deps);
  }

  function createMemoryHost() {
    const container = { kind: 'container', type: 'container', props: {}, children: [], text: null };
    function detach(node) {
      if (!node || !node.parent) return;
      const index = node.parent.children.indexOf(node);
      if (index >= 0) node.parent.children.splice(index, 1);
      node.parent = null;
    }
    return {
      container: container,
      reset: function () {
        container.children = [];
      },
      createInstance: function (type, props) {
        return { kind: 'inst', type: type, props: Object.assign({}, props), children: [], parent: null, text: null };
      },
      createTextInstance: function (text) {
        return { kind: 'text', type: TEXT, props: {}, children: [], parent: null, text: String(text) };
      },
      appendChild: function (parent, child) {
        detach(child);
        child.parent = parent;
        parent.children.push(child);
      },
      insertBefore: function (parent, child, before) {
        detach(child);
        const index = parent.children.indexOf(before);
        child.parent = parent;
        if (index < 0) parent.children.push(child);
        else parent.children.splice(index, 0, child);
      },
      removeChild: function (parent, child) {
        const index = parent.children.indexOf(child);
        if (index >= 0) parent.children.splice(index, 1);
        if (child && child.parent === parent) child.parent = null;
      },
      commitTextUpdate: function (node, text) {
        node.text = String(text);
      },
      commitUpdate: function (node, props) {
        node.props = Object.assign({}, props);
      },
    };
  }

  function treeToJSON(node) {
    if (!node) return null;
    if (node.kind === 'text') return node.text;
    const kids = (node.children || []).map(treeToJSON);
    if (node.kind === 'container') return kids;
    const props = {};
    const source = node.props || {};
    Object.keys(source).forEach(function (key) {
      if (typeof source[key] !== 'function') props[key] = source[key];
    });
    return { type: node.type, props: props, children: kids };
  }

  function treeToAscii(node, depth) {
    if (!node) return '';
    const pad = depth || 0;
    if (node.kind === 'container') {
      return (node.children || []).map(function (child) {
        return treeToAscii(child, pad);
      }).filter(Boolean).join('\n');
    }
    const indent = new Array(pad + 1).join('  ');
    if (node.kind === 'text') return indent + '“' + node.text + '”';
    let line = indent + node.type;
    if (node.props && node.props.className) line += '.' + node.props.className;
    const kids = (node.children || []).map(function (child) {
      return treeToAscii(child, pad + 1);
    }).filter(Boolean);
    if (!kids.length) return line;
    return line + '\n' + kids.join('\n');
  }

  function flattenText(node) {
    if (!node) return '';
    if (node.kind === 'text') return node.text || '';
    if (node.nodeValue != null && node.nodeType === 3) return node.nodeValue;
    const children = node.childNodes ? Array.from(node.childNodes) : (node.children || []);
    let out = '';
    for (let i = 0; i < children.length; i++) out += flattenText(children[i]);
    return out;
  }

  function createDemo() {
    const bridge = { log: [] };

    function Mast() {
      const pair = useState(1);
      const pins = pair[0];
      const setPins = pair[1];
      useEffect(function () {
        bridge.log.push('effect: ' + pins + (pins === 1 ? ' pin' : ' pins'));
      }, [pins]);
      bridge.pin = function () {
        eventLane = SyncLane;
        setPins(function (n) { return n + 1; });
      };
      return h('header', { className: 'mast' },
        h('h1', null, 'Northglass'),
        h('p', { className: 'pins' }, pins + (pins === 1 ? ' pin' : ' pins'))
      );
    }

    function Row(props) {
      return h('li', null, props.item.title);
    }

    function Catalog() {
      const pair = useState('all');
      const filter = pair[0];
      const setFilter = pair[1];
      useEffect(function () {
        bridge.log.push('effect: filter ' + filter);
      }, [filter]);
      bridge.filter = function (value) {
        eventLane = TransitionLane;
        setFilter(value);
      };
      const items = SPECIMENS.filter(function (item) {
        if (filter === 'all') return true;
        return item.title.toLowerCase().indexOf(String(filter).toLowerCase()) !== -1;
      });
      return h('section', { className: 'catalog' },
        h('p', { className: 'filter' }, filter === 'all' ? 'All specimens' : 'Filter: ' + filter),
        h('ul', null, items.map(function (item) {
          return h(Row, { key: item.id, item: item });
        }))
      );
    }

    function Desk() {
      return [h(Mast, { key: 'mast' }), h(Catalog, { key: 'catalog' })];
    }

    bridge.outside = function () {
      try {
        useState(0);
        return 'no throw';
      } catch (err) {
        return err.message;
      }
    };

    return { element: h(Desk), bridge: bridge, specimens: SPECIMENS };
  }

  function createRuntime(options) {
    const sourceHosts = options.hosts || [];
    const hosts = sourceHosts.map(adaptHost);
    let budgetMs = options.budgetMs == null ? 5 : options.budgetMs;
    let unitCostMs = options.unitCostMs == null ? 1 : options.unitCostMs;

    let rootFiber = null;
    let workInProgress = null;
    let wipRoot = null;
    let renderLane = 0;
    let phase = 'idle';
    let epoch = 0;
    let units = 0;
    let sliceSpent = 0;
    let prepared = 0;
    let effectFibers = [];
    let log = [];
    let discard = null;
    let preserveDiscard = false;
    let lastCommit = null;
    let activeId = 0;
    const root = { pendingLanes: 0, current: null };

    function pushLog(line) {
      log.push(line);
      if (log.length > 80) log = log.slice(log.length - 80);
    }

    function resetRoot() {
      hosts.forEach(function (host) { host.reset(); });
      rootFiber = createFiber(HostRoot, null, { children: [] });
      rootFiber.memoizedProps = rootFiber.pendingProps;
      rootFiber.stateNodes = hosts.map(function (host) { return host.container; });
      root.current = rootFiber;
      root.pendingLanes = 0;
      workInProgress = null;
      wipRoot = null;
      renderLane = 0;
      phase = 'idle';
      units = 0;
      sliceSpent = 0;
      prepared = 0;
      effectFibers = [];
      activeId = 0;
      log = [];
      discard = null;
      preserveDiscard = false;
      lastCommit = null;
    }

    resetRoot();

    function createWorkInProgress(current, pendingProps) {
      let wip = current.alternate;
      if (!wip) {
        wip = createFiber(current.type, current.key, pendingProps);
        wip.alternate = current;
        current.alternate = wip;
      } else {
        wip.pendingProps = pendingProps;
        wip.flags = NoFlags;
        wip.subtreeFlags = NoFlags;
        wip.deletions = null;
        wip.child = null;
        wip.sibling = null;
        wip.passive = null;
        wip.began = false;
        wip.completed = false;
        wip.skipped = false;
        wip.return = null;
      }
      wip.key = current.key;
      wip.type = current.type;
      wip.memoizedProps = current.memoizedProps;
      wip.memoizedState = current.memoizedState;
      wip.stateNodes = current.stateNodes;
      wip.lanes = current.lanes;
      wip.childLanes = current.childLanes;
      wip.epoch = epoch;
      return wip;
    }

    function cloneOneLevel(parent) {
      const current = parent.alternate;
      let child = current ? current.child : null;
      let prev = null;
      parent.child = null;
      while (child) {
        const wip = createWorkInProgress(child, child.memoizedProps);
        wip.return = parent;
        if (prev) prev.sibling = wip;
        else parent.child = wip;
        prev = wip;
        child = child.sibling;
      }
    }

    function cloneSubtree(parent) {
      cloneOneLevel(parent);
      let child = parent.child;
      while (child) {
        cloneSubtree(child);
        child = child.sibling;
      }
    }

    function reconcileChildren(wip, children) {
      const elements = normalizeList(children);
      const oldFibers = [];
      let old = wip.alternate ? wip.alternate.child : null;
      while (old) {
        oldFibers.push(old);
        old = old.sibling;
      }
      const used = new Array(oldFibers.length).fill(false);
      let prev = null;
      wip.child = null;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        let matchIndex = -1;
        for (let j = 0; j < oldFibers.length; j++) {
          if (used[j]) continue;
          const candidate = oldFibers[j];
          if (candidate.key === el.key && candidate.type === el.type) {
            matchIndex = j;
            break;
          }
        }
        let child;
        if (matchIndex >= 0) {
          used[matchIndex] = true;
          child = createWorkInProgress(oldFibers[matchIndex], el.props);
          if ((isHostElement(child) || isTextFiber(child)) &&
            propsChanged(oldFibers[matchIndex].memoizedProps, el.props)) {
            child.flags |= Update;
          }
        } else {
          child = createFiber(el.type, el.key, el.props);
          if (isHostElement(child) || isTextFiber(child)) child.flags |= Placement;
          child.epoch = epoch;
        }
        child.index = i;
        child.return = wip;
        if (prev) prev.sibling = child;
        else wip.child = child;
        prev = child;
      }
      for (let j = 0; j < oldFibers.length; j++) {
        if (used[j]) continue;
        wip.deletions = wip.deletions || [];
        wip.deletions.push(oldFibers[j]);
        wip.flags |= ChildDeletion;
      }
    }

    function preview(base, queue, lane) {
      let value = base;
      for (let i = 0; i < queue.length; i++) {
        const update = queue[i];
        if ((update.lane & lane) === 0) continue;
        value = typeof update.action === 'function' ? update.action(value) : update.action;
      }
      return value;
    }

    function reduceQueue(base, queue, lane) {
      let value = base;
      for (let i = 0; i < queue.length; i++) {
        const update = queue[i];
        if ((update.lane & lane) === 0) continue;
        if (update.appliedEpoch === epoch) continue;
        value = typeof update.action === 'function' ? update.action(value) : update.action;
        update.appliedEpoch = epoch;
      }
      return value;
    }

    function bubbleLane(fiber, lane) {
      let node = fiber;
      while (node) {
        if (node !== fiber) node.childLanes |= lane;
        node = node.return;
      }
      root.pendingLanes |= lane;
    }

    function renderFunction(fiber) {
      const alternate = fiber.alternate;
      const mount = !alternate || !alternate.memoizedState;
      const hooks = {
        mount: mount,
        cursor: mount ? null : alternate.memoizedState,
        first: null,
        prev: null,
      };

      function link(hook) {
        if (!hooks.first) hooks.first = hook;
        else hooks.prev.next = hook;
        hooks.prev = hook;
        hook.next = null;
      }

      const real = {
        useState: function (initial) {
          let hook;
          if (hooks.mount) {
            const value = typeof initial === 'function' ? initial() : initial;
            const cell = { queue: [], fiber: root.current, committed: value };
            hook = { tag: 'state', memoizedState: value, cell: cell };
          } else {
            const prev = hooks.cursor;
            if (!prev || prev.tag !== 'state') {
              throw new Error('Hook order changed.');
            }
            hooks.cursor = prev.next;
            hook = {
              tag: 'state',
              memoizedState: reduceQueue(prev.cell.committed, prev.cell.queue, renderLane),
              cell: prev.cell,
            };
          }
          link(hook);
          const cell = hook.cell;
          function dispatch(action) {
            const lane = eventLane;
            const latest = preview(cell.committed, cell.queue, lane);
            const resolved = typeof action === 'function' ? action(latest) : action;
            if (Object.is(resolved, latest)) return;
            cell.queue.push({ lane: lane, action: action });
            const owner = cell.fiber;
            owner.lanes |= lane;
            bubbleLane(owner, lane);
            onSchedule(lane, owner);
          }
          return [hook.memoizedState, dispatch];
        },
        useEffect: function (fn, deps) {
          let hook;
          if (hooks.mount) {
            hook = { tag: 'effect', memoizedState: null };
          } else {
            const prev = hooks.cursor;
            if (!prev || prev.tag !== 'effect') {
              throw new Error('Hook order changed.');
            }
            hooks.cursor = prev.next;
            hook = { tag: 'effect', memoizedState: prev.memoizedState };
          }
          link(hook);
          const prevDeps = hook.memoizedState && hook.memoizedState.deps;
          let changed = !prevDeps || !deps || prevDeps.length !== deps.length;
          if (!changed) {
            for (let i = 0; i < deps.length; i++) {
              if (!Object.is(deps[i], prevDeps[i])) changed = true;
            }
          }
          hook.memoizedState = { deps: deps ? deps.slice() : null, fn: fn };
          if (changed) {
            fiber.flags |= Passive;
            fiber.passive = fiber.passive || [];
            fiber.passive.push({ name: fiberName(fiber), run: fn });
          }
        },
      };

      dispatcher = real;
      const result = fiber.type(fiber.pendingProps || {});
      dispatcher = refuseHooks();
      fiber.memoizedState = hooks.first;
      return result;
    }

    function beginWork(fiber) {
      if (isTextFiber(fiber)) {
        fiber.child = null;
        return null;
      }
      const current = fiber.alternate;
      const self = (fiber.lanes & renderLane) !== 0;
      const below = (fiber.childLanes & renderLane) !== 0;
      if (current && fiber.pendingProps === current.memoizedProps && !self) {
        if (!below) {
          cloneSubtree(fiber);
          fiber.skipped = true;
          return null;
        }
        if (!fiber.child) cloneOneLevel(fiber);
        return fiber.child;
      }
      if (typeof fiber.type === 'function') {
        const produced = renderFunction(fiber);
        reconcileChildren(fiber, produced);
        return fiber.child;
      }
      reconcileChildren(fiber, (fiber.pendingProps && fiber.pendingProps.children) || []);
      return fiber.child;
    }

    function completeWork(fiber) {
      if (!isHostElement(fiber) && !isTextFiber(fiber)) return;
      if (!fiber.stateNodes) {
        fiber.stateNodes = hosts.map(function (host) {
          if (isTextFiber(fiber)) return host.createTextInstance(String(fiber.pendingProps.nodeValue));
          return host.createInstance(fiber.type, publicProps(fiber.pendingProps));
        });
        prepared += 1;
        if (!fiber.alternate) fiber.flags |= Placement;
      } else if (isTextFiber(fiber)) {
        const previous = fiber.alternate && fiber.alternate.memoizedProps
          ? fiber.alternate.memoizedProps.nodeValue
          : '';
        if (previous !== fiber.pendingProps.nodeValue) fiber.flags |= Update;
      }
    }

    function bubbleFlags(fiber) {
      let subtree = NoFlags;
      let child = fiber.child;
      while (child) {
        subtree |= child.subtreeFlags | child.flags;
        child = child.sibling;
      }
      fiber.subtreeFlags = subtree;
    }

    function performUnitOfWork(fiber) {
      activeId = fiber.id;
      if (!fiber.began) {
        const next = beginWork(fiber);
        fiber.began = true;
        fiber.memoizedProps = fiber.pendingProps;
        const skip = fiber.skipped ? ' · skip' : '';
        pushLog('begin ' + fiberName(fiber) + skip);
        if (next) {
          workInProgress = next;
          return;
        }
        return;
      }
      completeWork(fiber);
      bubbleFlags(fiber);
      if (fiber.flags || (fiber.deletions && fiber.deletions.length)) effectFibers.push(fiber);
      fiber.completed = true;
      const flags = flagNames(fiber.flags);
      pushLog('complete ' + fiberName(fiber) + (flags.length ? ' · ' + flags.join(', ') : ''));
      if (fiber.sibling) workInProgress = fiber.sibling;
      else workInProgress = fiber.return;
    }

    function directHosts(fiber, out) {
      let child = fiber.child;
      while (child) {
        if (isHostElement(child) || isTextFiber(child)) out.push(child);
        else directHosts(child, out);
        child = child.sibling;
      }
      return out;
    }

    function removeHostTree(fiber) {
      const top = [];
      if (isHostElement(fiber) || isTextFiber(fiber)) top.push(fiber);
      else directHosts(fiber, top);
      top.forEach(function (hostFiber) {
        if (!hostFiber.stateNodes) return;
        hosts.forEach(function (host, index) {
          const node = hostFiber.stateNodes[index];
          host.removeFromParent(node);
        });
      });
    }

    function syncChildren(parentFiber, calls) {
      if (!parentFiber.stateNodes) return;
      const desired = directHosts(parentFiber, []);
      const notes = [];
      hosts.forEach(function (host, index) {
        const parent = parentFiber.stateNodes[index];
        const wanted = [];
        for (let i = 0; i < desired.length; i++) {
          const nodes = desired[i].stateNodes;
          if (nodes) wanted.push(nodes[index]);
        }
        const currentKids = host.childNodes(parent);
        for (let i = 0; i < currentKids.length; i++) {
          if (wanted.indexOf(currentKids[i]) === -1) {
            host.removeChild(parent, currentKids[i]);
            if (index === 0) notes.push('removeChild from ' + fiberName(parentFiber));
          }
        }
        let previous = null;
        for (let i = 0; i < wanted.length; i++) {
          const node = wanted[i];
          const expected = previous ? host.nextSibling(previous) : host.firstChild(parent);
          if (node !== expected) {
            if (expected) host.insertBefore(parent, node, expected);
            else host.appendChild(parent, node);
            if (index === 0) {
              notes.push((expected ? 'insertBefore ' : 'appendChild ') + fiberName(desired[i]));
            }
          }
          previous = node;
        }
      });
      for (let i = 0; i < notes.length; i++) calls.push(notes[i]);
    }

    function walk(fiber, visit) {
      if (!fiber) return;
      visit(fiber);
      let child = fiber.child;
      while (child) {
        walk(child, visit);
        child = child.sibling;
      }
    }

    function walkPost(fiber, visit) {
      if (!fiber) return;
      let child = fiber.child;
      while (child) {
        walkPost(child, visit);
        child = child.sibling;
      }
      visit(fiber);
    }

    function rebind(fiber) {
      if (typeof fiber.type === 'function' && fiber.memoizedState && fiber.memoizedState.tag) {
        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.cell) {
            hook.cell.fiber = fiber;
            hook.cell.committed = hook.memoizedState;
            hook.cell.queue = hook.cell.queue.filter(function (update) {
              return update.appliedEpoch !== epoch;
            });
          }
          hook = hook.next;
        }
      }
      let child = fiber.child;
      while (child) {
        rebind(child);
        child = child.sibling;
      }
    }

    function stripLane(fiber, lane) {
      fiber.lanes &= ~lane;
      fiber.childLanes &= ~lane;
      let child = fiber.child;
      while (child) {
        stripLane(child, lane);
        child = child.sibling;
      }
    }

    function queuesStillHold(lane) {
      let found = false;
      walk(root.current, function (fiber) {
        if (found) return;
        if (typeof fiber.type !== 'function' || !fiber.memoizedState || !fiber.memoizedState.tag) return;
        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.cell) {
            for (let i = 0; i < hook.cell.queue.length; i++) {
              if (hook.cell.queue[i].lane & lane) found = true;
            }
          }
          hook = hook.next;
        }
      });
      return found;
    }

    function commitNow() {
      const finished = wipRoot;
      if (!finished) return;
      const calls = [];
      const described = effectFibers.map(describeEffect);
      walk(finished, function (fiber) {
        if (!fiber.deletions) return;
        fiber.deletions.forEach(function (deleted) { removeHostTree(deleted); });
      });
      walkPost(finished, function (fiber) {
        if (fiber.type === HostRoot || isHostElement(fiber)) syncChildren(fiber, calls);
        if (!(fiber.flags & Update) || !fiber.stateNodes) return;
        if (isTextFiber(fiber)) {
          const text = String(fiber.memoizedProps.nodeValue);
          hosts.forEach(function (host, index) {
            host.commitTextUpdate(fiber.stateNodes[index], text);
          });
          calls.push('commitTextUpdate ' + JSON.stringify(text));
        } else if (isHostElement(fiber)) {
          const nextProps = publicProps(fiber.memoizedProps);
          hosts.forEach(function (host, index) {
            host.commitUpdate(fiber.stateNodes[index], nextProps);
          });
          calls.push('commitUpdate ' + fiberName(fiber));
        }
      });
      root.current = finished;
      rebind(finished);
      stripLane(finished, renderLane);
      root.pendingLanes &= ~renderLane;
      if (queuesStillHold(renderLane)) root.pendingLanes |= renderLane;
      const passives = [];
      walk(finished, function (fiber) {
        if (!fiber.passive) return;
        fiber.passive.forEach(function (effect) { passives.push(effect); });
        fiber.passive = null;
      });
      for (let i = 0; i < passives.length; i++) passives[i].run();
      lastCommit = {
        lane: laneName(renderLane),
        effects: described,
        calls: calls,
        passive: passives.map(function (effect) { return effect.name; }),
      };
      pushLog('commit ' + described.length + ' effect' + (described.length === 1 ? '' : 's') + ' on ' + laneName(renderLane));
      workInProgress = null;
      wipRoot = null;
      effectFibers = [];
      renderLane = 0;
      phase = 'idle';
      activeId = 0;
    }

    function describeEffect(fiber) {
      return {
        name: fiberName(fiber),
        flags: flagNames(fiber.flags),
        deletions: (fiber.deletions || []).map(fiberName),
      };
    }

    function countFibers(fiber) {
      if (!fiber) return 0;
      let total = 1;
      let child = fiber.child;
      while (child) {
        total += countFibers(child);
        child = child.sibling;
      }
      return total;
    }

    function discardWork(kind, lane) {
      const count = countFibers(wipRoot);
      const from = renderLane;
      const text = kind === 'interrupt'
        ? 'prepareFreshStack threw away ' + count + ' fibers. ' + laneName(from) + ' never committed.'
        : 'Restarted ' + laneName(from) + '. ' + count + ' unfinished fibers were dropped.';
      discard = { count: count, from: laneName(from), to: laneName(lane), kind: kind, text: text };
      pushLog(text);
      preserveDiscard = true;
      workInProgress = null;
      wipRoot = null;
      effectFibers = [];
      prepared = 0;
      units = 0;
      sliceSpent = 0;
      activeId = 0;
      phase = 'idle';
      renderLane = 0;
    }

    function beginRender(lane) {
      if (!preserveDiscard) discard = null;
      preserveDiscard = false;
      epoch += 1;
      renderLane = lane;
      units = 0;
      sliceSpent = 0;
      prepared = 0;
      effectFibers = [];
      const current = root.current;
      workInProgress = createWorkInProgress(current, current.pendingProps);
      wipRoot = workInProgress;
      phase = 'render';
      pushLog('render ' + laneName(lane) + (isBlockingLane(lane) ? ' · sync, no yield' : ' · concurrent'));
    }

    function ownerAlreadyBegan(owner) {
      const wip = owner && owner.alternate;
      return !!(wip && wip.epoch === epoch && wip.began);
    }

    function onSchedule(lane, owner) {
      const highest = getHighestPriorityLane(lane);
      const rendering = workInProgress || phase === 'commit-ready';
      if (rendering && renderLane && highest < renderLane) {
        discardWork('interrupt', highest);
        beginRender(getHighestPriorityLane(root.pendingLanes));
        return;
      }
      if (workInProgress && (highest & renderLane) && ownerAlreadyBegan(owner)) {
        discardWork('restart', highest);
        beginRender(getHighestPriorityLane(root.pendingLanes));
        return;
      }
      if (!workInProgress && phase !== 'commit-ready') {
        beginRender(getHighestPriorityLane(root.pendingLanes));
      }
    }

    function armIfNeeded() {
      if (workInProgress || phase === 'commit-ready') return;
      if (!root.pendingLanes) return;
      beginRender(getHighestPriorityLane(root.pendingLanes));
    }

    function armNext() {
      if (root.pendingLanes) beginRender(getHighestPriorityLane(root.pendingLanes));
      else phase = 'idle';
    }

    function mount(element) {
      resetRoot();
      rootFiber.pendingProps = { children: [element] };
      rootFiber.lanes |= SyncLane;
      root.pendingLanes |= SyncLane;
      beginRender(SyncLane);
      return snapshot();
    }

    function step() {
      if (phase === 'commit-ready') {
        commitNow();
        armNext();
        return snapshot();
      }
      armIfNeeded();
      if (!workInProgress) return snapshot();
      performUnitOfWork(workInProgress);
      units += 1;
      sliceSpent += unitCostMs;
      if (!workInProgress) phase = 'commit-ready';
      else phase = 'render';
      return snapshot();
    }

    function slice() {
      if (phase === 'commit-ready') {
        commitNow();
        armNext();
        return snapshot();
      }
      armIfNeeded();
      if (!workInProgress) return snapshot();
      sliceSpent = 0;
      if (isBlockingLane(renderLane)) {
        while (workInProgress) {
          performUnitOfWork(workInProgress);
          units += 1;
          sliceSpent += unitCostMs;
        }
        commitNow();
        armNext();
        return snapshot();
      }
      while (workInProgress && sliceSpent < budgetMs) {
        performUnitOfWork(workInProgress);
        units += 1;
        sliceSpent += unitCostMs;
      }
      if (!workInProgress) {
        commitNow();
        armNext();
      } else {
        phase = 'yield';
        pushLog('yield at ' + sliceSpent + 'ms of a ' + budgetMs + 'ms budget');
      }
      return snapshot();
    }

    function finish() {
      if (phase === 'commit-ready') {
        commitNow();
        armNext();
        return snapshot();
      }
      armIfNeeded();
      let guard = 0;
      while (workInProgress && guard < 10000) {
        performUnitOfWork(workInProgress);
        units += 1;
        guard += 1;
      }
      if (wipRoot && !workInProgress) commitNow();
      armNext();
      return snapshot();
    }

    function flattenFibers(fiber, depth, out) {
      if (!fiber) return;
      out.push({
        id: fiber.id,
        depth: depth,
        name: fiberName(fiber),
        flags: flagNames(fiber.flags),
        skipped: !!fiber.skipped,
        active: fiber.id === activeId,
        deletions: (fiber.deletions || []).map(fiberName),
      });
      let child = fiber.child;
      while (child) {
        flattenFibers(child, depth + 1, out);
        child = child.sibling;
      }
    }

    function snapshot() {
      const fibers = [];
      const showingDraft = !!(wipRoot && (phase === 'yield' || phase === 'commit-ready' || units > 0));
      flattenFibers(showingDraft ? wipRoot : root.current, 0, fibers);
      const effects = (phase === 'commit-ready' ? effectFibers : []).map(describeEffect);
      return {
        phase: phase,
        lane: laneName(renderLane),
        blocking: isBlockingLane(renderLane),
        budgetMs: budgetMs,
        unitCostMs: unitCostMs,
        sliceSpent: sliceSpent,
        units: units,
        prepared: prepared,
        discard: discard,
        log: log.slice(),
        effects: effects,
        lastCommit: lastCommit,
        fibers: fibers,
        treeLabel: showingDraft ? 'draft' : 'screen',
      };
    }

    return {
      mount: mount,
      step: step,
      slice: slice,
      finish: finish,
      snapshot: snapshot,
      createDemo: createDemo,
      setBudget: function (value) { budgetMs = Number(value) || 1; },
      setUnitCost: function (value) { unitCostMs = Number(value) || 1; },
      hosts: sourceHosts,
    };
  }

  function adaptHost(host) {
    const children = new WeakMap();
    const parentOf = new WeakMap();
    function kids(parent) {
      let list = children.get(parent);
      if (!list) {
        list = [];
        children.set(parent, list);
      }
      return list;
    }
    function detach(child) {
      const parent = parentOf.get(child);
      if (!parent) return;
      const list = kids(parent);
      const index = list.indexOf(child);
      if (index >= 0) list.splice(index, 1);
      parentOf.delete(child);
    }
    return {
      container: host.container,
      reset: function () {
        if (host.reset) host.reset();
        children.set(host.container, []);
      },
      createInstance: function (type, props) { return host.createInstance(type, props); },
      createTextInstance: function (text) { return host.createTextInstance(text); },
      appendChild: function (parent, child) {
        detach(child);
        kids(parent).push(child);
        parentOf.set(child, parent);
        host.appendChild(parent, child);
      },
      insertBefore: function (parent, child, before) {
        detach(child);
        const list = kids(parent);
        const index = list.indexOf(before);
        if (index < 0) list.push(child);
        else list.splice(index, 0, child);
        parentOf.set(child, parent);
        host.insertBefore(parent, child, before);
      },
      removeChild: function (parent, child) {
        const list = kids(parent);
        const index = list.indexOf(child);
        if (index >= 0) list.splice(index, 1);
        if (parentOf.get(child) === parent) parentOf.delete(child);
        host.removeChild(parent, child);
      },
      removeFromParent: function (child) {
        const parent = parentOf.get(child);
        if (!parent) return;
        const list = kids(parent);
        const index = list.indexOf(child);
        if (index >= 0) list.splice(index, 1);
        parentOf.delete(child);
        host.removeChild(parent, child);
      },
      commitTextUpdate: function (node, text) { host.commitTextUpdate(node, text); },
      commitUpdate: function (node, props) { host.commitUpdate(node, props); },
      firstChild: function (parent) {
        const list = children.get(parent);
        return list && list.length ? list[0] : null;
      },
      nextSibling: function (node) {
        const parent = parentOf.get(node);
        if (!parent) return null;
        const list = kids(parent);
        const index = list.indexOf(node);
        return list[index + 1] || null;
      },
      childNodes: function (parent) {
        return (children.get(parent) || []).slice();
      },
    };
  }

  return {
    h: h,
    useState: useState,
    useEffect: useEffect,
    SyncLane: SyncLane,
    TransitionLane: TransitionLane,
    getHighestPriorityLane: getHighestPriorityLane,
    createMemoryHost: createMemoryHost,
    createRuntime: createRuntime,
    createDemo: createDemo,
    treeToJSON: treeToJSON,
    treeToAscii: treeToAscii,
    flattenText: flattenText,
    SPECIMENS: SPECIMENS,
  };
});
