import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  DiaryEntryDto,
  DiaryEntryInput,
  ExpenseDto,
  ExpenseInput,
  FuelLogDto,
  FuelLogInput,
  GeocodeResultDto,
  HomeInput,
  ImportResultDto,
  OptimizeOptions,
  OptimizeResultDto,
  RouteOptions,
  ShareLinkDto,
  StageDto,
  StageInput,
  TripRouteDto,
  TripStatsDto,
  VehicleDto,
  VehicleInput,
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
} from '@ourspots/shared';
import { api, buildQuery } from './client';
import { isOfflineError } from '../offline/db';
import { pendingSpot, pendingSpots, queuePhoto, queueSpot } from '../offline/outbox';

// --- Nutzer ----------------------------------------------------------------

export function useMe(): UseQueryResult<UserDto> {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<UserDto>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetHome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (home: HomeInput) => api<UserDto>('/auth/me/home', { method: 'PUT', body: home }),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useClearHome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<UserDto>('/auth/me/home', { method: 'DELETE' }),
    onSuccess: (user) => qc.setQueryData(['me'], user),
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
    queryFn: async () => {
      const queued = await pendingSpots();

      try {
        const result = await api<PagedResult<SpotDto>>(`/spots${buildQuery({ ...filters })}`);
        return mergePending(result, queued, filters);
      } catch (err) {
        // Ohne Netz liefert der Service Worker die letzte Antwort; noch nicht
        // übertragene Plätze kommen aus der Warteschlange dazu.
        if (isOfflineError(err) && queued.length > 0) {
          return mergePending({ items: [], nextCursor: null, total: 0 }, queued, filters);
        }
        throw err;
      }
    },
    placeholderData: (previous) => previous,
  });
}

/**
 * Noch nicht übertragene Stellplätze in eine Serverantwort einweben – sonst
 * verschwindet ein offline erfasster Platz aus Liste und Karte, bis wieder Netz
 * da ist.
 */
function mergePending(
  result: PagedResult<SpotDto>,
  queued: SpotDto[],
  filters: SpotFilters,
): PagedResult<SpotDto> {
  const relevant = queued.filter((spot) => {
    if (filters.tripId && spot.tripId !== filters.tripId) return false;
    if (filters.type && spot.type !== filters.type) return false;
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      const haystack = `${spot.name} ${spot.address ?? ''} ${spot.notes ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  if (relevant.length === 0) return result;

  const known = new Set(result.items.map((spot) => spot.id));
  const extra = relevant.filter((spot) => !known.has(spot.id));

  return {
    items: [...extra, ...result.items],
    nextCursor: result.nextCursor,
    total: (result.total ?? result.items.length) + extra.length,
  };
}

export function useSpot(id: string | undefined): UseQueryResult<SpotDto> {
  return useQuery({
    queryKey: ['spot', id],
    queryFn: async () => {
      try {
        return await api<SpotDto>(`/spots/${id}`);
      } catch (err) {
        const local = id ? await pendingSpot(id) : undefined;
        if (local) return local;
        throw err;
      }
    },
    enabled: Boolean(id),
  });
}

export function useSaveSpot() {
  const qc = useQueryClient();
  const me = useMe();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SpotInput }) => {
      try {
        return await api<SpotDto>(`/spots/${id}`, { method: 'PUT', body: input });
      } catch (err) {
        // Ohne Netz nicht verwerfen, sondern vormerken: genau dafür vergibt der
        // Client die ID selbst.
        if (isOfflineError(err)) {
          return queueSpot(id, input, optimisticSpot(id, input, me.data?.id ?? 'lokal'));
        }
        throw err;
      }
    },
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
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      try {
        return await api<PhotoDto>(`/spots/${spotId}/photos`, { method: 'POST', body: form });
      } catch (err) {
        if (isOfflineError(err)) {
          await queuePhoto(spotId, file);
          return null;
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spot', spotId] }),
  });
}

/** Wie der Server den Stellplatz voraussichtlich zurückgeben wird. */
function optimisticSpot(id: string, input: SpotInput, userId: string): SpotDto {
  const now = new Date().toISOString();
  return {
    id,
    tripId: input.tripId ?? null,
    createdById: userId,
    name: input.name,
    lat: input.lat,
    lon: input.lon,
    address: input.address ?? null,
    country: input.country ?? null,
    type: input.type,
    visitedAt: input.visitedAt ?? null,
    nights: input.nights ?? null,
    rating: input.rating ?? null,
    pricePerNight: input.pricePerNight ?? null,
    currency: input.currency,
    notes: input.notes ?? null,
    isPrivateNote: input.isPrivateNote,
    source: input.source,
    amenities: input.amenities,
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
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

// --- Etappen ---------------------------------------------------------------

export function useStages(tripId: string | undefined): UseQueryResult<StageDto[]> {
  return useQuery({
    queryKey: ['stages', tripId],
    queryFn: () => api<StageDto[]>(`/trips/${tripId}/stages`),
    enabled: Boolean(tripId),
  });
}

export function useSaveStages(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stages: StageInput[]) =>
      api<StageDto[]>(`/trips/${tripId}/stages`, { method: 'PUT', body: { stages } }),
    onSuccess: (data) => {
      qc.setQueryData(['stages', tripId], data);
      void qc.invalidateQueries({ queryKey: ['waypoints', tripId] });
      void qc.invalidateQueries({ queryKey: ['route', tripId] });
    },
  });
}

// --- Routenberechnung ------------------------------------------------------

export function useRoutingStatus(): UseQueryResult<{ configured: boolean }> {
  return useQuery({
    queryKey: ['routing-status'],
    queryFn: () => api<{ configured: boolean }>('/routing/status'),
    staleTime: Infinity,
  });
}

export function useCalculateRoute(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (options: Partial<RouteOptions>) =>
      api<TripRouteDto>(`/trips/${tripId}/route`, { method: 'POST', body: options }),
    onSuccess: (route) => qc.setQueryData(['route', tripId], route),
  });
}

/** Die zuletzt berechnete Route, damit ein Seitenwechsel sie nicht verwirft. */
export function useCachedRoute(tripId: string): TripRouteDto | undefined {
  const qc = useQueryClient();
  return qc.getQueryData<TripRouteDto>(['route', tripId]);
}

export function useOptimizeRoute(tripId: string) {
  return useMutation({
    mutationFn: (options: Partial<OptimizeOptions>) =>
      api<OptimizeResultDto>(`/trips/${tripId}/route/optimize`, { method: 'POST', body: options }),
  });
}

// --- Fahrzeuge -------------------------------------------------------------

export function useVehicles(): UseQueryResult<VehicleDto[]> {
  return useQuery({ queryKey: ['vehicles'], queryFn: () => api<VehicleDto[]>('/vehicles') });
}

export function useSaveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VehicleInput }) =>
      api<VehicleDto>(`/vehicles/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/vehicles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}

// --- Tagebuch, Tanken, Kosten ----------------------------------------------

export function useDiary(tripId: string | undefined): UseQueryResult<DiaryEntryDto[]> {
  return useQuery({
    queryKey: ['diary', tripId],
    queryFn: () => api<DiaryEntryDto[]>(`/trips/${tripId}/diary`),
    enabled: Boolean(tripId),
  });
}

export function useSaveDiary(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DiaryEntryInput }) =>
      api<DiaryEntryDto>(`/trips/${tripId}/diary/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['diary', tripId] });
      void qc.invalidateQueries({ queryKey: ['stats', tripId] });
    },
  });
}

export function useDeleteDiary(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/trips/${tripId}/diary/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['diary', tripId] });
      void qc.invalidateQueries({ queryKey: ['stats', tripId] });
    },
  });
}

export function useFuelLogs(tripId: string | undefined): UseQueryResult<FuelLogDto[]> {
  return useQuery({
    queryKey: ['fuel', tripId],
    queryFn: () => api<FuelLogDto[]>(`/trips/${tripId}/fuel`),
    enabled: Boolean(tripId),
  });
}

export function useSaveFuel(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FuelLogInput }) =>
      api<FuelLogDto>(`/trips/${tripId}/fuel/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fuel', tripId] });
      void qc.invalidateQueries({ queryKey: ['stats', tripId] });
    },
  });
}

