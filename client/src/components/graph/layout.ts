import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { GraphEdge, GraphNode } from '@/types';

export interface LaidNode extends GraphNode { x: number; y: number; r: number }
export interface LaidEdge extends GraphEdge { sx: number; sy: number; tx: number; ty: number; cx: number; cy: number; mx: number; my: number }
export interface Layout { nodes: LaidNode[]; edges: LaidEdge[]; byKey: Map<string, LaidNode>; bounds: { minX: number; minY: number; maxX: number; maxY: number } }

type SimNode = SimulationNodeDatum & { key: string; r: number; depth: number };

export const nodeRadius = (n: Pick<GraphNode, 'type' | 'degree'>) => (n.type === 'case' ? 20 : 15) + Math.min(n.degree, 12) * 0.7;

/**
 * Force-directed layout (d3-force is used for coordinates only; drawing, panning and interaction are our own SVG code).
 * Run synchronously for a fixed number of ticks, so the picture is stable: the same data always gives the same layout.
 */
export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], focusKey: string, pinned: Map<string, { x: number; y: number }>): Layout {
  const sim: SimNode[] = nodes.map((n, i) => {
    const ring = n.depth;
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 * 3.3;
    return { key: n.key, r: nodeRadius(n), depth: n.depth, x: Math.cos(angle) * (90 + ring * 150), y: Math.sin(angle) * (90 + ring * 150) };
  });
  const focus = sim.find((s) => s.key === focusKey);
  if (focus) { focus.fx = 0; focus.fy = 0; }

  const seen = new Set<string>();
  const links: SimulationLinkDatum<SimNode>[] = [];
  for (const e of edges) {
    const k = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
    if (seen.has(k)) continue;
    seen.add(k);
    links.push({ source: e.source, target: e.target });
  }
  const s = forceSimulation(sim)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.key).distance(150).strength(0.5))
    .force('charge', forceManyBody<SimNode>().strength((d) => -520 - d.r * 10))
    .force('collide', forceCollide<SimNode>().radius((d) => d.r + 40).iterations(3))
    .force('x', forceX<SimNode>(0).strength(0.02))
    .force('y', forceY<SimNode>(0).strength(0.02))
    .stop();
  const ticks = Math.min(420, 120 + nodes.length * 4);
  for (let i = 0; i < ticks; i++) s.tick();

  const laid: LaidNode[] = nodes.map((n, i) => {
    const p = pinned.get(n.key);
    return { ...n, x: p?.x ?? sim[i].x ?? 0, y: p?.y ?? sim[i].y ?? 0, r: sim[i].r };
  });
  const byKey = new Map(laid.map((n) => [n.key, n]));

  // parallel edges between the same two records are drawn as separate arcs
  const groups = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const k = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  const laidEdges: LaidEdge[] = [];
  for (const group of groups.values()) {
    group.forEach((e, idx) => {
      const a = byKey.get(e.source)!, b = byKey.get(e.target)!;
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const off = (idx - (group.length - 1) / 2) * 34;
      const nx = -dy / len, ny = dx / len;
      const cx = (a.x + b.x) / 2 + nx * off, cy = (a.y + b.y) / 2 + ny * off;
      // point on the curve at t = .5 (label position)
      const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x, my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
      laidEdges.push({ ...e, sx: a.x, sy: a.y, tx: b.x, ty: b.y, cx, cy, mx, my });
    });
  }

  const xs = laid.map((n) => n.x), ys = laid.map((n) => n.y);
  const bounds = laid.length
    ? { minX: Math.min(...xs) - 70, maxX: Math.max(...xs) + 70, minY: Math.min(...ys) - 60, maxY: Math.max(...ys) + 80 }
    : { minX: -200, maxX: 200, minY: -150, maxY: 150 };
  return { nodes: laid, edges: laidEdges, byKey, bounds };
}
