import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from 'zustand';
import { useAuth, useSettings } from '@dsa-portal/ui-core';
import { connectivity, desktop } from '../platform';

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useSettings();
  const { online } = useStore(connectivity);
  const navigate = useNavigate();
  // Cmd/Ctrl+K from the desktop menu: back to the topic picker (HomePage focuses it).
  useEffect(() => desktop?.onMenu((a) => a === 'switch-topic' && navigate('/')), [navigate]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="topbar">
        <strong>DSA Practice</strong>
        <nav aria-label="Main">
          <NavLink to="/">Practice</NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/leaderboard">Leaderboard</NavLink>
        </nav>
        <span className="spacer" />
        {desktop && (
          <span className={`badge ${online ? 'online' : 'offline'}`} role="status">
            {online ? '● Online' : '○ Offline: local practice'}
          </span>
        )}
        <label>
          <span className="sr-only">Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        {user ? (
          <button type="button" onClick={async () => { await logout(); navigate('/login'); }}>
            Log out {user.username}
          </button>
        ) : (
          <NavLink to="/login">Sign in</NavLink>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
