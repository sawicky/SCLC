/* =========================================================
   SC Loot Distributor - frontend
   ========================================================= */

// ---------- State ----------
const state = {
  items: [],          // raw items array from /api/items
  filtered: [],       // items after filters applied
  filters: { search: "", size: null, grade: null, industry: null },
  openCategories: new Set(),
  openSubcategories: new Set(),

  // People
  people: [],         // array of names
  selected: new Set(),// names currently selected
  lastClickedIndex: null,

  // Distribution memory
  methodByItem: {},   // itemId -> method
  weightsByPerson: {},// name -> weight (default 1)
  lastWonAt: {},      // name -> timestamp (ms)
  activity: [],       // [{ts, item, winner, method}]

  // Wishlists + focus
  wishlists: {},      // name -> [itemId, ...]
  focusedPerson: null,// last-clicked person, shown in the person panel

  // Attendance points (manually managed by the loot master)
  points: {},         // name -> integer
  // Permanent per-person win log (never trimmed; the global activity feed
  // can still cap for readability without losing per-person history).
  winsByPerson: {},   // name -> [{ts, itemId, item, method}]

  // Session: items collected this loot session, distributed later.
  session: [],        // array of itemIds
  // SCKP: transient per-person point spend for the current roll (not persisted).
  sckpSpend: {},      // name -> integer

  // UI
  currentItem: null,
  activeTab: "catalog",
};

const LS = {
  people: "sclo.people.v1",
  methodByItem: "sclo.methodByItem.v1",
  weights: "sclo.weights.v1",
  lastWonAt: "sclo.lastWonAt.v1",
  activity: "sclo.activity.v1",
  openCats: "sclo.openCats.v1",
  openSubs: "sclo.openSubs.v1",
  wishlists: "sclo.wishlists.v1",
  focused: "sclo.focused.v1",
  points: "sclc.points.v1",
  winsByPerson: "sclc.winsByPerson.v1",
  session: "sclc.session.v1",
};

// ---------- Storage helpers ----------
function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (_) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
// localStorage may hold data from an older app version or be hand-edited.
// These coerce a stored value to the expected shape so a wrong type can't
// crash startup (e.g. new Set() on a non-iterable, .forEach on a non-array).
function lsArray(key) {
  const v = lsGet(key, null);
  return Array.isArray(v) ? v : [];
}
function lsObject(key) {
  const v = lsGet(key, null);
  return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
}

function loadPersistence() {
  state.people = lsArray(LS.people);
  state.methodByItem = lsObject(LS.methodByItem);
  state.weightsByPerson = lsObject(LS.weights);
  state.lastWonAt = lsObject(LS.lastWonAt);
  state.activity = lsArray(LS.activity);
  state.openCategories = new Set(lsArray(LS.openCats));
  state.openSubcategories = new Set(lsArray(LS.openSubs));
  state.wishlists = lsObject(LS.wishlists);
  state.focusedPerson = lsGet(LS.focused, null);
  state.points = lsObject(LS.points);
  state.winsByPerson = lsObject(LS.winsByPerson);
  state.session = lsArray(LS.session);

  // Migration: if winsByPerson is empty but activity has entries, seed it
  // (so users upgrading from an earlier version keep their history).
  if (Object.keys(state.winsByPerson).length === 0 && state.activity.length > 0) {
    for (const e of state.activity) {
      if (!e || !e.winner) continue;
      if (!state.winsByPerson[e.winner]) state.winsByPerson[e.winner] = [];
      state.winsByPerson[e.winner].push({
        ts: e.ts, itemId: e.itemId, item: e.item, method: e.method,
      });
    }
    lsSet(LS.winsByPerson, state.winsByPerson);
  }
}

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  tree: $("#tree"),
  emptyState: $("#empty-state"),
  itemCount: $("#item-count"),
  search: $("#search"),
  // Tabs + session view
  catalogTabs: $("#catalog-tabs"),
  catalogView: $("#catalog-view"),
  sessionView: $("#session-view"),
  sessionList: $("#session-list"),
  sessionEmpty: $("#session-empty"),
  sessionCount: $("#session-count"),
  clearSession: $("#clear-session"),
  searchWrap: document.querySelector(".search-wrap"),
  fSize: $("#filter-size"),
  fGrade: $("#filter-grade"),
  fIndustry: $("#filter-industry"),
  clearFilters: $("#clear-filters"),
  reload: $("#reload-items"),
  // People
  people: $("#people"),
  newPerson: $("#new-person"),
  addForm: $("#add-person-form"),
  peopleCount: $("#people-count"),
  selectedCount: $("#selected-count"),
  selectAll: $("#select-all"),
  selectNone: $("#select-none"),
  addAttendance: $("#add-attendance"),
  // Activity
  activity: $("#activity"),
  clearActivity: $("#clear-activity"),
  // Person detail panel
  side: document.querySelector(".side"),
  personPanel: $("#person-panel"),
  personEmpty: $("#person-empty"),
  personDetail: $("#person-detail"),
  focusedName: $("#focused-name"),
  wishlist: $("#wishlist"),
  wishlistCount: $("#wishlist-count"),
  personWins: $("#person-wins"),
  personWinsCount: $("#person-wins-count"),
  // Wishlist controls inside item modal
  wishlistChips: $("#wishlist-chips"),
  wishlistEmpty: $("#wishlist-empty"),
  // OCR / paste image
  ocrBackdrop: $("#ocr-backdrop"),
  ocrClose: $("#ocr-close"),
  ocrDrop: $("#ocr-drop"),
  ocrDropLabel: $("#ocr-drop-label"),
  ocrFile: $("#ocr-file-input"),
  ocrProgress: $("#ocr-progress"),
  ocrProgressFill: document.querySelector("#ocr-progress .ocr-progress-fill"),
  ocrProgressLabel: document.querySelector("#ocr-progress .ocr-progress-label"),
  ocrPreviewWrap: $("#ocr-preview-wrap"),
  ocrPreview: $("#ocr-preview"),
  ocrResults: $("#ocr-results"),
  ocrList: $("#ocr-list"),
  ocrDetectedCount: $("#ocr-detected-count"),
  ocrSelectAll: $("#ocr-select-all"),
  ocrSelectNone: $("#ocr-select-none"),
  ocrAddRow: $("#ocr-add-row"),
  ocrConfirm: $("#ocr-confirm"),
  ocrSummary: $("#ocr-summary"),
  pasteImageBtn: $("#paste-image-btn"),
  // Modal
  backdrop: $("#modal-backdrop"),
  modalClose: $("#modal-close"),
  mImage: $("#modal-image"),
  mImageHolder: $("#modal-image-placeholder"),
  mCategory: $("#modal-category"),
  mSubcategory: $("#modal-subcategory"),
  mSize: $("#modal-size"),
  mGrade: $("#modal-grade"),
  mIndustry: $("#modal-industry"),
  mTitle: $("#modal-title"),
  mMfr: $("#modal-manufacturer"),
  mDesc: $("#modal-description"),
  mStats: $("#modal-stats"),
  method: $("#dist-method"),
  weightEditor: $("#weight-editor"),
  sckpEditor: $("#sckp-editor"),
  addToSession: $("#add-to-session-btn"),
  distSummary: $("#dist-selected-summary"),
  distribute: $("#distribute-btn"),
  distResult: $("#dist-result"),
  toast: $("#toast"),
};

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, kind) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden", "error");
  if (kind === "error") els.toast.classList.add("error");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2400);
}

