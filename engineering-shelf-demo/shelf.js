// The engineering shelf at layoffsandhires.com/engineering.
// Stages, titles, and one-line summaries are that shelf's. No reviews.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EngineeringShelf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'bookmark-demos.engineering-shelf.v1';

  const SHELVES = [
    { id: 'foundations', name: 'Foundations', group: 0 },
    { id: 'backend', name: 'Backend', group: 1 },
    { id: 'infra', name: 'Infra & Ops', group: 2 },
    { id: 'ai', name: 'AI', group: 3 },
  ];

  // w and h are the spine's box, in px. Long titles wrap down the spine.
  const BOOKS = [
    {
      id: 'csapp', n: 1, group: 0, stage: 'The Machine',
      title: "Computer Systems: A Programmer's Perspective",
      authors: "Randal E. Bryant, David R. O'Hallaron",
      ed: '3rd ed.',
      url: 'https://csapp.cs.cmu.edu/3e/about.html',
      summary: 'How code actually runs: bits, assembly, memory, linking, I/O.',
      topics: ['Bits, bytes & integers', 'IEEE floating point', 'x86-64 assembly', 'Procedures & the run-time stack', 'Buffer overflow attacks', 'Pipelining (Y86-64)', 'The memory hierarchy', 'Locality & cache memories', 'Linking: static vs dynamic', 'Exceptions & signals', 'Dynamic memory allocation', 'System-level I/O', 'The sockets interface'],
      spine: 'Computer Systems', short: "Bryant · O'Hallaron",
      bg: '#232226', fg: '#EDEBE6', band: '#5B8FD0', w: 52, h: 200,
    },
    {
      id: 'ostep', n: 2, group: 0, stage: 'The Operating System',
      title: 'Operating Systems: Three Easy Pieces',
      authors: 'Remzi & Andrea Arpaci-Dusseau',
      ed: '',
      url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
      summary: 'Processes, memory, concurrency and file systems, from first principles.',
      topics: ['Processes', 'Process API: fork / exec / wait', 'System calls & traps', 'Limited direct execution', 'Scheduling: MLFQ & lottery', 'Address spaces', 'Paging & TLBs', 'Swapping: mechanisms & policies', 'Threads', 'Locks', 'Condition variables & semaphores', 'Concurrency bugs & deadlock', 'File systems: inodes & journaling'],
      spine: 'Operating Systems', short: 'Arpaci-Dusseau',
      bg: '#121212', fg: '#EDEBE6', band: '#BFC6CF', w: 50, h: 210,
    },
    {
      id: 'network', n: 3, group: 0, stage: 'Networking',
      title: 'Computer Networking: A Top-Down Approach',
      authors: 'James F. Kurose, Keith W. Ross',
      ed: '9th ed.',
      url: 'https://gaia.cs.umass.edu/kurose_ross/index.php',
      summary: 'How data actually crosses the internet: layers, HTTP, DNS, TCP/UDP, IP, TLS.',
      topics: ['Internet & protocol layers', 'HTTP', 'DNS', 'TCP vs UDP & congestion control', 'IP addressing & NAT', 'A day in the life of a web page request', 'TLS & network security'],
      spine: 'Computer Networking', short: 'Kurose · Ross',
      bg: '#B3202A', fg: '#F4F2ED', band: '#F4F2ED', w: 48, h: 188,
    },
    {
      id: 'ddia', n: 4, group: 1, stage: 'Data Systems',
      title: 'Designing Data-Intensive Applications',
      authors: 'Martin Kleppmann, Chris Riccomini',
      ed: '2nd ed.',
      url: 'https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/',
      summary: 'Storage, replication, sharding, transactions and consensus: the backbone of every backend.',
      topics: ['Trade-offs in data systems architecture', 'Defining nonfunctional requirements', 'Data models: SQL, document, graph', 'Storage: LSM-trees vs B-trees', 'Encoding & schema evolution', 'Replication: leader, multi, leaderless', 'Sharding', 'Transactions & isolation levels', 'Trouble with distributed systems', 'Consistency & consensus', 'Batch processing', 'Stream processing', 'Doing the right thing'],
      spine: 'Designing Data-Intensive Applications', short: 'Kleppmann · Riccomini',
      bg: '#ECEAE4', fg: '#141414', band: '#C8372D', w: 58, h: 236,
    },
    {
      id: 'sdi', n: 5, group: 1, stage: 'System Design',
      title: "System Design Interview: An Insider's Guide, Vol. 1",
      authors: 'Alex Xu',
      ed: '',
      url: 'https://bytebytego.com/',
      summary: 'Turning the theory into real designs: rate limiters, feeds, chat, video, storage.',
      topics: ['Scale from zero to millions of users', 'Back-of-the-envelope estimation', 'Framework for system design interviews', 'Rate limiter', 'Consistent hashing', 'Key-value store', 'Unique ID generator', 'URL shortener', 'Web crawler', 'Notification system', 'News feed system', 'Chat system', 'Search autocomplete', 'Design YouTube', 'Design Google Drive'],
      spine: 'System Design Interview', short: 'Alex Xu',
      bg: '#383D63', fg: '#F4F2ED', band: '#C6D93B', w: 50, h: 176,
    },
    {
      id: 'micro', n: 6, group: 1, stage: 'Services & APIs',
      title: 'Building Microservices',
      authors: 'Sam Newman',
      ed: '2nd ed.',
      url: 'https://samnewman.io/books/building_microservices_2nd_edition/',
      summary: 'How services talk to each other and stay secure.',
      topics: ['Communication styles: sync, async, events', 'Implementing service communication', 'Microservice security'],
      spine: 'Building Microservices', short: 'Newman',
      bg: '#EFEBE2', fg: '#141414', band: '#D9A42B', w: 50, h: 200,
    },
    {
      id: 'docker', n: 7, group: 2, stage: 'Containers',
      title: 'Docker Deep Dive',
      authors: 'Nigel Poulton',
      ed: '',
      url: 'https://leanpub.com/dockerdeepdive',
      summary: 'Packaging and running software anywhere: images, containers, Compose, networking, volumes.',
      topics: ['Images & containers', 'Containerizing an app & Compose', 'Docker networking & volumes'],
      spine: 'Docker Deep Dive', short: 'Poulton',
      bg: '#4C76B6', fg: '#F4F2ED', band: '#F4F2ED', w: 48, h: 168,
    },
    {
      id: 'k8s', n: 8, group: 2, stage: 'Orchestration',
      title: 'Kubernetes: Up and Running',
      authors: 'Brendan Burns, Joe Beda, Kelsey Hightower, Lachlan Evenson',
      ed: '3rd ed.',
      url: 'https://www.oreilly.com/library/view/kubernetes-up-and/9781098110192/',
      summary: 'Running containers at scale: pods, services, deployments.',
      topics: ['Pods', 'Service discovery', 'Deployments'],
      spine: 'Kubernetes: Up & Running', short: 'Burns et al.',
      bg: '#ECEAE4', fg: '#141414', band: '#2A6FB5', w: 54, h: 214,
    },
    {
      id: 'terraform', n: 9, group: 2, stage: 'Infrastructure as Code',
      title: 'Terraform: Up & Running',
      authors: 'Yevgeniy Brikman',
      ed: '3rd ed.',
      url: 'https://www.terraformupandrunning.com/',
      summary: 'Defining infrastructure in code: why it matters, state, modules.',
      topics: ['Why infrastructure as code', 'Terraform state & modules'],
      spine: 'Terraform: Up & Running', short: 'Brikman',
      bg: '#ECEAE4', fg: '#141414', band: '#6E6A2E', w: 52, h: 186,
    },
    {
      id: 'sre', n: 10, group: 2, stage: 'Reliability',
      title: 'Site Reliability Engineering',
      authors: 'Betsy Beyer, Chris Jones, Jennifer Petoff, Niall Richard Murphy (Google)',
      ed: '',
      url: 'https://sre.google/sre-book/table-of-contents/',
      summary: 'Keeping systems up: SLOs, error budgets, on-call, incidents, overload.',
      topics: ['Embracing risk & error budgets', 'SLIs, SLOs & SLAs', 'Eliminating toil', 'The four golden signals', 'Release engineering', 'Being on-call', 'Effective troubleshooting', 'Managing incidents', 'Postmortem culture', 'Testing for reliability', 'Load balancing in the datacenter', 'Handling overload', 'Addressing cascading failures'],
      spine: 'Site Reliability Engineering', short: 'Google SRE',
      bg: '#2F63A6', fg: '#F4F2ED', band: '#F4F2ED', w: 56, h: 228,
    },
    {
      id: 'dl', n: 11, group: 3, stage: 'Math for ML',
      title: 'Deep Learning',
      authors: 'Ian Goodfellow, Yoshua Bengio, Aaron Courville',
      ed: '',
      url: 'https://www.deeplearningbook.org/',
      summary: 'The math under every model: linear algebra, probability, optimization, backprop.',
      topics: ['Linear algebra', 'Probability & information theory', 'Gradient-based optimization', 'Feedforward networks & backprop'],
      spine: 'Deep Learning', short: 'Goodfellow et al.',
      bg: '#3E5A49', fg: '#F4F2ED', band: '#C9A0B5', w: 50, h: 180,
    },
    {
      id: 'dmls', n: 12, group: 3, stage: 'ML Systems',
      title: 'Designing Machine Learning Systems',
      authors: 'Chip Huyen',
      ed: '',
      url: 'https://github.com/chiphuyen/dmls-book',
      summary: 'ML as an engineering discipline: data, features, deployment, drift, monitoring.',
      topics: ['ML in research vs production', 'Data engineering fundamentals', 'Sampling & labeling', 'Class imbalance', 'Feature engineering', 'Data leakage', 'Model development & ensembles', 'Model offline evaluation', 'Batch vs online prediction', 'Data distribution shifts', 'Monitoring & observability', 'Continual learning', 'Test in production: shadow, A/B, canary', 'ML platform & feature store'],
      spine: 'Designing Machine Learning Systems', short: 'Huyen',
      bg: '#ECEAE4', fg: '#141414', band: '#B23A2E', w: 58, h: 230,
    },
    {
      id: 'llm', n: 13, group: 3, stage: 'LLMs from Scratch',
      title: 'Build a Large Language Model (From Scratch)',
      authors: 'Sebastian Raschka',
      ed: '',
      url: 'https://github.com/rasbt/LLMs-from-scratch',
      summary: 'Build a GPT yourself: tokenizer, attention, training, finetuning.',
      topics: ['Tokenization & byte pair encoding', 'Token embeddings & word positions', 'Data sampling with a sliding window', 'Self-attention', 'Causal attention', 'Multi-head attention', 'LayerNorm, GELU & shortcut connections', 'The transformer block', 'Coding the GPT model', 'Decoding: temperature & top-k', 'Training loop: autograd & AdamW', 'Pretraining & cross-entropy loss', 'Loading pretrained weights', 'Finetuning for classification', 'Finetuning to follow instructions'],
      spine: 'Build a Large Language Model', short: 'Raschka',
      bg: '#141012', fg: '#F4F2ED', band: '#D21F2C', w: 60, h: 208,
    },
    {
      id: 'aie', n: 14, group: 3, stage: 'AI Engineering',
      title: 'AI Engineering: Building Applications with Foundation Models',
      authors: 'Chip Huyen',
      ed: '',
      url: 'https://github.com/chiphuyen/aie-book',
      summary: 'Shipping on top of foundation models: evaluation, prompting, RAG, agents, finetuning, inference.',
      topics: ['Foundation models: data, modeling, size', 'Sampling strategies', 'Evaluation & AI as a judge', 'Prompt engineering', 'Prompt injection & defenses', 'RAG & retrieval optimization', 'Embeddings & vector search', 'Agents: tools & planning', 'Memory', 'Parameter-efficient finetuning', 'Dataset engineering & synthesis', 'Inference optimization', 'Guardrails, model router & gateway', 'User feedback'],
      spine: 'AI Engineering', short: 'Huyen',
      bg: '#ECEAE4', fg: '#141414', band: '#7A5B3A', w: 50, h: 178,
    },
  ];

  // Bottom of the stack is the machine. A layer lights when every book on it is marked read.
  const LAYERS = [
    { id: 'hardware', name: 'Hardware', books: ['csapp'], tone: '#232226' },
    { id: 'os', name: 'OS', books: ['ostep'], tone: '#3d3d3d' },
    { id: 'network', name: 'Network', books: ['network'], tone: '#B3202A' },
    { id: 'data', name: 'Data', books: ['ddia'], tone: '#8d3a32' },
    { id: 'services', name: 'Services', books: ['sdi', 'micro'], tone: '#383D63' },
    { id: 'infra', name: 'Infra', books: ['docker', 'k8s', 'terraform'], tone: '#2A6FB5' },
    { id: 'ops', name: 'Ops', books: ['sre'], tone: '#2F63A6' },
    { id: 'ml', name: 'ML', books: ['dl', 'dmls'], tone: '#3E5A49' },
    { id: 'llm', name: 'LLM apps', books: ['llm', 'aie'], tone: '#7A4E2D' },
  ];

  const byId = Object.create(null);
  BOOKS.forEach(function (book) { byId[book.id] = book; });

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function bookById(id) {
    return byId[id] || null;
  }

  function booksOnShelf(group) {
    return BOOKS.filter(function (book) { return book.group === group; });
  }

  function normalizeRead(ids) {
    const seen = Object.create(null);
    const out = [];
    if (!Array.isArray(ids)) return out;
    ids.forEach(function (id) {
      if (typeof id !== 'string' || !byId[id] || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function loadRead(storage) {
    if (!storage) return [];
    try {
      return normalizeRead(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
    } catch (err) {
      return [];
    }
  }

  function saveRead(storage, ids) {
    const clean = normalizeRead(ids);
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  }

  function layerView(readIds) {
    const read = Object.create(null);
    normalizeRead(readIds).forEach(function (id) { read[id] = true; });
    return LAYERS.map(function (layer) {
      const have = layer.books.filter(function (id) { return read[id]; }).length;
      let state = 'off';
      if (have === layer.books.length) state = 'lit';
      else if (have > 0) state = 'partial';
      return {
        id: layer.id,
        name: layer.name,
        tone: layer.tone,
        books: layer.books.slice(),
        have: have,
        total: layer.books.length,
        state: state,
      };
    });
  }

  function pathSentence(view) {
    const lit = view.filter(function (layer) { return layer.state === 'lit'; }).length;
    if (lit === view.length) return 'All nine layers are lit, from the machine up to LLM apps.';
    const next = view.find(function (layer) { return layer.state !== 'lit'; });
    if (lit === 0) return 'Nothing is lit yet. Mark a book read and its layer starts to fill, from the machine upward.';
    const missing = next.total - next.have;
    const noun = missing === 1 ? 'book' : 'books';
    return lit + ' of 9 layers lit. ' + next.name + ' still needs ' + missing + ' ' + noun + '.';
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    SHELVES: SHELVES,
    BOOKS: BOOKS,
    LAYERS: LAYERS,
    pad: pad,
    bookById: bookById,
    booksOnShelf: booksOnShelf,
    normalizeRead: normalizeRead,
    loadRead: loadRead,
    saveRead: saveRead,
    layerView: layerView,
    pathSentence: pathSentence,
  };
});
