import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CallerView from './CallerView';
import './styles.css';

// Role selection:
//   ?role=caller  → force the mobile caller view
//   ?role=operator → force the operator dashboard
//   otherwise → small touch screens get the caller view, laptops get the operator.
function pickRole(): 'caller' | 'operator' {
  const param = new URLSearchParams(location.search).get('role');
  if (param === 'caller' || param === 'operator') return param;
  const isMobile = window.matchMedia('(max-width: 820px)').matches || 'ontouchstart' in window;
  return isMobile ? 'caller' : 'operator';
}

const Root = pickRole() === 'caller' ? CallerView : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
