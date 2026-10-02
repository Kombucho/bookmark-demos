# Jev embed demo

A one-page sketch of [How to use jev #1: As an embedder](https://x.com/kieranklaassen/status/2103537214575743221).

Open `index.html` in a browser. The inbox is the host page. Drag the small panel into the slot, or press **Drop into slot**. Then pick a canned example.

The panel does not call a model. Each note already has four named scores. Search ranks them with cosine similarity against the canned query from the post, “billing issues from customers” `[1, 0.5, 1, 0.5]`. **Urgent first** turns that query’s urgent score from `0.5` to `1.0`.

No build step. No server.
