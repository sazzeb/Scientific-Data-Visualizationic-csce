import * as D3 from 'd3';
import { FALLBACK_CSV } from './data.js';
import { NetworkModel, HierarchyModel } from './models.js';
import {
  hideTooltip, networkColors, renderForceNetwork, renderMatrix,
  renderRectilinearTree, renderTreemap, renderIcicle,
} from './charts.js';

let content;
let dataStatus;
let breadcrumb;
let toast;

const DATA_SOURCES = [
  {
    key: 'edges', label: 'Network edges',
    gist: 'https://gist.github.com/sazzeb/fe3ef697670a80cafa8af204004e77b8',
  },
  {
    key: 'nodes', label: 'Network nodes',
    gist: 'https://gist.github.com/sazzeb/b2d7d7c475c09bacc787d7fa845316e7',
  },
  {
    key: 'hierarchy', label: 'Hierarchy demo',
    gist: 'https://gist.github.com/sazzeb/381f30a531d31c130e664961eb14f8f3',
  },
];

async function loadCsvSource(source) {
  return { rows: D3.csvParse(FALLBACK_CSV[source.key]), location: 'bundled CSV' };
}

function sourceLinks() {
  return DATA_SOURCES.map(source => `<a class="source-link" href="${source.gist}" target="_blank" rel="noopener noreferrer">${source.label}<span aria-hidden="true">↗</span></a>`).join('');
}

const PAGE_META = {
  overview: ['Field guide', 'Begin the comparison', '00'],
  'q1-a': ['Question 1 / Part A', 'The same links, a new layout', '01'],
  'q1-b-file': ['Question 1 / Part B', 'Adjacency in arrival order', '01'],
  'q1-b-group': ['Question 1 / Part B', 'What ordering reveals', '01'],
  'q1-c': ['Question 1 / Part C', 'Time the two views', '01'],
  'q2-a': ['Question 2 / Part A', 'Build one hierarchy', '02'],
  'q2-b-tree': ['Question 2 / Part B / 1', 'Trace the tree', '02'],
  'q2-b-treemap': ['Question 2 / Part B / 2', 'Give values space', '02'],
  'q2-b-icicle': ['Question 2 / Part B / 3', 'Follow the bands', '02'],
  'q2-c': ['Question 2 / Part C', 'Account for each encoding', '02'],
};
function nextRunNumber() {
  try {
    const previous = Number(sessionStorage.getItem('hw8-force-run-number') || 0);
    const navigation = performance.getEntriesByType('navigation')[0];
    const reloadedForcePage = navigation?.type === 'reload' && location.hash === '#q1-a';
    const next = previous ? previous + (reloadedForcePage ? 1 : 0) : 1;
    sessionStorage.setItem('hw8-force-run-number', String(next));
    return next;
  } catch { return 1; }
}
function createRunSeed() {
  if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return (Date.now() ^ Math.floor(Math.random() * 2 ** 32)) >>> 0;
}
function loadRaceState() {
  const fresh = { selected: 't1-link', running: null, predictions: { t1: '', t2: '' }, lockedTasks: [], answers: {}, times: {} };
  try {
    const saved = JSON.parse(sessionStorage.getItem('hw8-race-state') || 'null');
    return saved ? { ...fresh, ...saved, running: null, predictions: { ...fresh.predictions, ...saved.predictions } } : fresh;
  } catch { return fresh; }
}
function saveRaceState() {
  try { sessionStorage.setItem('hw8-race-state', JSON.stringify({ ...state.race, running: null })); } catch { /* Storage is optional. */ }
}

