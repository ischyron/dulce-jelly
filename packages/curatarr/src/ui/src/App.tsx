import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { ScoutQueue } from './pages/ScoutQueue';
import { Scan } from './pages/Scan';
import { Settings } from './pages/Settings';
import { Disambiguate } from './pages/Disambiguate';
import { Verify } from './pages/Verify';
import { Movie } from './pages/Movie';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--c-bg)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/scout" element={<ScoutQueue />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/disambiguate" element={<Disambiguate />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/movies/:id" element={<Movie />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={
              <div className="p-8 space-y-2">
                <p className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Page not found.</p>
                <p className="text-sm" style={{ color: 'var(--c-muted)' }}>The route you navigated to does not exist.</p>
              </div>
            } />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
