// ascii.rest reads matchMedia("(prefers-reduced-motion: reduce)") once
// per mount and listens for change. This stands in for that query so
// the switch on the page can hold or release every piece.
(function () {
  const real = window.matchMedia.bind(window);
  const nativeList = real('(prefers-reduced-motion: reduce)');
  let forced = null;
  const lists = new Set();

  function reducedNow() {
    return forced == null ? nativeList.matches : forced;
  }

  function makeList() {
    const listeners = new Set();
    const list = {
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      get matches() {
        return reducedNow();
      },
      addEventListener: function (type, fn) {
        if (type === 'change' && typeof fn === 'function') listeners.add(fn);
      },
      removeEventListener: function (type, fn) {
        listeners.delete(fn);
        if (listeners.size === 0) lists.delete(list);
      },
      addListener: function (fn) { this.addEventListener('change', fn); },
      removeListener: function (fn) { this.removeEventListener('change', fn); },
      dispatchEvent: function () {
        const event = { matches: reducedNow(), media: list.media };
        listeners.forEach(function (fn) { fn(event); });
        return true;
      },
    };
    lists.add(list);
    return list;
  }

  function publish() {
    document.documentElement.classList.toggle('motion-held', reducedNow());
    lists.forEach(function (list) { list.dispatchEvent(); });
    window.dispatchEvent(new CustomEvent('ascii-stage-motion', { detail: { reduced: reducedNow() } }));
  }

  window.matchMedia = function (query) {
    if (String(query).trim() === '(prefers-reduced-motion: reduce)') return makeList();
    return real(query);
  };

  nativeList.addEventListener('change', function () {
    if (forced == null) publish();
  });

  document.documentElement.classList.toggle('motion-held', nativeList.matches);

  window.AsciiStageMotion = {
    get reduced() { return reducedNow(); },
    get nativeReduce() { return nativeList.matches; },
    set: function (on) {
      forced = !!on;
      publish();
    },
  };
})();
