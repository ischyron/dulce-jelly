import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar.js';
import { Dashboard } from './pages/Dashboard.js';
import { Library } from './pages/Library.js';
import { ScoutQueue } from './pages/ScoutQueue.js';
import { ScanPage } from './pages/ScanPage.js';
import { Settings } from './pages/Settings.js';
import { DisambiguatePage } from './pages/DisambiguatePage.js';
import { VerifyPage } from './pages/VerifyPage.js';
import { MoviePage } from './pages/MoviePage.js';

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
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/disambiguate" element={<DisambiguatePage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/movies/:id" element={<MoviePage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
