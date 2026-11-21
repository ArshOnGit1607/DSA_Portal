import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from 'zustand';
import { useAuth } from '@dsa-portal/ui-core';
import { Layout } from './components/Layout';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { HomePage } from './pages/HomePage';
import { ProblemPage } from './pages/ProblemPage';
import { StatsPage } from './pages/StatsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LandingPage } from './pages/LandingPage';
import { connectivity, desktop } from './platform';

/** Signed-in users, or desktop users who chose to practise offline. */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { status } = useAuth();
  const { offlineGuest, online } = useStore(connectivity);
  const location = useLocation();
  if (status === 'authenticated' || (offlineGuest && !online)) return children;
  if (status === 'unknown') return <p role="status">Loading…</p>;
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

/** Logged-out web visitors get the landing page; everyone else the topic picker as before (desktop keeps going to login). */
function Root() {
  const { status } = useAuth();
  const { offlineGuest, online } = useStore(connectivity);
  if (status === 'anonymous' && !desktop && !(offlineGuest && !online)) return <LandingPage />;
  return (
    <RequireAuth>
      <HomePage />
    </RequireAuth>
  );
}

// shortcut: HashRouter so the same build works from Electron's app:// protocol without server rewrites; switch web to BrowserRouter + host rewrites on Day 10.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<Root />} />
          <Route
            path="/problem/:id"
            element={
              <RequireAuth>
                <ProblemPage />
              </RequireAuth>
            }
          />
          <Route
            path="/stats"
            element={
              <RequireAuth>
                <StatsPage />
              </RequireAuth>
            }
          />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
