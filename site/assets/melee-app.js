/* Browser controller; all simulation state is local to this page. */
(() => {
  "use strict";
  const D = window.RIMWORLD_MELEE_DATA, E = window.RIMWORLD_MELEE;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = value => value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const seconds = value => value === null ? "Not reached" : `${value.toFixed(1)} s`;
  const pct = value => `${(value * 100).toFixed(1)}%`;
  const interval = (bounds, limit) => bounds.every(v => v === null) ? `Not reached (>${limit})` : `${bounds[0] === null ? `>${limit}` : bounds[0].toFixed(1)}–${bounds[1] === null ? `>${limit}` : bounds[1].toFixed(1)}`;
  const variants = [...D.variants, E.UNARMED], byId = new Map(variants.map(v => [v.id, v]));
  const results = new Map();
  let worker = null, running = false, token = 0, run = null, selected = null, sortKey = "median", sortAsc = true, lastPaint = 0;
  function option(select, value, label = value) { const el = document.createElement("option"); el.value = value; el.textContent = label; select.append(el); }
  [...new Set(D.variants.map(v => v.weapon))].sort().forEach(v => option($("weapon"), v));
  [...new Set(D.variants.map(v => v.material))].filter(v => v !== "None").sort().forEach(v => option($("material"), v));
  $("snapshot-description").textContent = `${D.variants.length} literal weapon/material/quality combinations from 24 wiki weapon pages, plus a natural human benchmark. Snapshot: ${D.snapshotDate}. Only combinations present in the source tables are offered. Implants and unique weapons are outside this version.`;
  $("source-list").innerHTML = D.sources.map(s => `<li><a href="${escape(s.snapshotUrl)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a> · revision ${s.revision}</li>`).join("");
  function theme(value) {
    document.documentElement.dataset.theme = value;
    $("theme-toggle").textContent = value === "dark" ? "Light theme" : "Dark theme";
    $("theme-toggle").setAttribute("aria-label", `Switch to ${value === "dark" ? "light" : "dark"} theme`);
    try { localStorage.setItem("rimworld-field-notes-theme", value); } catch (_) { /* Local files or blocked storage. */ }
  }
  try { theme(localStorage.getItem("rimworld-field-notes-theme") === "light" ? "light" : "dark"); } catch (_) { theme("dark"); }
  $("theme-toggle").addEventListener("click", () => theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  function pool() {
    const enabled = ["Royalty", "Anomaly", "Odyssey"].filter(d => $("dlc-" + d).checked);
    const rows = D.variants.filter(v => (!$("weapon").value || v.weapon === $("weapon").value) && ($("quality").value === "all" || v.quality === "Fixed" || v.quality === $("quality").value) && (!$("material").value || v.material === "None" || v.material === $("material").value) && v.dlc.every(d => enabled.includes(d)));
    if ($("unarmed").checked) rows.push(E.UNARMED);
    return rows;
  }
  function readConfig() {
    const input = {};
    Object.keys(E.DEFAULTS).forEach(k => { input[k] = $(k).value; });
    return E.normalizeConfig(input);
  }
  function settingsChanged() {
    const n = pool().length, count = n * Number($("trials").value);
    $("pool-count").textContent = `${fmt(n)} variations · ${fmt(count)} total trials`;
    $("armor-description").textContent = $("armor").value === "none" ? "No apparel or natural armor." : $("armor").value === "flak" ? "Normal flak vest, steel simple helmet, cloth shirt and pants. Face, hands and feet exposed." : "Normal marine armor and helmet, cloth shirt and pants. Hands and feet exposed.";
    if (run && !running) { $("run-badge").textContent = "SETTINGS CHANGED"; $("run-status").textContent = "Displayed results use the previous run settings. Run again to apply changes."; }
  }
  $("settings").addEventListener("input", settingsChanged);
  $("settings").addEventListener("change", settingsChanged);
  settingsChanged();
  function filteredResults() {
    const query = $("result-search").value.trim().toLowerCase();
    const rows = [...results.values()].filter(r => { const v = byId.get(r.id); return `${v.weapon} ${v.material} ${v.quality} ${v.dlc.join(" ")}`.toLowerCase().includes(query); });
    return rows.sort((a, b) => {
      if (sortKey === "weapon") return (sortAsc ? 1 : -1) * a.id.localeCompare(b.id);
      const x = a.stats[sortKey], y = b.stats[sortKey];
      if (x === null || y === null) return x === y ? a.id.localeCompare(b.id) : x === null ? 1 : -1;
      return (sortAsc ? x - y : y - x) || a.id.localeCompare(b.id);
    });
  }
  function render() {
    const rows = filteredResults(), c = run?.config;
    const value = x => x === null ? `<span class="censored-value" title="This percentile was not reached within ${c.limit} seconds">Not reached<br>(&gt;${c.limit} s)</span>` : x.toFixed(1);
    $("results-body").innerHTML = rows.map(r => {
      const v = byId.get(r.id), s = r.stats;
      return `<tr${selected === r.id ? ' class="selected-variant"' : ""}><td><button class="variant-button" type="button" data-id="${escape(v.id)}" aria-expanded="${selected === r.id}">${escape(v.weapon)}<small>${escape(v.material === "None" ? "No material variation" : v.material)} · ${escape(v.quality === "Fixed" ? "No quality variation" : v.quality)}</small></button></td><td>${value(s.median)}</td><td>${interval(s.medianCI, c.limit)}</td><td>${value(s.p10)}</td><td>${value(s.p90)}</td><td title="95% CI: ${s.horizonCI.map(pct).join('–')}">${pct(s.byHorizon)}</td><td title="95% CI: ${s.deathCI.map(pct).join('–')}">${pct(s.deathFraction)}</td><td>${fmt(s.censored)} / ${fmt(s.n)}</td></tr>`;
    }).join("");
    $("results-empty").hidden = rows.length > 0;
    if (results.size > 0 && !rows.length) $("results-empty").innerHTML = "<h3>No matching results</h3><p>Try a different weapon, material, or quality.</p>";
    else if (!results.size && run) $("results-empty").innerHTML = "<h3>Waiting for the first result</h3><p>Completed variations will appear here.</p>";
    $("results-count").textContent = `${fmt(rows.length)} shown / ${fmt(results.size)} completed`;
    $("export-csv").disabled = !rows.length;
    $("export-json").disabled = !results.size;
    $("metric-variants").textContent = run ? `${fmt(results.size)} / ${fmt(run.ids.length)}` : "—";
    $("metric-trials").textContent = run ? fmt(results.size * run.config.trials) : "—";
    const fastest = [...results.values()].map(r => r.stats.median).filter(m => m !== null);
    $("metric-median").textContent = fastest.length ? seconds(Math.min(...fastest)) : results.size ? "Not reached" : "—";
    document.querySelectorAll("#results-table th[data-sort]").forEach(th => {
      const active = th.dataset.sort === sortKey;
      th.setAttribute("aria-sort", active ? sortAsc ? "ascending" : "descending" : "none");
      const button = th.querySelector("button"); button.textContent = button.textContent.replace(/[↑↓↕]$/, active ? sortAsc ? "↑" : "↓" : "↕");
    });
  }
  $("result-search").addEventListener("input", render);
  document.querySelectorAll("#results-table th[data-sort] button").forEach(button => button.addEventListener("click", () => {
    const key = button.parentElement.dataset.sort;
    sortAsc = sortKey === key ? !sortAsc : !["byHorizon", "deathFraction"].includes(key); sortKey = key; render();
  }));
  $("results-body").addEventListener("click", event => { const button = event.target.closest("[data-id]"); if (button) { showVariant(button.dataset.id); render(); } });
  function drawDistribution(result) {
    const c = run.config, times = result.times.filter(t => t !== null).sort((a, b) => a - b);
    const x = t => 48 + 612 * t / c.limit, y = count => 180 - 160 * count / result.stats.n;
    let path = "M48 180", count = 0;
    for (let i = 0; i < times.length;) {
      const t = times[i]; while (i < times.length && times[i] === t) { count++; i++; }
      path += `H${x(t).toFixed(2)}V${y(count).toFixed(2)}`;
    }
    path += "H660";
    const grids = [0, .25, .5, .75, 1].map(p => `<path class="chart-grid" d="M48 ${180 - p * 160}H660"/><text x="38" y="${184 - p * 160}" text-anchor="end">${p * 100}%</text>`).join("");
    const ticks = [0, .25, .5, .75, 1].map(p => `<text x="${x(p * c.limit)}" y="205" text-anchor="middle">${+(p * c.limit).toFixed(1)}s</text>`).join("");
    $("distribution").innerHTML = `<title id="chart-title">Cumulative incapacitation over time</title><desc id="chart-description">${result.stats.events} of ${result.stats.n} trials reached incapacitation by ${c.limit} seconds. Median ${escape(seconds(result.stats.median))}. ${result.stats.censored} timeouts.</desc>${grids}<path class="chart-fill" d="${path}V180H48Z"/><path class="chart-line" d="${path}"/>${ticks}`;
  }
  function showVariant(id) {
    selected = id;
    const v = byId.get(id), r = results.get(id), s = r.stats, c = run.config;
    $("variant-detail").hidden = false;
    $("variant-title").textContent = v.weapon;
    $("variant-subtitle").textContent = `${v.material === "None" ? "No material variation" : v.material} · ${v.quality === "Fixed" ? "No quality variation" : v.quality} · ${fmt(s.n)} trials · Median: ${seconds(s.median)} · 95% CI: ${interval(s.medianCI, c.limit)} s`;
    $("variant-source").href = v.source;
    const special = { plasma: "Incomplete special effect: 50% direct heat proc on successful blade strikes is included; ignition, ongoing fire and panic are omitted. Treat this comparison cautiously.", emp: "Physical strikes are modeled. EMP has no effect on this natural human target; implants and mechanoids require a different model.", improvised: "Improvised weapon durability and consumption are omitted. The weapon lasts throughout the trial." }[v.special];
    $("variant-special").hidden = !special; $("variant-special").textContent = special || "";
    drawDistribution(r);
    $("variant-probabilities").textContent = `Down/dead by ${c.horizon}s: ${pct(s.byHorizon)} (95% CI ${s.horizonCI.map(pct).join("–")}). By ${c.limit}s: ${pct(s.incapacitation)} (95% CI ${s.incapacitationCI.map(pct).join("–")}). Dead first: ${pct(s.deathFraction)} (95% CI ${s.deathCI.map(pct).join("–")}). Timeouts: ${s.censored}.`;
    $("attack-mix").innerHTML = E.attacksFor(v, c).map(a => `<tr><td>${escape(a.name)}<small> · ${a.type}</small></td><td>${a.damage.toFixed(2)}</td><td>${pct(a.ap)}${a.fixedAP ? "*" : ""}</td><td>${a.cooldown.toFixed(2)} s</td><td>${pct(a.probability)} · ${a.category}</td></tr>`).join("");
    $("example-number").max = c.trials; $("example-number").value = 1;
    showExample();
  }
  function showExample() {
    if (!selected || !run) return;
    const trial = Number($("example-number").value);
    if (!Number.isInteger(trial) || trial < 1 || trial > run.config.trials) { $("example-summary").textContent = `Enter a trial from 1 to ${run.config.trials}.`; $("example-log").replaceChildren(); return; }
    const ctx = E.createContext(D, run.config, byId.get(selected)), result = E.simulateTrial(ctx, trial - 1, true);
    $("example-summary").textContent = `Trial ${trial}: ${result.reason} ${result.time === null ? `at the ${run.config.limit}s limit` : `at ${result.time.toFixed(2)}s`}, ${result.swings} swings. The log shows at most 500 swings.`;
    $("example-log").innerHTML = result.log.map(event => `<li><strong>${event.time.toFixed(2)}s · ${escape(event.attack)} · ${event.outcome}</strong>${event.injuries.length ? `<br>${event.injuries.map(i => `${escape(i.part)}: ${i.damage.toFixed(2)} ${i.type}${i.destroyed ? " (destroyed)" : ""}`).join("; ")}` : ""}<br>Pain ${pct(event.pain)} · Consciousness ${pct(event.consciousness)} · Moving ${pct(event.moving)}</li>`).join("");
  }
  $("example-show").addEventListener("click", showExample);
  function receiveResult(result, current) {
    if (!running || current !== token) return;
    results.set(result.id, result);
    $("run-progress").value = results.size / run.ids.length * 100;
    $("run-status").textContent = `${fmt(results.size)} of ${fmt(run.ids.length)} variations completed · ${fmt(results.size * run.config.trials)} trials`;
    if (performance.now() - lastPaint > 100) { render(); lastPaint = performance.now(); }
  }
  function finish(status, message) {
    running = false;
    if (worker) { worker.terminate(); worker = null; }
    $("settings").disabled = false; $("run").disabled = false; $("cancel").hidden = true;
    $("run-progress").hidden = true;
    run.status = status;
    run.elapsedSeconds = (performance.now() - run.startedAt) / 1000;
    $("run-badge").textContent = status.toUpperCase();
    $("run-status").textContent = message;
    render();
    if (results.size && !selected) showVariant(filteredResults()[0]?.id || results.keys().next().value);
  }
  function done(current) {
    if (!running || current !== token) return;
    finish("complete", `Completed ${fmt(run.ids.length * run.config.trials)} trials. Seed: ${run.config.seed}. Select a variation to inspect its results.`);
  }
  async function fallback(current) {
    try {
      $("run-status").textContent = "Using the local browser fallback. Comparisons run in small batches.";
      for (const id of run.ids) {
        const ctx = E.createContext(D, run.config, byId.get(id)), times = []; let deaths = 0;
        for (let trial = 0; trial < run.config.trials; trial++) {
          if (!running || current !== token) return;
          const r = E.simulateTrial(ctx, trial); times.push(r.time); deaths += r.dead ? 1 : 0;
          if (trial % 100 === 99) await new Promise(resolve => setTimeout(resolve, 0));
        }
        receiveResult({ id, times, stats: E.summarize(times, deaths, run.config.horizon, run.config.limit) }, current);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      done(current);
    } catch (error) { if (running && current === token) finish("error", error.message); }
  }
  $("sim-form").noValidate = true;
  $("sim-form").addEventListener("submit", event => {
    event.preventDefault();
    if (running) return;
    let config, chosen;
    try {
      config = readConfig(); chosen = pool();
      if (!chosen.length) throw Error("The weapon pool is empty. Change the weapon, material, or DLC settings.");
      if (chosen.length * config.trials > 2000000) throw Error("This run exceeds 2 million trials. Reduce the weapon pool or trial count, then refine a smaller pool.");
    } catch (error) { $("form-error").textContent = error.message; $("form-error").hidden = false; return; }
    $("form-error").hidden = true;
    token++; const current = token;
    running = true; selected = null; results.clear();
    run = { config, ids: chosen.map(v => v.id), createdAt: new Date().toISOString(), startedAt: performance.now(), status: "running", selection: { weapon: $("weapon").value, material: $("material").value, quality: $("quality").value, dlc: ["Royalty", "Anomaly", "Odyssey"].filter(d => $("dlc-" + d).checked), unarmed: $("unarmed").checked } };
    $("settings").disabled = true; $("run").disabled = true; $("cancel").hidden = false;
    $("variant-detail").hidden = true;
    $("run-badge").textContent = "RUNNING"; $("run-progress").hidden = false; $("run-progress").value = 0;
    $("run-description").textContent = `${config.armor === "none" ? "Unarmored" : config.armor === "flak" ? "Flak" : "Marine"} target · Attacker skill ${config.skill} · Target skill ${config.targetSkill} · ${fmt(config.trials)} trials/variation · ${config.limit}s limit · ${E.VERSION}`;
    $("horizon-heading").textContent = `Down/dead by ${config.horizon}s ↕`;
    $("run-status").textContent = "Starting comparison…";
    render();
    try {
      if (typeof Worker === "undefined") throw Error("Worker unavailable");
      worker = new Worker("./assets/melee-worker.js");
      worker.onmessage = ({ data: message }) => {
        if (!running || current !== token) return;
        if (message.type === "result") receiveResult(message.result, current);
        else if (message.type === "done") done(current);
        else if (message.type === "error") finish("error", message.message);
      };
      worker.onerror = event => {
        event.preventDefault();
        if (!running || current !== token) return;
        worker.terminate(); worker = null;
        if (results.size) finish("error", "The worker stopped. Completed results are retained; rerun the comparison to finish.");
        else fallback(current);
      };
      worker.postMessage({ config, ids: run.ids });
    } catch (_) { if (worker) worker.terminate(); worker = null; fallback(current); }
  });
  $("cancel").addEventListener("click", () => {
    if (!running) return;
    token++; finish("stopped", `Stopped after ${fmt(results.size)} of ${fmt(run.ids.length)} variations. Results cover the completed subset only.`);
    if (!results.size) $("results-empty").innerHTML = "<h3>Run stopped</h3><p>No variations completed. Adjust the conditions and run again.</p>";
  });
  function download(content, mime, name) {
    const url = URL.createObjectURL(new Blob([content], { type: mime })), a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("export-json").addEventListener("click", () => {
    if (!run) return;
    download(JSON.stringify({ modelVersion: E.VERSION, wikiSnapshotDate: D.snapshotDate, attribution: D.attribution, sources: D.sources, createdAt: run.createdAt, status: run.status, config: run.config, selection: run.selection, requestedVariantIds: run.ids, completedVariants: [...results.values()].map(r => ({ ...r, weapon: byId.get(r.id) })) }, null, 2), "application/json", "rimworld-melee-run.json");
  });
  $("export-csv").addEventListener("click", () => {
    if (!run) return;
    const keys = Object.keys(run.config), headers = ["weapon", "material", "quality", "variant_id", "trials", "median_seconds", "median_ci_lower_seconds", "median_ci_upper_seconds", "p10_seconds", "p90_seconds", "incap_by_horizon", "horizon_ci_lower", "horizon_ci_upper", "incap_by_limit", "incap_ci_lower", "incap_ci_upper", "dead_first_fraction", "dead_ci_lower", "dead_ci_upper", "timeouts", "model_version", "wiki_snapshot_date", "run_status", ...keys.map(k => "config_" + k)];
    const censored = x => x === null ? `>${run.config.limit}` : x;
    const rows = filteredResults().map(r => { const v = byId.get(r.id), s = r.stats; return [v.weapon, v.material, v.quality, v.id, s.n, censored(s.median), ...s.medianCI.map(censored), censored(s.p10), censored(s.p90), s.byHorizon, ...s.horizonCI, s.incapacitation, ...s.incapacitationCI, s.deathFraction, ...s.deathCI, s.censored, E.VERSION, D.snapshotDate, run.status, ...keys.map(k => run.config[k])]; });
    const cell = value => { let s = String(value); if (typeof value === "string" && /^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    download("\uFEFF" + [headers, ...rows].map(row => row.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8", "rimworld-melee-comparison.csv");
  });
})();
