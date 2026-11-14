import * as D3 from 'd3';
import { categoryColor } from './models.js';

const BACKGROUND = '#ffffff';
const LIGHT_TEXT = '#000000';
const MUTED_TEXT = '#266435';
function getTooltip() { return document.querySelector('#chart-tooltip'); }

function createSvg(container, width, height, title) {
  container.replaceChildren();
  const svg = D3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width).attr('height', height)
    .attr('role', 'img').attr('aria-label', title)
    .attr('font-family', 'DM Sans, Arial, sans-serif');
  svg.append('title').text(title);
  svg.append('rect').attr('width', width).attr('height', height).attr('fill', BACKGROUND);
  return svg;
}

function showTooltip(event, lines) {
  const tooltip = getTooltip();
  if (!tooltip) return;
  tooltip.textContent = lines.join('\n');
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const tooltip = getTooltip();
  if (!tooltip) return;
  const inset = 14;
  const maxX = window.innerWidth - tooltip.offsetWidth - inset;
  const maxY = window.innerHeight - tooltip.offsetHeight - inset;
  tooltip.style.left = `${Math.max(inset, Math.min(event.clientX + 14, maxX))}px`;
  tooltip.style.top = `${Math.max(inset, Math.min(event.clientY + 14, maxY))}px`;
}

export function hideTooltip() {
  const tooltip = getTooltip();
  if (tooltip) tooltip.hidden = true;
}

export function networkColors(model) {
  return new Map(model.groups.map((group, index) => [group, categoryColor(index)]));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed yields a genuinely different initial layout after every page reload. */
export function renderForceNetwork(container, model, { seed = Date.now(), onSettled = () => {}, compact = false } = {}) {
  const width = compact ? 920 : 1040;
  const height = compact ? 540 : 620;
  const svg = createSvg(container, width, height, 'Force-directed airport node-link diagram');
  const colors = networkColors(model);
  const random = seededRandom(seed);
  const nodes = model.nodes.map(node => ({
    ...node,
    x: width * (0.2 + random() * 0.6),
    y: height * (0.18 + random() * 0.64),
  }));
  const links = model.edges.map(edge => ({ source: edge.sourceId, target: edge.targetId }));

  const grid = svg.append('g').attr('stroke', '#266435').attr('stroke-opacity', 0.11);
  for (let x = 80; x < width; x += 80) grid.append('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', height);
  for (let y = 80; y < height; y += 80) grid.append('line').attr('y1', y).attr('y2', y).attr('x1', 0).attr('x2', width);

  const linkMarks = svg.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', '#000000').attr('stroke-width', 1.1).attr('stroke-opacity', 0.23);
  const nodeMarks = svg.append('g').selectAll('circle').data(nodes).join('circle')
    .attr('r', node => 4.5 + Math.sqrt(node.degree) * 1.4)
    .attr('fill', node => colors.get(node.group))
    .attr('stroke', '#ffffff').attr('stroke-width', 1.25)
    .attr('tabindex', 0).attr('role', 'img')
    .attr('aria-label', node => `${node.label}, degree ${node.degree}, ${node.group}`)
    .style('cursor', 'grab');
  const labels = svg.append('g').selectAll('text').data(nodes.filter(node => node.degree >= 15)).join('text')
    .text(node => node.id).attr('fill', LIGHT_TEXT).attr('font-size', 11)
    .attr('font-weight', 700).attr('paint-order', 'stroke')
    .attr('stroke', BACKGROUND).attr('stroke-width', 3).attr('pointer-events', 'none');

  let active = true;
  let finished = false;
  const simulation = D3.forceSimulation(nodes)
    .randomSource(seededRandom(seed ^ 0xa53b91))
    .force('link', D3.forceLink(links).id(node => node.id).distance(64).strength(0.45))
    .force('charge', D3.forceManyBody().strength(-170))
    .force('center', D3.forceCenter(width / 2, height / 2))
    .force('collide', D3.forceCollide(node => 6 + Math.sqrt(node.degree) * 1.45))
    .alphaDecay(0.045);

  function updatePositions() {
    for (const node of nodes) {
      node.x = Math.max(18, Math.min(width - 18, node.x));
      node.y = Math.max(24, Math.min(height - 20, node.y));
    }
    linkMarks.attr('x1', link => link.source.x).attr('y1', link => link.source.y)
      .attr('x2', link => link.target.x).attr('y2', link => link.target.y);
    nodeMarks.attr('cx', node => node.x).attr('cy', node => node.y);
    labels.attr('x', node => node.x + 10).attr('y', node => node.y - 8);
  }
  function finishSimulation() {
    if (!active || finished) return;
    finished = true;
    clearTimeout(settleFallback);
    onSettled();
  }
  simulation.on('tick', updatePositions).on('end', finishSimulation);
  // Background tabs can throttle animation frames indefinitely; finish the layout on a timer.
  const settleFallback = setTimeout(() => {
    if (!active || finished) return;
    simulation.stop().tick(300);
    updatePositions();
    finishSimulation();
  }, 6500);

  function focusNode(event, node) {
    const related = model.adjacency.get(node.id);
    nodeMarks.attr('opacity', item => item.id === node.id || related.has(item.id) ? 1 : 0.18);
    linkMarks.attr('stroke-opacity', link => link.source.id === node.id || link.target.id === node.id ? 0.9 : 0.045)
      .attr('stroke-width', link => link.source.id === node.id || link.target.id === node.id ? 2.1 : 1.1);
    labels.attr('opacity', item => item.id === node.id || related.has(item.id) ? 1 : 0.2);
    showTooltip(event, [node.label, `${node.group} · ${node.degree} direct connections`]);
  }
  function unfocusNode() {
    nodeMarks.attr('opacity', 1);
    linkMarks.attr('stroke-opacity', 0.23).attr('stroke-width', 1.1);
    labels.attr('opacity', 1);
    hideTooltip();
  }
  nodeMarks.on('pointerenter', focusNode).on('pointermove', moveTooltip).on('pointerleave', unfocusNode)
    .on('focus', function (event, node) {
      const box = this.getBoundingClientRect();
      focusNode({ clientX: box.left + box.width / 2, clientY: box.top }, node);
    }).on('blur', unfocusNode)
    .call(D3.drag()
      .on('start', (event, node) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        node.fx = node.x; node.fy = node.y;
      })
      .on('drag', (event, node) => { node.fx = event.x; node.fy = event.y; })
      .on('end', (event, node) => {
        if (!event.active) simulation.alphaTarget(0);
        node.fx = null; node.fy = null;
      }));

  updatePositions();
  return { svg: svg.node(), destroy() { active = false; clearTimeout(settleFallback); simulation.stop(); hideTooltip(); } };
}

