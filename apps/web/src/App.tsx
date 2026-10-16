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
import { SettingsPage } from './pages/SettingsPage';
import { PublicTripPage } from './pages/PublicTripPage';
import { VideoRenderPage } from './pages/VideoRenderPage';
import { EntdeckenPage } from './pages/EntdeckenPage';
import { EntdeckenTripPage } from './pages/EntdeckenTripPage';

export function App() {
  return (
    <Routes>
      {/* Öffentlicher Teilen-Link: bewusst außerhalb der Anmeldeprüfung. */}
      <Route path="/s/:token" element={<PublicTripPage />} />
      {/* Buehne fuer den Renderer im Container. Zeigt ohne injiziertes Rezept
          nichts an und ruft die API nie auf – deshalb ohne Anmeldung. */}
      <Route path="/video-rendern" element={<VideoRenderPage />} />
      {/* Oeffentlich freigegebene Reisen – die Eingangstuer fuer alle, die
          nicht angemeldet sind. Privat bleibt trotzdem die Voreinstellung:
          Hier erscheint nur, was jemand ausdruecklich freigegeben hat. */}
      <Route path="/entdecken" element={<EntdeckenPage />} />
      <Route path="/entdecken/:id" element={<EntdeckenTripPage />} />
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

function AuthenticatedApp() {
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
          <Route path="einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/karte" replace />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