// ---------- Items fetching ----------
async function fetchItems() {
  try {
    // Static deployment: fetch the bundled JSON directly. Works on any static
    // host (Supabase Storage, Vercel, Netlify, GitHub Pages, Pages, etc.) and
    // also through the optional Express dev server.
    const url = "./data/items.json?t=" + Date.now(); // cache-bust on Reload
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    buildFilterChips();
    applyFilters();
    renderPersonDetail(); // resolve wishlist + win item names now that catalog is loaded
    if (state.activeTab === "session") renderSession();
    els.itemCount.textContent = `${state.items.length} items`;
    toast(`Loaded ${state.items.length} items`);
  } catch (err) {
    console.error(err);
    toast("Failed to load items.json", "error");
    els.itemCount.textContent = "0 items";
  }
}

// ---------- Filter chips ----------
function uniqueValues(key) {
  const set = new Set();
  for (const it of state.items) {
    const v = it[key];
    if (v) set.add(v);
  }
  return [...set];
}

// Sort sizes naturally: S0..S12, then non-S values
function sortSizes(arr) {
  const sNum = (s) => {
    const m = /^S(\d+)/i.exec(s);
    return m ? parseInt(m[1], 10) : 1000;
  };
  return [...arr].sort((a, b) => sNum(a) - sNum(b) || a.localeCompare(b));
}

const GRADE_ORDER = ["A", "B", "C", "D", "E"];
function sortGrades(arr) {
  return [...arr].sort((a, b) => {
    const i = GRADE_ORDER.indexOf(a), j = GRADE_ORDER.indexOf(b);
    if (i === -1 && j === -1) return a.localeCompare(b);
    if (i === -1) return 1;
    if (j === -1) return -1;
    return i - j;
  });
}

function buildFilterChips() {
  renderChips(els.fSize, sortSizes(uniqueValues("size")), "size");
  renderChips(els.fGrade, sortGrades(uniqueValues("grade")), "grade");
  renderChips(els.fIndustry, uniqueValues("industry").sort(), "industry");
}
function renderChips(container, values, key) {
  container.innerHTML = "";
  for (const v of values) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = v;
    chip.dataset.value = v;
    if (state.filters[key] === v) chip.classList.add("active");
    chip.addEventListener("click", () => {
      state.filters[key] = state.filters[key] === v ? null : v;
      buildFilterChips();
      applyFilters();
    });
    container.appendChild(chip);
  }
}

