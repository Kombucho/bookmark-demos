// A mention is a string. The rule book is the brand, plus four lists.
// Attention outranks spam, spam outranks a wish, a wish outranks praise.
// No brand name, and the post never leaves Ignore.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BrandBot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LANES = ['amplify', 'feedback', 'attention', 'ignore'];
  const PRIORITY = ['attention', 'ignore', 'feedback', 'amplify'];
  const LANE_TITLE = {
    amplify: 'Amplify',
    feedback: 'Product feedback',
    attention: 'Needs attention',
    ignore: 'Ignore',
  };

  const BRAND = ['mothglass', '@mothglass'];
  const AMPLIFY = ['obsessed', 'love', 'beautiful', 'storybook', 'repost', 'recommend', 'best thing'];
  const FEEDBACK = ['wish', 'feature request', 'worth it', 'dimmer', 'night mode', 'brightness'];
  const ATTENTION = ['refund', 'died', 'lied', 'cracked', 'broke', 'broken', 'unsafe', 'hot', 'ghosted', 'never arrived'];
  const IGNORE = ['crypto', 'follow me', 'dm for', 'followers', 'link in bio'];

  const POSTS = [
    {
      id: 'ridge-love',
      handle: '@ridge.sample',
      source: 'sample',
      text: 'The Mothglass survived a wet weekend on the ridge. Warm light, quiet click. I am obsessed.',
    },
    {
      id: 'canoe-wish',
      handle: '@canoe.notes',
      source: 'sample',
      text: 'Wish the Mothglass had a red night mode. The white beam wakes the whole tent.',
    },
    {
      id: 'tent-refund',
      handle: '@tent.ledger',
      source: 'sample',
      text: 'My Mothglass died on night two and the charge light lied. I want a refund.',
    },
    {
      id: 'spam-crypto',
      handle: '@false.signal',
      source: 'sample',
      text: 'Follow me for Mothglass giveaways. DM for crypto lamp signals.',
    },
    {
      id: 'fog-photo',
      handle: '@fog.journal',
      source: 'sample',
      text: 'Fog, a canoe, and the Mothglass beam looking like a storybook. You should repost this.',
    },
    {
      id: 'inlet-question',
      handle: '@inlet.demo',
      source: 'sample',
      text: 'Is the Mothglass worth it for a canoe trip, or should I pack a candle?',
    },
    {
      id: 'pack-hinge',
      handle: '@pack.list',
      source: 'sample',
      text: 'The hinge on my Mothglass cracked and the glass got hot. This feels unsafe.',
    },
    {
      id: 'quiet-feature',
      handle: '@quiet.trail',
      source: 'sample',
      text: 'Feature request for Mothglass: a small carabiner on the handle.',
    },
    {
      id: 'north-best',
      handle: '@sample.north',
      source: 'sample',
      text: 'Packing the Mothglass on every trip now. Quietly the best thing in the bag. I recommend it.',
    },
    {
      id: 'lamp-ghost',
      handle: '@lamp.queue',
      source: 'sample',
      text: 'Mothglass support ghosted me. The order never arrived.',
    },
    {
      id: 'dimmer-steps',
      handle: '@canoe.notes',
      source: 'sample',
      text: 'The Mothglass dimmer steps are too coarse. A middle brightness would help.',
    },
    {
      id: 'buy-followers',
      handle: '@false.signal',
      source: 'sample',
      text: 'Buy Mothglass followers cheap. Link in bio.',
    },
    {
      id: 'lake-coffee',
      handle: '@ridge.sample',
      source: 'sample',
      text: 'The lake was glass this morning. No lantern, just coffee.',
    },
    {
      id: 'love-cracked',
      handle: '@tent.ledger',
      source: 'sample',
      text: 'I love my Mothglass, but the hinge cracked on day three.',
    },
    {
      id: 'shop-window',
      handle: '@fog.journal',
      source: 'sample',
      text: 'Saw a Mothglass in a shop window on the way to the ferry.',
    },
  ];

  function starterRules() {
    return {
      brand: BRAND.slice(),
      amplify: AMPLIFY.slice(),
      feedback: FEEDBACK.slice(),
      attention: ATTENTION.slice(),
      ignore: IGNORE.slice(),
    };
  }

  function keywordsToText(list) {
    return (list || []).join('\n');
  }

  function parseKeywordList(text) {
    const seen = new Set();
    const out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      const word = line.trim().toLowerCase();
      if (!word || seen.has(word)) return;
      seen.add(word);
      out.push(word);
    });
    return out;
  }

  function matchKeyword(text, keyword) {
    const raw = String(keyword || '').trim().toLowerCase();
    if (!raw) return false;
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i');
    return re.test(String(text || ''));
  }

  function matchList(text, keywords) {
    if (!keywords || !keywords.length) return [];
    return keywords.filter(function (word) { return matchKeyword(text, word); });
  }

  function sentence(lane, hits, also) {
    const lead = {
      attention: 'Needs a person',
      ignore: 'Set aside',
      feedback: 'Product note',
      amplify: 'Worth amplifying',
    }[lane];
    let line = lead + ': ' + hits.join(', ') + '.';
    if (also.length) {
      line += ' Also matched ' + also.map(function (item) {
        return item.hits.join(', ') + ' (' + LANE_TITLE[item.lane] + ')';
      }).join('; ') + '.';
    }
    return line;
  }

  function classify(text, rules) {
    const safe = rules || {};
    const brandHits = matchList(text, safe.brand);
    const matches = {
      attention: matchList(text, safe.attention),
      ignore: matchList(text, safe.ignore),
      feedback: matchList(text, safe.feedback),
      amplify: matchList(text, safe.amplify),
    };
    if (!brandHits.length) {
      return {
        lane: 'ignore',
        brandHits: [],
        matches: matches,
        signals: [],
        also: [],
        reason: 'No brand mention, so it stays in Ignore.',
      };
    }
    const ranked = PRIORITY.filter(function (lane) {
      return matches[lane].length;
    }).map(function (lane) {
      return { lane: lane, hits: matches[lane] };
    });
    if (!ranked.length) {
      return {
        lane: 'ignore',
        brandHits: brandHits,
        matches: matches,
        signals: [],
        also: [],
        reason: 'A brand mention with no amplify, feedback, or attention signal.',
      };
    }
    const winner = ranked[0];
    const also = ranked.slice(1);
    return {
      lane: winner.lane,
      brandHits: brandHits,
      matches: matches,
      signals: winner.hits.slice(),
      also: also,
      reason: sentence(winner.lane, winner.hits, also),
    };
  }

  return {
    LANES: LANES,
    PRIORITY: PRIORITY,
    LANE_TITLE: LANE_TITLE,
    POSTS: POSTS,
    starterRules: starterRules,
    keywordsToText: keywordsToText,
    parseKeywordList: parseKeywordList,
    matchKeyword: matchKeyword,
    classify: classify,
  };
});
