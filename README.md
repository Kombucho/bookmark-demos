# Auction anything

A one-page demo of a proxy auction. Name a lot, reserve a private maximum, and watch the public price move. The ceiling stays in your browser tab.

The rules follow the auction described by [visualizevalue/auctionanything](https://github.com/visualizevalue/auctionanything): hidden maxima, 10% steps, the earlier bidder wins a tie, and a bid near the close adds time. This page is a small local sketch of that idea, compressed so the close is visible.

Inspired by [this note](https://x.com/jackbutcher/status/2100973800120517104).

## Start

From this directory:

```bash
python3 -m http.server 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

No install and no build. Refresh the page to start the demo over. Nothing is saved and nothing is charged.

On a real lot the auction runs 48 hours, and a bid in the last 10 minutes adds 10 minutes. Here the clock starts at 40 seconds, and a bid in the last 15 seconds adds 15 seconds.
