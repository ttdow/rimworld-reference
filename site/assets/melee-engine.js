/* Wiki-based experimental model. See melee-model.md for the approximations. */
(function (root) {
  "use strict";
  const VERSION = "wiki-human-0.1.0";
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const DEFAULTS = Object.freeze({ skill: 10, manipulation: 1, sight: 1, skillOffset: 0, damageFactor: 1, cooldownFactor: 1, targetSkill: 8, targetSight: 1, targetMoving: 1, dodgeOffset: 0, healthScale: 1, painFactor: 1, painThreshold: 0.8, incomingFactor: 1, armor: "flak", trials: 1000, limit: 60, horizon: 10, seed: "colony-1" });
  const ranges = { skill: [0, 20], manipulation: [0.1, 2], sight: [0.1, 2], skillOffset: [-20, 20], damageFactor: [0.1, 5], cooldownFactor: [0.1, 5], targetSkill: [0, 20], targetSight: [0.1, 2], targetMoving: [0.2, 2], dodgeOffset: [-20, 30], healthScale: [0.1, 5], painFactor: [0, 3], painThreshold: [0.1, 2], incomingFactor: [0.1, 5], trials: [100, 10000], limit: [10, 300], horizon: [1, 300] };
  function normalizeConfig(input = {}) {
    const c = { ...DEFAULTS, ...input };
    for (const [key, [lo, hi]] of Object.entries(ranges)) {
      if (!Number.isFinite(Number(c[key])) || Number(c[key]) < lo || Number(c[key]) > hi) throw Error(`${key} must be between ${lo} and ${hi}.`);
      c[key] = Number(c[key]);
    }
    if (!Number.isInteger(c.trials)) throw Error("Trials must be a whole number.");
    if (c.horizon > c.limit) throw Error("The probability horizon must not exceed the time limit.");
    if (!["none", "flak", "marine"].includes(c.armor)) throw Error("Unknown armor preset.");
    c.seed = String(c.seed).trim();
    if (!c.seed || c.seed.length > 100) throw Error("Enter a seed with 1–100 characters.");
    return c;
  }
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function random(seed) {
    let a = seed >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function interpolate(x, points) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) if (x <= points[i][0]) {
      const [a, b] = points[i - 1], [c, d] = points[i]; return b + (d - b) * (x - a) / (c - a);
    }
    return points.at(-1)[1];
  }
  function hitChance(c) {
    const score = c.skill + 12 * (Math.min(1.5, c.manipulation) - 1) + 12 * (Math.min(1.5, c.sight) - 1) + c.skillOffset;
    return interpolate(score, [[-20, .05], [-10, .1], [0, .5], [10, .8], [20, .9], [40, .96], [60, .98]]);
  }
  function dodgeChance(c, moving = c.targetMoving, sight = c.targetSight) {
    const score = c.targetSkill + 18 * (moving - 1) + 8 * (Math.min(1.4, sight) - 1) + c.dodgeOffset;
    return interpolate(score, [[5, 0], [20, .3], [60, .5]]);
  }
  const NATURAL = [
    { name: "Left fist", type: "Blunt", damage: 8.2, cooldown: 2, ap: .12 },
    { name: "Right fist", type: "Blunt", damage: 8.2, cooldown: 2, ap: .12 },
    { name: "Teeth", type: "Bite", damage: 8.2, cooldown: 2, ap: .12, chanceFactor: .07 },
    { name: "Head", type: "Blunt", damage: 5, cooldown: 2, ap: .075, chanceFactor: .2 }
  ];
  const UNARMED = { id: "Unarmed|None|Fixed", weapon: "Unarmed human", quality: "Fixed", material: "None", dlc: [], attacks: [], special: "", source: "https://rimworldwiki.com/wiki/Weapons#Melee_combat" };
  function attacksFor(variant, c) {
    const attacks = [...variant.attacks, ...NATURAL].map(a => {
      const damage = a.damage * c.damageFactor, ap = a.ap * (a.fixedAP ? 1 : c.damageFactor), cooldown = a.cooldown * c.cooldownFactor;
      return { ...a, damage, ap, cooldown, score: damage * (1 + ap) * (a.chanceFactor ?? 1) / cooldown };
    });
    const max = Math.max(...attacks.map(a => a.score));
    const best = attacks.filter(a => a.score >= .95 * max), mid = attacks.filter(a => a.score < .95 * max && a.score >= .25 * max);
    return attacks.map(a => ({ ...a, category: best.includes(a) ? "Best" : mid.includes(a) ? "Mid" : "Worst", probability: best.includes(a) ? (mid.length ? .75 : 1) / best.length : mid.includes(a) ? .25 / mid.length : 0 }));
  }
  function weighted(items, weight, rng) {
    let total = 0;
    for (const item of items) total += weight(item);
    if (total <= 0) return null;
    let x = rng() * total;
    for (const item of items) { x -= weight(item); if (x < 0) return item; }
    return items.at(-1);
  }
  function buildBody(data) {
    const parts = [], names = {};
    for (const source of data.body) {
      names[source.name] = [];
      for (let side = 0; side < source.count; side++) {
        const part = { ...source, index: parts.length, side, label: (source.count === 2 ? (side ? "Right " : "Left ") : "") + source.name, children: [] };
        names[source.name].push(part.index); parts.push(part);
      }
    }
    for (const part of parts) {
      const parents = names[part.parent];
      part.parentIndex = parents ? parents[Math.min(part.side, parents.length - 1)] : -1;
      if (part.parentIndex >= 0) parts[part.parentIndex].children.push(part.index);
      part.solid = part.internal && part.name !== "Tongue" && /Skull|Ribcage|Sternum|Clavicle|Humerus|Radius|Pelvis|Femur|Tibia|Spine/.test(part.name);
    }
    return { parts, names };
  }
  function armorPieces(data, preset) {
    const ids = preset === "flak" ? ["Flak_vest", "Simple_helmet", "Button-down_shirt", "Pants"] : preset === "marine" ? ["Marine_armor", "Marine_helmet", "Button-down_shirt", "Pants"] : [];
    return ids.map(id => data.armor[id]).sort((a, b) => b.layer - a.layer);
  }
  function resolveArmor(damage, type, ap, armor, rng) {
    let category = ["Blunt", "Poke", "Demolish"].includes(type) ? "blunt" : type === "Burn" ? "heat" : "sharp";
    for (const item of armor) {
      const effective = Math.max(0, item[category] - ap), roll = rng();
      if (roll < effective / 2) return { damage: 0, type, blocked: true };
      if (roll < effective) {
        damage *= .5;
        if (category === "sharp") { type = "Blunt"; category = "blunt"; }
      }
    }
    return { damage, type, blocked: false };
  }
  function createContext(data, c, variant) {
    const body = buildBody(data), armor = armorPieces(data, c.armor);
    // A piece is tested once even if it occupies more than one layer.
    const protection = body.parts.map(p => armor.filter(a => a.groups.some(g => p.groups.includes(g))));
    return { data, c, variant, ...body, protection, attacks: attacksFor(variant, c).filter(a => a.probability > 0), hit: hitChance(c) };
  }
  function createState(ctx) {
    return { hp: Float64Array.from(ctx.parts, p => p.hp * ctx.c.healthScale), pain: new Float64Array(ctx.parts.length), missing: new Uint8Array(ctx.parts.length) };
  }
  function efficiency(ctx, state, name, side) {
    const indices = ctx.names[name] || [];
    const values = indices.filter(i => side === undefined || ctx.parts[i].side === side).map(i => state.missing[i] ? 0 : state.hp[i] / (ctx.parts[i].hp * ctx.c.healthScale));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1;
  }
  function capacities(ctx, state) {
    const e = (n, s) => efficiency(ctx, state, n, s);
    const heart = e("Heart"), breathing = e("Lung") * (1 - .5 * (1 - e("Ribcage"))), filtration = (e("Liver") + e("Kidney")) / 2;
    const pain = clamp(state.pain.reduce((a, b) => a + b, 0) / ctx.c.healthScale * ctx.c.painFactor);
    const consciousness = clamp(e("Brain") * (1 - .2 * (1 - heart)) * (1 - .2 * (1 - breathing)) * (1 - .1 * (1 - filtration)) - Math.max(0, (pain - .1) / 2.25));
    let toes = 0;
    for (const n of ["Little Toe", "Fourth Toe", "Middle Toe", "Second Toe", "Big Toe"]) toes += e(n) * 2;
    const legs = e("Leg") * e("Tibia") * e("Femur") * e("Foot") * (.6 + .04 * toes) * e("Pelvis") * e("Spine");
    const moving = ctx.c.targetMoving * consciousness * (1 - .2 * (1 - heart)) * (1 - .2 * (1 - breathing)) * legs;
    const sight = ctx.c.targetSight * (.75 * Math.max(e("Eye", 0), e("Eye", 1)) + .25 * Math.min(e("Eye", 0), e("Eye", 1)));
    const dead = ["Torso", "Neck", "Head", "Brain", "Heart", "Liver"].some(n => e(n) <= 0) || e("Lung") <= 0 || e("Kidney") <= 0 || consciousness <= 0;
    const reason = dead ? "dead" : pain >= ctx.c.painThreshold ? "pain shock" : consciousness < .3 ? "unconscious" : moving <= .15 ? "unable to walk" : "standing";
    return { pain, consciousness, moving, sight, dead, reason, incapacitated: reason !== "standing" };
  }
  function destroy(ctx, state, index) {
    state.missing[index] = 1; state.hp[index] = 0;
    for (const child of ctx.parts[index].children) {
      state.pain[child] = 0;
      destroy(ctx, state, child);
    }
  }
  function injure(ctx, state, index, damage, type, rng, injuries, depth = 0) {
    if (index < 0 || state.missing[index] || damage <= 0 || depth > 8) return;
    const part = ctx.parts[index], old = state.hp[index], max = part.hp * ctx.c.healthScale;
    let actual = Math.min(old, damage), lost = false;
    if (damage >= old) {
      const low = ["Cut", "Scratch", "Bite"].includes(type) ? 0 : .4;
      const high = ["Cut", "Bite"].includes(type) ? .1 : type === "Scratch" ? .7 : 1;
      const chance = clamp(((damage - old) / max - low) / (high - low));
      lost = !part.indestructible && rng() < chance;
      if (!lost) actual = Math.max(0, old - Math.min(1, max));
    }
    state.hp[index] = Math.max(0, old - actual);
    state.pain[index] += actual * (type === "Burn" ? .01875 : .0125);
    if (lost) {
      // Missing-part pain is approximated by one full-HP fresh injury.
      state.pain[index] = max * .0125;
      destroy(ctx, state, index);
    }
    if (injuries) injuries.push({ part: part.label, damage: +actual.toFixed(2), type, destroyed: lost });
    if (lost && ["Blunt", "Poke", "Demolish"].includes(type) && part.parentIndex >= 0 && !ctx.parts[part.parentIndex].internal) {
      injure(ctx, state, part.parentIndex, Math.max(0, damage - old), type, rng, injuries, depth + 1);
    }
  }
  function pickPart(ctx, state, rng, mode = "all", noBrain = false, noEyes = false) {
    return weighted(ctx.parts, p => state.missing[p.index] || (mode === "external" && p.internal) || (noBrain && p.name === "Brain") || (noEyes && p.name === "Eye") ? 0 : p.coverage, rng);
  }
  function neighbors(ctx, state, index) {
    const p = ctx.parts[index], candidates = [p.parentIndex, ...p.children];
    return candidates.filter(i => i >= 0 && !state.missing[i]);
  }
  function containedInternal(ctx, state, index) {
    return ctx.parts[index].children.flatMap(i => {
      const p = ctx.parts[i];
      return !p.internal || state.missing[i] ? [] : [p, ...containedInternal(ctx, state, i)];
    });
  }
  function strike(ctx, state, attack, rng, injuries) {
    const blunt = ["Blunt", "Demolish"].includes(attack.type), piercing = ["Stab", "Poke"].includes(attack.type);
    let count = 1;
    if (attack.type === "Cut") { const r = rng(); count = r < .3 ? 1 : r < .75 ? 2 : r < .95 ? 3 : 4; }
    let part = pickPart(ctx, state, rng, blunt || attack.type === "Scratch" || attack.type === "Burn" || (attack.type === "Cut" && count === 1) ? "external" : "all", piercing, blunt);
    if (!part) return false;
    if (piercing && !part.internal && rng() < (attack.type === "Stab" ? .6 : .4)) {
      const inside = part.children.map(i => ctx.parts[i]).filter(p => p.internal && p.name !== "Brain" && !state.missing[p.index]);
      part = weighted(inside, p => p.coverage, rng) || part;
    }
    const rolled = attack.damage * (.8 + .4 * rng()) * ctx.c.incomingFactor;
    const armor = resolveArmor(rolled, attack.type, attack.ap, ctx.protection[part.index], rng);
    if (armor.damage <= 0) return false;
    const amount = armor.damage, type = armor.type;
    if (["Blunt", "Demolish"].includes(type)) {
      let external = part;
      while (external.internal && external.parentIndex >= 0) external = ctx.parts[external.parentIndex];
      const internal = !external.solid && rng() < .4 ? weighted(containedInternal(ctx, state, external.index), p => p.coverage, rng) : null;
      if (internal) {
        const share = .1 + .1 * rng();
        injure(ctx, state, external.index, amount * (1 - share), type, rng, injuries);
        injure(ctx, state, internal.index, amount * (share + .2 + .15 * rng()), type, rng, injuries);
      } else injure(ctx, state, external.index, amount, type, rng, injuries);
    } else if (["Stab", "Poke"].includes(type) && part.internal) {
      let index = part.index;
      while (index >= 0 && ctx.parts[index].internal) {
        injure(ctx, state, index, amount * .4, type, rng, injuries);
        index = ctx.parts[index].parentIndex;
      }
      if (index >= 0) injure(ctx, state, index, amount * .75, type, rng, injuries);
    } else if (type === "Cut") {
      const targets = [part.index];
      while (targets.length < count) {
        const adjacent = [...new Set(targets.flatMap(i => neighbors(ctx, state, i)))].filter(i => !targets.includes(i));
        const next = weighted(adjacent, i => ctx.parts[i].coverage, rng);
        if (next === null) break;
        targets.push(next);
      }
      const each = targets.length === 1 ? amount : amount * 2.4 / (targets.length + 1.4);
      for (const i of targets) {
        injure(ctx, state, i, each, type, rng, injuries);
        let parent = ctx.parts[i].parentIndex;
        // Internal layer propagation stops at bones or an already selected parent.
        while (ctx.parts[i].internal && parent >= 0 && !targets.includes(parent) && !ctx.parts[parent].solid) {
          injure(ctx, state, parent, each, type, rng, injuries);
          if (!ctx.parts[parent].internal) break;
          parent = ctx.parts[parent].parentIndex;
        }
      }
    } else if (type === "Scratch") {
      const parent = part.parentIndex;
      const pool = [...new Set([part.index, ...neighbors(ctx, state, part.index), ...(parent >= 0 ? ctx.parts[parent].children : [])])].filter(i => !state.missing[i]);
      for (let j = 0; j < 2 && pool.length; j++) {
        const i = weighted(pool, () => 1, rng); pool.splice(pool.indexOf(i), 1);
        injure(ctx, state, i, amount * .67, type, rng, injuries);
      }
    } else injure(ctx, state, part.index, amount, type, rng, injuries);
    return true;
  }
  function simulateTrial(ctx, trial, record = false) {
    // Independent per-variant/per-trial streams: filtering/order/trial count never changes earlier trials.
    const rng = random(hash(`${ctx.c.seed}\u001f${ctx.variant.id}\u001f${trial}`));
    const state = createState(ctx), log = record ? [] : null;
    let time = 0, swings = 0, cap = capacities(ctx, state);
    if (cap.incapacitated) return { time: 0, dead: cap.dead, reason: cap.reason, swings, log };
    while (time <= ctx.c.limit + 1e-9) {
      const attack = weighted(ctx.attacks, a => a.probability, rng);
      const injuries = record ? [] : null;
      let outcome = "miss";
      swings++;
      if (rng() < ctx.hit) {
        if (rng() < dodgeChance(ctx.c, cap.moving, cap.sight)) outcome = "dodged";
        else {
          outcome = strike(ctx, state, attack, rng, injuries) ? "hit" : "blocked";
          if (outcome === "hit" && ctx.variant.special === "plasma" && ["Cut", "Stab"].includes(attack.type) && rng() < .5) {
            strike(ctx, state, { type: "Burn", damage: 10, ap: 0 }, rng, injuries);
          }
        }
      }
      cap = capacities(ctx, state);
      if (log && log.length < 500) log.push({ time: +time.toFixed(3), attack: attack.name, outcome, injuries, pain: cap.pain, moving: cap.moving, consciousness: cap.consciousness });
      if (cap.incapacitated) return { time, dead: cap.dead, reason: cap.reason, swings, log };
      time += attack.cooldown;
    }
    return { time: null, dead: false, reason: "time limit", swings, log };
  }
  function wilson(success, n) {
    const z = 1.95996398454, p = success / n, denom = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / denom, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom;
    return [clamp(center - half), clamp(center + half)];
  }
  const rankCache = new Map();
  function medianRanks(n) {
    if (rankCache.has(n)) return rankCache.get(n);
    // Binomial probabilities scaled about the mode avoid underflow at large n.
    const p = new Float64Array(n + 1), mid = Math.floor(n / 2); p[mid] = 1;
    for (let i = mid; i > 0; i--) p[i - 1] = p[i] * i / (n - i + 1);
    for (let i = mid; i < n; i++) p[i + 1] = p[i] * (n - i) / (i + 1);
    const total = p.reduce((a, b) => a + b, 0); let tail = 0, k = 0;
    while (k <= mid && tail + p[k] / total <= .025) { tail += p[k] / total; k++; }
    const ranks = [k - 1, n - k]; rankCache.set(n, ranks); return ranks;
  }
  function summarize(times, deaths, horizon, limit) {
    const sorted = times.map(t => t === null ? Infinity : t).sort((a, b) => a - b), n = sorted.length;
    if (!n) throw Error("Cannot summarize an empty run.");
    const at = i => i < 0 ? 0 : i >= n || !Number.isFinite(sorted[i]) ? null : sorted[i];
    const q = p => at(Math.max(0, Math.ceil(n * p) - 1)), ranks = medianRanks(n);
    const events = times.filter(t => t !== null).length, byHorizon = times.filter(t => t !== null && t <= horizon).length;
    return { n, events, censored: n - events, median: q(.5), p10: q(.1), p90: q(.9), medianCI: ranks.map(at), incapacitation: events / n, incapacitationCI: wilson(events, n), byHorizon: byHorizon / n, horizonCI: wilson(byHorizon, n), deathFraction: deaths / n, deathCI: wilson(deaths, n), horizon, limit };
  }
  function runVariant(data, variant, input, count) {
    const c = normalizeConfig(input), ctx = createContext(data, c, variant), times = []; let deaths = 0;
    for (let trial = 0; trial < (count ?? c.trials); trial++) { const result = simulateTrial(ctx, trial); times.push(result.time); deaths += result.dead ? 1 : 0; }
    return { id: variant.id, times, stats: summarize(times, deaths, c.horizon, c.limit) };
  }
  const api = { VERSION, DEFAULTS, UNARMED, normalizeConfig, random, hash, hitChance, dodgeChance, attacksFor, buildBody, armorPieces, resolveArmor, createContext, createState, capacities, injure, strike, simulateTrial, summarize, wilson, medianRanks, runVariant };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RIMWORLD_MELEE = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
