import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar.js';
import { Dashboard } from './pages/Dashboard.js';
import { Library } from './pages/Library.js';
import { ScoutQueue } from './pages/ScoutQueue.js';
import { Scan } from './pages/ScanPage.js';
import { Settings } from './pages/Settings.js';
import { Disambiguate } from './pages/DisambiguatePage.js';
import { Verify } from './pages/VerifyPage.js';
import { Movie } from './pages/MoviePage.js';

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