// ---------- Filtering + rendering ----------
function applyFilters() {
  const q = state.filters.search.trim().toLowerCase();
  state.filtered = state.items.filter((it) => {
    if (state.filters.size && it.size !== state.filters.size) return false;
    if (state.filters.grade && it.grade !== state.filters.grade) return false;
    if (state.filters.industry && it.industry !== state.filters.industry) return false;
    if (q) {
      const hay = [
        it.name, it.manufacturer, it.description, it.category, it.subcategory,
        it.size, it.grade, it.industry,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderTree();
}

function groupForTree(items) {
  // Group: category -> subcategory -> items[]
  const out = new Map();
  for (const it of items) {
    const cat = it.category || "Uncategorised";
    const sub = it.subcategory || "Other";
    if (!out.has(cat)) out.set(cat, new Map());
    const subMap = out.get(cat);
    if (!subMap.has(sub)) subMap.set(sub, []);
    subMap.get(sub).push(it);
  }
  // Sort categories and subcategories alphabetically; sort items by size then name.
  return out;
}

function renderTree() {
  els.tree.innerHTML = "";
  if (state.filtered.length === 0) {
    els.emptyState.classList.remove("hidden");
    return;
  }
  els.emptyState.classList.add("hidden");

  const grouped = groupForTree(state.filtered);
  // Expand all categories automatically if a search is active so results are visible
  const searching = state.filters.search.trim().length > 0
    || state.filters.size || state.filters.grade || state.filters.industry;

  const cats = [...grouped.keys()].sort();
  for (const cat of cats) {
    const subMap = grouped.get(cat);
    const totalItems = [...subMap.values()].reduce((n, arr) => n + arr.length, 0);

    const catEl = document.createElement("div");
    catEl.className = "category";
    if (state.openCategories.has(cat) || searching) catEl.classList.add("open");

    const head = document.createElement("div");
    head.className = "category-head";
    head.innerHTML = `
      <span class="chev">&#9656;</span>
      <span class="category-name"></span>
      <span class="category-meta"></span>
    `;
    head.querySelector(".category-name").textContent = cat;
    head.querySelector(".category-meta").textContent = `${subMap.size} groups • ${totalItems} items`;
    head.addEventListener("click", () => {
      catEl.classList.toggle("open");
      if (catEl.classList.contains("open")) state.openCategories.add(cat);
      else state.openCategories.delete(cat);
      lsSet(LS.openCats, [...state.openCategories]);
    });
    catEl.appendChild(head);

    const subs = [...subMap.keys()].sort();
    for (const sub of subs) {
      const items = subMap.get(sub).slice().sort(itemSort);
      const subKey = `${cat}::${sub}`;
      const subEl = document.createElement("div");
      subEl.className = "subcategory";
      if (state.openSubcategories.has(subKey) || searching) subEl.classList.add("open");

      const subHead = document.createElement("div");
      subHead.className = "sub-head";
      subHead.innerHTML = `<span class="chev">&#9656;</span><span></span>`;
      subHead.querySelector("span:last-child").textContent = `${sub} (${items.length})`;
      subHead.addEventListener("click", () => {
        subEl.classList.toggle("open");
        if (subEl.classList.contains("open")) state.openSubcategories.add(subKey);
        else state.openSubcategories.delete(subKey);
        lsSet(LS.openSubs, [...state.openSubcategories]);
      });
      subEl.appendChild(subHead);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "sub-items";
      for (const it of items) {
        itemsWrap.appendChild(renderItemCard(it));
      }
      subEl.appendChild(itemsWrap);
      catEl.appendChild(subEl);
    }

    els.tree.appendChild(catEl);
  }
}

function itemSort(a, b) {
  // sort by size first (S1<S2<..), then grade, then name
  const sizeNum = (s) => {
    if (!s) return 1000;
    const m = /^S(\d+)/i.exec(s);
    return m ? parseInt(m[1], 10) : 999;
  };
  const sa = sizeNum(a.size), sb = sizeNum(b.size);
  if (sa !== sb) return sa - sb;
  const ga = GRADE_ORDER.indexOf(a.grade), gb = GRADE_ORDER.indexOf(b.grade);
  if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
  return (a.name || "").localeCompare(b.name || "");
}

function renderItemCard(item) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "item-card";
  card.dataset.id = item.id;

  // Marker if any roster member has this on their wishlist
  const wishers = wishersOf(item.id);
  if (wishers.length) {
    card.classList.add("wishlisted");
    const mark = document.createElement("span");
    mark.className = "wishlist-marker";
    mark.title = "Wishlisted by " + wishers.join(", ");
    mark.textContent = "★"; // ★
    card.appendChild(mark);
  }

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item.name;
  card.appendChild(name);

  const badges = document.createElement("div");
  badges.className = "badges";
  if (item.size)     badges.appendChild(tag(item.size, "size"));
  if (item.grade)    badges.appendChild(tag(`Grade ${item.grade}`, "grade"));
  if (item.industry) badges.appendChild(tag(item.industry, "industry"));
  card.appendChild(badges);

  if (item.manufacturer) {
    const mfr = document.createElement("div");
    mfr.className = "muted small";
    mfr.textContent = item.manufacturer;
    card.appendChild(mfr);
  }

  card.addEventListener("click", () => openItemModal(item));
  return card;
}

// Return the list of roster members who have this itemId on their wishlist.
function wishersOf(itemId) {
  const out = [];
  for (const name of state.people) {
    const wl = state.wishlists[name] || [];
    if (wl.includes(itemId)) out.push(name);
  }
  return out;
}
function tag(text, cls = "") {
  const el = document.createElement("span");
  el.className = "tag " + cls;
  el.textContent = text;
  return el;
}

// ---------- People ----------
function renderPeople() {
  els.people.innerHTML = "";
  state.people.forEach((name, idx) => {
    const li = document.createElement("li");
    let cls = "person";
    if (state.selected.has(name)) cls += " selected";
    if (state.focusedPerson === name) cls += " focused";
    li.className = cls;
    li.dataset.index = idx;

    const span = document.createElement("span");
    span.className = "pname";
    span.appendChild(document.createTextNode(name));
    const pts = document.createElement("span");
    pts.className = "pts-tag";
    pts.title = "Attendance points";
    pts.textContent = `(${state.points[name] ?? 0})`;
    span.appendChild(pts);
    li.appendChild(span);

    const rm = document.createElement("button");
    rm.className = "remove";
    rm.type = "button";
    rm.innerHTML = "&times;";
    rm.title = "Remove";
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      removePerson(name);
    });
    li.appendChild(rm);

    li.addEventListener("click", (e) => onPersonClick(e, idx, name));
    els.people.appendChild(li);
  });
  els.peopleCount.textContent = state.people.length ? `${state.people.length}` : "";
  updateSelectedSummary();
  renderPersonDetail();
  // Keep wishlist chips in item modal in sync if it's open
  if (state.currentItem) renderWishlistChips();
}

function onPersonClick(e, idx, name) {
  const isCtrl = e.ctrlKey || e.metaKey;
  const isShift = e.shiftKey;

  if (isShift && state.lastClickedIndex != null) {
    const [a, b] = [state.lastClickedIndex, idx].sort((x, y) => x - y);
    if (!isCtrl) state.selected.clear();
    for (let i = a; i <= b; i++) state.selected.add(state.people[i]);
  } else if (isCtrl) {
    if (state.selected.has(name)) state.selected.delete(name);
    else state.selected.add(name);
    state.lastClickedIndex = idx;
  } else {
    state.selected.clear();
    state.selected.add(name);
    state.lastClickedIndex = idx;
  }
  // The last-clicked person is also the "focused" one whose detail we show.
  setFocusedPerson(name);
  renderPeople();
}

function setFocusedPerson(name) {
  state.focusedPerson = name;
  lsSet(LS.focused, name);
}

function addPerson(name) {
  name = name.trim();
  if (!name) return false;
  if (state.people.includes(name)) {
    toast(`${name} is already in the roster`, "error");
    return false;
  }
  state.people.push(name);
  if (!(name in state.points)) state.points[name] = 0;
  lsSet(LS.people, state.people);
  lsSet(LS.points, state.points);
  renderPeople();
  return true;
}

// Bulk add - used by the paste-image OCR flow.
function addPeopleBulk(names) {
  let added = 0;
  for (const raw of names) {
    const n = (raw || "").trim();
    if (!n) continue;
    if (state.people.includes(n)) continue;
    state.people.push(n);
    if (!(n in state.points)) state.points[n] = 0;
    added++;
  }
  if (added > 0) {
    lsSet(LS.people, state.people);
    lsSet(LS.points, state.points);
    renderPeople();
  }
  return added;
}

function setPoints(name, value) {
  const v = Number.isFinite(value) ? Math.round(value) : 0;
  state.points[name] = v;
  lsSet(LS.points, state.points);
  renderPeople();
  if (state.focusedPerson === name) renderPersonDetail();
}
function adjustPoints(name, delta) {
  setPoints(name, (state.points[name] ?? 0) + delta);
}
// Bulk +1 attendance for every currently-selected roster member.
function addAttendanceForSelected() {
  const names = [...state.selected];
  if (names.length === 0) {
    toast("Select people first", "error");
    return;
  }
  for (const name of names) {
    state.points[name] = (state.points[name] ?? 0) + 1;
  }
  lsSet(LS.points, state.points);
  renderPeople();
  toast(`+1 attendance for ${names.length} ${names.length === 1 ? "person" : "people"}`);
}
function removePerson(name) {
  // Removal takes them out of the active roster but DOES NOT erase their
  // loot history, wishlist or points - add them back later (same name) and
  // everything returns. This is intentional: loot history never disappears.
  state.people = state.people.filter((p) => p !== name);
  state.selected.delete(name);
  if (state.focusedPerson === name) {
    state.focusedPerson = null;
    lsSet(LS.focused, null);
  }
  lsSet(LS.people, state.people);
  renderPeople();
  renderTree();
}

function updateSelectedSummary() {
  const n = state.selected.size;
  els.selectedCount.textContent = n ? `${n} selected` : "";
  if (state.currentItem) {
    const names = [...state.selected];
    els.distSummary.textContent = n
      ? `${n} selected: ${names.slice(0, 4).join(", ")}${n > 4 ? "…" : ""}`
      : "No one selected.";
    els.distribute.disabled = n === 0;
    renderMethodEditors();
  }
}

// ---------- Points control ----------
function makePointsControl(name, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "points-ctl";
  wrap.title = "Attendance points for " + name;
  // Stop clicks here from also selecting the row.
  wrap.addEventListener("click", (e) => e.stopPropagation());

  const minus = document.createElement("button");
  minus.type = "button";
  minus.textContent = "−";
  minus.title = "−1";
  minus.addEventListener("click", () => adjustPoints(name, -1));

  const val = document.createElement("input");
  val.type = "number";
  val.className = "pts-val";
  val.value = state.points[name] ?? 0;
  val.title = "Click to set points directly";
  val.addEventListener("focus", () => val.select());
  val.addEventListener("change", () => {
    const n = parseInt(val.value, 10);
    setPoints(name, Number.isFinite(n) ? n : 0);
  });
  val.addEventListener("keydown", (e) => {
    if (e.key === "Enter") val.blur();
  });

  const plus = document.createElement("button");
  plus.type = "button";
  plus.textContent = "+";
  plus.title = "+1";
  plus.addEventListener("click", () => adjustPoints(name, 1));

  wrap.appendChild(minus);
  wrap.appendChild(val);
  wrap.appendChild(plus);
  return wrap;
}

// ---------- Wishlist + person detail ----------
function toggleWishlist(name, itemId) {
  if (!state.wishlists[name]) state.wishlists[name] = [];
  const arr = state.wishlists[name];
  const idx = arr.indexOf(itemId);
  if (idx === -1) arr.push(itemId);
  else arr.splice(idx, 1);
  lsSet(LS.wishlists, state.wishlists);
  renderWishlistChips();
  renderPersonDetail();
  // Update tree so the marker appears/disappears on the card.
  renderTree();
}

function renderWishlistChips() {
  if (!state.currentItem) return;
  const itemId = state.currentItem.id;
  els.wishlistChips.innerHTML = "";
  if (state.people.length === 0) {
    els.wishlistEmpty.classList.remove("hidden");
    return;
  }
  els.wishlistEmpty.classList.add("hidden");
  for (const name of state.people) {
    const on = (state.wishlists[name] || []).includes(itemId);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "wishlist-chip" + (on ? " on" : "");
    chip.innerHTML = `<span class="star">${on ? "★" : "☆"}</span><span class="who"></span>`;
    chip.querySelector(".who").textContent = name;
    chip.title = on ? "Remove from " + name + "'s wishlist" : "Add to " + name + "'s wishlist";
    chip.addEventListener("click", () => toggleWishlist(name, itemId));
    els.wishlistChips.appendChild(chip);
  }
}

function renderPersonDetail() {
  const name = state.focusedPerson;

  // If multiple people are selected the focus panel is intentionally hidden
  // so it doesn't fight the multi-select workflow.
  if (state.selected.size > 1) {
    els.personDetail.classList.add("hidden");
    els.personEmpty.classList.remove("hidden");
    els.personEmpty.textContent =
      `${state.selected.size} people selected - focus view is hidden. Click a single name to see their wishlist and wins.`;
    els.focusedName.textContent = "";
    return;
  }

  if (!name || !state.people.includes(name)) {
    els.personDetail.classList.add("hidden");
    els.personEmpty.classList.remove("hidden");
    els.personEmpty.textContent = "Click a name above to see their wishlist and wins.";
    els.focusedName.textContent = "";
    return;
  }

  els.personEmpty.classList.add("hidden");
  els.personDetail.classList.remove("hidden");
  els.focusedName.textContent = name;

  // Points display + control (re-rendered each time to stay in sync)
  let pd = document.getElementById("person-points");
  if (!pd) {
    pd = document.createElement("div");
    pd.id = "person-points";
    pd.className = "points-display";
    els.personDetail.insertBefore(pd, els.personDetail.firstChild);
  }
  pd.innerHTML = `
    <span class="label">Attendance points</span>
    <span class="val"></span>
    <span class="ctl"></span>
  `;
  pd.querySelector(".val").textContent = state.points[name] ?? 0;
  pd.querySelector(".ctl").appendChild(makePointsControl(name));

  // Wishlist
  const wl = state.wishlists[name] || [];
  els.wishlistCount.textContent = wl.length ? `(${wl.length})` : "";
  els.wishlist.innerHTML = "";
  if (wl.length === 0) {
    const li = document.createElement("li");
    li.className = "person-list-empty";
    li.textContent = "No wishlist items. Open an item and click " + name + " to add.";
    els.wishlist.appendChild(li);
  } else {
    const byId = new Map(state.items.map((it) => [it.id, it]));
    for (const id of wl) {
      const item = byId.get(id);
      const li = document.createElement("li");
      const nameSpan = document.createElement("a");
      nameSpan.className = "iname";
      nameSpan.textContent = item ? item.name : id;
      nameSpan.addEventListener("click", () => { if (item) openItemModal(item); });
      li.appendChild(nameSpan);
      if (item && item.size) li.appendChild(tag(item.size, "size"));
      const rm = document.createElement("button");
      rm.className = "remove-wish";
      rm.type = "button";
      rm.title = "Remove from wishlist";
      rm.innerHTML = "&times;";
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWishlist(name, id);
      });
      li.appendChild(rm);
      els.wishlist.appendChild(li);
    }
  }

  // Permanent wins log (never trimmed - sourced from winsByPerson)
  const wins = (state.winsByPerson[name] || []).slice().reverse();
  els.personWinsCount.textContent = wins.length ? `(${wins.length})` : "";
  els.personWins.innerHTML = "";
  if (wins.length === 0) {
    const li = document.createElement("li");
    li.className = "person-list-empty";
    li.textContent = "No wins yet.";
    els.personWins.appendChild(li);
  } else {
    const byId = new Map(state.items.map((it) => [it.id, it]));
    for (const e of wins) {
      const li = document.createElement("li");
      const itemEl = document.createElement("a");
      itemEl.className = "iname";
      itemEl.textContent = e.item;
      const item = byId.get(e.itemId);
      if (item) {
        itemEl.addEventListener("click", () => openItemModal(item));
      } else {
        itemEl.style.cursor = "default";
      }
      li.appendChild(itemEl);
      const meta = document.createElement("span");
      meta.className = "meta";
      const d = new Date(e.ts);
      meta.textContent = methodLabel(e.method) + " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
      li.appendChild(meta);
      els.personWins.appendChild(li);
    }
  }
}

