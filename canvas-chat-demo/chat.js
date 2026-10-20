// A scripted stand-in for MulmoChat's plugin turn.
// A prompt matches a tool. execute() returns two channels:
// message, jsonData, and instructions would go back to a model;
// data and viewState are what the canvas draws.
// No model is called. Nothing is fetched.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CanvasChat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROWS = [
    '~~~~~~~~',
    '~##s##~~',
    '~#++++#~',
    '~#+m++s~',
    '~#++++#~',
    '~##p###~',
    '~~~~~~~~',
    '~~~~~~~~',
  ];
  const WALK = { '#': 'path', '+': 'path', s: 'stall', m: 'hall', p: 'pier' };
  const PLACES = {
    '3,1': 'North net',
    '3,3': 'Salt hall',
    '6,3': 'Glass float',
    '3,5': 'Pier',
  };
  const LEDGER = [
    {stall: 'North net', catch: 'mackerel', price: 18, hour: 6},
    {stall: 'Red kettle', catch: 'oysters', price: 24, hour: 7},
    {stall: 'Pier three', catch: 'mackerel', price: 16, hour: 5},
    {stall: 'Glass float', catch: 'herring', price: 11, hour: 9},
    {stall: 'Salt room', catch: 'oysters', price: 27, hour: 8},
    {stall: 'Wick lamp', catch: 'herring', price: 12, hour: 6},
  ];

  function openingBoard() {
    const board = Array.from({length: 8}, function () { return Array(8).fill(0); });
    board[3][3] = 2;
    board[3][4] = 1;
    board[4][3] = 1;
    board[4][4] = 2;
    return board;
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function flips(board, x, y, player) {
    if (board[y][x] !== 0) return [];
    const other = player === 1 ? 2 : 1;
    const gained = [];
    DIRS.forEach(function (dir) {
      const line = [];
      let cx = x + dir[0];
      let cy = y + dir[1];
      while (cx >= 0 && cy >= 0 && cx < 8 && cy < 8 && board[cy][cx] === other) {
        line.push([cx, cy]);
        cx += dir[0];
        cy += dir[1];
      }
      if (line.length && cx >= 0 && cy >= 0 && cx < 8 && cy < 8 && board[cy][cx] === player) {
        line.forEach(function (cell) { gained.push(cell); });
      }
    });
    return gained;
  }

  function legalMoves(board, player) {
    const moves = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const gained = flips(board, x, y, player);
        if (gained.length) moves.push({x: x, y: y, flips: gained.length});
      }
    }
    return moves;
  }

  function bestMove(board, player) {
    return legalMoves(board, player).reduce(function (best, move) {
      if (!best) return move;
      if (move.flips > best.flips) return move;
      if (move.flips === best.flips && (move.y < best.y || (move.y === best.y && move.x < best.x))) return move;
      return best;
    }, null);
  }

  function applyMove(board, x, y, player) {
    const gained = flips(board, x, y, player);
    if (!gained.length) return null;
    const next = board.map(function (row) { return row.slice(); });
    next[y][x] = player;
    gained.forEach(function (cell) { next[cell[1]][cell[0]] = player; });
    return {board: next, flipped: gained.length};
  }

  function countDiscs(board, player) {
    return board.reduce(function (sum, row) {
      return sum + row.reduce(function (inner, cell) { return inner + (cell === player ? 1 : 0); }, 0);
    }, 0);
  }

  function coord(x, y) {
    return 'abcdefgh'[x] + String(y + 1);
  }

  function placeAt(x, y) {
    return PLACES[x + ',' + y] || 'the path';
  }

  function walkable(x, y) {
    if (y < 0 || x < 0 || y >= ROWS.length || x >= ROWS[0].length) return false;
    return Boolean(WALK[ROWS[y][x]]);
  }

  function sortedRows(rows, view) {
    const dir = view.dir === 'desc' ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      if (a[view.key] < b[view.key]) return -1 * dir;
      if (a[view.key] > b[view.key]) return 1 * dir;
      if (a.stall < b.stall) return -1;
      if (a.stall > b.stall) return 1;
      return 0;
    });
  }

  function pluginMap() {
    return {
      toolDefinition: {
        type: 'function',
        name: 'map',
        description: 'Open a walkable grid of a place on the canvas.',
        parameters: {
          type: 'object',
          properties: {
            place: {type: 'string', description: 'Place name to draw.'},
          },
          required: ['place'],
        },
      },
      generatingMessage: 'Opening the map…',
      execute: function (args) {
        const viewState = {x: 3, y: 5};
        return {
          title: 'Saltmarket',
          message: 'Saltmarket is on the canvas. The visitor starts on the pier.',
          jsonData: {place: args.place, stalls: ['North net', 'Glass float'], visitor: 'Pier'},
          instructions: 'The user can click a walkable cell. Water does nothing.',
          data: {place: args.place, rows: ROWS.map(function (row) { return row; }), places: Object.assign({}, PLACES)},
          viewState: viewState,
        };
      },
      interact: function (result, action) {
        if (action.type !== 'move') return {ok: false, error: 'Unknown map action.'};
        if (!walkable(action.x, action.y)) return {ok: false, error: 'That cell is water.'};
        const viewState = {x: action.x, y: action.y};
        return {
          ok: true,
          result: Object.assign({}, result, {
            viewState: viewState,
            jsonData: Object.assign({}, result.jsonData, {visitor: placeAt(action.x, action.y)}),
          }),
        };
      },
    };
  }

  function pluginPicture() {
    return {
      toolDefinition: {
        type: 'function',
        name: 'picture',
        description: 'Put a drawn scene on the canvas. This page draws it locally.',
        parameters: {
          type: 'object',
          properties: {
            scene: {type: 'string', description: 'Which scene to draw.'},
          },
          required: ['scene'],
        },
      },
      generatingMessage: 'Drawing on the canvas…',
      execute: function (args) {
        const viewState = {lamps: true, boats: true, rain: false};
        return {
          title: 'Harbor at dusk',
          message: 'A drawing of the harbor is on the canvas. Lamps, boats, and rain are layers.',
          jsonData: {scene: args.scene, layers: Object.assign({}, viewState)},
          instructions: 'The user can toggle each layer. No image model ran.',
          data: {scene: args.scene, title: 'Harbor at dusk'},
          viewState: viewState,
        };
      },
      interact: function (result, action) {
        if (action.type !== 'toggle' || !Object.prototype.hasOwnProperty.call(result.viewState, action.layer)) {
          return {ok: false, error: 'Unknown layer.'};
        }
        const viewState = Object.assign({}, result.viewState);
        viewState[action.layer] = !viewState[action.layer];
        return {
          ok: true,
          result: Object.assign({}, result, {
            viewState: viewState,
            jsonData: Object.assign({}, result.jsonData, {layers: Object.assign({}, viewState)}),
          }),
        };
      },
    };
  }

  function settle(board, notes) {
    let current = board;
    let guard = 0;
    while (guard < 4) {
      guard += 1;
      if (!legalMoves(current, 1).length && !legalMoves(current, 2).length) {
        return {board: current, over: true, turn: 0, notes: notes};
      }
      if (legalMoves(current, 1).length) {
        return {board: current, over: false, turn: 1, notes: notes};
      }
      notes.push('Dark has no move.');
      const reply = bestMove(current, 2);
      if (!reply) break;
      const played = applyMove(current, reply.x, reply.y, 2);
      current = played.board;
      notes.push('Light plays ' + coord(reply.x, reply.y) + ' and flips ' + played.flipped + '.');
    }
    const over = !legalMoves(current, 1).length && !legalMoves(current, 2).length;
    return {board: current, over: over, turn: over ? 0 : 1, notes: notes};
  }

  function pluginOthello() {
    return {
      toolDefinition: {
        type: 'function',
        name: 'othello',
        description: 'Open a playable othello board on the canvas.',
        parameters: {
          type: 'object',
          properties: {
            size: {type: 'number', description: 'Board size. This page uses 8.'},
          },
          required: ['size'],
        },
      },
      generatingMessage: 'Setting the board…',
      execute: function () {
        const board = openingBoard();
        const viewState = {board: board, turn: 1, over: false, note: 'Dark to play. Light answers with the move that flips the most discs.'};
        return {
          title: 'Othello',
          message: 'Othello is on the canvas. You are dark. Light is a fixed rule: most flips, then the earlier square.',
          jsonData: {size: 8, dark: 2, light: 2, opponent: 'most-flips'},
          instructions: 'The user clicks a legal square. No model chooses Light’s move.',
          data: {size: 8},
          viewState: viewState,
        };
      },
      interact: function (result, action) {
        const state = result.viewState;
        if (action.type !== 'move') return {ok: false, error: 'Unknown board action.'};
        if (state.over) return {ok: false, error: 'The game is over.'};
        const played = applyMove(state.board, action.x, action.y, 1);
        if (!played) return {ok: false, error: 'That square does not flip a disc.'};
        const notes = ['Dark plays ' + coord(action.x, action.y) + ' and flips ' + played.flipped + '.'];
        let current = played.board;
        const reply = bestMove(current, 2);
        if (reply) {
          const white = applyMove(current, reply.x, reply.y, 2);
          current = white.board;
          notes.push('Light plays ' + coord(reply.x, reply.y) + ' and flips ' + white.flipped + '.');
        } else {
          notes.push('Light has no move.');
        }
        const settled = settle(current, notes);
        const dark = countDiscs(settled.board, 1);
        const light = countDiscs(settled.board, 2);
        const ending = settled.over ? ' Game over. Dark ' + dark + ', light ' + light + '.' : '';
        return {
          ok: true,
          result: Object.assign({}, result, {
            viewState: {
              board: settled.board,
              turn: settled.turn,
              over: settled.over,
              note: settled.notes.join(' ') + ending,
            },
            jsonData: {size: 8, dark: dark, light: light, opponent: 'most-flips', over: settled.over},
          }),
        };
      },
    };
  }

  function pluginLedger() {
    return {
      toolDefinition: {
        type: 'function',
        name: 'ledger',
        description: 'Show a sortable stall ledger on the canvas.',
        parameters: {
          type: 'object',
          properties: {
            book: {type: 'string', description: 'Which book to open.'},
          },
          required: ['book'],
        },
      },
      generatingMessage: 'Opening the ledger…',
      execute: function (args) {
        const viewState = {key: 'hour', dir: 'asc'};
        return {
          title: 'Stall ledger',
          message: 'The morning ledger is on the canvas. Column heads sort it.',
          jsonData: {book: args.book, rows: LEDGER.length, sort: 'hour asc'},
          instructions: 'The user can sort by stall, catch, price, or hour.',
          data: {rows: LEDGER.map(function (row) { return Object.assign({}, row); })},
          viewState: viewState,
        };
      },
      interact: function (result, action) {
        const keys = {stall: 1, catch: 1, price: 1, hour: 1};
        if (action.type !== 'sort' || !keys[action.key]) return {ok: false, error: 'Unknown column.'};
        const dir = result.viewState.key === action.key && result.viewState.dir === 'asc' ? 'desc' : 'asc';
        const viewState = {key: action.key, dir: dir};
        return {
          ok: true,
          result: Object.assign({}, result, {
            viewState: viewState,
            jsonData: Object.assign({}, result.jsonData, {sort: action.key + ' ' + dir}),
          }),
        };
      },
    };
  }

  const PLUGINS = [pluginMap(), pluginPicture(), pluginOthello(), pluginLedger()];

  const PROMPTS = [
    {id: 'map', text: 'Show a map of Saltmarket', plugin: 'map', args: {place: 'Saltmarket'}, keys: ['map', 'saltmarket', 'where', 'walk', 'fish', 'market']},
    {id: 'picture', text: 'Draw the harbor at dusk', plugin: 'picture', args: {scene: 'harbor-dusk'}, keys: ['draw', 'harbor', 'dusk', 'image', 'picture', 'paint']},
    {id: 'game', text: 'Play othello on the canvas', plugin: 'othello', args: {size: 8}, keys: ['othello', 'play', 'game', 'board']},
    {id: 'ledger', text: 'Show the stall ledger', plugin: 'ledger', args: {book: 'morning'}, keys: ['ledger', 'sort', 'price', 'prices', 'catches', 'table']},
  ];

  function pluginByName(name) {
    return PLUGINS.filter(function (plugin) { return plugin.toolDefinition.name === name; })[0];
  }

  function words(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  }

  function matchPrompt(text) {
    const tokens = new Set(words(text));
    const lower = text.trim().toLowerCase();
    let best = null;
    PROMPTS.forEach(function (prompt) {
      let score = 0;
      prompt.keys.forEach(function (key) {
        if (tokens.has(key)) score += 2;
      });
      if (lower === prompt.text.toLowerCase()) score += 10;
      if (score <= 0) return;
      if (!best || score > best.score) {
        best = {
          id: prompt.id,
          text: prompt.text,
          plugin: prompt.plugin,
          args: prompt.args,
          score: score,
          weak: score < 4 && lower !== prompt.text.toLowerCase(),
        };
      }
    });
    return best;
  }

  function createSession() {
    return {messages: [], results: [], selectedId: null, next: 1};
  }

  function send(session, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return {ok: false, error: 'Type a prompt.', session: session};
    const match = matchPrompt(trimmed);
    const messages = session.messages.concat([{role: 'user', text: trimmed}]);
    if (!match) {
      const reply = {
        role: 'assistant',
        text: 'Nothing scripted is close. The four prompts are the whole set. No model is choosing a tool.',
        call: null,
      };
      return {
        ok: true,
        match: null,
        session: {
          messages: messages.concat([reply]),
          results: session.results,
          selectedId: session.selectedId,
          next: session.next,
        },
      };
    }
    const plugin = pluginByName(match.plugin);
    const executed = plugin.execute(match.args);
    const id = 'result-' + session.next;
    const result = {
      id: id,
      toolName: plugin.toolDefinition.name,
      title: executed.title,
      args: Object.assign({}, match.args),
      promptId: match.id,
      weak: match.weak,
      message: executed.message,
      jsonData: executed.jsonData,
      instructions: executed.instructions,
      data: executed.data,
      viewState: executed.viewState,
    };
    const preface = match.weak ? 'Closest scripted prompt: “' + match.text + '”. ' : '';
    const reply = {
      role: 'assistant',
      text: preface + executed.message,
      call: {
        name: plugin.toolDefinition.name,
        generatingMessage: plugin.generatingMessage,
        arguments: Object.assign({}, match.args),
        result: {
          message: executed.message,
          jsonData: structuredClone(executed.jsonData),
          instructions: executed.instructions,
        },
      },
    };
    return {
      ok: true,
      match: match.id,
      session: {
        messages: messages.concat([reply]),
        results: session.results.concat([result]),
        selectedId: id,
        next: session.next + 1,
      },
    };
  }

  function select(session, id) {
    if (!session.results.some(function (result) { return result.id === id; })) {
      return {ok: false, error: 'No canvas with that id.', session: session};
    }
    return {ok: true, session: Object.assign({}, session, {selectedId: id})};
  }

  function interact(session, id, action) {
    const index = session.results.findIndex(function (result) { return result.id === id; });
    if (index < 0) return {ok: false, error: 'No canvas with that id.', session: session};
    const plugin = pluginByName(session.results[index].toolName);
    const outcome = plugin.interact(session.results[index], action);
    if (!outcome.ok) return {ok: false, error: outcome.error, session: session};
    const results = session.results.slice();
    results[index] = outcome.result;
    return {ok: true, session: Object.assign({}, session, {results: results, selectedId: id})};
  }

  return {
    PROMPTS: PROMPTS,
    PLUGINS: PLUGINS,
    ROWS: ROWS,
    LEDGER: LEDGER,
    createSession: createSession,
    send: send,
    select: select,
    interact: interact,
    matchPrompt: matchPrompt,
    openingBoard: openingBoard,
    legalMoves: legalMoves,
    bestMove: bestMove,
    applyMove: applyMove,
    sortedRows: sortedRows,
    placeAt: placeAt,
    coord: coord,
  };
});
