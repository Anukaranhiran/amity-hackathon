import { useEffect, useMemo, useState } from 'react';
import { api, type GraphEdge, type GraphNode } from '../api';
import { useScanCtx } from '../App';
import { Icon } from '../ui';

const KIND_COLOR: Record<GraphNode['kind'], string> = {
  actor: '#38bdf8',
  resource: '#22c55e',
  collection: '#818cf8',
  endpoint: '#64748b',
};

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#64748b',
};

export function ResourceGraphPage() {
  const { go } = useScanCtx();
  const [nodes, setNodes] = useState<GraphNode[] | null>(null);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    api.graph().then((g) => { setNodes(g.nodes); setEdges(g.edges); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const layout = useMemo(() => {
    if (!nodes || nodes.length === 0) return null;
    // Radial layout: actors inner ring, resources middle, endpoints outer.
    const actors = nodes.filter((n) => n.kind === 'actor');
    const resources = nodes.filter((n) => n.kind === 'resource');
    const endpoints = nodes.filter((n) => n.kind === 'endpoint');
    const W = 960, H = 620, cx = W / 2, cy = H / 2;
    const pos = new Map<string, { x: number; y: number }>();

    // Actors: left side, vertically distributed
    actors.forEach((n, i) => {
      pos.set(n.id, { x: 90, y: cy + (i - (actors.length - 1) / 2) * 140 });
    });
    // Resources: middle column-ish circle
    resources.forEach((n, i) => {
      const angle = (i / Math.max(1, resources.length)) * Math.PI * 2 - Math.PI / 2;
      const rx = 280, ry = 210;
      pos.set(n.id, { x: cx + 40 + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
    });
    // Endpoints: outer ring, near their resource
    const byResource = new Map<string, GraphNode[]>();
    for (const e of edges) {
      if (e.kind === 'accesses' || e.kind === 'modifies') {
        const from = endpoints.find((n) => n.id === e.from);
        if (from) {
          if (!byResource.has(e.to)) byResource.set(e.to, []);
          byResource.get(e.to)!.push(from);
        }
      }
    }
    for (const [resId, eps] of byResource) {
      const center = pos.get(resId);
      if (!center) continue;
      eps.forEach((ep, i) => {
        const angle = (i / Math.max(1, eps.length)) * Math.PI * 2 - Math.PI / 2 + 0.35;
        pos.set(ep.id, { x: center.x + Math.cos(angle) * 150, y: center.y + Math.sin(angle) * 105 });
      });
    }
    // Any endpoint without a resource placement — bottom strip
    let stripX = 60;
    for (const ep of endpoints) {
      if (!pos.has(ep.id)) {
        pos.set(ep.id, { x: stripX, y: H - 40 });
        stripX += 120;
      }
    }
    return { W, H, pos };
  }, [nodes, edges]);

  if (error) {
    return (
      <>
        <Header />
        <div className="empty">
          <div className="empty-title">Graph Unavailable</div>
          <div className="empty-desc">Could not build the relationship graph: {error}</div>
        </div>
      </>
    );
  }
  if (!nodes) return <><Header /><div className="skeleton" style={{ height: 420 }} /></>;
  if (nodes.length === 0 || !layout) {
    return (
      <>
        <Header />
        <div className="empty">
          <div className="empty-title">No Graph Data Yet</div>
          <div className="empty-desc">The relationship graph is built from discovered API sources — import endpoints in the API Inventory to populate it.</div>
          <div className="empty-action"><button className="btn btn-primary btn-sm" onClick={() => go({ name: 'inventory' })}><Icon name="bolt" /> Open API Inventory</button></div>
        </div>
      </>
    );
  }

  const { W, H, pos } = layout;
  const dimmed = (id: string) => hover !== null && hover !== id && !edges.some((e) => (e.from === hover && e.to === id) || (e.to === hover && e.from === id));

  return (
    <>
      <Header />
      <div className="panel flush graph-panel">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', minWidth: 760 }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
            </marker>
          </defs>
          {/* Edges */}
          {edges.map((e, i) => {
            const a = pos.get(e.from); const b = pos.get(e.to);
            if (!a || !b) return null;
            const color = e.kind === 'owns' ? 'rgba(56,189,248,0.5)' : e.kind === 'contains' ? 'rgba(129,140,248,0.45)' : e.kind === 'manages' ? 'rgba(239,68,68,0.4)' : 'rgba(100,116,139,0.35)';
            const dim = dimmed(e.from) && dimmed(e.to);
            return (
              <line
                key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeWidth={dim ? 0.6 : 1.4} markerEnd="url(#arrow)"
                opacity={dim ? 0.15 : 1} style={{ transition: 'opacity 0.2s' }}
              />
            );
          })}
          {/* Nodes */}
          {nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const r = n.kind === 'actor' ? 26 : n.kind === 'resource' ? 22 : 13;
            const isHover = hover === n.id;
            const dim = dimmed(n.id);
            const findingColor = n.finding ? SEV_COLOR[n.finding.severity] ?? null : null;
            const fill = findingColor ?? (n.tested && n.kind === 'endpoint' ? 'rgba(34,197,94,0.25)' : 'var(--bg-panel)');
            return (
              <g
                key={n.id} transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.25 : 1}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                onClick={() => setSelected(n)}
              >
                {isHover && <circle r={r + 7} fill="none" stroke={KIND_COLOR[n.kind]} strokeWidth="1" opacity="0.5" />}
                <circle r={r} fill={fill} stroke={findingColor ?? KIND_COLOR[n.kind]} strokeWidth="2" />
                {n.kind === 'actor' && (
                  <text textAnchor="middle" dy="4" fill="var(--text)" fontSize="11" fontWeight="700">
                    {n.label.startsWith('Admin') ? 'A' : 'U'}
                  </text>
                )}
                <text
                  textAnchor="middle" y={r + 14} fill="var(--text-dim)"
                  fontSize={n.kind === 'endpoint' ? 9 : 11}
                  fontWeight={n.kind === 'endpoint' ? 500 : 650}
                  style={{ pointerEvents: 'none' }}
                >
                  {n.label.length > 26 ? `${n.label.slice(0, 24)}…` : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="row mt faint" style={{ gap: 16 }}>
        <span><span className="dot-swatch" style={{ background: '#38bdf8' }} /> Actor</span>
        <span><span className="dot-swatch" style={{ background: '#22c55e' }} /> Resource</span>
        <span><span className="dot-swatch" style={{ background: '#818cf8' }} /> owns / contains</span>
        <span><span className="dot-swatch" style={{ background: SEV_COLOR.high }} /> node color = worst confirmed finding</span>
        <span><span className="dot-swatch" style={{ background: 'rgba(34,197,94,0.4)' }} /> tested, no finding</span>
      </div>

      {selected && (
        <div className="panel mt">
          <div className="panel-head">
            <div className="panel-title"><Icon name="target" /> {selected.label}</div>
            <button className="icon-btn" onClick={() => setSelected(null)}><Icon name="x" /></button>
          </div>
          <div className="kv-grid">
            <dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{selected.kind}</dd>
            {selected.meta && 'auth' in selected.meta && <><dt>Authentication</dt><dd>{String(selected.meta.auth)}</dd></>}
            {selected.meta && 'idParam' in selected.meta && <><dt>Object id param</dt><dd className="mono">{String(selected.meta.idParam)}</dd></>}
            <dt>Tested</dt><dd>{selected.tested ? 'Yes' : 'No'}</dd>
            {selected.finding && (
              <>
                <dt>Findings</dt>
                <dd>
                  <span className={`sev ${selected.finding.severity}`}>{selected.finding.severity.toUpperCase()}</span>{' '}
                  <span className="faint">({selected.finding.count} total, {selected.finding.status})</span>
                </dd>
                <dt>Actions</dt>
                <dd><a className="link" onClick={() => go({ name: 'findings' })}>View findings →</a></dd>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Header() {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">API Discovery & Intelligence</div>
        <h1 className="page-title">Resource Relationship Graph</h1>
        <p className="page-sub">
          How actors, resources and endpoints relate — inferred from discovered API structure and overlaid with real scan findings.
        </p>
      </div>
    </div>
  );
}