export function useDeleteFuel(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/trips/${tripId}/fuel/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fuel', tripId] });
      void qc.invalidateQueries({ queryKey: ['stats', tripId] });
    },
  });
}

export function useExpenses(tripId: string | undefined): UseQueryResult<ExpenseDto[]> {
  return useQuery({
    queryKey: ['expenses', tripId],
    queryFn: () => api<ExpenseDto[]>(`/trips/${tripId}/expenses`),
    enabled: Boolean(tripId),
  });
}

export function useSaveExpense(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExpenseInput }) =>
      api<ExpenseDto>(`/trips/${tripId}/expenses/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses', tripId] });
      void qc.invalidateQueries({ queryKey: ['stats', tripId] });
    },
  });
}

export function useDeleteExpense(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/trips/${tripId}/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses', tripId] });
      void qc.invalidateQueries({ queryKey: ['stats', tripId] });
    },
  });
}

export function useTripStats(tripId: string | undefined): UseQueryResult<TripStatsDto> {
  return useQuery({
    queryKey: ['stats', tripId],
    queryFn: () => api<TripStatsDto>(`/trips/${tripId}/stats`),
    enabled: Boolean(tripId),
  });
}

// --- Teilen ----------------------------------------------------------------

export function useShareLinks(tripId: string | undefined): UseQueryResult<ShareLinkDto[]> {
  return useQuery({
    queryKey: ['share', tripId],
    queryFn: () => api<ShareLinkDto[]>(`/trips/${tripId}/share`),
    enabled: Boolean(tripId),
  });
}

export function useCreateShareLink(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (includePhotos: boolean) =>
      api<ShareLinkDto>(`/trips/${tripId}/share`, { method: 'POST', body: { includePhotos } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share', tripId] }),
  });
}

export function useRevokeShareLink(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<void>(`/share/${token}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share', tripId] }),
  });
}

// --- Import ----------------------------------------------------------------

export function useImportSpots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, tripId }: { file: File; tripId?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (tripId) form.append('tripId', tripId);
      return api<ImportResultDto>('/import', { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spots'] }),
  });
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
