import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getState } from './store/store';
import { applyUiScale } from './store/uiScale';
import './styles/app.css';

// The text and icon size chosen in Settings, before anything is drawn.
applyUiScale(getState().prefs.uiScale);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
