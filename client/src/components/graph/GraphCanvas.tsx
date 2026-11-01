import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { TYPE_META } from '@/lib/entities';
import { cx } from '@/lib/format';
import type { GraphEdge, GraphNode } from '@/types';
import { computeLayout, type LaidEdge, type LaidNode } from './layout';

export type Selection = { kind: 'node'; key: string } | { kind: 'edge'; id: string } | null;

interface Props {
  nodes: GraphNode[]; edges: GraphEdge[]; focusKey: string;
  selection: Selection; onSelect: (s: Selection) => void;
  highlightMulti: boolean;
  pathNodes?: Set<string>; pathEdges?: Set<string>;
  resetToken: string;
}

const DASH: Record<string, string | undefined> = { high: undefined, recorded: undefined, medium: '7 4', low: '3 4', unverified: '1.5 4.5' };
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const curve = (e: LaidEdge) => `M${e.sx},${e.sy} Q${e.cx},${e.cy} ${e.tx},${e.ty}`;

/**
 * Interactive relationship graph drawn as SVG: pan (drag), zoom (wheel / buttons), select, hover-focus,
 * keyboard access. Layout comes from d3-force; everything shown is a real row from the database.
 */
export function GraphCanvas({ nodes, edges, focusKey, selection, onSelect, highlightMulti, pathNodes, pathEdges, resetToken }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Map<string, { x: number; y: number }>>(new Map());
  const drag = useRef<{ mode: 'pan' | 'node'; key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  // measure
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // a new data set forgets manually moved nodes
  useEffect(() => { setPinned(new Map()); }, [resetToken]);
  const layout = useMemo(() => computeLayout(nodes, edges, focusKey, pinned), [nodes, edges, focusKey, pinned]);

  const fit = useCallback(() => {
    const { minX, maxX, minY, maxY } = layout.bounds;
    const k = Math.min(1.05, Math.max(0.2, Math.min(size.w / (maxX - minX), size.h / (maxY - minY))));
    setView({ k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: size.h / 2 - ((minY + maxY) / 2) * k });
  }, [layout.bounds, size.w, size.h]);
  // fit when the data set changes (not while dragging nodes)
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetToken, size.w, size.h]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(3, Math.max(0.15, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }, []);

  // wheel zoom must be a non-passive native listener to prevent page scroll
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toWorld = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
  };

  const onPointerDown = (e: React.PointerEvent, nodeKey?: string) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    e.stopPropagation();
    if (nodeKey) {
      const n = layout.byKey.get(nodeKey)!;
      drag.current = { mode: 'node', key: nodeKey, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
    } else {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    if (d.mode === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else if (d.key) {
      const w = toWorld(e.clientX, e.clientY);
      setPinned((p) => new Map(p).set(d.key!, { x: w.x, y: w.y }));
    }
  };
  const onPointerUp = (e: React.PointerEvent, nodeKey?: string) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (nodeKey) onSelect({ kind: 'node', key: nodeKey });
      else if (!(e.target as Element).closest('[data-edge]')) onSelect(null);
    }
  };

  // what is "lit": hovered node + neighbours, or the selection, or the path
  const activeKey = hover ?? (selection?.kind === 'node' ? selection.key : null);
  const lit = useMemo(() => {
    if (!activeKey) return null;
    const s = new Set<string>([activeKey]);
    for (const e of edges) { if (e.source === activeKey) s.add(e.target); if (e.target === activeKey) s.add(e.source); }
    return s;
  }, [activeKey, edges]);
  const dimmed = (key: string) => (pathNodes?.size ? !pathNodes.has(key) : lit ? !lit.has(key) : false);
  const edgeDim = (e: LaidEdge) => (pathEdges?.size ? !pathEdges.has(e.id) : lit ? !(e.source === activeKey || e.target === activeKey) : false);
  const showAllLabels = view.k >= 1.25;

  const onKeyNode = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ kind: 'node', key }); }
  };

  const ordered = useMemo(() => [...layout.nodes].sort((a, b) => Number(a.key === focusKey) - Number(b.key === focusKey)), [layout.nodes, focusKey]);

  return (
    <div ref={wrap} className="relative h-full min-h-[420px] w-full touch-none select-none overflow-hidden rounded-[18px] border border-line bg-white"
      style={{ backgroundImage: 'radial-gradient(#dcddd2 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
      <svg width={size.w} height={size.h} role="group" aria-label="Relationship graph" className={cx('block', drag.current?.mode === 'pan' ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={(e) => onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={(e) => onPointerUp(e)} onPointerCancel={() => { drag.current = null; }}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* edges */}
          <g fill="none">
            {layout.edges.map((e) => {
              const sel = selection?.kind === 'edge' && selection.id === e.id;
              const onPath = pathEdges?.has(e.id);
              const dim = edgeDim(e) && !sel;
              return (
                <g key={e.id} data-edge onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge(null)}>
                  <path d={curve(e)} stroke="transparent" strokeWidth={14} className="cursor-pointer"
                    onPointerUp={(ev) => { ev.stopPropagation(); if (!drag.current?.moved) onSelect({ kind: 'edge', id: e.id }); drag.current = null; }}
                    onPointerDown={(ev) => ev.stopPropagation()} />
                  <path d={curve(e)} stroke="#1f1f1f" strokeLinecap="round" pointerEvents="none"
                    strokeWidth={sel || onPath ? 3.2 : hoverEdge === e.id ? 2.4 : 1.6} strokeDasharray={DASH[e.confidence]}
                    strokeOpacity={dim ? 0.1 : sel || onPath || hoverEdge === e.id ? 1 : 0.5} />
                </g>
              );
            })}
          </g>
          {/* edge labels (hover / selected / zoomed in) */}
          <g pointerEvents="none" fontSize={11} fontWeight={500}>
            {layout.edges.filter((e) => showAllLabels || hoverEdge === e.id || (selection?.kind === 'edge' && selection.id === e.id) || pathEdges?.has(e.id) || (activeKey && (e.source === activeKey || e.target === activeKey) && layout.nodes.length < 40)).map((e) => {
              const w = e.label.length * 6.2 + 12;
              return (
                <g key={`l${e.id}`} opacity={edgeDim(e) ? 0.25 : 1}>
                  <rect x={e.mx - w / 2} y={e.my - 9} width={w} height={18} rx={9} fill="#fff" stroke="#cfd0c4" />
                  <text x={e.mx} y={e.my + 4} textAnchor="middle" fill="#1f1f1f">{e.label}</text>
                </g>
              );
            })}
          </g>
          {/* nodes */}
          {ordered.map((n: LaidNode) => {
            const meta = TYPE_META[n.type];
            const Icon = meta.icon;
            const isFocus = n.key === focusKey;
            const sel = selection?.kind === 'node' && selection.key === n.key;
            const multi = highlightMulti && n.case_count >= 2;
            const dim = dimmed(n.key) && !sel;
            const isCase = n.type === 'case';
            const label = trunc(n.label, 24);
            return (
              <g key={n.key} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.22 : 1} tabIndex={0} role="button"
                aria-label={`${meta.label}: ${n.label}. ${n.degree} connection${n.degree === 1 ? '' : 's'}${n.case_count >= 2 ? `, linked to ${n.case_count} cases` : ''}${isFocus ? ', focus of the graph' : ''}`}
                aria-pressed={sel} className="cursor-pointer outline-none"
                onPointerDown={(e) => onPointerDown(e, n.key)} onPointerUp={(e) => onPointerUp(e, n.key)}
                onPointerEnter={() => setHover(n.key)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(n.key)} onBlur={() => setHover(null)} onKeyDown={(e) => onKeyNode(e, n.key)}>
                {(sel || isFocus) && <circle r={n.r + 8} fill="none" stroke="#1f1f1f" strokeWidth={sel ? 2.5 : 1.5} strokeOpacity={sel ? 1 : 0.35} />}
                {multi && <circle r={n.r + 5} fill="none" stroke="#1f1f1f" strokeWidth={1.6} strokeDasharray="3 3" />}
                {pathNodes?.has(n.key) && <circle r={n.r + 11} fill="none" stroke="#1f1f1f" strokeWidth={3} />}
                <circle r={n.r} fill={isCase ? meta.color : '#fff'} stroke={meta.color} strokeWidth={isCase ? 0 : 3} />
                <Icon x={-n.r * 0.5} y={-n.r * 0.5} width={n.r} height={n.r} stroke={isCase ? '#f6f7ed' : meta.color} strokeWidth={2} pointerEvents="none" />
                {multi && (
                  <g transform={`translate(${n.r * 0.78},${-n.r * 0.78})`}>
                    <circle r={9} fill="#1f1f1f" stroke="#fff" strokeWidth={1.5} />
                    <text y={3.6} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">{n.case_count}</text>
                  </g>
                )}
                <text y={n.r + 15} textAnchor="middle" fontSize={12} fontWeight={isFocus || sel ? 700 : 500} fill="#1f1f1f" stroke="#fff" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">{label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-line-strong bg-white shadow-sm">
        {[
          { l: 'Zoom in', i: <Plus size={16} />, f: () => zoomAt(1.25, size.w / 2, size.h / 2) },
          { l: 'Zoom out', i: <Minus size={16} />, f: () => zoomAt(0.8, size.w / 2, size.h / 2) },
          { l: 'Fit graph to screen', i: <Maximize2 size={15} />, f: fit },
        ].map((b) => <button key={b.l} aria-label={b.l} title={b.l} onClick={b.f} className="flex h-9 w-9 items-center justify-center border-b border-line last:border-0 hover:bg-mist">{b.i}</button>)}
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-white/90 px-3 py-1 text-[11.5px] text-muted sm:block">Drag to pan · scroll to zoom · click a record or line for details</p>
    </div>
  );
}
