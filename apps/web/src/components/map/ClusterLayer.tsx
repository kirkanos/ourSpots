import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useMap } from 'react-leaflet';
import type { SpotDto } from '@womo/shared';
import { spotIcon } from './markerIcons';

interface Props {
  spots: SpotDto[];
  onSelect: (spot: SpotDto) => void;
}

/**
 * markercluster wird imperativ eingebunden. Eine React-Wrapper-Bibliothek
 * dafür hinkt den Leaflet-Versionen regelmäßig hinterher; der direkte Weg ist
 * hier kürzer und stabiler.
 */
export function ClusterLayer({ spots, onSelect }: Props): null {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
    });

    for (const spot of spots) {
      const marker = L.marker([spot.lat, spot.lon], {
        icon: spotIcon(spot.type, spot.rating),
        title: spot.name,
      });
      marker.on('click', () => onSelectRef.current(spot));
      group.addLayer(marker);
    }

    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, spots]);

  return null;
}
