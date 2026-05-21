// script.js — theme toggle + CSV preview tables (no frameworks)
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const DEFAULT_THEME = "dark";
const THEME_KEY = "repro_site_theme";

function setTheme(theme){
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if(saved){
    setTheme(saved);
    return;
  }
  // default based on prefers-color-scheme
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  setTheme(prefersLight ? "light" : DEFAULT_THEME);
}

function toggleTheme(){
  const cur = document.documentElement.dataset.theme || DEFAULT_THEME;
  setTheme(cur === "light" ? "dark" : "light");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  })[c]);
}

function parseCsv(text){
  // Simple CSV parser that supports quoted fields with commas/newlines.
  const rows = [];
  let i=0, field="", row=[], inQuotes=false;
  while(i < text.length){
    const c = text[i];
    const next = text[i+1];

    if(inQuotes){
      if(c === '"' && next === '"'){ field += '"'; i += 2; continue; }
      if(c === '"'){ inQuotes=false; i++; continue; }
      field += c; i++; continue;
    }else{
      if(c === '"'){ inQuotes=true; i++; continue; }
      if(c === ','){ row.push(field); field=""; i++; continue; }
      if(c === '\n'){
        row.push(field); rows.push(row);
        row=[]; field=""; i++; continue;
      }
      if(c === '\r'){ i++; continue; }
      field += c; i++; continue;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function normalizeBool(v){
  const s = String(v).trim().toLowerCase();
  if(["1","true","yes","y","ok","passed","pass","success"].includes(s)) return true;
  if(["0","false","no","n","fail","failed"].includes(s)) return false;
  return null;
}

function badge(value){
  const b = normalizeBool(value);
  if(b === true) return '<span class="badge badge--ok">yes</span>';
  if(b === false) return '<span class="badge badge--no">no</span>';
  return `<span class="badge">${escapeHtml(value)}</span>`;
}

function compare(a,b){
  if(a == null && b == null) return 0;
  if(a == null) return -1;
  if(b == null) return 1;

  // numeric if both look numeric
  const na = Number(a), nb = Number(b);
  const isNum = !Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "";
  if(isNum) return na - nb;

  return String(a).localeCompare(String(b));
}

function normKey(s){
  // Normalize header keys: lowercase and remove any non-alphanumeric
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function uniqueValuesFrom(rows, key){
  const s = new Set(rows.map(r => String(r[key] ?? "").trim()).filter(Boolean));
  return Array.from(s).sort((a,b)=>a.localeCompare(b));
}

function fillSelect(selectEl, values){
  if(!selectEl) return;
  const cur = selectEl.value;
  selectEl.innerHTML = '<option value="">All</option>' + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if(values.includes(cur)) selectEl.value = cur;
}

// =========================
// Main Results table (MultiAgent / SingleLLM / ablations)
// =========================

let rawRows = [];
let viewRows = [];
let sortKey = null;
let sortAsc = true;

const COLUMNS = ["Model","File","Start Line","End Line","Detect","Use Fallback","Iteration","Compile","Test","Usefulness"];

// Scenario → CSV file mapping
const SCENARIO_FILES = {
  "Claude": "./downloads/RQ1_Claude.csv",
  "Deepseek": "./downloads/RQ1_Deepseek.csv",
  "GPT": "./downloads/RQ1_GPT.csv",
  "Gemini": "./downloads/RQ1_Gemini.csv",
  "No Feedback Loop": "./downloads/no%20feedback%20loop.csv",
  "No Panelist": "./downloads/no%20panelist.csv",
  "No RAG": "./downloads/no%20rag.csv",
  "No Usefulness": "./downloads/no%20usefulness.csv"
};

// Static model labels (used when CSVs don't include per-row `model` values)
const STATIC_MODELS = ["Deepseek v3.2","Gemini 3 Pro","GPT-5.2","Claude Opus 4.6"];

// Map scenario keys to model labels (for filtering when `model` column is empty)
const SCENARIO_MODEL_MAP = {
  "Claude": "Claude Opus 4.6",
  "Deepseek": "Deepseek v3.2",
  "GPT": "GPT-5.2",
  "Gemini": "Gemini 3 Pro",
  "No Feedback Loop": null,
  "No Panelist": null,
  "No RAG": null,
  "No Usefulness": null
};

let headerMap = null; // canonical column -> index in CSV

function rowToObj(row){
  const obj = {};
  for(const c of COLUMNS){
    const idx = headerMap ? headerMap[c] : -1;
    obj[c] = (idx != null && idx >= 0) ? (row[idx] ?? "") : "";
  }
  return obj;
}

function applyFilters(){
  const q = ($("#searchInput")?.value || "").trim().toLowerCase();
  const model = ($("#modelFilter")?.value || "").trim();
  const scenario = ($("#scenarioFilter")?.value || "").trim();
  const iteration = ($("#settingFilter")?.value || "").trim();

  viewRows = rawRows.filter(r => {
    if(scenario && String(r["__scenario"] ?? "") !== scenario) return false;
    if(model){
      // If CSV rows include Model values, filter by them. Otherwise, map scenario -> model.
      const modelsInData = uniqueValuesFrom(rawRows, "Model");
      if(modelsInData.length > 0){
        if(String(r["Model"] ?? "").trim() !== model) return false;
      }else{
        const mapped = SCENARIO_MODEL_MAP[String(r["__scenario"] ?? "")];
        if(mapped !== model) return false;
      }
    }
    if(iteration && String(r["Iteration"] ?? "").trim() !== iteration) return false;

    if(!q) return true;
    const hay = COLUMNS.map(c => String(r[c] ?? "")).join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderTable();
}

function sortBy(key){
  if(sortKey === key){
    sortAsc = !sortAsc;
  }else{
    sortKey = key;
    sortAsc = true;
  }
  viewRows.sort((r1,r2) => {
    const c = compare(r1[key], r2[key]);
    return sortAsc ? c : -c;
  });
  renderTable();
}

function adjustHeaderForScenario(scenario){
  // No scenario-specific header adjustments needed for the current CSV set.
}

function renderTable(){
  const tbody = $("#resultsTable tbody");
  if(!tbody) return;

  tbody.innerHTML = viewRows.map(r => {
    const detect = badge(r["Detect"]);
    const fallback = badge(r["Use Fallback"]);
    const compile = badge(r["Compile"]);
    const test = badge(r["Test"]);
    const useful = badge(r["Usefulness"]);

    return `
      <tr>
        <td>${escapeHtml(r["Model"])}</td>
        <td>${escapeHtml(r["File"])}</td>
        <td>${escapeHtml(r["Start Line"])}</td>
        <td>${escapeHtml(r["End Line"])}</td>
        <td>${detect}</td>
        <td class="fallback-cell">${fallback}</td>
        <td>${escapeHtml(r["Iteration"])}</td>
        <td>${compile}</td>
        <td>${test}</td>
        <td>${useful}</td>
      </tr>
    `;
  }).join("");

  // Fill dropdowns based on CURRENT view
  const modelsInData = uniqueValuesFrom(rawRows, "Model");
  const modelOptions = modelsInData.length > 0 ? modelsInData : STATIC_MODELS;
  fillSelect($("#modelFilter"), modelOptions);
  fillSelect($("#settingFilter"), uniqueValuesFrom(viewRows, "Iteration"));

  const currentScenario = ($("#scenarioFilter")?.value || "").trim();
  adjustHeaderForScenario(currentScenario);
}

async function loadResultsCsv(selectedScenario){
  async function loadOne(url, scenarioLabel){
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const rows = parseCsv(text).filter(r => r.some(x => String(x).trim() !== ""));
    if(rows.length < 2) return [];

    // Attempt to build a robust header row. Some CSVs have header tokens split
    // across the first two physical lines (e.g., a stray newline before "usefulness").
    let rawHeaders = rows[0].map(h => String(h ?? "").trim());

    // Provide alternative aliases for common header name variations
    const ALIASES = {
      "Model": ["model"],
      "File": ["filename","filepath","path","file"],
      "Start Line": ["startline","startlineno","start"],
      "End Line": ["endline","endlineno","end"],
      "Detect": ["detect","detected"],
      "Use Fallback": ["usefallback","fallback","usefallbacks"],
      "Iteration": ["iteration","iterations","iter"],
      "Compile": ["compile","compiled"],
      "Test": ["test","tests","tested"],
      "Usefulness": ["usefulness","useful"]
    };

    // Known header tokens (normalized) to look for in the next row if header is split
    const KNOWN_HEADER_TOKENS = new Set(Object.values(ALIASES).flat().map(normKey).concat(Object.keys(ALIASES).map(normKey)));

    // If the following row contains header-like tokens that are missing from rawHeaders,
    // append them to rawHeaders and consume that row as part of header.
    let extraHeaderRowUsed = false;
    if(rows.length > 1){
      const nextRow = rows[1].map(h => String(h ?? "").trim());
      const existingNorms = new Set(rawHeaders.map(normKey));
      const toAppend = [];
      for(const cell of nextRow){
        if(!cell) continue;
        const nk = normKey(cell);
        if(KNOWN_HEADER_TOKENS.has(nk) && !existingNorms.has(nk)){
          toAppend.push(cell);
          existingNorms.add(nk);
        }
      }
      if(toAppend.length > 0){
        rawHeaders = rawHeaders.concat(toAppend);
        extraHeaderRowUsed = true;
      }
    }

    const headerIndexByNorm = new Map();
    rawHeaders.forEach((h, i) => {
      const k = normKey(h);
      if(k) headerIndexByNorm.set(k, i);
    });

    headerMap = {};
    for(const c of COLUMNS){
      const canon = normKey(c);
      let idx = headerIndexByNorm.get(canon);
      if(idx == null){
        const alts = ALIASES[c] || [];
        for(const a of alts){
          const ai = headerIndexByNorm.get(normKey(a));
          if(ai != null){ idx = ai; break; }
        }
      }
      headerMap[c] = (idx == null ? -1 : idx);
    }

    // ---- Special handling for SingleLLM CSV format ----
    // If the CSV has "Iterations"/"Iteration" but not "Success Iteration Number",
    // map Iterations → Success Iteration Number
    if(scenarioLabel === "SingleLLM" && headerMap["Success Iteration Number"] === -1){
      const iterIdx = headerIndexByNorm.get("iterations") ?? headerIndexByNorm.get("iteration");
      if(iterIdx != null){
        headerMap["Success Iteration Number"] = iterIdx;
      }
    }

    const dataRows = extraHeaderRowUsed ? rows.slice(2) : rows.slice(1);

    return dataRows
      .filter(r => r.some(x => String(x).trim() !== ""))
      .map(rowToObj)
      .map(obj => ({...obj, __scenario: scenarioLabel}));
  }

  try{
    if(selectedScenario && SCENARIO_FILES[selectedScenario]){
      rawRows = await loadOne(SCENARIO_FILES[selectedScenario], selectedScenario);
    }else{
      const all = [];
      for(const [sc, url] of Object.entries(SCENARIO_FILES)){
        try{
          const rows = await loadOne(url, sc);
          all.push(...rows);
        }catch(e){
          console.warn("Could not load", url);
        }
      }
      rawRows = all;
    }
  }catch(err){
    console.error("Failed to load scenario CSV", err);
    rawRows = [];
  }

  viewRows = [...rawRows];
  applyFilters();
}

function initSorting(){
  $$("#resultsTable thead th").forEach(th => {
    const key = th.dataset.sort;
    if(!key) return;
    th.addEventListener("click", () => sortBy(key));
  });
}

// =========================
// JDeodorant table (separate headers)
// =========================

let rawJdeoRows = [];
let viewJdeoRows = [];
let jdeoSortKey = null;
let jdeoSortAsc = true;

const JDEO_COLUMNS = [
  "filename",
  "start line",
  "end line",
  "compile",
  "test",
  "Correct?",
  "Precondition violation"
];

let jdeoHeaderMap = null;

function jdeoRowToObj(row){
  const obj = {};
  for(const c of JDEO_COLUMNS){
    const idx = jdeoHeaderMap ? jdeoHeaderMap[c] : -1;
    obj[c] = (idx != null && idx >= 0) ? (row[idx] ?? "") : "";
  }
  return obj;
}

function applyJdeoFilters(){
  const q = ($("#jdeoSearchInput")?.value || "").trim().toLowerCase();
  const correctness = ($("#jdeoCorrectFilter")?.value || "").trim();

  viewJdeoRows = rawJdeoRows.filter(r => {
    if(correctness && String(r["Correct?"] ?? "").trim() !== correctness) return false;

    if(!q) return true;
    const hay = JDEO_COLUMNS.map(c => String(r[c] ?? "")).join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderJdeoTable();
}

function jdeoSortBy(key){
  if(jdeoSortKey === key){
    jdeoSortAsc = !jdeoSortAsc;
  }else{
    jdeoSortKey = key;
    jdeoSortAsc = true;
  }
  viewJdeoRows.sort((a,b) => {
    const c = compare(a[key], b[key]);
    return jdeoSortAsc ? c : -c;
  });
  renderJdeoTable();
}

function renderJdeoTable(){
  const tbody = $("#jdeoTable tbody");
  if(!tbody) return;

  tbody.innerHTML = viewJdeoRows.map(r => {
    const compile = badge(r["compile"]);
    const test = badge(r["test"]);
    const correct = badge(r["Correct?"]);
    const pcv = badge(r["Precondition violation"]);

    return `
      <tr>
        <td class="filename-cell">${escapeHtml(r["filename"])}</td>
        <td class="small-cell">${escapeHtml(r["start line"])}</td>
        <td class="small-cell">${escapeHtml(r["end line"])}</td>
        <td class="small-cell">${compile}</td>
        <td class="small-cell">${test}</td>
        <td class="small-cell">${correct}</td>
        <td class="precondition-cell">${pcv}</td>
      </tr>
    `;
  }).join("");

  fillSelect($("#jdeoCorrectFilter"), uniqueValuesFrom(rawJdeoRows, "Correct?"));
}

async function loadJdeoCsv(){
  const url = "./downloads/results_jdeodorant.csv";

  function showJdeoBanner(html){
    const sec = document.querySelector("#jdeodorant");
    if(!sec) return;

    const existing = sec.querySelector("[data-jdeo-banner]");
    if(existing) existing.remove();

    const banner = document.createElement("div");
    banner.setAttribute("data-jdeo-banner", "1");
    banner.style.margin = "12px 0";
    banner.style.padding = "10px 14px";
    banner.style.border = "1px solid var(--border)";
    banner.style.borderRadius = "12px";
    banner.style.background = "var(--panel)";
    banner.innerHTML = html;

    const head = sec.querySelector(".section__head");
    if(head) head.insertAdjacentElement("afterend", banner);
  }

  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok){
      // If file not found, show a subtle info banner instead of an error.
      if(res.status === 404){
        showJdeoBanner(`ℹ️ <b>No JDeodorant results provided</b>. Place <span class="mono">results_jdeodorant.csv</span> in the <span class="mono">downloads/</span> folder to enable this table.`);
        rawJdeoRows = [];
        viewJdeoRows = [];
        renderJdeoTable();
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();

    const rows = parseCsv(text).filter(r => r.some(x => String(x).trim() !== ""));
    if(rows.length < 2){
      showJdeoBanner(`⚠️ <b>No data found</b> in <span class="mono">${escapeHtml(url)}</span>. CSV only has header or is empty.`);
      rawJdeoRows = [];
      viewJdeoRows = [];
      renderJdeoTable();
      return;
    }

    const rawHeaders = rows[0].map(h => String(h ?? "").trim());
    const headerIndexByNorm = new Map();
    rawHeaders.forEach((h, i) => {
      const k = normKey(h);
      if(k) headerIndexByNorm.set(k, i);
    });

    jdeoHeaderMap = {};
    for(const c of JDEO_COLUMNS){
      const idx = headerIndexByNorm.get(normKey(c));
      jdeoHeaderMap[c] = (idx == null ? -1 : idx);
    }

    rawJdeoRows = rows.slice(1)
      .filter(r => r.some(x => String(x).trim() !== ""))
      .map(jdeoRowToObj);

    showJdeoBanner(`✅ Loaded <b>${rawJdeoRows.length}</b> rows from <span class="mono">${escapeHtml(url)}</span>.`);

    viewJdeoRows = [...rawJdeoRows];
    applyJdeoFilters();

  }catch(err){
    console.error("Failed to load JDeodorant CSV", err);
    showJdeoBanner(
      `❌ Could not load <span class="mono">${escapeHtml(url)}</span>. ` +
      `Make sure the file exists in <span class="mono">downloads/</span> and you are opening the site via <span class="mono">http://localhost:8001/</span>. ` +
      `Error: <span class="mono">${escapeHtml(err?.message || String(err))}</span>`
    );
    rawJdeoRows = [];
    viewJdeoRows = [];
    renderJdeoTable();
  }
}

function initJdeoSorting(){
  $$("#jdeoTable thead th").forEach(th => {
    const key = th.dataset.sort;
    if(!key) return;
    th.addEventListener("click", () => jdeoSortBy(key));
  });
}

function initControls(){
  // Main table controls
  $("#searchInput")?.addEventListener("input", applyFilters);
  $("#modelFilter")?.addEventListener("change", applyFilters);
  $("#settingFilter")?.addEventListener("change", applyFilters);
  $("#scenarioFilter")?.addEventListener("change", async (e) => {
    const sc = e.target.value;
    await loadResultsCsv(sc);
    applyFilters();
  });

  const dlBtn = $("#downloadCsvBtn");
  if(dlBtn){
    dlBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = "./downloads/results.zip";
      a.download = "results.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  // JDeodorant controls
  $("#jdeoSearchInput")?.addEventListener("input", applyJdeoFilters);
  $("#jdeoCorrectFilter")?.addEventListener("change", applyJdeoFilters);

  const jdeoDlBtn = $("#jdeoDownloadCsvBtn");
  if(jdeoDlBtn){
    jdeoDlBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = "./downloads/results_jdeodorant.csv";
      a.download = "results_jdeodorant.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  const copyBtn = $("#copyBibtexBtn");
  if(copyBtn){
    copyBtn.addEventListener("click", async () => {
      const bib = $("#bibtex");
      if(!bib) return;
      const text = bib.innerText;
      try{
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(()=> copyBtn.textContent = "Copy BibTeX", 900);
      }catch{
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        copyBtn.textContent = "Copied!";
        setTimeout(()=> copyBtn.textContent = "Copy BibTeX", 900);
      }
    });
  }

  const themeBtn = $("#themeToggle");
  if(themeBtn){
    themeBtn.addEventListener("click", toggleTheme);
  }
}

function initFooter(){
  const y = $("#year");
  if(y) y.textContent = String(new Date().getFullYear());
}

initTheme();
document.addEventListener("DOMContentLoaded", async () => {
  initControls();
  initSorting();
  initJdeoSorting();
  initFooter();

  await loadResultsCsv();
  await loadJdeoCsv();
});