const state = {
  network: null,
  hierarchy: null,
  sourceLocations: {},
  sampleRows: null,
  pendingRows: null,
  pendingName: 'Supplied example hierarchy',
  pendingIsOwn: false,
  hierarchySourceKind: 'demo',
  period: null,
  mapping: { levelOne: 'region', levelTwo: 'income_group', leaf: 'country', value: 'population_millions' },
  runNumber: nextRunNumber(),
  runSeed: createRunSeed(),
  currentChart: null,
  toastTimeout: null,
  race: loadRaceState(),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
function formatNumber(value, decimals = 0) { return D3.format(decimals ? `,.${decimals}f` : ',.0f')(value); }
function currentPage() {
  const name = location.hash.slice(1);
  if (PAGE_META[name]) return name;
  if (name) history.replaceState(null, '', '#overview');
  return 'overview';
}
function showToast(message) {
  clearTimeout(state.toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimeout = setTimeout(() => { toast.hidden = true; }, 4200);
}
function navigate(page) {
  if (!PAGE_META[page]) return;
  if (location.hash === `#${page}`) renderPage();
  else location.hash = page;
}
function pageHero(page, description, tags = []) {
  const [kicker, title, number] = PAGE_META[page];
  return `<section class="page-hero"><div><div class="eyebrow">${kicker.toUpperCase()}</div><h1>${title}</h1><p>${description}</p><div class="hero-tags">${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div></div><div class="hero-index" aria-hidden="true">${number}</div></section>`;
}
function notice(message, type = '') {
  return `<div class="notice ${type}"><span class="notice-icon" aria-hidden="true">${type === 'warn' ? '◇' : type === 'danger' ? '!' : '✦'}</span><div>${message}</div></div>`;
}
function chartCard(title, description, screenshot, wide = false) {
  return `<section class="card chart-card span-12"><div class="chart-topline"><div><div class="chart-overline">${screenshot}</div><h2>${title}</h2><p>${description}</p></div><button class="button ghost small" id="export-chart" type="button">↧ Export PNG</button></div><div id="chart-container" class="chart-surface ${wide ? 'wide' : ''}"></div><div id="chart-legend" class="chart-legend"></div></section>`;
}
function networkLegend(showNodeSize = false) {
  const colors = networkColors(state.network);
  const entries = state.network.groups.map(group => `<span class="legend-item"><span class="legend-swatch" style="background:${colors.get(group)}"></span>${escapeHtml(group)}</span>`);
  if (showNodeSize) entries.push('<span class="legend-item">● Node size represents degree</span>');
  document.querySelector('#chart-legend').innerHTML = entries.join('');
}
function hierarchyLegend() {
  document.querySelector('#chart-legend').innerHTML = [...state.hierarchy.branchColors]
    .map(([branch, color]) => `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${escapeHtml(branch)}</span>`).join('');
}
function bindExport(screenshotName) {
  document.querySelector('#export-chart')?.addEventListener('click', () => exportChartPng(screenshotName));
}

async function exportChartPng(name) {
  const original = state.currentChart?.svg;
  if (!original) return showToast('The visualization is still preparing.');
  const clone = original.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svgText = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = reject; image.src = url;
    });
    const width = Number(original.getAttribute('width'));
    const height = Number(original.getAttribute('height'));
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = width * scale; canvas.height = height * scale;
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed.');
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl; link.download = `${name}.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 2500);
    showToast(`${name}.png exported. Capture the whole page separately if your submission requires controls and captions.`);
  } catch (error) {
    showToast(`Could not export the chart: ${error.message}`);
  } finally { URL.revokeObjectURL(url); }
}

function renderOverview() {
  const graph = state.network, tree = state.hierarchy;
  content.innerHTML = `<div class="page">${pageHero('overview', 'Explore one network through connection and adjacency, then one hierarchy through three different spatial languages.', ['2 controlled comparisons', '7 capture points', '6 views'])}
    <div class="content-grid">
      <div class="card metric span-3"><span class="metric-label">AIRPORT NODES</span><strong class="metric-value metric-accent">${graph.nodes.length}</strong><span class="metric-sub">Two countries · one graph</span></div>
      <div class="card metric span-3"><span class="metric-label">DIRECT LINKS</span><strong class="metric-value metric-coral">${graph.edges.length}</strong><span class="metric-sub">Unique undirected pairs</span></div>
      <div class="card metric span-3"><span class="metric-label">LINKS PER NODE</span><strong class="metric-value metric-gold">${graph.linksPerNode.toFixed(2)}</strong><span class="metric-sub">Above the 3–4 reading guideline</span></div>
      <div class="card metric span-3"><span class="metric-label">HIERARCHY LEAVES</span><strong class="metric-value">${tree.leafCount}</strong><span class="metric-sub">${tree.isOwnData ? 'Your confirmed data' : state.hierarchySourceKind === 'imported' ? 'Imported preview; confirm provenance' : 'Supplied demo; import your own'}</span></div>
      <a class="route-card span-6" href="#q1-a" data-page="q1-a"><span class="route-num">QUESTION 01 / CONNECTION ↔ MATRIX</span><h3>Start with the network</h3><p>Two force runs and two matrix orderings.</p></a>
      <a class="route-card coral span-6" href="#q2-a" data-page="q2-a"><span class="route-num">QUESTION 02 / CONNECTION ↔ AREA</span><h3>Build a hierarchy</h3><p>Import your dataset, then compare three tree idioms.</p></a>
      <section class="card span-12"><div class="section-kicker">DATA PROVENANCE</div><h2>Three source gists</h2><p class="muted">The app includes copies of the linked GitHub Gist data, so the visualization runs without fetching CSV files at startup. The hierarchy Gist is supplied demonstration data; Question 2 still requires your own hierarchy.</p><div class="source-links">${sourceLinks()}</div><p class="fine-print">Current sources: ${DATA_SOURCES.map(source => `${source.label}: ${state.sourceLocations[source.key] || 'pending'}`).join(' · ')}</p></section>
    </div></div>`;
}

function renderQuestionOnePartA() {
  const graph = state.network;
  content.innerHTML = `<div class="page">${pageHero('q1-a', 'A force simulation places the same airports from a new random starting point on every reload. Capture the two settled runs without dragging nodes.', ['Screenshots 1 + 2', `${graph.nodes.length} airports`, `${graph.linksPerNode.toFixed(2)} links / node`])}
    <div class="content-grid">
      <section class="card span-8"><div class="card-head"><div><div class="section-kicker">RUN PROTOCOL</div><h2>Two views of the same edge list</h2></div><span class="pill">RUN ${state.runNumber}</span></div><ol class="step-list"><li>Wait for <strong>Simulation settled</strong>, then capture Screenshot ${state.runNumber === 1 ? '1' : '2'} without dragging.</li><li>Reload for the next run. The starting positions change, but the graph does not.</li><li>Compare airport locations and crossing patterns; verify degree and adjacency stay fixed.</li></ol><div class="action-row"><button class="button primary" id="reload-layout" type="button">↻ Reload for another run</button><span id="simulation-status" class="pill warn">Simulation moving…</span></div></section>
      <section class="card span-4"><div class="section-kicker">DENSITY CHECK</div><div class="callout-number">${graph.linksPerNode.toFixed(2)}</div><p class="muted">The assignment uses links ÷ nodes. This network sits above the reading’s 3–4 links per node warning, so inspect the diagram for crossings and difficult paths.</p><p class="fine-print">Conventional graph density is ${graph.graphDensity.toFixed(3)}; it answers a different question.</p></section>
      ${chartCard('Force-directed node-link view', 'Hover an airport to isolate its direct links. Drag only after both required untouched screenshots are captured.', 'CAPTURE POINT · SCREENSHOTS 1 + 2')}
    </div></div>`;
  state.currentChart = renderForceNetwork(document.querySelector('#chart-container'), graph, {
    seed: state.runSeed,
    onSettled: () => {
      const status = document.querySelector('#simulation-status');
      if (status) { status.textContent = 'Simulation settled'; status.className = 'pill good'; }
    },
  });
  networkLegend(true);
  bindExport(`hw8-q1-a-run-${state.runNumber}`);
  document.querySelector('#reload-layout').addEventListener('click', () => location.reload());
}

function renderQuestionOnePartB(order) {
  const graph = state.network;
  const grouped = order === 'group';
  const page = grouped ? 'q1-b-group' : 'q1-b-file';
  content.innerHTML = `<div class="page">${pageHero(page, grouped
    ? 'Reorder rows and columns by country, then degree. The edge set is unchanged; a new spatial pattern appears.'
    : 'The first appearance of each airport in the edge list determines row and column position.', [grouped ? 'Screenshot 4' : 'Screenshot 3', 'Same 301 links', grouped ? 'Country → degree' : 'True file order'])}
    <div class="content-grid"><section class="card span-8"><div class="section-kicker">PART B · ORDERING</div><h2>${grouped ? 'Two strong diagonal blocks' : 'An arbitrary starting arrangement'}</h2><p class="muted">${grouped
    ? 'Spain and Brazil now occupy contiguous row and column ranges. The dense within-country areas form diagonal blocks; just four links bridge the countries.'
    : 'Each airport takes the position where it first occurs in the edge CSV. The starter’s original “file” button actually uses alphabetic airport IDs, so the final implementation keeps first-seen order explicitly.'}</p><div class="action-row"><button type="button" class="button ${grouped ? 'ghost' : 'is-active'}" data-page="q1-b-file">File order</button><button type="button" class="button ${grouped ? 'is-active' : 'ghost'}" data-page="q1-b-group">Country + degree</button></div></section>
      <section class="card span-4"><div class="section-kicker">READ THE MARKS</div><dl class="key-value"><dt>Filled off-diagonal cells</dt><dd>${graph.edges.length * 2}</dd><dt>Self-links</dt><dd>0</dd><dt>Cross-country links</dt><dd>${graph.countCrossGroupLinks()}</dd><dt>Network changed?</dt><dd>No</dd></dl></section>
      ${chartCard(grouped ? 'Grouped adjacency matrix' : 'File-order adjacency matrix', 'Each colored square means its row airport is directly linked to its column airport. Hover a cell to identify the pair.', `CAPTURE POINT · SCREENSHOT ${grouped ? '4' : '3'}`, true)}
    </div></div>`;
  state.currentChart = renderMatrix(document.querySelector('#chart-container'), graph, order);
  networkLegend();
  bindExport(`hw8-q1-b-${grouped ? 'group-order-4' : 'file-order-3'}`);
}

let raceTicker = null;

function chooseRacePair(graph) {
  const candidates = [...graph.nodes].sort((a, b) => Math.abs(a.degree - 8) - Math.abs(b.degree - 8) || D3.ascending(a.id, b.id));
  for (const source of candidates) {
    const target = graph.nodes.find(node => node.id !== source.id && !graph.hasEdge(source.id, node.id) && graph.twoHopPaths(source.id, node.id).length);
    if (target) return [source, target];
  }
  throw new Error('This graph has no two-hop pair for the timed task.');
}

function connectedTriple(graph) {
  for (const edge of graph.edges) {
    const third = graph.neighbors(edge.sourceId).find(id => graph.hasEdge(id, edge.targetId));
    if (third) return [edge.sourceId, edge.targetId, third];
  }
  return [];
}

function renderQuestionOnePartC() {
  const graph = state.network;
  const race = state.race;
  const [source, target] = chooseRacePair(graph);
  const trials = [
    { id: 't1-link', task: 'T1', view: 'Node-link' },
    { id: 't1-matrix', task: 'T1', view: 'Grouped matrix' },
    { id: 't2-link', task: 'T2', view: 'Node-link' },
    { id: 't2-matrix', task: 'T2', view: 'Grouped matrix' },
  ];
  const selected = trials.find(trial => trial.id === race.selected) || trials[0];
  const allComplete = trials.every(trial => race.times[trial.id] != null);
  const trialResult = task => {
    const link = race.times[`${task}-link`], matrix = race.times[`${task}-matrix`];
    return `Node-link ${(link / 1000).toFixed(2)} s · matrix ${(matrix / 1000).toFixed(2)} s · faster: ${link === matrix ? 'tie' : link < matrix ? 'node-link' : 'matrix'}`;
  };
  const evidence = allComplete ? `<section class="card span-12"><div class="section-kicker">OBSERVED RESULTS</div><p><strong>T1:</strong> ${trialResult('t1')}.</p><p><strong>T2:</strong> ${trialResult('t2')}.</p><div class="divider"></div><p><strong>T1 answer check:</strong> ${source.id} has ${graph.neighbors(source.id).length} direct neighbors: ${graph.neighbors(source.id).join(', ')}. One valid path is ${graph.twoHopPaths(source.id, target.id)[0].join(' → ')}.</p><p><strong>T2 answer check:</strong> highest degree: ${graph.maxDegreeNodes().map(node => `${node.id} (${node.degree})`).join(', ')}. One fully connected three-airport group is ${connectedTriple(graph).join(', ')}.</p></section>` : '';
  content.innerHTML = `<div class="page">${pageHero('q1-c', 'Predict which view will help, then time each task once with the node-link diagram and once with the same grouped matrix.', ['4 timed trials', `${graph.nodes.length} nodes`, 'Same edge set'])}
    <div class="content-grid">
      <section class="card span-6"><div class="section-kicker">T1 · TOPOLOGICAL</div><h2>Trace neighbors and a path</h2><p>List every airport directly connected to <strong>${escapeHtml(source.label)}</strong>, then find a two-hop path to <strong>${escapeHtml(target.label)}</strong>.</p><label class="field">Predict the faster view before starting<textarea data-race-prediction="t1" rows="2" placeholder="Node-link or matrix, and why" ${race.lockedTasks.includes('t1') ? 'disabled' : ''}>${escapeHtml(race.predictions.t1)}</textarea></label></section>
      <section class="card span-6"><div class="section-kicker">T2 · STRUCTURAL</div><h2>Find a hub and a dense group</h2><p>Which airport has the most direct connections? Name at least three airports that are all directly connected to one another.</p><label class="field">Predict the faster view before starting<textarea data-race-prediction="t2" rows="2" placeholder="Node-link or matrix, and why" ${race.lockedTasks.includes('t2') ? 'disabled' : ''}>${escapeHtml(race.predictions.t2)}</textarea></label></section>
      <section class="card span-12"><div class="section-kicker">FOUR TRIALS · SAME DATA</div><p class="muted">Open one view, wait for it to settle if needed, then start the clock. Answer using only that view. Stop the clock after entering your answer. The matrix uses country + degree order in both matrix trials.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Task</th><th>View</th><th>Time</th><th>Action</th></tr></thead><tbody>${trials.map(trial => `<tr><td>${trial.task}</td><td>${trial.view}</td><td>${race.times[trial.id] == null ? '—' : `${(race.times[trial.id] / 1000).toFixed(2)} s`}</td><td><button class="button small ${race.selected === trial.id ? 'is-active' : 'ghost'}" type="button" data-race-select="${trial.id}" ${race.running ? 'disabled' : ''}>${race.selected === trial.id ? 'Open now' : 'Open view'}</button></td></tr>`).join('')}</tbody></table></div></section>
      <section class="card span-12"><div class="card-head"><div><div class="section-kicker">CURRENT TRIAL · ${selected.task}</div><h2>${selected.view}</h2></div><strong id="race-time" class="race-clock">${race.times[selected.id] == null ? '0.00 s' : `${(race.times[selected.id] / 1000).toFixed(2)} s`}</strong></div><label class="field">Your answer<textarea id="race-answer" rows="2" placeholder="Enter the neighbors and path, or the hub and connected group" disabled>${escapeHtml(race.answers[selected.id] || '')}</textarea></label><div class="action-row"><button id="race-start" class="button primary" type="button" ${selected.view === 'Node-link' ? 'disabled' : ''}>Start timer</button><button id="race-stop" class="button ghost" type="button" disabled>Stop and record</button><span id="race-status" class="pill">${selected.view === 'Node-link' ? 'Wait for the simulation to settle' : 'Ready'}</span></div></section>
      ${chartCard(selected.view === 'Node-link' ? 'Force-directed node-link view' : 'Grouped adjacency matrix', 'Use this view alone for the current trial.', 'TIMED TRIAL', selected.view !== 'Node-link')}
      ${evidence}
    </div></div>`;
  state.currentChart = selected.view === 'Node-link'
    ? renderForceNetwork(document.querySelector('#chart-container'), graph, { seed: state.runSeed, onSettled: () => {
      const start = document.querySelector('#race-start');
      if (start) start.disabled = false;
      const status = document.querySelector('#race-status');
      if (status) status.textContent = 'Ready';
    } })
    : renderMatrix(document.querySelector('#chart-container'), graph, 'group');
  networkLegend(selected.view === 'Node-link');
  bindExport(`hw8-q1-c-${selected.id}`);
  document.querySelectorAll('[data-race-prediction]').forEach(field => field.addEventListener('input', () => {
    race.predictions[field.dataset.racePrediction] = field.value;
    saveRaceState();
  }));
  document.querySelectorAll('[data-race-select]').forEach(button => button.addEventListener('click', () => {
    race.selected = button.dataset.raceSelect;
    saveRaceState();
    renderPage();
  }));
  document.querySelector('#race-answer').addEventListener('input', event => {
    race.answers[selected.id] = event.target.value;
    saveRaceState();
  });
  document.querySelector('#race-start').addEventListener('click', () => {
    if (!race.predictions[selected.task.toLowerCase()].trim()) return showToast('Write your prediction for this task before starting.');
    if (!race.lockedTasks.includes(selected.task.toLowerCase())) race.lockedTasks.push(selected.task.toLowerCase());
    document.querySelector(`[data-race-prediction="${selected.task.toLowerCase()}"]`).disabled = true;
    saveRaceState();
    race.answers[selected.id] = '';
    document.querySelector('#race-answer').value = '';
    document.querySelector('#race-answer').disabled = false;
    race.running = { id: selected.id, startedAt: performance.now() };
    document.querySelector('#race-start').disabled = true;
    document.querySelector('#race-stop').disabled = false;
    document.querySelector('#race-status').textContent = 'Timing now';
    raceTicker = setInterval(() => {
      const clock = document.querySelector('#race-time');
      if (clock && race.running) clock.textContent = `${((performance.now() - race.running.startedAt) / 1000).toFixed(2)} s`;
    }, 50);
  });
  document.querySelector('#race-stop').addEventListener('click', () => {
    if (!race.answers[selected.id]?.trim()) return showToast('Enter your answer before stopping the clock.');
    race.times[selected.id] = performance.now() - race.running.startedAt;
    race.running = null;
    clearInterval(raceTicker);
    raceTicker = null;
    saveRaceState();
    renderPage();
  });
}

function defaultMapping(columns) {
  const choose = (names, fallback) => names.find(name => columns.includes(name)) || fallback;
  const value = choose(['population_millions', 'co2_total_mt', 'value', 'count', 'amount', 'total', 'size'], columns.at(-1));
  const categories = columns.filter(column => column !== value);
  const levelOne = choose(['region', 'category', 'group', 'department'], categories[0]);
  const leaf = choose(['country', 'item', 'name', 'label', 'product'], categories.findLast(column => column !== levelOne));
  const levelTwo = ['income_group', 'subcategory', 'subgroup', 'type'].find(name => categories.includes(name) && name !== levelOne && name !== leaf) || '';
  return { levelOne, levelTwo, leaf, value };
}
function availablePeriods(rows) {
  return rows?.columns?.includes('year') ? [...new Set(rows.map(row => String(row.year).trim()))].filter(Boolean).sort(D3.ascending) : [];
}
function defaultPeriod(rows) {
  const periods = availablePeriods(rows);
  const rowCounts = periods.map(period => rows.filter(row => String(row.year).trim() === period).length);
  const largest = Math.max(0, ...rowCounts);
  return periods.filter((_, index) => rowCounts[index] === largest).at(-1) || null;
}
function additiveValueColumns(rows) {
  return (rows?.columns || []).filter(column => {
    if (/^year$|per.?capita|ratio|rate|percent|_pct\b|average|mean|median|rank/i.test(column)) return false;
    return rows.some(row => Number(String(row[column] ?? '').replaceAll(',', '')) > 0)
      && rows.every(row => String(row[column] ?? '').trim() !== '' && Number.isFinite(Number(String(row[column]).replaceAll(',', ''))) && Number(String(row[column]).replaceAll(',', '')) >= 0);
  });
}
function isInstructorSample(name) {
  return /^hw[567]_sample_data(?:\s*\(\d+\))?\.csv$|^hw8_hierarchy\.csv$/i.test(name);
}
function rowsForPeriod(rows, period) {
  if (!period) return rows;
  const filtered = rows.filter(row => String(row.year).trim() === period);
  filtered.columns = rows.columns;
  return filtered;
}
function selectOptions(columns, selected, allowNone = false) {
  return `${allowNone ? '<option value="">No middle level</option>' : ''}${columns.map(column => `<option value="${escapeHtml(column)}" ${column === selected ? 'selected' : ''}>${escapeHtml(column)}</option>`).join('')}`;
}
function renderQuestionTwoPartA() {
  const tree = state.hierarchy;
  const columns = state.pendingRows?.columns || [];
  const valueColumns = additiveValueColumns(state.pendingRows);
  const periods = availablePeriods(state.pendingRows);
  const mapping = state.mapping;
  const branchRows = tree.root.children?.map(node => `<tr><td>${escapeHtml(node.data.name)}</td><td>${node.leaves().length}</td><td>${formatNumber(node.value, 1)}</td></tr>`).join('') || '';
  content.innerHTML = `<div class="page">${pageHero('q2-a', 'Import a hierarchy from your own CSV, map its categories and one additive value, then use the same tree in all three views.', [`${tree.leafCount} current leaves`, `Max depth ${tree.maxDepth}`, tree.isOwnData ? 'Your data active' : state.hierarchySourceKind === 'imported' ? 'Imported preview active' : 'Supplied demo active'])}
    <div class="content-grid"><section class="card span-7"><div class="section-kicker">DATA SOURCE</div><h2>Make the hierarchy yours</h2>${notice(tree.isOwnData
      ? `<strong>Your CSV is active:</strong> ${escapeHtml(tree.sourceName)}. Its category mapping and selected value are used throughout Question 2.`
      : `<strong>Preview mode:</strong> ${state.hierarchySourceKind === 'imported' ? 'the imported file has not been confirmed as your own data.' : 'the supplied hierarchy is for demonstration.'} HW8 requires your own hierarchy for the final answer.`, tree.isOwnData ? '' : 'warn')}
      <div class="action-row"><label class="file-drop" style="flex:1"><strong>Drop or choose a CSV file</strong><span>Use two or three category columns and a numeric column · at least 30 leaves</span><input id="hierarchy-upload" type="file" accept=".csv,text/csv" aria-label="Choose your hierarchy CSV"></label></div><p class="fine-print">HW5-style data: region → income group → country. HW6/HW7-style data: select one year, then region → country. Choose population or total CO₂; per-capita values and percentages cannot be summed. Instructor sample files are previews, not your own dataset.</p><p class="fine-print">The file is read only in this browser tab. No upload or server storage occurs.</p></section>
      <section class="card span-5"><div class="section-kicker">CURRENT MODEL</div><h2>${escapeHtml(tree.sourceName)}</h2><dl class="key-value"><dt>Top-level branches</dt><dd>${tree.branchCount}</dd><dt>Maximum depth</dt><dd>${tree.maxDepth}</dd><dt>Leaf count</dt><dd>${tree.leafCount}</dd><dt>Root total</dt><dd>${formatNumber(tree.total, 1)}</dd><dt>Measure</dt><dd>${escapeHtml(tree.mapping.value)}</dd><dt>30-leaf rule</dt><dd>${tree.qualifies ? 'Pass' : 'Needs more leaves'}</dd></dl></section>
      <section class="card span-7"><div class="section-kicker">FIELD MAPPING</div><h2>${escapeHtml(state.pendingName)}</h2><p class="muted">Category order defines ancestry. A leaf is the final category; the numeric value is summed from leaves into parents.</p>${periods.length ? `<label class="field period-field">Choose one year for additive snapshot totals<select id="map-period">${periods.map(period => `<option value="${escapeHtml(period)}" ${period === state.period ? 'selected' : ''}>${escapeHtml(period)} · ${rowsForPeriod(state.pendingRows, period).length} rows</option>`).join('')}</select></label><p class="fine-print">HW6/HW7 style files repeat countries by year. Selecting one year avoids adding the same population across years. The latest year with the fullest set of rows is selected first.</p>` : ''}<div class="field-grid">
        <label class="field">Top-level category<select id="map-level-one">${selectOptions(columns, mapping.levelOne)}</select></label>
        <label class="field">Middle category (optional)<select id="map-level-two">${selectOptions(columns, mapping.levelTwo, true)}</select></label>
        <label class="field">Leaf category<select id="map-leaf">${selectOptions(columns, mapping.leaf)}</select></label>
        <label class="field">Additive quantitative value<select id="map-value">${selectOptions(valueColumns, mapping.value)}</select></label>
      </div><label class="source-confirmation"><input id="confirm-own-source" type="checkbox" ${state.pendingIsOwn ? 'checked' : ''} ${state.pendingRows === state.sampleRows || isInstructorSample(state.pendingName) ? 'disabled' : ''}> This is my own dataset or a source I independently selected; it is not an instructor sample.</label><div class="action-row"><button id="apply-hierarchy" class="button primary" type="button">Apply mapping →</button><button id="use-demo" class="button ghost" type="button">Use supplied demo</button></div><div id="mapping-status" class="fine-print">${state.pendingRows?.length || 0} rows ready to inspect${state.period ? ` · year ${escapeHtml(state.period)} selected` : ''}.</div></section>
      <section class="card span-12"><div class="section-kicker">BRANCH AUDIT</div><h2>Totals at the first category level</h2><div class="table-scroll"><table class="data-table"><thead><tr><th>Top-level branch</th><th>Leaves</th><th>Total ${escapeHtml(tree.mapping.value)}</th></tr></thead><tbody>${branchRows}</tbody></table></div></section>
    </div></div>`;
  document.querySelector('#hierarchy-upload').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) return showToast('Choose a CSV smaller than 5 MB.');
    try {
      const rows = D3.csvParse(await file.text());
      if (!rows.length || rows.columns.length < 3) throw new Error('A hierarchy CSV needs data rows and at least three columns.');
      if (new Set(rows.columns).size !== rows.columns.length) throw new Error('CSV header names must be unique.');
      state.pendingRows = rows;
      state.pendingName = file.name;
      state.pendingIsOwn = false;
      state.mapping = defaultMapping(rows.columns);
      state.period = defaultPeriod(rows);
      renderPage();
      showToast(`${file.name} loaded. Review the category and value mapping, then apply it.`);
    } catch (error) { showToast(`Could not read CSV: ${error.message}`); }
  });
  document.querySelector('#apply-hierarchy').addEventListener('click', () => {
    const mapped = {
      levelOne: document.querySelector('#map-level-one').value,
      levelTwo: document.querySelector('#map-level-two').value,
      leaf: document.querySelector('#map-leaf').value,
      value: document.querySelector('#map-value').value,
    };
    try {
      state.period = document.querySelector('#map-period')?.value || null;
      state.pendingIsOwn = document.querySelector('#confirm-own-source').checked
        && state.pendingRows !== state.sampleRows && !isInstructorSample(state.pendingName);
      const model = new HierarchyModel(rowsForPeriod(state.pendingRows, state.period), mapped,
        `${state.pendingName}${state.period ? ` · ${state.period}` : ''}`, state.pendingIsOwn);
      state.mapping = mapped;
      state.hierarchy = model;
      state.hierarchySourceKind = state.pendingRows === state.sampleRows ? 'demo' : 'imported';
      renderPage();
      showToast(model.qualifies ? 'Hierarchy validated and applied to all three views.' : 'Hierarchy applied, but it does not meet the 30-leaf/depth requirement.');
    } catch (error) {
      document.querySelector('#mapping-status').textContent = error.message;
      showToast(error.message);
    }
  });
  document.querySelector('#use-demo').addEventListener('click', () => {
    state.pendingRows = state.sampleRows;
    state.pendingName = 'Supplied example hierarchy';
    state.pendingIsOwn = false;
    state.hierarchySourceKind = 'demo';
    state.period = null;
    state.mapping = { levelOne: 'region', levelTwo: 'income_group', leaf: 'country', value: 'population_millions' };
    state.hierarchy = new HierarchyModel(state.sampleRows, state.mapping, state.pendingName, false);
    renderPage();
    showToast('Supplied example restored for preview. Import your own CSV for the final assignment.');
  });
}

function renderQuestionTwoPartB(view) {
  const tree = state.hierarchy;
  const config = {
    tree: { page: 'q2-b-tree', title: 'Rectilinear node-link tree', description: 'Depth follows the vertical axis, siblings spread horizontally, and visible curves connect each parent to its children.', screenshot: 5, render: renderRectilinearTree, wide: true },
    treemap: { page: 'q2-b-treemap', title: 'Treemap', description: 'Every leaf receives area proportional to the selected value, nested inside its parent categories.', screenshot: 6, render: renderTreemap, wide: false },
    icicle: { page: 'q2-b-icicle', title: 'Icicle partition', description: 'Depth occupies successive bands; child segments line up inside their parent’s horizontal span.', screenshot: 7, render: renderIcicle, wide: true },
  }[view];
  content.innerHTML = `<div class="page">${pageHero(config.page, config.description, [`Screenshot ${config.screenshot}`, `${tree.leafCount} leaves`, escapeHtml(tree.mapping.value)])}
    <div class="content-grid">
      <section class="card span-12"><div class="section-kicker">THREE VIEWS · ONE TREE</div><h2>Choose an idiom</h2><div class="action-row"><button class="button ${view === 'tree' ? 'is-active' : 'ghost'}" type="button" data-page="q2-b-tree">1 · Node-link</button><button class="button ${view === 'treemap' ? 'is-active' : 'ghost'}" type="button" data-page="q2-b-treemap">2 · Treemap</button><button class="button ${view === 'icicle' ? 'is-active' : 'ghost'}" type="button" data-page="q2-b-icicle">3 · Icicle</button></div></section>
      ${chartCard(config.title, 'Hover a mark for its full name, depth, aggregate value, and descendant leaf count.', `CAPTURE POINT · SCREENSHOT ${config.screenshot}`, config.wide)}
    </div></div>`;
  state.currentChart = config.render(document.querySelector('#chart-container'), tree);
  hierarchyLegend();
  bindExport(`hw8-q2-b-${view}-screenshot-${config.screenshot}`);
}

function renderQuestionTwoPartC() {
  const tree = state.hierarchy;
  const rows = [
    ['Rectilinear node-link tree', 'Vertical position: each level is a row farther from the root.', 'Left-to-right position; siblings inherit the descending value sort.', 'Curved lines connect each parent to its child.', 'Connection'],
    ['Treemap', 'Each deeper level is a rectangle nested inside its ancestor.', 'Children follow the value sort in the layout input, but their tile positions do not form a clear linear sequence.', 'Enclosing rectangles contain their descendants.', 'Containment'],
    ['Icicle partition', 'Successive horizontal bands descend from the root.', 'Left-to-right order within a parent band follows descending value.', 'Child segments align inside the horizontal span of their parent.', 'Containment'],
  ];
  content.innerHTML = `<div class="page">${pageHero('q2-c', 'Read exactly where depth, sibling order, and parent–child structure appear in each of the three views.', [`${tree.maxDepth} levels below root`, `${tree.leafCount} leaves`, 'One hierarchy'])}
    <div class="content-grid"><section class="card span-12"><div class="section-kicker">PART C · ENCODING ACCOUNT</div><h2>One tree, three spatial grammars</h2><p class="muted">All three use the same ${escapeHtml(tree.mapping.levelOne)} → ${tree.mapping.levelTwo ? `${escapeHtml(tree.mapping.levelTwo)} → ` : ''}${escapeHtml(tree.mapping.leaf)} hierarchy, the same descending value sort, and the same branch colors.</p><div class="table-scroll"><table class="data-table encoding-table"><thead><tr><th>Idiom</th><th>Tree depth</th><th>Sibling order</th><th>Parent–child structure</th><th>Mark type</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      <section class="card span-12"><div class="section-kicker">COMPARE THE SAME BRANCH</div><p>Open any top-level branch in each view: the node-link tree traces ancestry with lines, the treemap nests its value-sized leaves, and the icicle aligns descendants under the same parent span.</p><div class="action-row"><button class="button ghost" type="button" data-page="q2-b-tree">Node-link tree</button><button class="button ghost" type="button" data-page="q2-b-treemap">Treemap</button><button class="button ghost" type="button" data-page="q2-b-icicle">Icicle</button></div></section>
    </div></div>`;
}

function renderPage() {
  if (state.race.running && currentPage() !== 'q1-c') {
    clearInterval(raceTicker);
    raceTicker = null;
    state.race.running = null;
  }
  state.currentChart?.destroy?.();
  state.currentChart = null;
  hideTooltip();
  const page = currentPage();
  const [locationLabel] = PAGE_META[page];
  breadcrumb.textContent = `FIELD NOTES / ${locationLabel.toUpperCase()}`;
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (!state.network || !state.hierarchy) return;
  if (page === 'overview') renderOverview();
  else if (page === 'q1-a') renderQuestionOnePartA();
  else if (page === 'q1-b-file') renderQuestionOnePartB('file');
  else if (page === 'q1-b-group') renderQuestionOnePartB('group');
  else if (page === 'q1-c') renderQuestionOnePartC();
  else if (page === 'q2-a') renderQuestionTwoPartA();
  else if (page === 'q2-b-tree') renderQuestionTwoPartB('tree');
  else if (page === 'q2-b-treemap') renderQuestionTwoPartB('treemap');
  else if (page === 'q2-b-icicle') renderQuestionTwoPartB('icicle');
  else if (page === 'q2-c') renderQuestionTwoPartC();
  content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', event => {
  const route = event.target.closest('[data-page]');
  if (!route) return;
  event.preventDefault();
  navigate(route.dataset.page);
});
window.addEventListener('hashchange', renderPage);

async function initialize() {
  if (!D3) {
    content.innerHTML = `<div class="page">${notice('<strong>D3 could not load.</strong> Check the internet connection used for the pinned D3 script, then reload.', 'danger')}</div>`;
    return;
  }
  try {
    const [edges, nodes, hierarchy] = await Promise.all(DATA_SOURCES.map(loadCsvSource));
    const edgeRows = edges.rows, nodeRows = nodes.rows, hierarchyRows = hierarchy.rows;
    state.sourceLocations = { edges: edges.location, nodes: nodes.location, hierarchy: hierarchy.location };
    state.network = new NetworkModel(edgeRows, nodeRows);
    state.sampleRows = hierarchyRows;
    state.pendingRows = hierarchyRows;
    state.hierarchy = new HierarchyModel(hierarchyRows, state.mapping, state.pendingName, false);
    const sourceLabel = 'Bundled CSV data';
    dataStatus.textContent = `${state.network.nodes.length} nodes · ${state.network.edges.length} links · ${state.network.linksPerNode.toFixed(2)} links/node · ${sourceLabel}`;
    renderPage();
  } catch (error) {
    content.innerHTML = `<div class="page">${pageHero('overview', 'The datasets could not be loaded.', ['Loading error'])}<div class="content-grid"><section class="card span-12">${notice(`<strong>${escapeHtml(error.message)}</strong> The bundled data could not be parsed.`, 'danger')}</section></div></div>`;
    dataStatus.textContent = 'Data unavailable';
  }
}

export function startApp() {
  content = document.querySelector('#page-content');
  dataStatus = document.querySelector('#data-status');
  breadcrumb = document.querySelector('#page-breadcrumb');
  toast = document.querySelector('#toast');
  if (!content || !dataStatus || !breadcrumb || !toast) {
    throw new Error('The React app shell must be mounted before visualization startup.');
  }
  initialize();
}
