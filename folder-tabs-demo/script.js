(function () {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  const status = document.getElementById("status");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"));

  function select(index, focus) {
    current = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => {
      const on = i === current;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    panels.forEach((panel, i) => {
      const on = i === current;
      panel.classList.toggle("is-front", on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
      panel.inert = !on;
      panel.tabIndex = on ? 0 : -1;
      if (!on) panel.classList.remove("is-lift");
    });
    status.textContent = tabs[current].textContent.trim() + " is open.";
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i, false));
    tab.addEventListener("pointerenter", () => {
      if (reduce.matches) return;
      panels[i].classList.add("is-lift");
    });
    tab.addEventListener("pointerleave", () => {
      panels[i].classList.remove("is-lift");
    });
  });

  document.getElementById("tabs").addEventListener("keydown", (event) => {
    let next = null;
    if (event.key === "ArrowRight") next = current + 1;
    else if (event.key === "ArrowLeft") next = current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(next, true);
  });

  select(current, false);
})();