// ---------- Modal / item detail ----------
function openItemModal(item) {
  state.currentItem = item;

  // Header / meta
  els.mTitle.textContent = item.name;
  els.mCategory.textContent = item.category || "";
  els.mCategory.classList.toggle("hidden", !item.category);
  els.mSubcategory.textContent = item.subcategory || "";
  els.mSubcategory.classList.toggle("hidden", !item.subcategory);
  els.mSize.textContent = item.size || "";
  els.mSize.classList.toggle("hidden", !item.size);
  els.mGrade.textContent = item.grade ? `Grade ${item.grade}` : "";
  els.mGrade.classList.toggle("hidden", !item.grade);
  els.mIndustry.textContent = item.industry || "";
  els.mIndustry.classList.toggle("hidden", !item.industry);

  els.mMfr.textContent = item.manufacturer || "";
  els.mDesc.textContent = item.description || "";

  // Image
  if (item.image) {
    els.mImage.src = item.image;
    els.mImage.alt = item.name;
    els.mImage.classList.remove("hidden");
    els.mImageHolder.classList.add("hidden");
    els.mImage.onerror = () => {
      els.mImage.classList.add("hidden");
      els.mImageHolder.classList.remove("hidden");
      els.mImageHolder.textContent = "Image failed to load";
    };
  } else {
    els.mImage.removeAttribute("src");
    els.mImage.classList.add("hidden");
    els.mImageHolder.classList.remove("hidden");
    els.mImageHolder.textContent = "No screenshot";
  }

  // Stats
  els.mStats.innerHTML = "";
  const stats = item.stats || {};
  const keys = Object.keys(stats);
  if (keys.length === 0) {
    els.mStats.classList.add("hidden");
  } else {
    els.mStats.classList.remove("hidden");
    for (const k of keys) {
      const row = document.createElement("div");
      row.className = "stat";
      const ke = document.createElement("span"); ke.className = "k"; ke.textContent = humanKey(k);
      const ve = document.createElement("span"); ve.className = "v"; ve.textContent = formatStatValue(stats[k]);
      row.appendChild(ke); row.appendChild(ve);
      els.mStats.appendChild(row);
    }
  }

  // Method memory: default to last method used for this item, otherwise
  // roll-off. Legacy/unknown values fall back to roll-off.
  const VALID_METHODS = ["rolloff", "weighted", "least-recent", "sckp"];
  const storedMethod = state.methodByItem[item.id];
  els.method.value = VALID_METHODS.includes(storedMethod) ? storedMethod : "rolloff";
  state.sckpSpend = {};
  onMethodChange();
  els.distResult.classList.add("hidden");
  els.distResult.innerHTML = "";

  updateSelectedSummary();
  renderWishlistChips();
  updateAddToSessionBtn();

  els.backdrop.classList.remove("hidden");
  els.backdrop.setAttribute("aria-hidden", "false");
  // Defer the doc-click listener so the click that opened us doesn't fire it.
  setTimeout(() => document.addEventListener("click", onDocClickWhileOpen), 0);
}

