/* A small Lisp-1 used by the live image. No host eval. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LispImage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  class LispError extends Error {
    constructor(message) {
      super(message);
      this.name = "LispError";
    }
  }

  function fail(message) {
    throw new LispError(message);
  }

  function sym(name) {
    return { t: "sym", n: name };
  }

  function cons(a, d) {
    return { t: "cons", a: a, d: d };
  }

  function isSym(value) {
    return !!value && value.t === "sym";
  }

  function isCons(value) {
    return !!value && value.t === "cons";
  }

  function isList(value) {
    return value === null || isCons(value);
  }

  function arrayToList(items) {
    let tail = null;
    for (let i = items.length - 1; i >= 0; i -= 1) tail = cons(items[i], tail);
    return tail;
  }

  function listToArray(list) {
    const out = [];
    let node = list;
    let guard = 0;
    while (isCons(node)) {
      guard += 1;
      if (guard > 100000) fail("list too long");
      out.push(node.a);
      node = node.d;
    }
    if (node !== null) out.improper = node;
    return out;
  }

  function length(list) {
    if (list === null) return 0;
    const items = listToArray(list);
    if (items.improper) fail("length expects a proper list");
    return items.length;
  }

  function Env(parent) {
    this.parent = parent || null;
    this.bindings = new Map();
  }

  Env.prototype.define = function (name, value) {
    this.bindings.set(name, value);
  };

  Env.prototype.lookup = function (name) {
    if (this.bindings.has(name)) return { env: this, value: this.bindings.get(name) };
    if (this.parent) return this.parent.lookup(name);
    return null;
  };

  Env.prototype.root = function () {
    let env = this;
    while (env.parent) env = env.parent;
    return env;
  };

  Env.prototype.set = function (name, value) {
    const found = this.lookup(name);
    if (found) found.env.define(name, value);
    else this.root().define(name, value);
  };

  function formatNum(number) {
    if (Object.is(number, -0)) return "0";
    if (Number.isInteger(number)) return String(number);
    const rounded = Math.round(number * 1000) / 1000;
    return String(rounded);
  }

  function format(value) {
    if (value === null) return "nil";
    if (typeof value === "number") return formatNum(value);
    if (typeof value === "string") return JSON.stringify(value);
    if (isSym(value)) return value.n;
    if (value && value.t === "builtin") return "#<builtin " + value.n + ">";
    if (value && value.t === "fn") {
      const params = value.params.join(" ");
      return "#<fn" + (value.name ? " " + value.name : "") + " (" + params + ")>";
    }
    if (isCons(value)) {
      const parts = [];
      let node = value;
      let guard = 0;
      while (isCons(node)) {
        guard += 1;
        if (guard > 80) {
          parts.push("…");
          node = null;
          break;
        }
        parts.push(format(node.a));
        node = node.d;
      }
      if (node !== null) parts.push(".", format(node));
      return "(" + parts.join(" ") + ")";
    }
    return String(value);
  }

  function readForms(input) {
    const source = String(input);
    let index = 0;

    function skip() {
      for (;;) {
        while (index < source.length && /[\s,]/.test(source[index])) index += 1;
        if (source[index] === ";") {
          while (index < source.length && source[index] !== "\n") index += 1;
          continue;
        }
        break;
      }
    }

    function readString() {
      index += 1;
      let out = "";
      while (index < source.length) {
        const ch = source[index];
        index += 1;
        if (ch === '"') return out;
        if (ch === "\\") {
          if (index >= source.length) fail("unterminated string");
          const escaped = source[index];
          index += 1;
          out += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
          continue;
        }
        out += ch;
      }
      fail("unterminated string");
    }

    function readAtom() {
      const start = index;
      while (index < source.length && !/[\s()'"`;]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      if (!text) fail("empty atom");
      if (text === "nil") return null;
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
        const number = Number(text);
        if (Number.isFinite(number)) return number;
      }
      return sym(text);
    }

    function readList() {
      index += 1;
      const items = [];
      for (;;) {
        skip();
        if (index >= source.length) fail("unterminated list");
        if (source[index] === ")") {
          index += 1;
          break;
        }
        items.push(readForm().form);
      }
      return arrayToList(items);
    }

    function readForm() {
      skip();
      if (index >= source.length) return { eof: true };
      const start = index;
      const ch = source[index];
      if (ch === "(") {
        const form = readList();
        if (isCons(form)) form.src = source.slice(start, index);
        return { form: form };
      }
      if (ch === ")") fail("unexpected )");
      if (ch === "'") {
        index += 1;
        const inner = readForm();
        if (inner.eof) fail("quote needs a form");
        const form = cons(sym("quote"), cons(inner.form, null));
        form.src = source.slice(start, index);
        return { form: form };
      }
      if (ch === '"') return { form: readString() };
      return { form: readAtom() };
    }

    const forms = [];
    skip();
    while (index < source.length) {
      const got = readForm();
      if (got.eof) break;
      forms.push(got.form);
      skip();
    }
    return forms;
  }

  function truthy(value) {
    return value !== null;
  }

  function evalBody(body, env, evalForm) {
    let last = null;
    let node = body;
    let guard = 0;
    while (isCons(node)) {
      guard += 1;
      if (guard > 100000) fail("body too long");
      last = evalForm(node.a, env);
      node = node.d;
    }
    if (node !== null) fail("bad body");
    return last;
  }

  function createImage() {
    const root = new Env(null);
    let depth = 0;
    root.define("*world*", null);

    function specialQuote(form) {
      const parts = listToArray(form);
      if (parts.length !== 2 || parts.improper) fail("quote needs one form");
      return parts[1];
    }

    function specialIf(form, env) {
      const parts = listToArray(form);
      if ((parts.length !== 3 && parts.length !== 4) || parts.improper) {
        fail("if needs a test, a then, and an optional else");
      }
      if (truthy(evalForm(parts[1], env))) return evalForm(parts[2], env);
      if (parts.length === 4) return evalForm(parts[3], env);
      return null;
    }

    function specialCond(form, env) {
      let clause = form.d;
      while (isCons(clause)) {
        if (!isCons(clause.a)) fail("cond clause must be a list");
        const test = evalForm(clause.a.a, env);
        if (truthy(test)) {
          if (clause.a.d === null) return test;
          return evalBody(clause.a.d, env, evalForm);
        }
        clause = clause.d;
      }
      if (clause !== null) fail("bad cond");
      return null;
    }

    function specialProgn(form, env) {
      return evalBody(form.d, env, evalForm);
    }

    function specialAnd(form, env) {
      let last = sym("t");
      let node = form.d;
      while (isCons(node)) {
        last = evalForm(node.a, env);
        if (!truthy(last)) return last;
        node = node.d;
      }
      if (node !== null) fail("bad and");
      return last;
    }

    function specialOr(form, env) {
      let node = form.d;
      while (isCons(node)) {
        const value = evalForm(node.a, env);
        if (truthy(value)) return value;
        node = node.d;
      }
      if (node !== null) fail("bad or");
      return null;
    }

    function bindPair(pair) {
      if (!isCons(pair)) fail("binding must be (name value)");
      const bits = listToArray(pair);
      if (bits.length !== 2 || bits.improper || !isSym(bits[0])) fail("binding must be (name value)");
      return bits;
    }

    function specialLet(form, env, star) {
      const parts = listToArray(form);
      if (parts.length < 2 || parts.improper || !isList(parts[1])) fail("let needs a binding list");
      const pairs = listToArray(parts[1]);
      if (pairs.improper) fail("let bindings must be a proper list");
      const frame = new Env(env);
      if (star) {
        pairs.forEach(function (pair) {
          const bits = bindPair(pair);
          frame.define(bits[0].n, evalForm(bits[1], frame));
        });
      } else {
        const inits = pairs.map(function (pair) {
          const bits = bindPair(pair);
          return [bits[0].n, evalForm(bits[1], env)];
        });
        inits.forEach(function (init) {
          frame.define(init[0], init[1]);
        });
      }
      return evalBody(form.d.d, frame, evalForm);
    }

    function specialSetq(form, env) {
      const parts = listToArray(form);
      if (parts.improper || parts.length < 3 || (parts.length - 1) % 2 !== 0) fail("setq needs name/value pairs");
      let last = null;
      for (let i = 1; i < parts.length; i += 2) {
        if (!isSym(parts[i])) fail("setq name must be a symbol");
        last = evalForm(parts[i + 1], env);
        env.set(parts[i].n, last);
      }
      return last;
    }

    function makeFn(paramsList, body, env, name, src) {
      if (!isList(paramsList)) fail("parameters must be a list");
      const params = listToArray(paramsList);
      if (params.improper) fail("parameters must be a proper list");
      const names = params.map(function (param) {
        if (!isSym(param)) fail("parameter must be a symbol");
        return param.n;
      });
      return {
        t: "fn",
        params: names,
        body: body,
        env: env,
        name: name,
        src: src,
        user: !!name,
      };
    }

    function specialLambda(form, env) {
      const parts = listToArray(form);
      if (parts.length < 3 || parts.improper) fail("lambda needs parameters and a body");
      return makeFn(parts[1], form.d.d, env, null, form.src || format(form));
    }

    function specialDefun(form, env) {
      const parts = listToArray(form);
      if (parts.length < 4 || parts.improper || !isSym(parts[1])) {
        fail("defun needs a name, parameters, and a body");
      }
      const fn = makeFn(parts[2], form.d.d.d, env.root(), parts[1].n, form.src || format(form));
      env.root().define(parts[1].n, fn);
      return sym(parts[1].n);
    }

    const specials = {
      quote: specialQuote,
      if: specialIf,
      cond: specialCond,
      progn: specialProgn,
      let: function (form, env) { return specialLet(form, env, false); },
      "let*": function (form, env) { return specialLet(form, env, true); },
      setq: specialSetq,
      defun: specialDefun,
      lambda: specialLambda,
      and: specialAnd,
      or: specialOr,
    };

    function evalForm(form, env) {
      depth += 1;
      if (depth > 4000) fail("too much recursion");
      try {
        if (typeof form === "number" || typeof form === "string" || form === null) return form;
        if (isSym(form)) {
          if (form.n === "t") return sym("t");
          const found = env.lookup(form.n);
          if (!found) fail("unbound symbol " + form.n);
          return found.value;
        }
        if (!isCons(form)) fail("cannot eval " + format(form));
        if (isSym(form.a) && specials[form.a.n]) return specials[form.a.n](form, env);
        const fn = evalForm(form.a, env);
        const args = [];
        let node = form.d;
        while (isCons(node)) {
          args.push(evalForm(node.a, env));
          node = node.d;
        }
        if (node !== null) fail("bad call");
        return apply(fn, args);
      } finally {
        depth -= 1;
      }
    }

    function apply(fn, args) {
      if (!fn || (fn.t !== "fn" && fn.t !== "builtin")) fail("not a function: " + format(fn));
      if (fn.t === "builtin") return fn.fn(args);
      if (args.length !== fn.params.length) {
        fail((fn.name || "lambda") + " expects " + fn.params.length + " argument" + (fn.params.length === 1 ? "" : "s") + ", got " + args.length);
      }
      const frame = new Env(fn.env);
      fn.params.forEach(function (name, i) {
        frame.define(name, args[i]);
      });
      return evalBody(fn.body, frame, evalForm);
    }

    function needNum(value, name) {
      if (typeof value !== "number" || !Number.isFinite(value)) fail(name + " expects a number");
      return value;
    }

    function arity(args, count, name) {
      if (args.length !== count) fail(name + " expects " + count + " argument" + (count === 1 ? "" : "s"));
    }

    function numFold(args, name, seed, step) {
      return args.reduce(function (acc, value) {
        return step(acc, needNum(value, name));
      }, seed);
    }

    function plistKey(key) {
      if (isSym(key)) return key.n;
      if (typeof key === "string") return key;
      fail("plist key must be a symbol");
    }

    function plistGet(list, key) {
      if (list === null) return null;
      const items = listToArray(list);
      if (items.improper) fail("plist must be a proper list");
      const name = plistKey(key);
      for (let i = 0; i + 1 < items.length; i += 2) {
        if (plistKey(items[i]) === name) return items[i + 1];
      }
      return null;
    }

    function plistPut(list, key, value) {
      const items = list === null ? [] : listToArray(list);
      if (items.improper) fail("plist must be a proper list");
      const name = plistKey(key);
      let found = false;
      for (let i = 0; i + 1 < items.length; i += 2) {
        if (plistKey(items[i]) === name) {
          items[i + 1] = value;
          found = true;
          break;
        }
      }
      if (!found) items.push(sym(name), value);
      return arrayToList(items);
    }

    function command(op, args, count) {
      arity(args, count, op);
      return arrayToList([sym(op)].concat(args));
    }

    function flag(value) {
      return value ? sym("t") : null;
    }

    function equal(a, b) {
      if (a === b) return true;
      if (typeof a === "number" && typeof b === "number") return a === b;
      if (typeof a === "string" && typeof b === "string") return a === b;
      if (isSym(a) && isSym(b)) return a.n === b.n;
      if (isCons(a) && isCons(b)) return equal(a.a, b.a) && equal(a.d, b.d);
      return false;
    }

    function chain(args, name, pred) {
      if (args.length < 2) fail(name + " expects at least 2 arguments");
      for (let i = 1; i < args.length; i += 1) {
        if (!pred(needNum(args[i - 1], name), needNum(args[i], name))) return null;
      }
      return sym("t");
    }

    const builtins = {
      "+": function (args) { return numFold(args, "+", 0, function (a, b) { return a + b; }); },
      "-": function (args) {
        if (args.length === 0) fail("- expects a number");
        if (args.length === 1) return -needNum(args[0], "-");
        return args.slice(1).reduce(function (acc, value) {
          return acc - needNum(value, "-");
        }, needNum(args[0], "-"));
      },
      "*": function (args) { return numFold(args, "*", 1, function (a, b) { return a * b; }); },
      "/": function (args) {
        if (args.length === 0) fail("/ expects a number");
        let value = needNum(args[0], "/");
        if (args.length === 1) {
          if (value === 0) fail("division by zero");
          return 1 / value;
        }
        for (let i = 1; i < args.length; i += 1) {
          const divisor = needNum(args[i], "/");
          if (divisor === 0) fail("division by zero");
          value /= divisor;
        }
        return value;
      },
      mod: function (args) {
        arity(args, 2, "mod");
        const divisor = needNum(args[1], "mod");
        if (divisor === 0) fail("mod by zero");
        return needNum(args[0], "mod") % divisor;
      },
      wrap: function (args) {
        arity(args, 3, "wrap");
        const value = needNum(args[0], "wrap");
        const lo = needNum(args[1], "wrap");
        const hi = needNum(args[2], "wrap");
        const span = hi - lo;
        if (span === 0) return lo;
        let mod = (value - lo) % span;
        if (mod < 0) mod += span;
        return lo + mod;
      },
      abs: function (args) { arity(args, 1, "abs"); return Math.abs(needNum(args[0], "abs")); },
      floor: function (args) { arity(args, 1, "floor"); return Math.floor(needNum(args[0], "floor")); },
      sin: function (args) { arity(args, 1, "sin"); return Math.sin(needNum(args[0], "sin")); },
      cos: function (args) { arity(args, 1, "cos"); return Math.cos(needNum(args[0], "cos")); },
      min: function (args) {
        if (args.length < 1) fail("min expects a number");
        return args.reduce(function (acc, value) { return Math.min(acc, needNum(value, "min")); }, Infinity);
      },
      max: function (args) {
        if (args.length < 1) fail("max expects a number");
        return args.reduce(function (acc, value) { return Math.max(acc, needNum(value, "max")); }, -Infinity);
      },
      "=": function (args) {
        if (args.length < 2) fail("= expects at least 2 arguments");
        for (let i = 1; i < args.length; i += 1) if (!equal(args[0], args[i])) return null;
        return sym("t");
      },
      "<": function (args) { return chain(args, "<", function (a, b) { return a < b; }); },
      ">": function (args) { return chain(args, ">", function (a, b) { return a > b; }); },
      "<=": function (args) { return chain(args, "<=", function (a, b) { return a <= b; }); },
      ">=": function (args) { return chain(args, ">=", function (a, b) { return a >= b; }); },
      not: function (args) { arity(args, 1, "not"); return flag(!truthy(args[0])); },
      null: function (args) { arity(args, 1, "null"); return flag(args[0] === null); },
      numberp: function (args) { arity(args, 1, "numberp"); return flag(typeof args[0] === "number"); },
      stringp: function (args) { arity(args, 1, "stringp"); return flag(typeof args[0] === "string"); },
      symbolp: function (args) { arity(args, 1, "symbolp"); return flag(isSym(args[0])); },
      listp: function (args) { arity(args, 1, "listp"); return flag(isList(args[0])); },
      list: function (args) { return arrayToList(args); },
      cons: function (args) { arity(args, 2, "cons"); return cons(args[0], args[1]); },
      car: function (args) {
        arity(args, 1, "car");
        if (args[0] === null) return null;
        if (!isCons(args[0])) fail("car expects a list");
        return args[0].a;
      },
      cdr: function (args) {
        arity(args, 1, "cdr");
        if (args[0] === null) return null;
        if (!isCons(args[0])) fail("cdr expects a list");
        return args[0].d;
      },
      nth: function (args) {
        arity(args, 2, "nth");
        let index = Math.floor(needNum(args[0], "nth"));
        let node = args[1];
        if (index < 0) return null;
        while (index > 0 && isCons(node)) {
          node = node.d;
          index -= 1;
        }
        return isCons(node) ? node.a : null;
      },
      length: function (args) { arity(args, 1, "length"); return length(args[0] === undefined ? null : args[0]); },
      append: function (args) {
        return args.reduce(function (acc, list) {
          if (acc === null) return list;
          if (list === null) return acc;
          const items = listToArray(acc);
          if (items.improper) fail("append expects proper lists");
          let tail = list;
          for (let i = items.length - 1; i >= 0; i -= 1) tail = cons(items[i], tail);
          return tail;
        }, null);
      },
      reverse: function (args) {
        arity(args, 1, "reverse");
        let tail = null;
        let node = args[0];
        while (isCons(node)) {
          tail = cons(node.a, tail);
          node = node.d;
        }
        if (node !== null) fail("reverse expects a proper list");
        return tail;
      },
      take: function (args) {
        arity(args, 2, "take");
        let count = Math.floor(needNum(args[0], "take"));
        if (count <= 0 || args[1] === null) return null;
        const items = [];
        let node = args[1];
        while (count > 0 && isCons(node)) {
          items.push(node.a);
          node = node.d;
          count -= 1;
        }
        return arrayToList(items);
      },
      mapcar: function (args) {
        arity(args, 2, "mapcar");
        if (!args[0] || (args[0].t !== "fn" && args[0].t !== "builtin")) fail("mapcar expects a function");
        const items = [];
        let node = args[1];
        while (isCons(node)) {
          items.push(apply(args[0], [node.a]));
          node = node.d;
        }
        if (node !== null) fail("mapcar expects a proper list");
        return arrayToList(items);
      },
      "plist-get": function (args) { arity(args, 2, "plist-get"); return plistGet(args[0], args[1]); },
      "plist-put": function (args) { arity(args, 3, "plist-put"); return plistPut(args[0], args[1], args[2]); },
      world: function (args) {
        arity(args, 1, "world");
        const found = root.lookup("*world*");
        return plistGet(found ? found.value : null, args[0]);
      },
      str: function (args) {
        arity(args, 1, "str");
        const value = args[0];
        if (typeof value === "number") return formatNum(value);
        if (typeof value === "string") return value;
        if (isSym(value)) return value.n;
        if (value === null) return "";
        return format(value);
      },
      concat: function (args) {
        return args.map(function (value) {
          if (typeof value === "string") return value;
          if (typeof value === "number") return formatNum(value);
          fail("concat expects strings or numbers");
        }).join("");
      },
      upcase: function (args) {
        arity(args, 1, "upcase");
        if (typeof args[0] !== "string") fail("upcase expects a string");
        return args[0].toUpperCase();
      },
      downcase: function (args) {
        arity(args, 1, "downcase");
        if (typeof args[0] !== "string") fail("downcase expects a string");
        return args[0].toLowerCase();
      },
      "string-reverse": function (args) {
        arity(args, 1, "string-reverse");
        if (typeof args[0] !== "string") fail("string-reverse expects a string");
        return Array.from(args[0]).reverse().join("");
      },
      clear: function (args) { return command("clear", args, 1); },
      rect: function (args) { return command("rect", args, 5); },
      circle: function (args) { return command("circle", args, 4); },
      line: function (args) { return command("line", args, 5); },
      ring: function (args) { return command("ring", args, 4); },
      text: function (args) { return command("text", args, 5); },
    };

    Object.keys(builtins).forEach(function (name) {
      root.define(name, { t: "builtin", n: name, fn: builtins[name] });
    });

    function evaluate(source) {
      const forms = readForms(source);
      if (forms.length === 0) fail("empty form");
      depth = 0;
      let last = null;
      forms.forEach(function (form) {
        last = evalForm(form, root);
      });
      return last;
    }

    function call(name, jsArgs) {
      const found = root.lookup(name);
      if (!found || !found.value || (found.value.t !== "fn" && found.value.t !== "builtin")) {
        fail("undefined function " + name);
      }
      depth = 0;
      return apply(found.value, (jsArgs || []).map(fromJS));
    }

    function functions() {
      const out = [];
      root.bindings.forEach(function (value, name) {
        if (value && value.t === "fn" && value.user) {
          out.push({ name: name, params: value.params.slice(), source: value.src || "" });
        }
      });
      out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      return out;
    }

    function world() {
      const found = root.lookup("*world*");
      return found ? found.value : null;
    }

    return {
      eval: evaluate,
      call: call,
      has: function (name) {
        const found = root.lookup(name);
        return !!(found && found.value && found.value.t === "fn");
      },
      functions: functions,
      world: world,
      format: format,
      describeWorld: function () { return describeWorld(world()); },
    };
  }

  function fromJS(value) {
    if (typeof value === "number" || typeof value === "string" || value === null || value === undefined) {
      return value === undefined ? null : value;
    }
    if (value === true) return sym("t");
    if (value === false) return null;
    fail("cannot pass that value into Lisp");
  }

  function describeWorld(world) {
    if (world === null) return [];
    const items = listToArray(world);
    if (items.improper || items.length % 2 !== 0) return [{ key: "value", value: format(world) }];
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      const key = isSym(items[i]) ? items[i].n : format(items[i]);
      const value = items[i + 1];
      let shown;
      if ((key === "trail" || key === "marks") && (value === null || isCons(value))) {
        const count = value === null ? 0 : length(value);
        shown = count === 1 ? "1 point" : count + " points";
      } else {
        shown = format(value);
      }
      rows.push({ key: key, value: shown });
    }
    return rows;
  }

  return {
    createImage: createImage,
    readForms: readForms,
    format: format,
    LispError: LispError,
  };
});
