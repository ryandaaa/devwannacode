import React from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/600.css';

import '@fontsource/geist-mono/400.css';

import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';

import './styles/index.css';
import './style.css';
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container!);

// Prevent the default OS/browser context menu globally
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