function closeModal() {
  els.backdrop.classList.add("hidden");
  els.backdrop.setAttribute("aria-hidden", "true");
  state.currentItem = null;
  document.removeEventListener("click", onDocClickWhileOpen);
}

// Doc-level click handler that runs while the item panel is open.
// Closes the panel for clicks that aren't inside the panel itself and aren't
// inside the right-side roster column (which we want to keep usable).
//
// We test against the event's composedPath rather than `target.contains(...)`:
// clicking a roster name or a wishlist chip re-renders that part of the DOM
// inside its own click handler, which detaches the clicked node before this
// doc-level handler runs. A detached node fails every `contains()` check, so
// the panel used to close. composedPath() is captured at dispatch time and
// still includes the stable ancestor containers (.modal, .side).
function onDocClickWhileOpen(e) {
  if (els.backdrop.classList.contains("hidden")) return;
  const path = (e.composedPath && e.composedPath()) || [];
  const panel = els.backdrop.querySelector(".modal");
  // Click inside the panel? keep open.
  if (panel && path.includes(panel)) return;
  // Click inside the roster sidebar (roster, person panel, activity)? keep open.
  if (els.side && path.includes(els.side)) return;
  // Click on another item card (catalog or session)? let its own handler
  // reopen us with the new item instead of closing.
  if (path.some((el) => el.classList
      && (el.classList.contains("item-card") || el.classList.contains("session-card")))) return;
  closeModal();
}

function humanKey(k) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatStatValue(v) {
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toFixed(2);
  }
  return String(v);
}

// ---------- Weight editor ----------
function renderWeightEditor() {
  if (!state.currentItem) return;
  if (els.method.value !== "weighted") {
    els.weightEditor.classList.add("hidden");
    els.weightEditor.innerHTML = "";
    return;
  }
  els.weightEditor.classList.remove("hidden");
  els.weightEditor.innerHTML = "";
  const names = [...state.selected];
  if (names.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted small";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = "Select people to set weights.";
    els.weightEditor.appendChild(empty);
    return;
  }
  for (const name of names) {
    const row = document.createElement("div");
    row.className = "weight-row";
    const n = document.createElement("div"); n.className = "wname"; n.textContent = name;
    const i = document.createElement("input");
    // step="any" makes the spinner arrows move by whole integers while the
    // field still accepts manually-typed decimals.
    i.type = "number"; i.min = "0"; i.step = "any";
    i.value = state.weightsByPerson[name] ?? 1;
    i.addEventListener("input", () => {
      const v = parseFloat(i.value);
      state.weightsByPerson[name] = Number.isFinite(v) && v >= 0 ? v : 0;
      lsSet(LS.weights, state.weightsByPerson);
    });
    row.appendChild(n); row.appendChild(i);
    els.weightEditor.appendChild(row);
  }
}

// ---------- SCKP editor (Star Citizen Kill Points) ----------
// Manual points-spend: each selected person gets a field for how many
// attendance points they're spending on this item. Highest spend wins;
// the winner's points are deducted on Distribute.
function renderSckpEditor() {
  if (!state.currentItem) return;
  if (els.method.value !== "sckp") {
    els.sckpEditor.classList.add("hidden");
    els.sckpEditor.innerHTML = "";
    return;
  }
  els.sckpEditor.classList.remove("hidden");
  els.sckpEditor.innerHTML = "";
  const names = [...state.selected];
  if (names.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted small";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = "Select people, then enter the points each is spending.";
    els.sckpEditor.appendChild(empty);
    return;
  }
  for (const name of names) {
    const have = state.points[name] ?? 0;
    const row = document.createElement("div");
    row.className = "sckp-row";

    const n = document.createElement("div");
    n.className = "sname";
    n.textContent = name;

    const cur = document.createElement("div");
    cur.className = "scur";
    cur.textContent = `has ${have} pt`;

    const i = document.createElement("input");
    i.type = "number"; i.min = "0"; i.step = "1";
    i.value = state.sckpSpend[name] ?? 0;
    i.title = "Points " + name + " is spending on this item";
    i.addEventListener("focus", () => i.select());
    i.addEventListener("input", () => {
      const v = parseInt(i.value, 10);
      state.sckpSpend[name] = Number.isFinite(v) && v >= 0 ? v : 0;
    });

    row.appendChild(n);
    row.appendChild(cur);
    row.appendChild(i);
    els.sckpEditor.appendChild(row);
  }
}

// Show whichever method-specific editor matches the current method.
function renderMethodEditors() {
  renderWeightEditor();
  renderSckpEditor();
}

function onMethodChange() {
  if (state.currentItem) {
    state.methodByItem[state.currentItem.id] = els.method.value;
    lsSet(LS.methodByItem, state.methodByItem);
  }
  renderMethodEditors();
}

