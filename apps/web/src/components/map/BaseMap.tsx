import type { ReactNode } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../lib/env';

interface Props {
  center?: [number, number];
  zoom?: number;
  /** Rahmt alle Punkte ein; hat Vorrang vor center/zoom. */
  bounds?: LatLngBoundsExpression;
  onClick?: (lat: number, lon: number) => void;
  onMoveEnd?: (bbox: string) => void;
  children?: ReactNode;
  className?: string;
}

export function BaseMap({
  center,
  zoom,
  bounds,
  onClick,
  onMoveEnd,
  children,
  className = 'map',
}: Props) {
  // Leaflet wertet `bounds` nur aus, wenn kein center/zoom gesetzt ist. Deshalb
  // wird hier das eine ODER das andere uebergeben – sonst zeigt eine Karte, die
  // alle Punkte einrahmen soll, stumm den Standardausschnitt.
  const view = bounds
    // Rand, damit Marker am Kartenrand nicht halb abgeschnitten sind, und eine
    // Zoom-Obergrenze: ein einzelner Punkt ergibt sonst einen Ausschnitt, auf
    // dem nur noch eine leere Wiese zu sehen ist.
    ? { bounds, boundsOptions: { padding: [24, 24] as [number, number], maxZoom: 13 } }
    : { center: center ?? DEFAULT_CENTER, zoom: zoom ?? DEFAULT_ZOOM };

  return (
    <MapContainer
      {...view}
      className={className}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <MapEvents onClick={onClick} onMoveEnd={onMoveEnd} />
      {children}
    </MapContainer>
  );
}

function MapEvents({
  onClick,
  onMoveEnd,
}: {
  onClick?: (lat: number, lon: number) => void;
  onMoveEnd?: (bbox: string) => void;
}): null {
  useMapEvents({
    click(event) {
      onClick?.(event.latlng.lat, event.latlng.lng);
    },
    moveend(event) {
      if (!onMoveEnd) return;
      const b = event.target.getBounds();
      // Reihenfolge wie im API-Filter: minLon,minLat,maxLon,maxLat
      onMoveEnd(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
          .map((n) => n.toFixed(5))
          .join(','),
      );
    },
  });
  return null;
}
