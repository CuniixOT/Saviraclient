import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/geist';
import { App } from './App';
import { Setup } from './Setup';
import { LogWindow } from './LogWindow';
import { NewsArt } from './NewsArt';
import { news } from './news';
import './styles.css';

// The same bundle serves the launcher and its installer; main.cjs picks the mode via the URL.
const mode = new URLSearchParams(location.search).get('mode');
// mode=newsart: the news pictures for the in-game main menu, exported by scripts/menu-art.cjs.
const newsArt = <div className="newsart-export" style={{ '--accent': '#5ccf95' } as React.CSSProperties}>{news.map(item => <div key={item.art} data-art={item.art}><NewsArt kind={item.art} /></div>)}</div>;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{mode === 'setup' || mode === 'uninstall' ? <Setup mode={mode} /> : mode === 'logs' ? <LogWindow /> : mode === 'newsart' ? newsArt : <App />}</React.StrictMode>);
