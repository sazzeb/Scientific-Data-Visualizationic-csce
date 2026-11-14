import * as D3 from 'd3';

// One category keeps the same color wherever it appears in the comparisons.
const CATEGORY_PALETTE = [
  '#266435', // green
  '#2859a5', // blue
  '#a55b12', // amber
  '#863c8c', // violet
  '#b43d49', // red
  '#067c82', // teal
  '#78572a', // brown
];

export function categoryColor(index) {
  return CATEGORY_PALETTE[index] ?? D3.hsl((index * 137.508) % 360, 0.56, 0.38).formatHex();
}

/** An undirected graph with one canonical edge and one adjacency set per airport. */
export class NetworkModel {
  constructor(edgeRows, nodeRows = []) {
    if (!Array.isArray(edgeRows) || edgeRows.length === 0) {
      throw new Error('The network edge list is empty.');
    }

    this.nodes = [];
    this.edges = [];
    this.nodesById = new Map();
    this.adjacency = new Map();
    this.warnings = [];
    const edgeKeys = new Set();
    const metadata = new Map(nodeRows.map(row => [String(row.id ?? '').trim(), row]));

    const ensureNode = (id, fallbackCountry) => {
      if (!this.nodesById.has(id)) {
        const row = metadata.get(id);
        const node = {
          id,
          label: row?.city ? `${row.city} (${id})` : id,
          city: row?.city || id,
          group: row?.country || fallbackCountry || 'Unclassified',
          cluster: row?.cluster ?? null,
          degree: 0,
          fileIndex: this.nodes.length,
        };
        this.nodesById.set(id, node);
        this.adjacency.set(id, new Set());
        this.nodes.push(node);
      } else if (this.nodesById.get(id).group === 'Unclassified' && fallbackCountry) {
        this.nodesById.get(id).group = fallbackCountry;
      }
      return this.nodesById.get(id);
    };

    edgeRows.forEach((row, rowIndex) => {
      const sourceId = String(row.source ?? '').trim();
      const targetId = String(row.target ?? '').trim();
      if (!sourceId || !targetId) {
        this.warnings.push(`Skipped edge row ${rowIndex + 2}: missing endpoint.`);
        return;
      }
      if (sourceId === targetId) {
        this.warnings.push(`Skipped self-link at ${sourceId}.`);
        return;
      }
      const key = [sourceId, targetId].sort().join('\u001f');
      if (edgeKeys.has(key)) {
        this.warnings.push(`Skipped duplicate link ${sourceId}–${targetId}.`);
        return;
      }
      edgeKeys.add(key);
      ensureNode(sourceId, row.source_country);
      ensureNode(targetId, row.target_country);
      this.edges.push({ sourceId, targetId, linkType: row.link_type || '' });
      this.adjacency.get(sourceId).add(targetId);
      this.adjacency.get(targetId).add(sourceId);
    });

    // Metadata-only nodes are retained as isolated nodes if a future dataset has any.
    for (const row of nodeRows) {
      const id = String(row.id ?? '').trim();
      if (id) ensureNode(id, row.country);
    }
    if (this.nodes.length < 2 || this.edges.length === 0) {
      throw new Error('The network needs at least two nodes and one valid link.');
    }
    for (const node of this.nodes) node.degree = this.adjacency.get(node.id).size;
    this.groups = [...new Set(this.nodes.map(node => node.group))].sort(D3.ascending);
  }

  get linksPerNode() { return this.edges.length / this.nodes.length; }
  get graphDensity() { return 2 * this.edges.length / (this.nodes.length * (this.nodes.length - 1)); }
  neighbors(id) { return [...(this.adjacency.get(id) ?? [])].sort(D3.ascending); }
  hasEdge(sourceId, targetId) { return this.adjacency.get(sourceId)?.has(targetId) ?? false; }
  twoHopPaths(sourceId, targetId) {
    return this.neighbors(sourceId).filter(middleId => this.hasEdge(middleId, targetId))
      .map(middleId => [sourceId, middleId, targetId]);
  }
  maxDegreeNodes() {
    const maxDegree = D3.max(this.nodes, node => node.degree);
    return this.nodes.filter(node => node.degree === maxDegree);
  }
  countGroups() {
    return new Map(D3.rollups(this.nodes, nodes => nodes.length, node => node.group));
  }
  countCrossGroupLinks() {
    return this.edges.filter(edge => this.nodesById.get(edge.sourceId).group !== this.nodesById.get(edge.targetId).group).length;
  }
  orderedNodes(order = 'file') {
    const nodes = [...this.nodes];
    if (order === 'degree') {
      nodes.sort((a, b) => b.degree - a.degree || D3.ascending(a.id, b.id));
    } else if (order === 'group') {
      nodes.sort((a, b) => D3.ascending(a.group, b.group) || b.degree - a.degree || D3.ascending(a.id, b.id));
    }
    return nodes;
  }
}

