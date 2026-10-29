/* DOM/controller integration test, without browser rendering.
 * Optional: npm install --no-save jsdom@30.1.3
 * node tests/melee-ui.cjs [path/to/jsdom]
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Worker: NodeWorker } = require("node:worker_threads");
const { JSDOM } = require(process.argv[2] ? path.resolve(process.argv[2]) : "jsdom");
const E = require("../site/assets/melee-engine.js"), D = require("../site/assets/melee-data.js");
const assets = path.resolve(__dirname, "../site/assets");
class WorkerBridge {
  constructor() {
    const code = `const {parentPort}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const browser={postMessage:data=>parentPort.postMessage(data)};browser.self=browser;const context=vm.createContext(browser);browser.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.resolve(${JSON.stringify(assets)},f),'utf8'),context));vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(assets, "melee-worker.js"))},'utf8'),context);parentPort.on('message',data=>browser.onmessage({data}));`;
    this.worker = new NodeWorker(code, { eval: true });
    this.worker.on("message", data => this.onmessage?.({ data }));
    this.worker.on("error", error => this.onerror?.({ message: error.message, preventDefault() {} }));
  }
  postMessage(data) { this.worker.postMessage(data); }
  terminate() { this.worker.terminate(); }
}
function setup(Worker) {
  const dom = new JSDOM(fs.readFileSync(path.join(assets, "../melee.html"), "utf8"), { url: "https://example.test/rimworld-reference/melee.html", runScripts: "outside-only" });
  const w = dom.window, $ = id => w.document.getElementById(id);
  w.Worker = Worker;
  let blob, filename;
  w.Blob = Blob;
  w.URL.createObjectURL = value => { blob = value; return "blob:test"; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  ["melee-data.js", "melee-engine.js", "melee-app.js"].forEach(f => w.eval(fs.readFileSync(path.join(assets, f), "utf8")));
  const pick = (key, values) => {
    $(key + "-picker").open = true;
    if (values === "all") $(key + "-all").click();
    else {
      $(key + "-clear").click();
      for (const value of values) {
        const input = [...$(key + "-options").querySelectorAll("input")].find(input => input.value === value);
        assert.ok(input, `Missing ${key} option: ${value}`); input.click();
      }
    }
  };
  const change = (key, value) => {
    const selector = { weapon: "weapons", quality: "qualities", material: "materials" }[key];
    if (selector) { pick(selector, value === "" || value === "all" ? "all" : Array.isArray(value) ? value : [value]); return; }
    if (typeof value === "boolean") $(key).checked = value; else $(key).value = value;
    $(key).dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  const submit = () => $("sim-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  const json = async () => { $("export-json").click(); assert.equal(filename, "rimworld-melee-run.json"); return JSON.parse(await blob.text()); };
  return { dom, w, $, change, pick, submit, json, blob: () => blob, filename: () => filename };
}
async function until(test, timeout = 10000) {
  const start = Date.now();
  while (!test()) { if (Date.now() - start > timeout) throw Error("UI condition timed out"); await new Promise(r => setTimeout(r, 10)); }
}
async function exercise(Worker) {
  const h = setup(Worker), { w, $, change, submit } = h;
  assert.match($("pool-count").textContent, /100 variations/);
  assert.equal($("weapons-options").querySelectorAll("input:checked").length, 24);
  assert.equal($("qualities-summary").textContent, "Normal, Fixed");
  $("weapons-picker").open = true;
  const weaponInput = $("weapons-options").querySelector("input");
  weaponInput.focus(); weaponInput.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal($("weapons-picker").open, false);
  assert.equal(w.document.activeElement, $("weapons-picker").querySelector("summary"));
  $("weapons-picker").open = true; $("materials-picker").querySelector("summary").click();
  assert.equal($("weapons-picker").open, false);
  assert.equal($("materials-picker").open, true);
  $("materials-picker").querySelector("summary").click();
  assert.equal($("source-list").children.length, D.sources.length);
  const ids = [...w.document.querySelectorAll("[id]")].map(e => e.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const label of w.document.querySelectorAll("label")) assert.ok(label.control, label.outerHTML);
  change("unarmed", false); change("weapon", "Monosword"); change("dlc-Royalty", false);
  assert.match($("pool-count").textContent, /^0 variations/);
  change("dlc-Royalty", true); change("weapon", "Longsword"); change("material", "Bioferrite"); change("dlc-Anomaly", false);
  assert.match($("pool-count").textContent, /^0 variations/);
  change("dlc-Anomaly", true); change("weapon", "Club"); change("material", "Vacstone blocks"); change("dlc-Odyssey", false);
  assert.match($("pool-count").textContent, /^0 variations/);
  change("dlc-Odyssey", true);
  assert.match($("pool-count").textContent, /^1 variations/);
  $("theme-toggle").click(); assert.equal(w.document.documentElement.dataset.theme, "light");
  change("weapon", "Longsword"); change("material", "Steel"); change("unarmed", false); change("trials", 100); change("seed", "=1+2");
  submit(); assert.equal($("settings").disabled, true);
  assert.equal($("weapons-picker").open, false);
  assert.equal($("qualities-clear").matches(":disabled"), true);
  await until(() => $("run-badge").textContent === "COMPLETE");
  assert.equal($("settings").disabled, false);
  assert.equal($("results-body").children.length, 1);
  assert.equal($("variant-detail").hidden, false);
  assert.ok($("distribution").querySelector(".chart-line"));
  assert.ok($("example-log").children.length);
  const exported = await h.json();
  assert.equal(exported.modelVersion, E.VERSION);
  assert.equal(exported.config.seed, "=1+2");
  const expected = E.runVariant(D, D.variants.find(v => v.id === "Longsword|Steel|Normal"), exported.config);
  assert.deepEqual(exported.completedVariants[0].times, expected.times);
  assert.deepEqual(exported.completedVariants[0].stats, expected.stats);
  $("export-csv").click();
  assert.equal(h.filename(), "rimworld-melee-comparison.csv");
  assert.match(await h.blob().text(), /"'=1\+2"/);

  // Select two weapons, two qualities and two materials: exactly their eight legal combinations.
  change("weapon", ["Mace", "Longsword"]); change("quality", ["Normal", "Legendary"]); change("material", ["Steel", "Uranium"]);
  assert.match($("pool-count").textContent, /^8 variations/);
  assert.equal($("materials-summary").textContent, "Steel, Uranium");
  submit(); await until(() => $("run-badge").textContent === "COMPLETE");
  const subset = await h.json(), expectedIds = [];
  for (const weapon of ["Mace", "Longsword"]) for (const material of ["Steel", "Uranium"]) for (const quality of ["Normal", "Legendary"]) expectedIds.push(`${weapon}|${material}|${quality}`);
  assert.deepEqual([...subset.requestedVariantIds].sort(), expectedIds.sort());
  assert.deepEqual(subset.completedVariants.map(r => r.id).sort(), expectedIds);
  assert.deepEqual(subset.selection.weapons, ["Longsword", "Mace"]);
  assert.deepEqual(subset.selection.qualities, ["Normal", "Legendary"]);
  assert.deepEqual(subset.selection.materials, ["Steel", "Uranium"]);
  $("export-csv").click(); const subsetCsv = await h.blob().text();
  assert.equal(subsetCsv.trim().split("\r\n").length, 9);
  assert.ok(!subsetCsv.includes('"Awful"') && !subsetCsv.includes('"Gold"'));

  for (const key of ["weapons", "qualities", "materials"]) {
    h.pick(key, []); assert.match($("pool-count").textContent, /^0 variations/);
    submit(); assert.match($("form-error").textContent, /empty/);
    h.pick(key, "all");
  }
  change("weapon", "Club"); change("quality", "Fixed"); change("material", "Steel");
  submit(); await until(() => $("run-badge").textContent === "COMPLETE");
  assert.deepEqual((await h.json()).requestedVariantIds, ["Club|Steel|Fixed"]);
  change("weapon", "Monosword"); change("quality", "Legendary"); change("material", "None");
  assert.equal($("materials-summary").textContent, "No material");
  submit(); await until(() => $("run-badge").textContent === "COMPLETE");
  assert.deepEqual((await h.json()).requestedVariantIds, ["Monosword|None|Legendary"]);

  change("quality", ["Normal", "Fixed"]); change("material", "Steel");
  change("skill", 11); assert.equal($("run-badge").textContent, "SETTINGS CHANGED");
  change("limit", 5); submit(); assert.equal($("form-error").hidden, false);
  assert.equal($("results-body").children.length, 1);
  change("limit", 60); change("weapon", ""); submit();
  await until(() => $("run-badge").textContent === "COMPLETE");
  assert.equal($("results-body").children.length, 10); // nine Normal steel weapons plus the Fixed-quality steel club
  const numericMedians = () => [...$("results-body").children].map(r => Number(r.cells[1].textContent));
  const asc = numericMedians(); assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  w.document.querySelector('[data-sort="median"] button').click();
  assert.deepEqual(numericMedians(), [...asc].sort((a, b) => b - a));
  change("result-search", "Longsword"); assert.equal($("results-body").children.length, 1);
  change("result-search", "absent weapon"); assert.equal($("results-body").children.length, 0); assert.equal($("export-csv").disabled, true);
  change("result-search", "");
  change("material", ""); change("quality", "all"); change("trials", 1000); submit(); $("cancel").click();
  assert.equal($("run-badge").textContent, "STOPPED"); assert.equal($("settings").disabled, false);
  change("weapon", "Knife"); change("material", "Wood"); submit(); assert.match($("form-error").textContent, /empty/);
  change("weapon", "Longsword"); change("material", "Steel"); change("quality", "Normal"); change("trials", 100); submit();
  await until(() => $("run-badge").textContent === "COMPLETE");
  assert.equal($("results-body").children.length, 1);
  // A run with deliberately overwhelming protection/health must display censoring, never a success-only median.
  change("armor", "marine"); change("healthScale", 5); change("damageFactor", .1); change("limit", 10); change("painFactor", 0); submit();
  await until(() => $("run-badge").textContent === "COMPLETE");
  assert.match($("results-body").textContent, /Not reached/);
  assert.equal((await h.json()).completedVariants[0].stats.median, null);
  h.dom.window.close();
}
(async () => {
  await exercise(undefined);
  await exercise(WorkerBridge);
  const broken = setup(class { constructor() { throw Error("Unavailable"); } });
  broken.change("weapon", "Monosword"); broken.change("material", "None"); broken.change("unarmed", false); broken.change("trials", 100); broken.submit();
  await until(() => broken.$("run-badge").textContent === "COMPLETE");
  broken.dom.window.close();
  console.log("PASS DOM/controller integration: multi-select weapons/qualities/materials, All/Clear, exact run/export subsets, worker/fallback replay, DLC, sorting, details, censoring, validation, cancellation and restart.");
})().catch(error => { console.error(error); process.exitCode = 1; });
