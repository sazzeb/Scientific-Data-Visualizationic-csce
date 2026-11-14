import { useEffect } from 'react';
import { startApp } from './scripts/app.js';

const navGroups = [
  { heading: 'START HERE', links: [['overview', '◈', 'Overview']] },
  { heading: '01 ONE NETWORK · TWO IDIOMS', links: [['q1-a', '✣', 'Part A', 'Node-link runs'], ['q1-b-file', '', 'Part B · File order'], ['q1-b-group', '', 'Part B · Group order'], ['q1-c', '', 'Part C · Timed tasks']] },
  { heading: '02 ONE HIERARCHY · THREE IDIOMS', links: [['q2-a', '▦', 'Part A', 'Build the tree'], ['q2-b-tree', '', 'Part B · Node-link tree'], ['q2-b-treemap', '', 'Part B · Treemap'], ['q2-b-icicle', '', 'Part B · Icicle'], ['q2-c', '', 'Part C · Encoding table']] },
];

function Sidebar() {
  return <aside className="sidebar" aria-label="Assignment navigation">
    <a className="brand" href="#overview" data-page="overview" aria-label="CSCE 5320 Homework 8 overview"><span className="brand-mark">UNT</span><span className="brand-name">University of North Texas</span></a>
    <div className="sidebar-caption">CSCE 5320 · MODULE 08</div>
    <nav className="chapter-nav" aria-label="Question parts">
      {navGroups.map((group) => <div className="nav-group" key={group.heading}>
        <div className="nav-heading">{group.heading}</div>
        {group.links.map(([page, symbol, label, detail]) => <button className={`nav-link${detail ? '' : ' nav-sub'}`} data-page={page} type="button" key={page}>
          <span className={detail ? 'nav-symbol' : 'nav-track'}>{symbol}</span>{label}{detail && <small>{detail}</small>}
        </button>)}
      </div>)}
    </nav>
  </aside>;
}

export default function App() {
  useEffect(() => { startApp(); }, []);
  return <div className="app-shell">
    <Sidebar />
    <div className="main-shell">
      <header className="topbar"><div className="topbar-location"><span className="live-dot" aria-hidden="true" /><span id="page-breadcrumb">FIELD NOTES / OVERVIEW</span></div><div className="topbar-right"><span id="data-status">Loading datasets…</span><span className="topbar-divider" /><span>HW8 STUDIO</span></div></header>
      <main id="page-content" tabIndex="-1" aria-live="polite"><div className="loading-state"><span className="loading-orbit" /><p>Preparing Homework 8…</p></div></main>
    </div>
    <div id="chart-tooltip" className="chart-tooltip" role="tooltip" hidden />
    <div id="toast" className="toast" role="status" aria-live="polite" hidden />
  </div>;
}