/** The file ordering uses first appearance in the edge CSV, not alphabetic ID. */
export function renderMatrix(container, model, order = 'file') {
  const nodes = model.orderedNodes(order);
  const width = 980, height = 955, left = 106, top = 100, side = 815;
  const svg = createSvg(container, width, height, `Airport adjacency matrix ordered by ${order}`);
  const colors = networkColors(model);
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const cell = side / nodes.length;
  const plot = svg.append('g').attr('transform', `translate(${left},${top})`);
  plot.append('rect').attr('width', side).attr('height', side).attr('fill', '#ffffff');

  const crosshair = plot.append('g').attr('pointer-events', 'none').style('display', 'none');
  const rowGuide = crosshair.append('rect').attr('width', side).attr('height', cell).attr('fill', '#ffffff').attr('fill-opacity', .075);
  const colGuide = crosshair.append('rect').attr('width', cell).attr('height', side).attr('fill', '#ffffff').attr('fill-opacity', .075);
  const filledCells = model.edges.flatMap(edge => [
    { rowId: edge.sourceId, columnId: edge.targetId },
    { rowId: edge.targetId, columnId: edge.sourceId },
  ]);
  const marks = plot.append('g').selectAll('rect').data(filledCells).join('rect')
    .attr('x', entry => index.get(entry.columnId) * cell + .7)
    .attr('y', entry => index.get(entry.rowId) * cell + .7)
    .attr('width', Math.max(1, cell - 1.4)).attr('height', Math.max(1, cell - 1.4))
    .attr('rx', Math.min(2, cell / 5))
    .attr('fill', entry => colors.get(model.nodesById.get(entry.rowId).group))
    .attr('fill-opacity', .91).attr('tabindex', 0).attr('role', 'img')
    .attr('aria-label', entry => `${entry.rowId} is connected to ${entry.columnId}`);

  for (let position = 0; position <= nodes.length; position++) {
    const offset = position * cell;
    plot.append('line').attr('x1', 0).attr('x2', side).attr('y1', offset).attr('y2', offset)
      .attr('stroke', '#266435').attr('stroke-opacity', .15).attr('pointer-events', 'none');
    plot.append('line').attr('x1', offset).attr('x2', offset).attr('y1', 0).attr('y2', side)
      .attr('stroke', '#266435').attr('stroke-opacity', .15).attr('pointer-events', 'none');
  }
  if (order === 'group') {
    for (let position = 1; position < nodes.length; position++) {
      if (nodes[position].group === nodes[position - 1].group) continue;
      const offset = position * cell;
      plot.append('line').attr('x1', 0).attr('x2', side).attr('y1', offset).attr('y2', offset)
        .attr('stroke', '#000000').attr('stroke-width', 2.5).attr('pointer-events', 'none');
      plot.append('line').attr('x1', offset).attr('x2', offset).attr('y1', 0).attr('y2', side)
        .attr('stroke', '#000000').attr('stroke-width', 2.5).attr('pointer-events', 'none');
    }
  }

  const axis = svg.append('g');
  axis.selectAll('text.row').data(nodes).join('text')
    .attr('x', left - 8).attr('y', (_, i) => top + (i + .74) * cell)
    .attr('text-anchor', 'end').attr('fill', MUTED_TEXT)
    .attr('font-size', 10).attr('font-weight', 700).text(node => node.id);
  axis.selectAll('text.column').data(nodes).join('text')
    .attr('transform', (_, i) => `translate(${left + (i + .72) * cell},${top - 8}) rotate(-60)`)
    .attr('text-anchor', 'start').attr('fill', MUTED_TEXT)
    .attr('font-size', 10).attr('font-weight', 700).text(node => node.id);
  svg.append('text').attr('x', 12).attr('y', 25).attr('fill', LIGHT_TEXT)
    .attr('font-size', 13).attr('font-weight', 700)
    .text(order === 'group' ? 'COUNTRY → DEGREE' : order === 'degree' ? 'DEGREE' : 'FIRST APPEARANCE');

  function focusCell(event, entry) {
    const row = index.get(entry.rowId), column = index.get(entry.columnId);
    crosshair.style('display', null);
    rowGuide.attr('y', row * cell);
    colGuide.attr('x', column * cell);
    marks.attr('fill-opacity', mark => mark.rowId === entry.rowId || mark.columnId === entry.columnId ? 1 : .28);
    showTooltip(event, [`${entry.rowId} ↔ ${entry.columnId}`, 'Direct connection']);
  }
  function unfocusCell() {
    crosshair.style('display', 'none');
    marks.attr('fill-opacity', .91);
    hideTooltip();
  }
  marks.on('pointerenter', focusCell).on('pointermove', moveTooltip).on('pointerleave', unfocusCell)
    .on('focus', function (event, entry) {
      const box = this.getBoundingClientRect();
      focusCell({ clientX: box.left + box.width / 2, clientY: box.top }, entry);
    }).on('blur', unfocusCell);
  return { svg: svg.node(), destroy: hideTooltip };
}

