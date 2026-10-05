import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource-variable/geist';
import { App } from './App';
import { Setup } from './Setup';
import './styles.css';

// The same bundle serves the launcher and its installer; main.cjs picks the mode via the URL.
const mode = new URLSearchParams(location.search).get('mode');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{mode === 'setup' || mode === 'uninstall' ? <Setup mode={mode} /> : <App />}</React.StrictMode>);
