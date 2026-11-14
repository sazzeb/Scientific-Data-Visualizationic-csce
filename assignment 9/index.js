import * as d3 from 'd3';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

globalThis.d3 = d3;
createRoot(document.getElementById('root')).render(React.createElement(App));
