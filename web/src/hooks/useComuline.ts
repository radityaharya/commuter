import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = '/api';

export interface Station {
  uid: string;
  id: string;
  name: string;
  type: string;
  metadata: {
    active: boolean;
    origin: {
      fg_enable: number;
      daop: number;
    };
  };
}

export interface Schedule {
  id: string;
  station_id: string;
  station_origin_id: string;
  station_destination_id: string;
  train_id: string;
  line: string;
  route: string;
  departs_at: string;
  arrives_at: string;
  metadata: {
    origin: {
      color: string;
    };
  };
  updated_at: string;
}

export interface RouteData {
  routes: RouteStop[];
  details: RouteDetail;
}

export interface RouteStop {
  id: string;
  station_id: string;
  station_name: string;
  departs_at: string;
  created_at: string;
  updated_at: string;
}

export interface RouteDetail {
  train_id: string;
  line: string;
  route: string;
  station_origin_id: string;
  station_origin_name: string;
  station_destination_id: string;
  station_destination_name: string;
  arrives_at: string;
}

export function useStations() {
  return useQuery({
    queryKey: ['stations'],
    queryFn: async (): Promise<Station[]> => {
      const response = await fetch(`${API_BASE_URL}/v1/station`);
      if (!response.ok) throw new Error('Failed to fetch stations');
      const json = await response.json();
      return json.data;
    },
  });
}

export function useSchedule(stationId: string | null) {
  return useQuery({
    queryKey: ['schedule', stationId],
    queryFn: async (): Promise<Schedule[]> => {
      if (!stationId) return [];
      const response = await fetch(`${API_BASE_URL}/v1/schedule/${stationId}`);
      if (!response.ok) throw new Error('Failed to fetch schedule');
      const json = await response.json();
      return json.data;
    },
    enabled: !!stationId,
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useRoute(trainId: string | null) {
  return useQuery({
    queryKey: ['route', trainId],
    queryFn: async (): Promise<RouteData> => {
      if (!trainId) throw new Error('Train ID required');
      const response = await fetch(`${API_BASE_URL}/v1/route/${trainId}`);
      if (!response.ok) throw new Error('Failed to fetch route');
      const json = await response.json();
      return json.data;
    },
    enabled: !!trainId,
  });
}

export function useSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/v1/sync`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to trigger sync');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}
