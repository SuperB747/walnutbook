import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('App');
  if (container) {
    const root = createRoot(container);
    root.render(
      <HashRouter>
        <App />
      </HashRouter>
    );
  }
}); 