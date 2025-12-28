import { useState, useEffect, useRef, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useStations, useSchedule, useRoute, useSync, useNextDepartures, type Station } from '@/hooks/useComuline';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { StationSidebar } from '@/components/comuline/StationSidebar';
import { format } from 'date-fns';
import { Train, MapPin, Clock, Menu, Loader2, ChevronLeft, Star, ArrowRight } from 'lucide-react';
import { useFavorites } from '@/store';

export const Route = createFileRoute('/')({
  component: ComulinePage,
});

function ComulinePage() {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { favorites } = useFavorites();
  const { data: stations, isLoading: isLoadingStations, error: stationsError } = useStations();
  const { data: schedules, isLoading: isLoadingSchedules } = useSchedule(selectedStation?.id || null);
  const { data: routeData, isLoading: isLoadingRoute } = useRoute(selectedTrainId);
  const { mutate: sync, isPending: isSyncing } = useSync();
  const { data: nextDepartures, isLoading: isLoadingNextDepartures } = useNextDepartures(favorites);

  const scheduleRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Find next schedule index
  const nextScheduleIndex = useMemo(() => {
    if (!schedules || schedules.length === 0) return -1;
    const now = new Date();
    return schedules.findIndex(s => new Date(s.departs_at) > now);
  }, [schedules]);

  const selectedSchedule = useMemo(() =>
    schedules?.find(s => s.train_id === selectedTrainId),
    [schedules, selectedTrainId]
  );

  // Enrich next departures with station names
  const enrichedDepartures = useMemo(() => {
    if (!nextDepartures || !stations) return [];
    return nextDepartures.map(dep => ({
      ...dep,
      station_name: stations.find(s => s.id === dep.station_id)?.name || dep.station_id,
    }));
  }, [nextDepartures, stations]);

  // Group departures by station
  const groupedDepartures = useMemo(() => {
    if (!enrichedDepartures || !stations) return new Map();
    const grouped = new Map<string, typeof enrichedDepartures>();
    enrichedDepartures.forEach(dep => {
      const existing = grouped.get(dep.station_id) || [];
      grouped.set(dep.station_id, [...existing, dep]);
    });
    return grouped;
  }, [enrichedDepartures, stations]);

  // Auto-scroll to nearest schedule
  useEffect(() => {
    if (schedules && schedules.length > 0 && !isLoadingSchedules) {
      const now = new Date();
      const nextScheduleIndex = schedules.findIndex(s => new Date(s.departs_at) > now);

      if (nextScheduleIndex !== -1 && scheduleRefs.current[nextScheduleIndex]) {
        scheduleRefs.current[nextScheduleIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [schedules, isLoadingSchedules, selectedStation]);

  const handleSelectStation = (station: Station) => {
    setSelectedStation(station);
    setSelectedTrainId(null);
    setIsMobileOpen(false);
  };

  // Calculate last updated time
  const lastUpdated = useMemo(() => {
    let date: Date | null = null;

    // Try to get from selected station schedules
    if (schedules?.[0]?.updated_at) {
      date = new Date(schedules[0].updated_at);
    }
    // Fallback to next departures (favorites)
    else if (nextDepartures && nextDepartures.length > 0) {
      // Find the most recent update
      const first = nextDepartures[0].next_schedule;
      if (first?.updated_at) {
        date = new Date(first.updated_at);
      }
    }

    return date;
  }, [schedules, nextDepartures]);

  const sidebarProps = {
    stations,
    isLoading: isLoadingStations,
    error: stationsError,
    selectedStationId: selectedStation?.id,
    onSelectStation: handleSelectStation,
    searchQuery,
    setSearchQuery,
    sync,
    isSyncing,
    lastUpdated
  };

  return (
    <div className="flex h-screen bg-terminal-bg text-terminal-text font-mono overflow-hidden flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-terminal-border bg-terminal-bg shrink-0">
        <div className="flex items-center gap-2 text-terminal-green">
          <Train className="size-6" />
          {lastUpdated ? (
            <div className="flex flex-col leading-none">
              <span className="text-[10px] text-terminal-muted uppercase tracking-wider font-bold">Last Updated</span>
              <span className="text-sm font-mono font-bold">{format(lastUpdated, 'dd MMM HH:mm')}</span>
            </div>
          ) : (
            <h1 className="text-xl font-bold tracking-tight">Comuline</h1>
          )}
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="size-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-terminal-border bg-terminal-bg w-80">
            <StationSidebar {...sidebarProps} isMobile={true} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-80 border-r border-terminal-border flex-col shrink-0 transition-all duration-300 h-full">
        <StationSidebar {...sidebarProps} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-terminal-bg/50 relative h-full">
        {selectedStation ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Station Header */}
            <div className="p-6 border-b border-terminal-border bg-terminal-surface/20 shrink-0">
              <div className="flex items-center gap-3 mb-1">
                <MapPin className="size-5 text-terminal-green" />
                <h2 className="text-2xl font-bold">{selectedStation.name}</h2>
                <span className="text-sm font-normal text-terminal-muted border border-terminal-border px-2 py-0.5 rounded">
                  {selectedStation.id}
                </span>
              </div>
              <p className="text-terminal-muted pl-8">
                {schedules?.length || 0} departures scheduled
              </p>
            </div>

            <div className="flex-1 flex min-h-0 flex-col lg:flex-row relative">
              {/* Schedule Table */}
              <div className={`flex-1 flex flex-col overflow-hidden ${selectedTrainId ? 'hidden lg:flex lg:w-1/2 lg:border-r border-terminal-border' : 'w-full'}`}>
                <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-terminal-border bg-terminal-bg/80 backdrop-blur text-sm font-bold text-terminal-muted sticky top-0 shrink-0">
                  <div className="col-span-2">Time</div>
                  <div className="col-span-2">Train</div>
                  <div className="col-span-4">Destination</div>
                  <div className="col-span-4">Line</div>
                </div>
                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full">
                    {isLoadingSchedules ? (
                      <div className="flex justify-center p-12 text-terminal-muted">
                        <Loader2 className="size-8 animate-spin" />
                      </div>
                    ) : (
                      <div className="divide-y divide-terminal-border/50">
                        {schedules?.map((sch, index) => {
                          const isNext = index === nextScheduleIndex;
                          return (
                            <button
                              key={sch.id}
                              ref={el => { scheduleRefs.current[index] = el; }}
                              onClick={() => setSelectedTrainId(sch.train_id)}
                              className={`grid grid-cols-12 gap-4 px-6 py-3 text-sm w-full text-left hover:bg-terminal-surface/50 transition-all duration-300 ${selectedTrainId === sch.train_id ? 'bg-terminal-surface/80' : ''
                                } ${isNext ? 'bg-terminal-green/5 border-l-2 border-terminal-green' : 'border-l-2 border-transparent'}`}
                            >
                              <div className="col-span-2 font-mono font-bold text-terminal-green flex items-center gap-2">
                                <Clock className="size-3" />
                                {format(new Date(sch.departs_at), 'HH:mm')}
                              </div>
                              <div className="col-span-2 font-medium">{sch.train_id}</div>
                              <div className="col-span-4 truncate font-medium">
                                {sch.route.split('-')[1] || sch.route}
                              </div>
                              <div className="col-span-4 truncate text-xs flex items-center">
                                <span
                                  className="px-2 py-0.5 rounded-full bg-terminal-surface border border-terminal-border"
                                  style={{ color: sch.metadata.origin.color }}
                                >
                                  {sch.line}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                        {schedules?.length === 0 && (
                          <div className="p-12 text-center text-terminal-muted">
                            No schedules available for this station.
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>

              {/* Route Detail View */}
              {selectedTrainId && (
                <div className="flex-1 flex flex-col lg:border-l lg:border-terminal-border lg:w-1/2 lg:bg-terminal-surface/30 lg:min-h-0 lg:overflow-hidden">
                  <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-200 lg:static lg:h-full fixed inset-0 z-50 bg-terminal-bg">
                    <div className="p-4 border-b border-terminal-border flex items-center justify-between bg-terminal-bg/90 backdrop-blur shrink-0">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-bold flex items-center gap-2">
                          <Train className="size-4" />
                          <span>Route: {selectedTrainId}</span>
                          {selectedSchedule && (
                            <span className="font-normal text-terminal-muted">
                              to {selectedSchedule.route.split('-')[1] || selectedSchedule.route}
                            </span>
                          )}
                        </h3>
                        {selectedSchedule && (
                          <div className="text-xs font-mono text-terminal-green pl-6">
                            Departs at {format(new Date(selectedSchedule.departs_at), 'HH:mm')}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTrainId(null)} className="lg:hidden flex items-center gap-1 text-terminal-green">
                        <ChevronLeft className="size-4" /> Back
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTrainId(null)} className="hidden lg:flex">
                        Close
                      </Button>
                    </div>

                    <div className="flex-1 min-h-0">
                      <ScrollArea className="h-full p-6">
                        {isLoadingRoute ? (
                          <div className="flex justify-center p-8 text-terminal-muted">
                            <Loader2 className="size-6 animate-spin" />
                          </div>
                        ) : (
                          <div className="relative">
                            {/* Timeline Line */}
                            <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-terminal-border" />

                            <div className="space-y-6">
                              {routeData?.routes.map((stop, i) => {
                                const isCurrentStation = stop.station_id === selectedStation.id;

                                return (
                                  <div key={stop.id} className="relative flex gap-4 items-start group">
                                    <div
                                      className={`relative z-10 size-10 rounded-full flex items-center justify-center border-2 transition-all ${isCurrentStation
                                        ? 'bg-terminal-green border-terminal-green text-black scale-110 shadow-[0_0_10px_rgba(34,197,94,0.4)]'
                                        : 'bg-terminal-bg border-terminal-border text-terminal-muted group-hover:border-terminal-text'
                                        }`}
                                    >
                                      <div className="text-xs font-bold">{i + 1}</div>
                                    </div>
                                    <div className="flex-1 pt-1">
                                      <div className="flex justify-between items-start">
                                        <div className={`font-bold transition-colors ${isCurrentStation ? 'text-terminal-green text-lg' : 'group-hover:text-terminal-text'}`}>
                                          {stop.station_name}
                                        </div>
                                        <div className="font-mono text-sm text-terminal-muted">
                                          {format(new Date(stop.departs_at), 'HH:mm')}
                                        </div>
                                      </div>
                                      <div className="text-xs text-terminal-muted mt-0.5 font-mono">
                                        {stop.station_id}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden">
            {/* <div className="mb-6 shrink-0">
              <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
                <Star className="size-6 text-yellow-400 fill-yellow-400" />
                My Stations
              </h2>
              <p className="text-terminal-muted">Next departures from your favorite stations</p>
            </div> */}

            {favorites.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-terminal-muted/50 text-center animate-in fade-in duration-500">
                <div className="bg-terminal-surface/50 p-8 rounded-full mb-6">
                  <Train className="size-16" />
                </div>
                <h3 className="text-xl font-bold text-terminal-muted mb-2">No Favorites Yet</h3>
                <p className="max-w-md">Star some stations from the sidebar to see their next departures here.</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0 pb-10">
                {isLoadingNextDepartures ? (
                  <div className="flex justify-center p-12 text-terminal-muted">
                    <Loader2 className="size-8 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-6 pb-8">
                    {Array.from(groupedDepartures.entries()).map(([stationId, departures]) => {
                      const station = stations?.find(s => s.id === stationId);
                      if (!station || !departures.length) return null;

                      return (
                        <div key={stationId} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg">{departures[0].station_name}</h3>
                            <span className="text-xs text-terminal-muted font-mono bg-terminal-surface/50 px-2 py-0.5 rounded">
                              {stationId}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {departures.map((departure, idx) => (
                              <button
                                key={`${stationId}-${departure.destination}-${idx}`}
                                onClick={() => {
                                  if (station) {
                                    setSelectedStation(station);
                                  }
                                }}
                                className="bg-terminal-surface/30 border border-terminal-border rounded-lg p-4 hover:bg-terminal-surface/50 hover:border-terminal-green/50 transition-all duration-200 text-left group"
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="text-sm text-terminal-muted mb-1">to</div>
                                    <h4 className="font-bold group-hover:text-terminal-green transition-colors">
                                      {departure.destination}
                                    </h4>
                                  </div>
                                  <ArrowRight className="size-5 text-terminal-muted group-hover:text-terminal-green group-hover:translate-x-1 transition-all" />
                                </div>

                                {departure.next_schedule ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-terminal-green">
                                      <Clock className="size-4" />
                                      <span className="font-mono font-bold text-xl">
                                        {format(new Date(departure.next_schedule.departs_at), 'HH:mm')}
                                      </span>
                                      <LiveCountdown targetDate={departure.next_schedule.departs_at} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Train className="size-4 text-terminal-muted" />
                                      <span className="font-medium">{departure.next_schedule.train_id}</span>
                                    </div>
                                    <div className="pt-2">
                                      <span
                                        className="text-xs px-2 py-1 rounded-full bg-terminal-surface border border-terminal-border inline-block"
                                        style={{ color: departure.next_schedule.metadata.origin.color }}
                                      >
                                        {departure.next_schedule.line}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-terminal-muted text-sm">
                                    No upcoming departures
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveCountdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const target = new Date(targetDate);
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('Departing');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remMinutes = minutes % 60;
        setTimeLeft(`${hours}h ${remMinutes}m`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <span className="text-sm font-mono text-terminal-muted/80 ml-2">
      ({timeLeft} to depart)
    </span>
  );
}