// ---------- Distribution ----------
function distribute() {
  if (!state.currentItem) return;
  const names = [...state.selected];
  if (names.length === 0) return;

  const method = els.method.value;
  let winner = null;

  if (method === "sckp") {
    distributeSckp(names);
    return;
  }

  if (method === "weighted") {
    const weights = names.map((n) => Math.max(0, state.weightsByPerson[n] ?? 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      // Fall back to uniform if all weights are 0
      winner = names[Math.floor(Math.random() * names.length)];
    } else {
      let r = Math.random() * sum;
      for (let i = 0; i < names.length; i++) {
        r -= weights[i];
        if (r <= 0) { winner = names[i]; break; }
      }
      if (!winner) winner = names[names.length - 1];
    }
    const detailStr = names
      .map((n, i) => `${n}: ${weights[i]}`)
      .join(", ");
    renderSimpleResult(winner, `Weighted random (${detailStr})`);
  } else if (method === "least-recent") {
    // Pick the person with the smallest lastWonAt (treat undefined = 0 = oldest).
    const ranked = names
      .map((n) => ({ name: n, t: state.lastWonAt[n] ?? 0 }))
      .sort((a, b) => a.t - b.t);
    const oldest = ranked[0].t;
    const tied = ranked.filter((r) => r.t === oldest);
    winner = tied[Math.floor(Math.random() * tied.length)].name;
    const rows = ranked.map((r) => ({
      name: r.name,
      value: r.t ? new Date(r.t).toLocaleString() : "never",
      isWinner: r.name === winner,
    }));
    renderRolloffResult(winner, "Least recent", rows);
  } else if (method === "rolloff") {
    const rolls = names.map((n) => ({ name: n, value: 1 + Math.floor(Math.random() * 100) }));
    // Animate the rolls before settling
    animateRolls(rolls, () => {
      const max = Math.max(...rolls.map((r) => r.value));
      const winners = rolls.filter((r) => r.value === max);
      // Tiebreak with another quick roll among ties
      winner = winners[Math.floor(Math.random() * winners.length)].name;
      const rows = [...rolls]
        .sort((a, b) => b.value - a.value)
        .map((r) => ({ name: r.name, value: r.value, isWinner: r.name === winner }));
      finalizeRolloff(winner, rows);
    });
    return; // finalize inside animation callback
  }

  if (winner) recordWin(winner, state.currentItem, method);
}

// SCKP: manual kill-points spend. Highest spender wins (ties broken by a
// roll); the winner's attendance points are reduced by what they spent.
function distributeSckp(names) {
  const spends = names.map((name) => ({
    name,
    spend: Math.max(0, Math.round(state.sckpSpend[name] ?? 0)),
    have: state.points[name] ?? 0,
  }));
  const top = Math.max(...spends.map((s) => s.spend));
  const tied = spends.filter((s) => s.spend === top);
  const won = tied[Math.floor(Math.random() * tied.length)];

  const remaining = Math.max(0, won.have - won.spend);
  setPoints(won.name, remaining);

  const rows = [...spends]
    .sort((a, b) => b.spend - a.spend)
    .map((s) => ({
      name: s.name,
      value: `${s.spend} pt`,
      isWinner: s.name === won.name,
    }));
  renderRolloffResult(won.name, `SCKP · spent ${won.spend}, ${remaining} left`, rows);
  recordWin(won.name, state.currentItem, "sckp");

  // Clear the spend fields so the editor is ready for the next item.
  state.sckpSpend = {};
  renderSckpEditor();
}

function renderSimpleResult(winner, methodLabel) {
  els.distResult.classList.remove("hidden");
  els.distResult.innerHTML = `
    <div class="winner-line">Winner: <span class="winner-name"></span></div>
    <div class="winner-meta"></div>
  `;
  els.distResult.querySelector(".winner-name").textContent = winner;
  els.distResult.querySelector(".winner-meta").textContent = `${methodLabel} • ${state.currentItem.name}`;
}

function renderRolloffResult(winner, methodLabel, rows) {
  els.distResult.classList.remove("hidden");
  const rowsHtml = rows.map((r) => `
    <div class="roll-row ${r.isWinner ? "winner" : ""}">
      <span class="rname"></span><span class="rval"></span>
    </div>
  `).join("");
  els.distResult.innerHTML = `
    <div class="winner-line">Winner: <span class="winner-name"></span></div>
    <div class="winner-meta"></div>
    <div class="rolls">${rowsHtml}</div>
  `;
  els.distResult.querySelector(".winner-name").textContent = winner;
  els.distResult.querySelector(".winner-meta").textContent = `${methodLabel} • ${state.currentItem.name}`;
  const rowEls = els.distResult.querySelectorAll(".roll-row");
  rows.forEach((r, i) => {
    rowEls[i].querySelector(".rname").textContent = r.name;
    rowEls[i].querySelector(".rval").textContent = r.value;
  });
}

// Roll-off animation
function animateRolls(rolls, done) {
  els.distResult.classList.remove("hidden");
  const rowsHtml = rolls.map(() => `
    <div class="roll-row">
      <span class="rname"></span><span class="rval"></span>
    </div>
  `).join("");
  els.distResult.innerHTML = `
    <div class="winner-line">Rolling…</div>
    <div class="winner-meta">${escapeHtml(state.currentItem.name)}</div>
    <div class="rolls">${rowsHtml}</div>
  `;
  const rowEls = els.distResult.querySelectorAll(".roll-row");
  rolls.forEach((r, i) => {
    rowEls[i].querySelector(".rname").textContent = r.name;
  });

  const start = performance.now();
  const duration = 1100;
  function tick(now) {
    const t = (now - start) / duration;
    rolls.forEach((r, i) => {
      const display = t >= 1 ? r.value : 1 + Math.floor(Math.random() * 100);
      rowEls[i].querySelector(".rval").textContent = display;
    });
    if (t < 1) requestAnimationFrame(tick);
    else done();
  }
  requestAnimationFrame(tick);
}
function finalizeRolloff(winner, rows) {
  renderRolloffResult(winner, "Roll-off", rows);
  recordWin(winner, state.currentItem, "rolloff");
}

function recordWin(winner, item, method) {
  state.lastWonAt[winner] = Date.now();
  lsSet(LS.lastWonAt, state.lastWonAt);
  const entry = {
    ts: Date.now(),
    item: item.name,
    itemId: item.id,
    winner,
    method,
  };
  state.activity.unshift(entry);
  if (state.activity.length > 200) state.activity.length = 200;
  lsSet(LS.activity, state.activity);

  // Permanent per-person history. This list is never trimmed - even if the
  // global activity feed rolls off, the winner's loot record stays forever.
  if (!state.winsByPerson[winner]) state.winsByPerson[winner] = [];
  state.winsByPerson[winner].push({
    ts: entry.ts, itemId: entry.itemId, item: entry.item, method: entry.method,
  });
  lsSet(LS.winsByPerson, state.winsByPerson);

  renderActivity();
  renderPersonDetail();
}

// ---------- Activity ----------
function renderActivity() {
  els.activity.innerHTML = "";
  if (!state.activity.length) {
    const li = document.createElement("li");
    li.className = "muted small";
    li.textContent = "Nothing distributed yet.";
    els.activity.appendChild(li);
    return;
  }
  for (const e of state.activity) {
    const li = document.createElement("li");
    const time = new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    li.innerHTML = `
      <div>
        <span class="winner"></span> won
        <span class="item-name"></span>
      </div>
      <div class="meta"></div>
    `;
    li.querySelector(".winner").textContent = e.winner;
    li.querySelector(".item-name").textContent = e.item;
    li.querySelector(".meta").textContent = `${methodLabel(e.method)} • ${time}`;
    els.activity.appendChild(li);
  }
}
function methodLabel(m) {
  switch (m) {
    case "random": return "Full random";
    case "weighted": return "Weighted";
    case "least-recent": return "Least recent";
    case "rolloff": return "Roll-off";
    case "sckp": return "SCKP";
    default: return m;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ---------- OCR / paste-image roster import ----------
// Loads Tesseract.js on demand from a CDN, reads names out of a screenshot
// of a Discord member list (or any vertical list of names), and gives the
// user a confirmation step before adding to the roster.

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
let tesseractPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_CDN;
    s.async = true;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("Failed to load Tesseract.js"));
    document.head.appendChild(s);
  });
  return tesseractPromise;
}

