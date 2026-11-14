import * as d3 from 'd3';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

globalThis.d3 = d3;
createRoot(document.getElementById('root')).render(<App />);
