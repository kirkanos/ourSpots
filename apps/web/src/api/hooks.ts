import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  GeocodeResultDto,
  PagedResult,
  PhotoDto,
  SpotDto,
  SpotInput,
  TripDto,
  TripInput,
  TripMemberInput,
  UserDto,
  WaypointDto,
  WaypointInput,
} from '@womo/shared';
import { api, buildQuery } from './client';

// --- Nutzer ----------------------------------------------------------------

export function useMe(): UseQueryResult<UserDto> {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<UserDto>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

// --- Reisen ----------------------------------------------------------------

export function useTrips(): UseQueryResult<TripDto[]> {
  return useQuery({ queryKey: ['trips'], queryFn: () => api<TripDto[]>('/trips') });
}

export function useTrip(id: string | undefined): UseQueryResult<TripDto> {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: () => api<TripDto>(`/trips/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TripInput }) =>
      api<TripDto>(`/trips/${id}`, { method: 'PUT', body: input }),
    onSuccess: (trip) => {
      void qc.invalidateQueries({ queryKey: ['trips'] });
      void qc.invalidateQueries({ queryKey: ['trip', trip.id] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/trips/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

export function useAddTripMember(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TripMemberInput) =>
      api<void>(`/trips/${tripId}/members`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip', tripId] }),
  });
}

export function useRemoveTripMember(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/trips/${tripId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip', tripId] }),
  });
}

// --- Wegpunkte -------------------------------------------------------------

export function useWaypoints(tripId: string | undefined): UseQueryResult<WaypointDto[]> {
  return useQuery({
    queryKey: ['waypoints', tripId],
    queryFn: () => api<WaypointDto[]>(`/trips/${tripId}/waypoints`),
    enabled: Boolean(tripId),
  });
}

export function useSaveWaypoints(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (waypoints: WaypointInput[]) =>
      api<WaypointDto[]>(`/trips/${tripId}/waypoints`, { method: 'PUT', body: { waypoints } }),
    onSuccess: (data) => qc.setQueryData(['waypoints', tripId], data),
  });
}

// --- Stellplätze -----------------------------------------------------------

export interface SpotFilters {
  q?: string;
  tripId?: string;
  type?: string;
  minRating?: number;
  maxPrice?: number;
  amenities?: string[];
  country?: string;
  from?: string;
  to?: string;
  bbox?: string;
  near?: string;
  radiusKm?: number;
  onlyMine?: boolean;
  sort?: string;
  order?: string;
  limit?: number;
}

export function useSpots(filters: SpotFilters): UseQueryResult<PagedResult<SpotDto>> {
  return useQuery({
    queryKey: ['spots', filters],
    queryFn: () => api<PagedResult<SpotDto>>(`/spots${buildQuery({ ...filters })}`),
    placeholderData: (previous) => previous,
  });
}

export function useSpot(id: string | undefined): UseQueryResult<SpotDto> {
  return useQuery({
    queryKey: ['spot', id],
    queryFn: () => api<SpotDto>(`/spots/${id}`),
    enabled: Boolean(id),
  });
}

export function useSaveSpot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SpotInput }) =>
      api<SpotDto>(`/spots/${id}`, { method: 'PUT', body: input }),
    onSuccess: (spot) => {
      void qc.invalidateQueries({ queryKey: ['spots'] });
      void qc.invalidateQueries({ queryKey: ['spot', spot.id] });
      void qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

export function useDeleteSpot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/spots/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spots'] }),
  });
}

// --- Fotos -----------------------------------------------------------------

export function useUploadPhoto(spotId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<PhotoDto>(`/spots/${spotId}/photos`, { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spot', spotId] }),
  });
}

export function useDeletePhoto(spotId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api<void>(`/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spot', spotId] }),
  });
}

export function photoUrl(photoId: string, size: 'thumb' | 'medium' | 'original' = 'medium'): string {
  return `/api/photos/${photoId}?size=${size}`;
}

// --- Adresssuche -----------------------------------------------------------

export function useGeocode(query: string) {
  return useQuery({
    queryKey: ['geocode', query],
    queryFn: () => api<GeocodeResultDto[]>(`/geocode${buildQuery({ q: query })}`),
    // Nominatim erlaubt nur eine Anfrage pro Sekunde – erst ab drei Zeichen
    // und mit langer Frischezeit anfragen.
    enabled: query.trim().length >= 3,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function reverseGeocode(lat: number, lon: number): Promise<GeocodeResultDto | null> {
  return api<GeocodeResultDto | null>(`/reverse${buildQuery({ lat, lon })}`);
}