// Tokens that are NOT usernames (Discord badges, status words, etc.)
const NAME_BLACKLIST = new Set([
  "zap", "live", "afk", "dnd", "idle", "online", "offline", "bot",
  "streaming", "stream", "speaking", "mic", "muted", "deafened", "deaf",
  "video", "screen", "share", "voice", "lobby", "general", "owner", "admin",
  "moderator", "mod", "discord", "server", "channel", "go", "ago", "now",
  "today", "yesterday", "h", "m", "s", "min", "mins", "hr", "hrs",
  // Common OCR artefacts
  "i", "l", "ii", "iii", "iv",
]);

const NAME_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9_.\-]{1,31}/g;

// Pick the best username candidate out of an OCR line.
function extractNameFromLine(line) {
  if (!line) return null;
  let tokens = line.match(NAME_TOKEN_RE) || [];
  if (!tokens.length) return null;

  // Score each token: prefer length, demote pure numeric, demote blacklisted,
  // demote all-uppercase short tokens (typical badge style).
  const scored = tokens
    .map((tok) => {
      if (NAME_BLACKLIST.has(tok.toLowerCase())) return null;
      if (/^[0-9]+$/.test(tok)) return null;       // pure numeric
      if (tok.length < 3) return null;             // too short
      let score = tok.length;
      if (/^[A-Z]+$/.test(tok) && tok.length <= 4) score -= 10; // ZAP/LIVE-like
      if (/^[A-Z][a-z]/.test(tok)) score += 2;      // capitalised name
      if (/_|-/.test(tok)) score += 1;              // common in usernames
      return { tok, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].tok : null;
}

// Run OCR on a Blob/File and return an array of candidate names.
async function ocrImageToNames(imageBlob) {
  const Tesseract = await loadTesseract();
  els.ocrProgress.classList.remove("hidden");
  els.ocrProgressFill.style.width = "0%";
  els.ocrProgressLabel.textContent = "Loading OCR engine…";

  const { data } = await Tesseract.recognize(imageBlob, "eng", {
    logger: (m) => {
      if (m.status) {
        const pct = Math.max(0, Math.min(1, m.progress || 0));
        els.ocrProgressFill.style.width = (pct * 100).toFixed(1) + "%";
        els.ocrProgressLabel.textContent = m.status + " · " + Math.round(pct * 100) + "%";
      }
    },
  });
  els.ocrProgress.classList.add("hidden");

  const text = data?.text || "";
  const names = [];
  const seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const n = extractNameFromLine(raw);
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      names.push(n);
    }
  }
  return names;
}

function openOcrModal() {
  els.ocrBackdrop.classList.remove("hidden");
  els.ocrBackdrop.setAttribute("aria-hidden", "false");
  els.ocrResults.classList.add("hidden");
  els.ocrPreviewWrap.classList.add("hidden");
  els.ocrProgress.classList.add("hidden");
  els.ocrList.innerHTML = "";
  els.ocrSummary.textContent = "";
}
function closeOcrModal() {
  els.ocrBackdrop.classList.add("hidden");
  els.ocrBackdrop.setAttribute("aria-hidden", "true");
}