function addHierarchyTooltip(selection, model) {
  selection.on('pointerenter', (event, node) => showTooltip(event, [
    node.data.name,
    `Depth ${node.depth} · ${D3.format(',.1f')(node.value)} ${model.mapping.value}`,
    node.children ? `${node.leaves().length} descendant leaves` : 'Leaf',
  ])).on('pointermove', moveTooltip).on('pointerleave', hideTooltip);
}

export function renderRectilinearTree(container, model) {
  const root = model.copyRoot();
  const width = Math.max(1500, model.leafCount * 27 + 130);
  const height = 760;
  const svg = createSvg(container, width, height, 'Rectilinear node-link hierarchy');
  D3.tree().size([width - 130, 435]).separation((a, b) => a.parent === b.parent ? 1 : 1.7)(root);
  const x = node => node.x + 65;
  const y = node => node.y + 65;
  const link = D3.linkVertical().x(node => x(node)).y(node => y(node));
  svg.append('g').selectAll('path').data(root.links()).join('path')
    .attr('d', link).attr('fill', 'none').attr('stroke', edge => model.colorFor(edge.target))
    .attr('stroke-opacity', .58).attr('stroke-width', 1.4);
  const marks = svg.append('g').selectAll('circle').data(root.descendants()).join('circle')
    .attr('cx', x).attr('cy', y).attr('r', node => node.children ? 6.8 : 4.6)
    .attr('fill', node => model.colorFor(node)).attr('stroke', '#000000').attr('stroke-width', 1.1);
  addHierarchyTooltip(marks, model);
  svg.append('g').selectAll('text.internal').data(root.descendants().filter(node => node.children)).join('text')
    .attr('x', x).attr('y', node => y(node) - 12).attr('text-anchor', 'middle')
    .attr('fill', LIGHT_TEXT).attr('font-size', node => node.depth < 2 ? 12 : 10)
    .attr('font-weight', 700).attr('paint-order', 'stroke').attr('stroke', BACKGROUND)
    .attr('stroke-width', 3)
    .text(node => node.depth >= 2 && node.data.name.length > 10
      ? `${node.data.name.slice(0, 9)}…` : node.data.name)
    .append('title').text(node => node.data.name);
  svg.append('g').selectAll('text.leaf').data(root.leaves()).join('text')
    .attr('transform', node => `translate(${x(node) - 2},${y(node) + 13}) rotate(57)`)
    .attr('fill', MUTED_TEXT).attr('font-size', 9).attr('font-weight', 700)
    .text(node => node.data.name);
  return { svg: svg.node(), destroy: hideTooltip };
}

