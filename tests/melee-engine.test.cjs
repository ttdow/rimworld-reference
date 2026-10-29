"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const E = require("../site/assets/melee-engine.js");
const D = require("../site/assets/melee-data.js");
const config = input => E.normalizeConfig(input);
const find = (weapon, material = "Steel", quality = "Normal") => {
  const v = D.variants.find(v => v.weapon === weapon && v.material === material && v.quality === quality);
  assert.ok(v, `${weapon} ${material} ${quality}`); return v;
};
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} should equal ${b}`);

test("wiki snapshot has unique, legal variants, source revisions and a complete weighted human body", () => {
  assert.equal(D.variants.length, 567);
  assert.equal(new Set(D.variants.map(v => v.id)).size, 567);
  assert.equal(new Set(D.variants.map(v => v.weapon)).size, 24);
  const body = E.buildBody(D);
  assert.equal(body.parts.length, 63);
  near(body.parts.reduce((n, p) => n + p.coverage, 0), 1, .00001);
  assert.equal(body.parts[body.names.Foot[1]].parentIndex, body.names.Leg[1]);
  assert.equal(body.parts[body.names.Brain[0]].parentIndex, body.names.Skull[0]);
  assert.ok(D.sources.every(s => s.revision > 0 && s.snapshotUrl.endsWith("oldid=" + s.revision)));
  assert.deepEqual(find("Longsword").dlc, []);
  assert.deepEqual(find("Longsword", "Bioferrite").dlc, ["Anomaly"]);
  assert.deepEqual(find("Axe").dlc, ["Royalty"]);
  assert.ok(!D.variants.some(v => v.weapon === "Club" && v.quality !== "Fixed"));
  assert.ok(!D.variants.some(v => v.weapon === "Knife" && v.material === "Wood"));
  assert.deepEqual(D.variants.find(v => v.material === "Vacstone blocks").dlc, ["Odyssey"]);
});

test("hit and dodge curves match independent wiki anchor examples and impairment", () => {
  near(E.hitChance(config({ skill: 0 })), .5);
  near(E.hitChance(config({ skill: 10 })), .8);
  near(E.hitChance(config({ skill: 20 })), .9);
  near(E.hitChance(config({ skill: 0, manipulation: .5, sight: .5 })), .09);
  near(E.hitChance(config({ skill: 10, manipulation: 2 })), E.hitChance(config({ skill: 10, manipulation: 1.5 })));
  near(E.dodgeChance(config({ targetSkill: 5 })), 0);
  near(E.dodgeChance(config({ targetSkill: 20 })), .3);
  near(E.dodgeChance(config({ targetSkill: 10, dodgeOffset: 15 })), .325);
  near(E.dodgeChance(config({ targetSkill: 10 }), .5, 1), 0);
});

test("longsword selection reproduces the wiki mix including two fists; exceptional AP stays fixed", () => {
  const attacks = E.attacksFor(find("Longsword"), config());
  near(attacks.find(a => a.name === "Point").probability, .375);
  near(attacks.find(a => a.name === "Blade").probability, .375);
  near(attacks.find(a => a.name === "Handle").probability, 1 / 12);
  near(attacks.find(a => a.name === "Left fist").probability, 1 / 12);
  near(attacks.reduce((p, a) => p + a.probability, 0), 1);
  const spear = find("Spear");
  const scaled = E.attacksFor(spear, config({ damageFactor: 2 }));
  near(scaled.find(a => a.type === "Stab").ap, spear.attacks.find(a => a.type === "Stab").ap);
  near(scaled.find(a => a.type === "Poke").ap, spear.attacks.find(a => a.type === "Poke").ap * 2);
  for (const v of D.variants) near(E.attacksFor(v, config()).reduce((p, a) => p + a.probability, 0), 1);
});

test("armor blocks, halves and converts damage; penetration subtracts; inner layers use converted category", () => {
  const gear = [{ sharp: 1, blunt: .2, heat: .5 }];
  assert.equal(E.resolveArmor(20, "Cut", .2, gear, () => .39).damage, 0);
  assert.deepEqual(E.resolveArmor(20, "Cut", .2, gear, () => .6), { damage: 10, type: "Blunt", blocked: false });
  assert.equal(E.resolveArmor(20, "Cut", .2, gear, () => .81).damage, 20);
  assert.equal(E.resolveArmor(20, "Cut", 1.5, gear, () => 0).damage, 20);
  const rolls = [.6, .2];
  const layers = [{ sharp: 1, blunt: 0 }, { sharp: 1, blunt: .5 }];
  assert.equal(E.resolveArmor(20, "Cut", 0, layers, () => rolls.shift()).damage, 0);
  const rolls2 = [.6, .3];
  assert.equal(E.resolveArmor(20, "Cut", 0, layers, () => rolls2.shift()).damage, 5);
});

test("armor frequencies agree with analytic 40% block, 40% half, 20% full at 80% effective armor", () => {
  const rng = E.random(31415), n = 100000; let blocked = 0, half = 0, full = 0;
  for (let i = 0; i < n; i++) {
    const r = E.resolveArmor(20, "Cut", .2, [{ sharp: 1, blunt: 0 }], rng);
    if (!r.damage) blocked++; else if (r.damage === 10) half++; else full++;
  }
  near(blocked / n, .4, .005); near(half / n, .4, .005); near(full / n, .2, .005);
});

test("preset coverage leaves hands, feet and the simple helmet face exposed, and tests marine armor once", () => {
  const flak = E.createContext(D, config(), find("Mace"));
  assert.deepEqual(flak.protection[flak.names.Torso[0]].map(g => g.name), ["Flak vest", "Cloth Button-down shirt"]);
  assert.deepEqual(flak.protection[flak.names.Eye[0]], []);
  assert.deepEqual(flak.protection[flak.names.Hand[0]], []);
  assert.deepEqual(flak.protection[flak.names.Foot[0]], []);
  const marine = E.createContext(D, config({ armor: "marine" }), find("Mace"));
  assert.equal(marine.protection[marine.names.Arm[0]].filter(g => g.name === "Marine armor").length, 1);
  assert.equal(marine.protection[marine.names.Eye[0]][0].name, "Marine helmet");
});

test("body injuries reduce capacities and can cause pain shock, downing, or organ death", () => {
  const ctx = E.createContext(D, config({ armor: "none" }), find("Mace")), state = E.createState(ctx);
  near(E.capacities(ctx, state).moving, 1);
  near(E.capacities(ctx, state).consciousness, 1);
  state.hp[ctx.names.Brain[0]] = 2;
  assert.equal(E.capacities(ctx, state).reason, "unconscious");
  state.hp[ctx.names.Brain[0]] = 10;
  state.hp[ctx.names.Spine[0]] = 0;
  assert.equal(E.capacities(ctx, state).reason, "unable to walk");
  state.hp[ctx.names.Spine[0]] = 25;
  state.pain[0] = .8;
  assert.equal(E.capacities(ctx, state).reason, "pain shock");
  state.pain[0] = 0;
  state.hp[ctx.names.Heart[0]] = 0;
  assert.equal(E.capacities(ctx, state).dead, true);
});

test("overkill prevention, indestructible bones, subtree removal and blunt carry preserve valid health", () => {
  const ctx = E.createContext(D, config({ armor: "none" }), find("Mace")), state = E.createState(ctx);
  const arm = ctx.names.Arm[0], shoulder = ctx.names.Shoulder[0], skull = ctx.names.Skull[0];
  E.injure(ctx, state, arm, 30, "Blunt", () => 0, null);
  assert.equal(state.hp[arm], 1);  // zero overkill: cannot destroy
  state.pain[ctx.names.Hand[0]] = .1;
  E.injure(ctx, state, arm, 40, "Blunt", () => 0, null);
  assert.equal(state.missing[arm], 1);
  assert.equal(state.missing[ctx.names.Hand[0]], 1);
  assert.equal(state.missing[ctx.names.Hand[1]], 0);
  assert.equal(state.pain[ctx.names.Hand[0]], 0);
  assert.ok(state.hp[shoulder] < 30);
  E.injure(ctx, state, skull, 100, "Cut", () => 0, null);
  assert.equal(state.hp[skull], 1);
  assert.equal(state.missing[skull], 0);
});

test("right-censored trials stay in quantiles and probabilities; median is not success-only", () => {
  const s = E.summarize([2, 4, null, null, null], 1, 3, 60);
  assert.equal(s.median, null); assert.equal(s.p10, 2); assert.equal(s.p90, null);
  assert.equal(s.byHorizon, .2); assert.equal(s.deathFraction, .2); assert.equal(s.censored, 3);
  assert.equal(E.summarize([0, 1, null, null], 0, 1, 60).median, 1);
  assert.equal(E.summarize(Array(100).fill(null), 0, 10, 60).medianCI[1], null);
  const ci = E.wilson(0, 100); near(ci[0], 0); near(ci[1], .03699, .0001);
  assert.deepEqual(E.medianRanks(100), [39, 60]);
});

test("same seed reproduces prefixes across trial count, filtering, order, and log collection", () => {
  const a = find("Longsword"), b = find("Mace"), c = config({ trials: 100 });
  const first = E.runVariant(D, a, c);
  E.runVariant(D, b, c);
  const second = E.runVariant(D, a, { ...c, trials: 200 });
  assert.deepEqual(first.times, second.times.slice(0, 100));
  const ctx = E.createContext(D, c, a);
  const logged = E.simulateTrial(ctx, 0, true), plain = E.simulateTrial(ctx, 0);
  assert.equal(logged.time, plain.time); assert.equal(logged.dead, plain.dead);
  assert.equal(logged.time, first.times[0]);
  assert.notDeepEqual(first.times, E.runVariant(D, a, { ...c, seed: "another-seed" }).times);
});

test("every variant completes a short run with finite times in bounds, or explicit censoring", () => {
  for (const v of [...D.variants, E.UNARMED]) {
    const r = E.runVariant(D, v, { trials: 100, limit: 10 });
    assert.ok(r.times.every(t => t === null || Number.isFinite(t) && t >= 0 && t <= 10 + 1e-9), v.id);
    assert.equal(r.stats.n, 100);
    assert.ok(r.stats.median === null || r.stats.p10 <= r.stats.median);
  }
});

test("invalid settings fail before expensive simulation", () => {
  assert.throws(() => config({ healthScale: 0 }), /healthScale/);
  assert.throws(() => config({ trials: 100.5 }), /whole number/);
  assert.throws(() => config({ horizon: 61, limit: 60 }), /horizon/);
  assert.throws(() => config({ seed: " " }), /seed/);
  assert.throws(() => config({ skill: NaN }), /skill/);
});

test("stab routes 40% inward and 75% outward; cut splits across adjacent parts; scratch deals two 67% hits", () => {
  const fixture = { body: [
    { name: "Torso", hp: 200, count: 1, coverage: .5, parent: "", internal: false, groups: [] },
    { name: "Heart", hp: 200, count: 1, coverage: .4, parent: "Torso", internal: true, groups: [] },
    { name: "Brain", hp: 200, count: 1, coverage: .1, parent: "Heart", internal: true, groups: [] }
  ], armor: {} };
  const ctx = E.createContext(fixture, config({ armor: "none" }), E.UNARMED);
  let state = E.createState(ctx), rolls = [.8, .5];
  E.strike(ctx, state, { type: "Stab", damage: 100, ap: 0 }, () => rolls.shift(), null);
  near(state.hp[1], 160); near(state.hp[0], 125); near(state.hp[2], 200);
  state = E.createState(ctx); rolls = [.4, .6, .5, 0];
  E.strike(ctx, state, { type: "Cut", damage: 100, ap: 0 }, () => rolls.shift(), null);
  near(state.hp[0], 200 - 100 * 2.4 / 3.4); near(state.hp[1], state.hp[0]);
  state = E.createState(ctx); rolls = [.1, .5, 0, 0];
  E.strike(ctx, state, { type: "Scratch", damage: 100, ap: 0 }, () => rolls.shift(), null);
  near(state.hp[0], 133); near(state.hp[1], 133);
});

test("simulation clock and event rates match an analytic geometric one-hit target", () => {
  const fixture = { body: [{ name: "Torso", hp: 1, count: 1, coverage: 1, parent: "", internal: false, groups: [] }], armor: {} };
  const r = E.runVariant(fixture, E.UNARMED, { armor: "none", skill: 0, targetSkill: 0, trials: 10000, horizon: 2, limit: 10 });
  const firstSwing = r.times.filter(t => t === 0).length / r.stats.n;
  near(firstSwing, .5, .015);
  near(r.stats.byHorizon, .75, .015);
  near(r.stats.incapacitation, 1 - .5 ** 6, .01);
  assert.ok(r.times.every(t => t === null || [0, 2, 4, 6, 8, 10].includes(t)));
});