async function startOcrFromBlob(blob) {
  openOcrModal();
  const url = URL.createObjectURL(blob);
  els.ocrPreview.src = url;
  els.ocrPreviewWrap.classList.remove("hidden");
  try {
    const names = await ocrImageToNames(blob);
    renderOcrResults(names);
  } catch (err) {
    console.error(err);
    toast("OCR failed: " + (err.message || err), "error");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderOcrResults(names) {
  els.ocrResults.classList.remove("hidden");
  els.ocrList.innerHTML = "";
  for (const n of names) addOcrRow(n, true);
  if (!names.length) addOcrRow("", true);
  els.ocrDetectedCount.textContent = `(${names.length})`;
  updateOcrSummary();
}

function addOcrRow(value, checked) {
  const li = document.createElement("li");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!checked;
  cb.addEventListener("change", updateOcrSummary);

  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.placeholder = "name";
  input.addEventListener("input", updateOcrSummary);

  const dupe = document.createElement("span");
  dupe.className = "dupe-mark";

  const updateDupe = () => {
    const v = input.value.trim();
    dupe.textContent = v && state.people.includes(v) ? "already in roster" : "";
  };
  input.addEventListener("input", updateDupe);
  updateDupe();

  const rm = document.createElement("button");
  rm.className = "drop-row";
  rm.type = "button";
  rm.title = "Drop row";
  rm.innerHTML = "&times;";
  rm.addEventListener("click", () => {
    li.remove();
    updateOcrSummary();
  });

  li.appendChild(cb);
  li.appendChild(input);
  li.appendChild(dupe);
  li.appendChild(rm);
  els.ocrList.appendChild(li);
}

function getOcrSelectedNames() {
  const out = [];
  for (const li of els.ocrList.querySelectorAll("li")) {
    const cb = li.querySelector('input[type="checkbox"]');
    const input = li.querySelector('input[type="text"]');
    if (!cb || !input) continue;
    if (!cb.checked) continue;
    const v = input.value.trim();
    if (v) out.push(v);
  }
  return out;
}
function updateOcrSummary() {
  const picks = getOcrSelectedNames();
  const newCount = picks.filter((n) => !state.people.includes(n)).length;
  els.ocrSummary.textContent = `${newCount} new · ${picks.length - newCount} already in roster`;
  els.ocrConfirm.disabled = newCount === 0;
}

function confirmOcrAdd() {
  const picks = getOcrSelectedNames();
  const added = addPeopleBulk(picks);
  closeOcrModal();
  toast(added ? `Added ${added} ${added === 1 ? "person" : "people"} to the roster` : "No new names to add");
}

// ---------- Tabs + Session ----------
function switchTab(tab) {
  state.activeTab = tab;
  for (const btn of els.catalogTabs.querySelectorAll(".tab")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  const onSession = tab === "session";
  els.catalogView.classList.toggle("hidden", onSession);
  els.sessionView.classList.toggle("hidden", !onSession);
  // The search box only applies to the catalog.
  els.searchWrap.classList.toggle("hidden", onSession);
  if (onSession) renderSession();
}

function addToSession(itemId) {
  if (state.session.includes(itemId)) return;
  state.session.push(itemId);
  lsSet(LS.session, state.session);
  if (state.activeTab === "session") renderSession();
}

function removeFromSession(itemId) {
  state.session = state.session.filter((id) => id !== itemId);
  lsSet(LS.session, state.session);
  if (state.activeTab === "session") renderSession();
  updateAddToSessionBtn();
}

function clearSession() {
  if (state.session.length === 0) return;
  state.session = [];
  lsSet(LS.session, state.session);
  renderSession();
  updateAddToSessionBtn();
  toast("Session cleared");
}

// Toggle the currently-open item in/out of the session.
function toggleSession(itemId) {
  if (state.session.includes(itemId)) {
    removeFromSession(itemId);
    toast("Removed from session");
  } else {
    addToSession(itemId);
    toast("Added to session");
  }
  updateAddToSessionBtn();
}

// Keep the modal's add/remove button label in sync with session membership.
function updateAddToSessionBtn() {
  if (!state.currentItem) return;
  const inSession = state.session.includes(state.currentItem.id);
  els.addToSession.textContent = inSession ? "✓ In session — remove" : "+ Add to session";
  els.addToSession.classList.toggle("in-session", inSession);
}

function renderSession() {
  const byId = new Map(state.items.map((it) => [it.id, it]));
  els.sessionList.innerHTML = "";
  const n = state.session.length;
  els.sessionCount.textContent = n ? `${n} ${n === 1 ? "item" : "items"}` : "";
  els.sessionEmpty.classList.toggle("hidden", n > 0);
  for (const id of state.session) {
    els.sessionList.appendChild(renderSessionCard(id, byId.get(id)));
  }
}

function renderSessionCard(itemId, item) {
  const card = document.createElement("div");
  card.className = "session-card";
  card.addEventListener("click", () => { if (item) openItemModal(item); });

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item ? item.name : itemId;
  card.appendChild(name);

  if (item) {
    const badges = document.createElement("div");
    badges.className = "badges";
    if (item.size)     badges.appendChild(tag(item.size, "size"));
    if (item.grade)    badges.appendChild(tag(`Grade ${item.grade}`, "grade"));
    if (item.industry) badges.appendChild(tag(item.industry, "industry"));
    card.appendChild(badges);
  }

  const rm = document.createElement("button");
  rm.className = "remove-session";
  rm.type = "button";
  rm.title = "Remove from session";
  rm.innerHTML = "&times;";
  rm.addEventListener("click", (e) => {
    e.stopPropagation();
    removeFromSession(itemId);
  });
  card.appendChild(rm);
  return card;
}

// ---------- Wire events ----------
function wireEvents() {
  // Search (debounced)
  let stimer;
  els.search.addEventListener("input", () => {
    clearTimeout(stimer);
    stimer = setTimeout(() => {
      state.filters.search = els.search.value || "";
      applyFilters();
    }, 100);
  });
  els.clearFilters.addEventListener("click", () => {
    state.filters = { search: "", size: null, grade: null, industry: null };
    els.search.value = "";
    buildFilterChips();
    applyFilters();
  });
  els.reload.addEventListener("click", fetchItems);

  // Tabs + session
  els.catalogTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) switchTab(btn.dataset.tab);
  });
  els.clearSession.addEventListener("click", clearSession);
  els.addToSession.addEventListener("click", () => {
    if (state.currentItem) toggleSession(state.currentItem.id);
  });

  // Roster
  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addPerson(els.newPerson.value);
    els.newPerson.value = "";
    els.newPerson.focus();
  });
  els.selectAll.addEventListener("click", () => {
    state.people.forEach((n) => state.selected.add(n));
    renderPeople();
  });
  els.selectNone.addEventListener("click", () => {
    state.selected.clear();
    renderPeople();
  });
  els.addAttendance.addEventListener("click", addAttendanceForSelected);
  els.clearActivity.addEventListener("click", () => {
    state.activity = [];
    lsSet(LS.activity, state.activity);
    renderActivity();
    renderPersonDetail();
  });

  // Modal
  els.modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.backdrop.classList.contains("hidden")) closeModal();
  });
  els.method.addEventListener("change", onMethodChange);
  els.distribute.addEventListener("click", distribute);

  // -------- OCR / paste image --------
  // Page-wide paste handler: if the clipboard has an image, start OCR.
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        e.preventDefault();
        const blob = it.getAsFile();
        if (blob) startOcrFromBlob(blob);
        return;
      }
    }
  });
  els.pasteImageBtn.addEventListener("click", () => {
    openOcrModal();
    toast("Press Ctrl+V to paste a screenshot, or drop a file below");
  });
  els.ocrClose.addEventListener("click", closeOcrModal);
  els.ocrBackdrop.addEventListener("click", (e) => {
    if (e.target === els.ocrBackdrop) closeOcrModal();
  });
  els.ocrFile.addEventListener("change", () => {
    if (els.ocrFile.files && els.ocrFile.files[0]) {
      startOcrFromBlob(els.ocrFile.files[0]);
      els.ocrFile.value = "";
    }
  });
  els.ocrDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.ocrDrop.classList.add("drag-over");
  });
  els.ocrDrop.addEventListener("dragleave", () => els.ocrDrop.classList.remove("drag-over"));
  els.ocrDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    els.ocrDrop.classList.remove("drag-over");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) startOcrFromBlob(f);
  });
  els.ocrSelectAll.addEventListener("click", () => {
    els.ocrList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
    updateOcrSummary();
  });
  els.ocrSelectNone.addEventListener("click", () => {
    els.ocrList.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
    updateOcrSummary();
  });
  els.ocrAddRow.addEventListener("click", () => { addOcrRow("", true); updateOcrSummary(); });
  els.ocrConfirm.addEventListener("click", confirmOcrAdd);
}

// ---------- Version footer ----------
// version.json is written at build time by scripts/gen-version.js. If it is
// missing (e.g. a static deploy with no build step) the footer stays hidden.
async function renderVersionFooter() {
  const el = document.getElementById("version-footer");
  if (!el) return;
  try {
    const res = await fetch("./version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const v = await res.json();
    if (!v.commit) throw new Error("no commit");
    el.textContent = v.commit;
    el.href = "https://github.com/sawicky/SCLC/commit/" + v.commit;
    el.title = [v.ref, v.builtAt ? "built " + new Date(v.builtAt).toLocaleString() : ""]
      .filter(Boolean).join(" • ");
    el.classList.remove("hidden");
  } catch (_) {
    el.classList.add("hidden");
  }
}

// ---------- Init ----------
// If startup throws (typically corrupt/incompatible localStorage data), show
// a recovery panel instead of a blank page so the user can reset and reload.
function showRecovery(err) {
  console.error("SCLC failed to start:", err);
  const wrap = document.createElement("div");
  wrap.className = "recovery";
  wrap.innerHTML = `
    <div class="recovery-box">
      <h2>Couldn't load saved data</h2>
      <p>Something stored in this browser is stopping the app from starting.
         Resetting clears this browser's roster, points, wishlists and history.
         Other people's browsers are not affected.</p>
      <pre class="recovery-err"></pre>
      <button type="button" class="primary-btn" id="recovery-reset">Reset saved data &amp; reload</button>
    </div>`;
  wrap.querySelector(".recovery-err").textContent = String((err && err.stack) || err);
  wrap.querySelector("#recovery-reset").addEventListener("click", () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("scl"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    location.reload();
  });
  document.body.appendChild(wrap);
}

function init() {
  try {
    loadPersistence();
    renderPeople();
    renderActivity();
    renderPersonDetail();
    wireEvents();
    fetchItems();
    renderVersionFooter();
  } catch (err) {
    showRecovery(err);
  }
}
init();