export function renderTreemap(container, model) {
  const root = model.copyRoot();
  const width = 1060, height = 690;
  const svg = createSvg(container, width, height, 'Treemap hierarchy sized by quantitative value');
  D3.treemap().size([width - 30, height - 30]).paddingOuter(3).paddingInner(2)
    .paddingTop(node => node.children && node.depth > 0 ? 19 : 2).round(true)(root);
  const nodes = root.descendants();
  const groups = svg.append('g').attr('transform', 'translate(15,15)')
    .selectAll('g').data(nodes).join('g');
  const rectangles = groups.append('rect')
    .attr('x', node => node.x0).attr('y', node => node.y0)
    .attr('width', node => Math.max(0, node.x1 - node.x0))
    .attr('height', node => Math.max(0, node.y1 - node.y0))
    .attr('fill', node => {
      if (node.depth === 0) return '#ffffff';
      const color = D3.color(model.colorFor(node));
      return node.children ? color.darker(.95).formatHex() : color.formatHex();
    }).attr('stroke', node => node.children ? '#000000' : BACKGROUND)
    .attr('stroke-width', node => node.children ? 1.25 : .8)
    .attr('opacity', node => node.children ? .95 : .88);
  addHierarchyTooltip(rectangles, model);
  groups.filter(node => node.depth > 0 && node.x1 - node.x0 > 46 && node.y1 - node.y0 > (node.children ? 20 : 29))
    .append('text').attr('x', node => node.x0 + 5)
    .attr('y', node => node.y0 + (node.children ? 14 : 18))
    .attr('fill', node => D3.lab(model.colorFor(node)).l < 52 ? '#ffffff' : '#000000')
    .attr('font-size', node => node.children ? 11 : 10)
    .attr('font-weight', 700).attr('pointer-events', 'none')
    .text(node => node.data.name.length > Math.floor((node.x1 - node.x0) / 6)
      ? `${node.data.name.slice(0, Math.max(3, Math.floor((node.x1 - node.x0) / 6) - 1))}…`
      : node.data.name);
  return { svg: svg.node(), destroy: hideTooltip };
}

export function renderIcicle(container, model) {
  const root = model.copyRoot();
  const width = 1150, height = 540;
  const svg = createSvg(container, width, height, 'Icicle partition hierarchy');
  D3.partition().size([width - 36, height - 50]).padding(1.3)(root);
  const nodes = root.descendants();
  const groups = svg.append('g').attr('transform', 'translate(18,25)')
    .selectAll('g').data(nodes).join('g');
  const rectangles = groups.append('rect')
    .attr('x', node => node.x0).attr('y', node => node.y0)
    .attr('width', node => Math.max(0, node.x1 - node.x0))
    .attr('height', node => Math.max(0, node.y1 - node.y0))
    .attr('fill', node => {
      if (node.depth === 0) return '#266435';
      const color = D3.color(model.colorFor(node));
      return node.children ? color.darker(node.depth === 1 ? .65 : .2).formatHex() : color.formatHex();
    }).attr('stroke', BACKGROUND).attr('stroke-width', 1)
    .attr('opacity', node => node.children ? .9 : .96);
  addHierarchyTooltip(rectangles, model);
  groups.filter(node => node.x1 - node.x0 > 52 && node.y1 - node.y0 > 21)
    .append('text').attr('x', node => node.x0 + 6)
    .attr('y', node => node.y0 + 22)
    .attr('fill', node => node.depth === 0 || D3.lab(model.colorFor(node)).l < 52 ? '#ffffff' : '#000000')
    .attr('font-size', 11).attr('font-weight', 700).attr('pointer-events', 'none')
    .text(node => node.data.name.length > Math.floor((node.x1 - node.x0) / 7)
      ? `${node.data.name.slice(0, Math.max(3, Math.floor((node.x1 - node.x0) / 7) - 1))}…`
      : node.data.name);
  svg.append('text').attr('x', 18).attr('y', 14).attr('fill', MUTED_TEXT)
    .attr('font-size', 10).attr('font-weight', 700)
    .text('ROOT  →  CATEGORIES  →  LEAVES');
  return { svg: svg.node(), destroy: hideTooltip };
}
