(() => {
  "use strict";

  const datasets = window.RIMWORLD_DATA.datasets;
  const $ = (selector) => document.querySelector(selector);
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const copy = {
    apparel: {
      eyebrow: "EQUIPMENT",
      description: "Find the right layers for your colonists.",
      placeholder: "Search apparel, materials, research…",
      category: "Layer",
      categoryAll: "All layers",
      views: [
        { id: "overview", label: "Overview", keys: ["name", "layer", "sharp", "blunt", "heatArmor", "hp", "marketValue", "materials"] },
        { id: "protection", label: "Armor & insulation", keys: ["name", "layer", "sharp", "blunt", "heatArmor", "hp", "coldMultiplier", "coldBase", "heatMultiplier", "heatBase", "coverage"] },
        { id: "crafting", label: "Crafting & value", keys: ["name", "layer", "research", "work", "material1Amount", "material1Type", "material2Amount", "material2Type", "marketValue", "valueWork", "valueMaterial"] },
        { id: "all", label: "All columns", keys: ["name", ...datasets.apparel.columns.map((column) => column.key).filter((key) => key !== "name")] },
      ],
    },
    textiles: {
      eyebrow: "MATERIALS",
      description: "Compare the materials behind your apparel.",
      placeholder: "Search textiles, categories, any value…",
      category: "Category",
      categoryAll: "All categories",
      views: [
        { id: "overview", label: "Overview", keys: ["name", "category", "sharp", "coldBonus", "heatBonus", "hp", "marketValue"] },
        { id: "protection", label: "Armor & insulation", keys: ["name", "category", "sharp", "blunt", "heatArmor", "coldBonus", "heatBonus"] },
        { id: "properties", label: "Other properties", keys: ["name", "category", "beauty", "hp", "flammability", "marketValue"] },
        { id: "all", label: "All columns", keys: datasets.textiles.columns.map((column) => column.key) },
      ],
    },
  };
  const shortLabels = {
    name: "Name", layer: "Layer", category: "Category", sharp: "Sharp armor", blunt: "Blunt armor", heatArmor: "Heat armor",
    hp: "Hit points", coverage: "Coverage", coldMultiplier: "Cold insulation ×", coldBase: "Cold base (°C)",
    heatMultiplier: "Heat insulation ×", heatBase: "Heat base (°C)", special: "Special properties", research: "Research",
    work: "Work (ticks)", material1Amount: "Material 1 qty", material1Type: "Material 1 type", material2Amount: "Material 2 qty",
    material2Type: "Material 2 type", marketValue: "Base value", valueWork: "Value / work", valueMaterial: "Value / material",
    beauty: "Beauty ×", flammability: "Flammability ×", coldBonus: "Cold bonus (°C)", heatBonus: "Heat bonus (°C)", materials: "Materials",
  };
  const state = { dataset: "apparel", tables: {} };
  for (const key of Object.keys(datasets)) {
    state.tables[key] = { query: "", category: "", view: "overview", sort: "name", direction: "asc" };
    $(`#${key}-total`).textContent = datasets[key].rows.length;
    $(`#${key}-count`).textContent = datasets[key].rows.length;
  }

  const activeData = () => datasets[state.dataset];
  const activeState = () => state.tables[state.dataset];
  const isBlank = (value) => value === null || value === undefined || value === "";
  const normalize = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const sourceColumns = () => new Map(activeData().columns.map((column) => [column.key, column]));

  function materialSummary(row) {
    const parts = [];
    for (const index of [1, 2]) {
      const amount = row[`material${index}Amount`];
      const type = row[`material${index}Type`];
      if (!isBlank(amount) || !isBlank(type)) {
        parts.push([isBlank(amount) ? null : numberFormat.format(amount), type].filter((part) => !isBlank(part)).join(" "));
      }
    }
    return parts.length ? parts.join(" + ") : null;
  }

  function fieldValue(row, key) {
    return key === "materials" ? materialSummary(row) : row[key];
  }

  function displayValue(value, column) {
    if (isBlank(value)) return "—";
    if (typeof value !== "number") return String(value);
    const formatted = numberFormat.format(value);
    if (column.type === "multiplier") return `${formatted}×`;
    if (column.type === "temperature") return `${formatted} °C`;
    return formatted;
  }

  function visibleRows() {
    const data = activeData();
    const current = activeState();
    const terms = normalize(current.query).trim().split(/\s+/).filter(Boolean);
    const rows = data.rows.filter((row) => {
      if (current.category && row[data.categoryKey] !== current.category) return false;
      const text = normalize(data.columns.map((column) => row[column.key] ?? "").join(" "));
      return terms.every((term) => text.includes(term));
    });
    return rows.sort((a, b) => {
      const av = fieldValue(a, current.sort);
      const bv = fieldValue(b, current.sort);
      // Missing source values stay last in either sort direction.
      if (isBlank(av) && isBlank(bv)) return collator.compare(a.name, b.name);
      if (isBlank(av)) return 1;
      if (isBlank(bv)) return -1;
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
      return result ? result * (current.direction === "asc" ? 1 : -1) : collator.compare(a.name, b.name);
    });
  }

  function visibleColumns() {
    const columns = sourceColumns();
    columns.set("materials", { key: "materials", label: "Materials (amount and type from source)", type: "text" });
    return copy[state.dataset].views.find((view) => view.id === activeState().view).keys.map((key) => columns.get(key));
  }

  function labelFor(column) {
    if (state.dataset === "textiles") {
      if (column.key === "hp") return "Max HP ×";
      if (["sharp", "blunt", "heatArmor"].includes(column.key)) return `${shortLabels[column.key]} ×`;
      if (column.key === "marketValue") return "Silver / unit";
    }
    return shortLabels[column.key] || column.label;
  }

  function renderViews() {
    const container = $("#column-views");
    container.replaceChildren();
    for (const view of copy[state.dataset].views) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = view.label;
      button.className = `view-button${activeState().view === view.id ? " active" : ""}`;
      button.setAttribute("aria-pressed", String(activeState().view === view.id));
      button.addEventListener("click", () => {
        activeState().view = view.id;
        const keys = view.keys;
        if (!keys.includes(activeState().sort)) {
          activeState().sort = "name";
          activeState().direction = "asc";
        }
        renderViews();
        renderTable();
        $("#table-scroll").scrollLeft = 0;
        [...container.children].find((element) => element.getAttribute("aria-pressed") === "true").focus();
      });
      container.append(button);
    }
  }

  function renderTable() {
    const data = activeData();
    const current = activeState();
    const columns = visibleColumns();
    const rows = visibleRows();
    const header = document.createElement("tr");
    for (const column of columns) {
      const th = document.createElement("th");
      th.scope = "col";
      if (column.type !== "text") th.className = "numeric";
      const sorted = current.sort === column.key;
      th.setAttribute("aria-sort", sorted ? (current.direction === "asc" ? "ascending" : "descending") : "none");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.title = column.label;
      button.setAttribute("aria-label", `Sort by ${column.label}, ${sorted && current.direction === "asc" ? "descending" : "ascending"}`);
      const label = document.createElement("span");
      label.textContent = labelFor(column);
      const icon = document.createElement("span");
      icon.className = "sort-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = sorted ? (current.direction === "asc" ? "↑" : "↓") : "↕";
      button.append(label, icon);
      button.addEventListener("click", () => {
        current.direction = current.sort === column.key && current.direction === "asc" ? "desc" : "asc";
        current.sort = column.key;
        const scroll = $("#table-scroll");
        const left = scroll.scrollLeft;
        renderTable();
        scroll.scrollLeft = left;
        $("#table-head").querySelector(`[data-key="${column.key}"] button`).focus({ preventScroll: true });
      });
      th.dataset.key = column.key;
      th.append(button);
      header.append(th);
    }
    $("#table-head").replaceChildren(header);

    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement("tr");
      for (const column of columns) {
        const td = document.createElement("td");
        const value = fieldValue(row, column.key);
        if (column.key === "name") {
          td.className = "name-cell";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "item-name";
          button.textContent = row.name;
          button.setAttribute("aria-label", `View all details for ${row.name}`);
          button.addEventListener("click", () => openDetails(row));
          td.append(button);
        } else if (column.key === data.categoryKey) {
          const chip = document.createElement("span");
          chip.className = "category-chip";
          chip.dataset.category = value ?? "";
          chip.textContent = displayValue(value, column);
          td.append(chip);
        } else {
          td.textContent = displayValue(value, column);
          if (column.type !== "text") td.classList.add("numeric");
          if (["special", "coverage", "research", "material1Type", "material2Type"].includes(column.key)) td.classList.add("long-text");
          if (column.key === "materials") td.classList.add("materials-cell");
        }
        if (isBlank(value)) {
          td.classList.add("missing");
          td.title = "Blank in the source spreadsheet";
        }
        tr.append(td);
      }
      fragment.append(tr);
    }
    $("#table-body").replaceChildren(fragment);
    $("#result-count").textContent = `${rows.length} of ${data.rows.length} ${state.dataset === "apparel" ? "items" : "textiles"}`;
    $("#table-scroll").hidden = rows.length === 0;
    $("#empty-state").hidden = rows.length !== 0;
    $("#export-csv").disabled = rows.length === 0;
    $("#reset-filters").disabled = !current.query && !current.category;
    $("#table-scroll").scrollTop = 0;
  }

  function selectDataset(key) {
    if (!datasets[key]) return;
    state.dataset = key;
    const data = activeData();
    const current = activeState();
    const words = copy[key];
    for (const button of document.querySelectorAll("[data-dataset]")) {
      const selected = button.dataset.dataset === key;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    $("#table-title").textContent = data.name;
    $("#table-eyebrow").textContent = words.eyebrow;
    $("#table-description").textContent = words.description;
    $("#search").value = current.query;
    $("#search").placeholder = words.placeholder;
    $("#category-label").textContent = words.category;
    const options = [new Option(words.categoryAll, "")];
    const categories = [...new Set(data.rows.map((row) => row[data.categoryKey]).filter((value) => !isBlank(value)))];
    for (const value of categories) options.push(new Option(value, value));
    $("#category").replaceChildren(...options);
    $("#category").value = current.category;
    $("#source-label").textContent = `${data.source.file} · ${data.source.sheet}`;
    $("#table-scroll").setAttribute("aria-label", `${data.name} table; scroll for more columns`);
    $("#table-caption").textContent = `${data.name} from ${data.source.file}. Select a column heading to sort or an item name to see every field.`;
    renderViews();
    renderTable();
    $("#table-scroll").scrollLeft = 0;
  }

  function openDetails(row) {
    const data = activeData();
    $("#detail-title").textContent = row.name;
    $("#detail-category").textContent = `${data.name.toUpperCase()} / ${row[data.categoryKey] ?? ""}`;
    const fragment = document.createDocumentFragment();
    for (const column of data.columns) {
      const wrapper = document.createElement("div");
      wrapper.className = "detail-row";
      const term = document.createElement("dt");
      term.textContent = column.label;
      const detail = document.createElement("dd");
      detail.textContent = displayValue(row[column.key], column);
      if (isBlank(row[column.key])) detail.className = "missing";
      wrapper.append(term, detail);
      fragment.append(wrapper);
    }
    $("#detail-fields").replaceChildren(fragment);
    $("#detail-source").textContent = `Source: ${data.source.file} · ${data.source.sheet} · row ${row.sourceRow}. Values as supplied.`;
    $("#detail-dialog").showModal();
    $("#detail-dialog").scrollTop = 0;
    $("#close-detail").focus({ preventScroll: true });
  }

  function resetFilters() {
    activeState().query = "";
    activeState().category = "";
    $("#search").value = "";
    $("#category").value = "";
    renderTable();
  }

  function csvCell(value) {
    if (isBlank(value)) return '""';
    // Prevent source text from becoming a formula when a CSV is opened in Excel.
    const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const data = activeData();
    const rows = visibleRows();
    const matrix = [data.columns.map((column) => column.label), ...rows.map((row) => data.columns.map((column) => row[column.key]))];
    const csv = "\uFEFF" + matrix.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rimworld-${state.dataset}${activeState().query || activeState().category ? "-filtered" : ""}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setTheme(theme) {
    const selected = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = selected;
    const label = `Switch to ${selected === "dark" ? "light" : "dark"} theme`;
    $("#theme-toggle").setAttribute("aria-label", label);
    $("#theme-toggle").title = label;
    $("#theme-toggle use").setAttribute("href", selected === "dark" ? "#icon-sun" : "#icon-moon");
    try { localStorage.setItem("rimworld-field-notes-theme", selected); } catch { /* Storage may be disabled. */ }
  }

  for (const button of document.querySelectorAll("[data-dataset]")) button.addEventListener("click", () => selectDataset(button.dataset.dataset));
  $("#search").addEventListener("input", (event) => { activeState().query = event.target.value; renderTable(); });
  $("#category").addEventListener("change", (event) => { activeState().category = event.target.value; renderTable(); });
  $("#reset-filters").addEventListener("click", resetFilters);
  $("#empty-reset").addEventListener("click", () => { resetFilters(); $("#search").focus(); });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#close-detail").addEventListener("click", () => $("#detail-dialog").close());
  $("#detail-dialog").addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
  });
  document.addEventListener("keydown", (event) => {
    const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (event.key === "/" && !editing && !$("#detail-dialog").open && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      $("#search").focus();
    }
  });
  $("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem("rimworld-field-notes-theme") || "dark"; } catch { /* Use default. */ }
  setTheme(savedTheme);
  selectDataset("apparel");
})();
