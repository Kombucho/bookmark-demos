# Bookmark demos

Eleven static tools:

- [Auction anything](auction-demo/) — a multi-bidder proxy auction using the rules from [visualizevalue/auctionanything](https://github.com/visualizevalue/auctionanything): private maxima, 10% steps, earlier ties, a 48-hour close, and a 10-minute anti-snipe.
- [Requirements review](requirements-demo/) — paste a note and see which of the 18 characteristics from [make-requirements-great](https://github.com/gnurio/nurijanian-skills/blob/main/skills/make-requirements-great/SKILL.md) fail, including verb + object duplicates.
- [Named embeddings](jev-embed-demo/) — edit questions, document scores, and the query vector from [Kieran Klaassen’s note](https://x.com/kieranklaassen/status/2103522599414501550). Rank is cosine similarity. No model is called.
- [Cinematic FUI](fui-demo/) — scroll a three.js HUD. Instanced quads blend into one black-and-white mask, sit on a tilted plane, and a final shader maps that mask through a palette with grain, blur, and chromatic aberration. From [kc’s post](https://x.com/bzor/status/2106094467992224005).
- [Agent change requests](change-requests-demo/) — review scripted edits to typed records. Writes land as change requests with field diffs, comments, and commits, including two requests that conflict on one field. From [Dan Kornas’s post](https://x.com/DanKornas/status/2105783312350421009) about [Busabase](https://github.com/busabase/busabase). No model is called.
- [A Lisp image](lisp-grow-demo/) — a tiny Lisp interpreter and a live picture. Step through a scripted conversation, or type a form. Redefining a function changes the running image; `*world*` survives. From [Geoffrey Huntley’s post](https://x.com/GeoffreyHuntley/status/2107080798209794317) and [article](https://ghuntley.com/lisp/). No model is called.
- [Theme studio](theme-studio-demo/) — hue, contrast, roundness, density, type, and shadow write CSS variables. A component gallery restyles live, and the page exports tokens plus a short design brief. From [Josh Puckett’s post](https://x.com/joshpuckett/status/2107175379903594714) about [Graphical](https://graphicalui.com).
- [Constraint gate](constraint-gate-demo/) — an agent and a hurried human send twelve diffs. Toggle the type checker, lint rules, tests, a locked abstraction, and alerts. Each rule stops a diff, or it ships and an incident follows. From [Lauren Tan’s post](https://x.com/poteto/status/2106916667599278365). No model is called.
- [Concept first](concept-first-demo/) — pick a running app, a sleep app, a plant app, or an Italian deck. Leave the template, choose one of three directions, and run a critique that counts the tells. Refine changes the phone screen. From [Tobia Donadon’s article](https://x.com/tobiadonadon_/status/2106430529113301163). No model is called.
- [Athanor](athanor-demo/) — planetary hours from sunrise and sunset, a sigil and a three-card spread from a host-key stand-in, four pigment stages with measured contrast, a Floyd-Steinberg plate, and a roguelike status line. From [Panat’s post](https://x.com/ptaranat/status/2106851920371741074) about [athanor](https://github.com/script-wizards/athanor).
- [Paper Mono](paper-mono-demo/) — a type bench for [Paper Mono](https://github.com/paper-design/paper-mono) v1.000 (SIL OFL 1.1): variable weight, coding ligatures, duospace, a narrow space, small arrows, a single-story a, a slashed zero, and fractions. From [Paper’s post](https://x.com/paper/status/2107867860349735284).

## Open locally

From this directory:

```bash
python3 -m http.server 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Check the rules

```bash
node --test auction-demo/engine.test.js requirements-demo/engine.test.js jev-embed-demo/engine.test.js change-requests-demo/engine.test.js lisp-grow-demo/lisp.test.js theme-studio-demo/theme.test.js constraint-gate-demo/gate.test.js concept-first-demo/concept.test.js athanor-demo/alchemy.test.js
```

## GitHub Pages

After this lands on `main`, the Pages workflow deploys the site. The project URL is:

https://kombucho.github.io/bookmark-demos/

- https://kombucho.github.io/bookmark-demos/auction-demo/
- https://kombucho.github.io/bookmark-demos/requirements-demo/
- https://kombucho.github.io/bookmark-demos/jev-embed-demo/
- https://kombucho.github.io/bookmark-demos/fui-demo/
- https://kombucho.github.io/bookmark-demos/change-requests-demo/
- https://kombucho.github.io/bookmark-demos/lisp-grow-demo/
- https://kombucho.github.io/bookmark-demos/theme-studio-demo/
- https://kombucho.github.io/bookmark-demos/constraint-gate-demo/
- https://kombucho.github.io/bookmark-demos/concept-first-demo/
- https://kombucho.github.io/bookmark-demos/athanor-demo/
- https://kombucho.github.io/bookmark-demos/paper-mono-demo/
