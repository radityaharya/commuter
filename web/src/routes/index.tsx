import { useState, useEffect, useRef, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useStations, useSchedule, useRoute, useSync, type Station } from '@/hooks/useComuline';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { StationSidebar } from '@/components/comuline/StationSidebar';
import { format } from 'date-fns';
import { Train, MapPin, Clock, Menu, Loader2, ChevronLeft } from 'lucide-react';
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

  const scheduleRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Find next schedule index
  const nextScheduleIndex = useMemo(() => {
    if (!schedules || schedules.length === 0) return -1;
    const now = new Date();
    return schedules.findIndex(s => new Date(s.departs_at) > now);
  }, [schedules]);

  // Auto-select favorite station
  useEffect(() => {
    if (stations && !selectedStation && favorites.length > 0) {
      const favoriteStation = stations.find(s => s.id === favorites[0]);
      if (favoriteStation) {
        setSelectedStation(favoriteStation);
      }
    }
  }, [stations, favorites, selectedStation]);

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

  const sidebarProps = {
    stations,
    isLoading: isLoadingStations,
    error: stationsError,
    selectedStationId: selectedStation?.id,
    onSelectStation: handleSelectStation,
    searchQuery,
    setSearchQuery,
    sync,
    isSyncing
  };

  return (
    <div className="flex h-screen bg-terminal-bg text-terminal-text font-mono overflow-hidden flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-terminal-border bg-terminal-bg shrink-0">
        <div className="flex items-center gap-2 text-terminal-green">
          <Train className="size-6" />
          <h1 className="text-xl font-bold tracking-tight">Comuline</h1>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="size-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-terminal-border bg-terminal-bg w-80">
            <StationSidebar {...sidebarProps} />
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

            <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
              {/* Schedule Table */}
              <div className={`flex-1 flex flex-col ${selectedTrainId ? 'hidden lg:flex lg:w-1/2 lg:border-r border-terminal-border' : 'w-full'}`}>
                <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-terminal-border bg-terminal-bg/80 backdrop-blur text-sm font-bold text-terminal-muted sticky top-0 z-10 shrink-0">
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
                <div className="flex-1 bg-terminal-surface/30 flex flex-col border-l border-terminal-border lg:w-1/2 animate-in slide-in-from-right-4 duration-200 lg:static absolute inset-0 z-20 bg-terminal-bg">
                  <div className="p-4 border-b border-terminal-border flex items-center justify-between bg-terminal-bg/90 backdrop-blur shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                      <Train className="size-4" />
                      Route: {selectedTrainId}
                    </h3>
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
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-terminal-muted/50 p-8 text-center animate-in fade-in duration-500">
            <div className="bg-terminal-surface/50 p-8 rounded-full mb-6">
              <Train className="size-16" />
            </div>
            <h3 className="text-xl font-bold text-terminal-muted mb-2">Comuline</h3>
            <p className="max-w-md">Select a station from the sidebar to view real-time departures and route information.</p>
          </div>
        )}
      </div>
    </div>
  );
}
