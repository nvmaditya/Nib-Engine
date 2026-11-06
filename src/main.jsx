import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { FONTS } from './engine/config.js';
import './styles.css';

// Each hand is a font file in /fonts, named "LH <id>" so the style chips can show it.
// The browser only downloads a file when something on screen uses that hand.
const base = import.meta.env.BASE_URL;
const faces = document.createElement('style');
faces.textContent = FONTS.map(f => `@font-face{font-family:"LH ${f.id}";src:url("${base}fonts/${f.id}.woff") format("woff");font-weight:${f.weight};font-display:swap}`).join('\n');
document.head.append(faces);

createRoot(document.getElementById('root')).render(<App />);
