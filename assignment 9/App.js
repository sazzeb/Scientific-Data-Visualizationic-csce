import React, { useEffect } from 'react';
import { startApp } from './scripts/app.js';

const h = React.createElement;
const navGroups = [
  { heading: 'START HERE', links: [['overview', '◈', 'Overview']] },
  { heading: '01 ONE NETWORK · TWO IDIOMS', links: [['q1-a', '✣', 'Part A', 'Node-link runs'], ['q1-b-file', '', 'Part B · File order'], ['q1-b-group', '', 'Part B · Group order'], ['q1-c', '', 'Part C · Timed tasks']] },
  { heading: '02 ONE HIERARCHY · THREE IDIOMS', links: [['q2-a', '▦', 'Part A', 'Build the tree'], ['q2-b-tree', '', 'Part B · Node-link tree'], ['q2-b-treemap', '', 'Part B · Treemap'], ['q2-b-icicle', '', 'Part B · Icicle'], ['q2-c', '', 'Part C · Encoding table']] },
];

function Sidebar() {
  return h('aside', { className: 'sidebar', 'aria-label': 'Assignment navigation' },
    h('a', { className: 'brand', href: '#overview', 'data-page': 'overview', 'aria-label': 'CSCE 5320 Homework 8 overview' }, h('span', { className: 'brand-mark' }, 'UNT'), h('span', { className: 'brand-name' }, 'University of North Texas')),
    h('div', { className: 'sidebar-caption' }, 'CSCE 5320 · MODULE 08'),
    h('nav', { className: 'chapter-nav', 'aria-label': 'Question parts' }, navGroups.map((group) => h('div', { className: 'nav-group', key: group.heading },
      h('div', { className: 'nav-heading' }, group.heading), group.links.map(([page, symbol, label, detail]) => h('button', { className: `nav-link${detail ? '' : ' nav-sub'}`, 'data-page': page, type: 'button', key: page },
        h('span', { className: detail ? 'nav-symbol' : 'nav-track' }, symbol), label, detail && h('small', null, detail)))))));
}

export default function App() {
  useEffect(() => { startApp(); }, []);
  return h('div', { className: 'app-shell' }, h(Sidebar), h('div', { className: 'main-shell' },
    h('header', { className: 'topbar' }, h('div', { className: 'topbar-location' }, h('span', { className: 'live-dot', 'aria-hidden': true }), h('span', { id: 'page-breadcrumb' }, 'FIELD NOTES / OVERVIEW')), h('div', { className: 'topbar-right' }, h('span', { id: 'data-status' }, 'Loading datasets…'), h('span', { className: 'topbar-divider' }), h('span', null, 'HW8 STUDIO'))),
    h('main', { id: 'page-content', tabIndex: -1, 'aria-live': 'polite' }, h('div', { className: 'loading-state' }, h('span', { className: 'loading-orbit' }), h('p', null, 'Preparing Homework 8…')))),
    h('div', { id: 'chart-tooltip', className: 'chart-tooltip', role: 'tooltip', hidden: true }), h('div', { id: 'toast', className: 'toast', role: 'status', 'aria-live': 'polite', hidden: true }));
}