/** A validated, summed hierarchy that can be copied for independent D3 layouts. */
export class HierarchyModel {
  constructor(rows, mapping, sourceName, isOwnData = false) {
    if (!rows?.length) throw new Error('The hierarchy CSV has no data rows.');
    const levelColumns = [mapping.levelOne, mapping.levelTwo, mapping.leaf].filter(Boolean);
    if (levelColumns.length < 2 || new Set(levelColumns).size !== levelColumns.length) {
      throw new Error('Choose distinct category columns for the top level, optional middle level, and leaf.');
    }
    if (!mapping.value || levelColumns.includes(mapping.value)) {
      throw new Error('Choose a separate numeric value column.');
    }
    if (/per.?capita|ratio|rate|percent|_pct\b|average|mean|median|rank/i.test(mapping.value)) {
      throw new Error('Choose an additive value. Rates, percentages, ranks, and averages cannot be summed into parent totals.');
    }
    const columns = rows.columns || Object.keys(rows[0]);
    for (const column of [...levelColumns, mapping.value]) {
      if (!columns.includes(column)) throw new Error(`Column “${column}” is missing from the CSV.`);
    }

    const cleanRows = rows.map((row, index) => {
      const categories = levelColumns.map(column => String(row[column] ?? '').trim());
      const rawValue = String(row[mapping.value] ?? '').trim();
      const value = Number(rawValue.replaceAll(',', ''));
      if (categories.some(category => !category)) {
        throw new Error(`Row ${index + 2} has an empty category.`);
      }
      if (!rawValue || !Number.isFinite(value) || value < 0) {
        throw new Error(`Row ${index + 2} needs a finite, nonnegative value.`);
      }
      return { categories, value };
    });
    if (cleanRows.every(row => row.value === 0)) {
      throw new Error('At least one leaf must have a value above zero for the area views.');
    }

    const keys = levelColumns.map((_, depth) => row => row.categories[depth]);
    const grouped = D3.group(cleanRows, ...keys);
    const buildChildren = (group, depth, parentPath = []) => Array.from(group, ([name, children]) => {
      const path = [...parentPath, name];
      const id = path.join('\u001f');
      if (depth === levelColumns.length - 1) {
        return { id, name, value: D3.sum(children, row => row.value) };
      }
      return { id, name, children: buildChildren(children, depth + 1, path) };
    });

    this.sourceName = sourceName;
    this.isOwnData = isOwnData;
    this.mapping = { ...mapping };
    this.root = D3.hierarchy({ id: 'root', name: 'All data', children: buildChildren(grouped, 0) })
      .sum(item => item.value || 0)
      .sort((a, b) => b.value - a.value || D3.ascending(a.data.name, b.data.name));
    this.leafCount = this.root.leaves().length;
    this.maxDepth = D3.max(this.root.descendants(), node => node.depth);
    this.branchCount = this.root.children?.length ?? 0;
    this.total = this.root.value;
    this.qualifies = this.leafCount >= 30 && this.maxDepth >= 2;
    const branches = this.root.children?.map(node => node.data.name) ?? [];
    this.branchColors = new Map(branches.map((name, index) => [name, categoryColor(index)]));
  }

  copyRoot() { return this.root.copy(); }
  topBranch(node) {
    let current = node;
    while (current?.parent && current.parent.depth > 0) current = current.parent;
    return current?.depth === 1 ? current.data.name : null;
  }
  colorFor(node) { return this.branchColors.get(this.topBranch(node)) || '#266435'; }
  countAtDepth(depth) { return this.root.descendants().filter(node => node.depth === depth).length; }
}
