# Bookmark demos

Five static tools:

- [Auction anything](auction-demo/) — a multi-bidder proxy auction using the rules from [visualizevalue/auctionanything](https://github.com/visualizevalue/auctionanything): private maxima, 10% steps, earlier ties, a 48-hour close, and a 10-minute anti-snipe.
- [Requirements review](requirements-demo/) — paste a note and see which of the 18 characteristics from [make-requirements-great](https://github.com/gnurio/nurijanian-skills/blob/main/skills/make-requirements-great/SKILL.md) fail, including verb + object duplicates.
- [Named embeddings](jev-embed-demo/) — edit questions, document scores, and the query vector from [Kieran Klaassen’s note](https://x.com/kieranklaassen/status/2103522599414501550). Rank is cosine similarity. No model is called.
- [Cinematic FUI](fui-demo/) — scroll a three.js HUD. Instanced quads blend into one black-and-white mask, sit on a tilted plane, and a final shader maps that mask through a palette with grain, blur, and chromatic aberration. From [kc’s post](https://x.com/bzor/status/2106094467992224005).
- [Agent change requests](change-requests-demo/) — review scripted edits to typed records. Writes land as change requests with field diffs, comments, and commits, including two requests that conflict on one field. From [Dan Kornas’s post](https://x.com/DanKornas/status/2105783312350421009) about [Busabase](https://github.com/busabase/busabase). No model is called.

## Open locally

From this directory:

```bash
python3 -m http.server 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Check the rules

```bash
node --test auction-demo/engine.test.js requirements-demo/engine.test.js jev-embed-demo/engine.test.js change-requests-demo/engine.test.js
```

## GitHub Pages

After this lands on `main`, the Pages workflow deploys the site. The project URL is:

https://yodait22-cmyk.github.io/bookmark-demos/

- https://yodait22-cmyk.github.io/bookmark-demos/auction-demo/
- https://yodait22-cmyk.github.io/bookmark-demos/requirements-demo/
- https://yodait22-cmyk.github.io/bookmark-demos/jev-embed-demo/
- https://yodait22-cmyk.github.io/bookmark-demos/fui-demo/
- https://yodait22-cmyk.github.io/bookmark-demos/change-requests-demo/
