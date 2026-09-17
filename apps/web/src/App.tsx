import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { MapPage } from './pages/MapPage';
import { SpotsPage } from './pages/SpotsPage';
import { SpotDetailPage } from './pages/SpotDetailPage';
import { SpotEditPage } from './pages/SpotEditPage';
import { CapturePage } from './pages/CapturePage';
import { TripsPage } from './pages/TripsPage';
import { TripDetailPage } from './pages/TripDetailPage';

export function App() {
  return (
    <RequireAuth>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/karte" replace />} />
          <Route path="karte" element={<MapPage />} />
          <Route path="stellplaetze" element={<SpotsPage />} />
          <Route path="stellplaetze/neu" element={<SpotEditPage />} />
          <Route path="stellplaetze/:id" element={<SpotDetailPage />} />
          <Route path="stellplaetze/:id/bearbeiten" element={<SpotEditPage />} />
          <Route path="erfassen" element={<CapturePage />} />
          <Route path="reisen" element={<TripsPage />} />
          <Route path="reisen/:id" element={<TripDetailPage />} />
          <Route path="*" element={<Navigate to="/karte" replace />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
