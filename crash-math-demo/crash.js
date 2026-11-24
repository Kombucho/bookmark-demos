// Crash-survival maths from hft.md/crash, on a seeded path.
// Simulated educational numbers. Not advice, and not a market history.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CrashMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAYS_PER_YEAR = 252;

  const DEFAULTS = {
    seed: 7,
    days: DAYS_PER_YEAR * 4,
    mu: 0.07,
    sigma: 0.18,
    crashSize: -0.35,
    crashDays: 20,
    startPrice: 100,
    loss: 0.5,
    yearlyReturn: 0.08,
    volTarget: true,
    targetVol: 0.1,
    volCap: 1.5,
    ewmaLambda: 0.94,
    drawdownBrake: true,
    drawdownLimit: 0.1,
    drawdownFloor: 0.25,
    trend: true,
    trendLookback: 200,
    trendFloor: 0,
    kelly: true,
    kellyScale: 0.5,
    kellyWindow: 63,
  };

  function recoveryGain(loss) {
    if (!(loss >= 0 && loss < 1)) throw new RangeError('loss must be in [0, 1)');
    return loss / (1 - loss);
  }

  function yearsToRecover(loss, yearlyReturn) {
    if (!(loss >= 0 && loss < 1)) throw new RangeError('loss must be in [0, 1)');
    if (!(yearlyReturn > 0)) throw new RangeError('yearly return must be positive');
    return Math.log(1 / (1 - loss)) / Math.log(1 + yearlyReturn);
  }

  function recoveryCurve(yearlyReturn, steps) {
    const n = Math.max(2, steps | 0);
    const pts = [];
    for (let i = 0; i <= n; i += 1) {
      const loss = (0.9 * i) / n;
      pts.push({
        loss: loss,
        gain: recoveryGain(loss),
        years: yearsToRecover(loss, yearlyReturn),
      });
    }
    return pts;
  }

  function maxDrawdown(equity) {
    let peak = equity[0];
    let mdd = 0;
    for (let i = 0; i < equity.length; i += 1) {
      peak = Math.max(peak, equity[i]);
      mdd = Math.max(mdd, 1 - equity[i] / peak);
    }
    return mdd;
  }

  function drawdownStats(equity) {
    let peak = equity[0];
    let peakAt = 0;
    let mdd = 0;
    let troughAt = 0;
    let peakBefore = 0;
    for (let i = 0; i < equity.length; i += 1) {
      if (equity[i] >= peak) {
        peak = equity[i];
        peakAt = i;
      }
      const dd = 1 - equity[i] / peak;
      if (dd > mdd) {
        mdd = dd;
        troughAt = i;
        peakBefore = peakAt;
      }
    }
    if (mdd <= 1e-12) {
      return { maxDrawdown: 0, recovered: true, recoveryDays: 0, troughIndex: 0, peakIndex: 0 };
    }
    const target = equity[peakBefore];
    for (let i = troughAt; i < equity.length; i += 1) {
      if (equity[i] >= target - 1e-9) {
        return {
          maxDrawdown: mdd,
          recovered: true,
          recoveryDays: i - troughAt,
          troughIndex: troughAt,
          peakIndex: peakBefore,
        };
      }
    }
    return {
      maxDrawdown: mdd,
      recovered: false,
      recoveryDays: null,
      troughIndex: troughAt,
      peakIndex: peakBefore,
    };
  }

  function cagr(equity, periodsPerYear) {
    const n = equity.length - 1;
    const per = periodsPerYear || DAYS_PER_YEAR;
    if (n <= 0 || !(equity[0] > 0) || !(equity[n] > 0)) return null;
    return Math.pow(equity[n] / equity[0], per / n) - 1;
  }

  function sharpeIsh(equity, periodsPerYear) {
    const n = equity.length - 1;
    if (n < 2) return null;
    const per = periodsPerYear || DAYS_PER_YEAR;
    let mean = 0;
    const rets = new Array(n);
    for (let i = 1; i < equity.length; i += 1) {
      const r = equity[i] / equity[i - 1] - 1;
      rets[i - 1] = r;
      mean += r;
    }
    mean /= n;
    let acc = 0;
    for (let i = 0; i < n; i += 1) {
      const d = rets[i] - mean;
      acc += d * d;
    }
    const sd = Math.sqrt(acc / (n - 1));
    if (!(sd > 0)) return null;
    return (mean / sd) * Math.sqrt(per);
  }

  function summaryStats(equity) {
    const dd = drawdownStats(equity);
    return {
      cagr: cagr(equity),
      maxDrawdown: dd.maxDrawdown,
      recovered: dd.recovered,
      recoveryDays: dd.recoveryDays,
      sharpe: sharpeIsh(equity),
      end: equity[equity.length - 1],
      troughIndex: dd.troughIndex,
      peakIndex: dd.peakIndex,
    };
  }

  function volTarget(targetVol, currentVol, cap) {
    const limit = cap == null ? 2 : cap;
    return Math.min(limit, targetVol / currentVol);
  }

  function ewmaVarNext(prev, dailyReturn, lambda) {
    const r2 = dailyReturn * dailyReturn;
    if (prev == null) return r2;
    return lambda * prev + (1 - lambda) * r2;
  }

  function annualVolFromVar(variance) {
    return Math.sqrt(Math.max(0, variance) * DAYS_PER_YEAR);
  }

  function windowMeanVar(values, end, length) {
    const start = end - length;
    let mean = 0;
    for (let i = start; i < end; i += 1) mean += values[i];
    mean /= length;
    let acc = 0;
    for (let i = start; i < end; i += 1) {
      const d = values[i] - mean;
      acc += d * d;
    }
    return { mean: mean, variance: acc / (length - 1) };
  }

  function kellyFraction(meanDaily, varianceDaily, scale) {
    if (!(varianceDaily > 0)) return 0;
    const full = meanDaily / varianceDaily;
    return Math.max(0, full * scale);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    let u = rng();
    const v = rng();
    if (u < 1e-12) u = 1e-12;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function generateSeries(config) {
    const opt = Object.assign({}, DEFAULTS, config || {});
    const days = Math.max(8, opt.days | 0);
    const crashSize = clamp(opt.crashSize, -0.9, -0.01);
    const crashLen = clamp(opt.crashDays | 0, 1, days - 2);
    let crashReturnStart = Math.floor(days * 0.45);
    if (crashReturnStart + crashLen > days) crashReturnStart = days - crashLen;
    if (crashReturnStart < 1) crashReturnStart = 1;
    const dailyCrash = Math.pow(1 + crashSize, 1 / crashLen);
    const dt = 1 / DAYS_PER_YEAR;
    const drift = (opt.mu - 0.5 * opt.sigma * opt.sigma) * dt;
    const vol = opt.sigma * Math.sqrt(dt);
    const rng = mulberry32(opt.seed);
    const prices = [opt.startPrice];
    for (let i = 0; i < days; i += 1) {
      const z = gaussian(rng);
      let next = prices[i] * Math.exp(drift + vol * z);
      if (i >= crashReturnStart && i < crashReturnStart + crashLen) next *= dailyCrash;
      if (!(next > 0) || !Number.isFinite(next)) next = prices[i];
      prices.push(next);
    }
    return {
      prices: prices,
      preIndex: crashReturnStart,
      postIndex: crashReturnStart + crashLen,
      crashSize: crashSize,
      crashDays: crashLen,
      seed: opt.seed >>> 0,
      mu: opt.mu,
      sigma: opt.sigma,
    };
  }

  function simulate(prices, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const n = prices.length;
    const buyHold = new Array(n);
    const protectedEq = new Array(n);
    const drawdownBuyHold = new Array(n);
    const drawdownProtected = new Array(n);
    const exposure = new Array(n);
    buyHold[0] = 1;
    protectedEq[0] = 1;
    drawdownBuyHold[0] = 0;
    drawdownProtected[0] = 0;
    exposure[0] = 1;

    let peakB = 1;
    let peakP = 1;
    let ewmaVar = null;
    let exposureNow = 1;
    let lastVol = 0;
    let lastKelly = null;
    const rets = [];

    for (let i = 1; i < n; i += 1) {
      const prev = prices[i - 1];
      const assetRet = prev > 0 ? prices[i] / prev - 1 : 0;
      const held = exposureNow;
      exposure[i] = held;
      buyHold[i] = buyHold[i - 1] * (1 + assetRet);
      let nextEq = protectedEq[i - 1] * (1 + held * assetRet);
      if (!(nextEq > 0) || !Number.isFinite(nextEq)) nextEq = 0;
      protectedEq[i] = nextEq;
      peakB = Math.max(peakB, buyHold[i]);
      if (protectedEq[i] >= peakP) peakP = protectedEq[i];
      drawdownBuyHold[i] = buyHold[i] / peakB - 1;
      drawdownProtected[i] = peakP > 0 ? protectedEq[i] / peakP - 1 : -1;

      ewmaVar = ewmaVarNext(ewmaVar, assetRet, opt.ewmaLambda);
      rets.push(assetRet);
      lastVol = annualVolFromVar(ewmaVar);

      let next = 1;
      if (opt.volTarget) next *= volTarget(opt.targetVol, Math.max(lastVol, 1e-6), opt.volCap);
      if (opt.drawdownBrake) {
        const dd = peakP > 0 ? 1 - protectedEq[i] / peakP : 1;
        if (dd >= opt.drawdownLimit) next *= opt.drawdownFloor;
      }
      if (opt.trend && i >= opt.trendLookback) {
        let sum = 0;
        const look = opt.trendLookback | 0;
        for (let k = i - look + 1; k <= i; k += 1) sum += prices[k];
        if (prices[i] < sum / look) next *= opt.trendFloor;
      }
      lastKelly = null;
      if (opt.kelly && rets.length >= opt.kellyWindow) {
        const stats = windowMeanVar(rets, rets.length, opt.kellyWindow | 0);
        lastKelly = kellyFraction(stats.mean, stats.variance, opt.kellyScale);
        next = Math.min(next, lastKelly);
      }
      next = Math.min(opt.volCap, Math.max(0, next));
      if (!Number.isFinite(next)) next = 0;
      exposureNow = next;
    }

    let exposureSum = 0;
    for (let i = 1; i < n; i += 1) exposureSum += exposure[i];
    return {
      buyHold: buyHold,
      protected: protectedEq,
      drawdownBuyHold: drawdownBuyHold,
      drawdownProtected: drawdownProtected,
      exposure: exposure,
      averageExposure: n > 1 ? exposureSum / (n - 1) : 1,
      lastExposure: exposureNow,
      lastVol: lastVol,
      lastKelly: lastKelly,
      buyHoldStats: summaryStats(buyHold),
      protectedStats: summaryStats(protectedEq),
    };
  }

  function formatPercent(x, digits) {
    if (x == null || !Number.isFinite(x)) return '—';
    const d = digits == null ? 1 : digits;
    const sign = x < 0 ? '−' : '';
    return sign + (Math.abs(x) * 100).toFixed(d) + '%';
  }

  function formatSignedPercent(x, digits) {
    if (x == null || !Number.isFinite(x)) return '—';
    const d = digits == null ? 1 : digits;
    const sign = x > 0 ? '+' : x < 0 ? '−' : '';
    return sign + (Math.abs(x) * 100).toFixed(d) + '%';
  }

  function formatRecovery(stats) {
    if (!stats) return '—';
    if (stats.maxDrawdown < 1e-8) return 'No drawdown';
    if (!stats.recovered || stats.recoveryDays == null) return 'Not regained';
    if (stats.recoveryDays === 0) return 'No drawdown';
    return stats.recoveryDays + (stats.recoveryDays === 1 ? ' day' : ' days');
  }

  function formatYears(years) {
    if (years == null || !Number.isFinite(years)) return '—';
    return (Math.round(years * 10) / 10).toFixed(1);
  }

  return {
    DAYS_PER_YEAR: DAYS_PER_YEAR,
    DEFAULTS: DEFAULTS,
    recoveryGain: recoveryGain,
    yearsToRecover: yearsToRecover,
    recoveryCurve: recoveryCurve,
    maxDrawdown: maxDrawdown,
    drawdownStats: drawdownStats,
    cagr: cagr,
    sharpeIsh: sharpeIsh,
    summaryStats: summaryStats,
    volTarget: volTarget,
    ewmaVarNext: ewmaVarNext,
    annualVolFromVar: annualVolFromVar,
    kellyFraction: kellyFraction,
    generateSeries: generateSeries,
    simulate: simulate,
    formatPercent: formatPercent,
    formatSignedPercent: formatSignedPercent,
    formatRecovery: formatRecovery,
    formatYears: formatYears,
    mulberry32: mulberry32,
    gaussian: gaussian,
  };
});
