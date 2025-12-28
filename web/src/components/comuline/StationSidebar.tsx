import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Train, Search, AlertCircle, Loader2, RefreshCw, ChevronRight, Star } from 'lucide-react';
import type { Station } from '@/hooks/useComuline';
import { useFavorites } from '@/store';
import { format } from 'date-fns';

interface StationSidebarProps {
  stations: Station[] | undefined;
  isLoading: boolean;
  error: Error | null;
  selectedStationId: string | undefined;
  onSelectStation: (station: Station) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sync: () => void;
  isSyncing: boolean;
  isMobile?: boolean;
  lastUpdated?: Date | null;
}

export function StationSidebar({
  stations,
  isLoading,
  error,
  selectedStationId,
  onSelectStation,
  searchQuery,
  setSearchQuery,
  sync,
  isSyncing,
  isMobile,
  lastUpdated
}: StationSidebarProps) {
  const { favorites, toggleFavorite } = useFavorites();

  const filteredStations = stations?.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const favoriteStations = filteredStations?.filter(s => favorites.includes(s.id));
  const otherStations = filteredStations?.filter(s => !favorites.includes(s.id));

  const renderStationItem = (station: Station) => {
    const isFavorite = favorites.includes(station.id);
    return (
      <div
        key={station.id}
        className={`flex items-center justify-between p-3 rounded-md transition-colors hover:bg-terminal-surface group ${selectedStationId === station.id ? 'bg-terminal-surface ring-1 ring-terminal-border' : ''
          }`}
      >
        <button
          onClick={() => onSelectStation(station)}
          className="flex-1 text-left"
        >
          <div>
            <div className={`font-bold ${selectedStationId === station.id ? 'text-terminal-green' : ''}`}>
              {station.name}
            </div>
            <div className="text-xs text-terminal-muted flex items-center gap-2">
              <span className="bg-terminal-surface/50 px-1.5 py-0.5 rounded">{station.id}</span>
              <span>Daop {station.metadata.origin.daop}</span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(station.id);
            }}
            className="h-8 w-8 text-terminal-muted hover:text-yellow-400 hover:bg-transparent"
          >
            <Star className={`size-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
          </Button>
          {selectedStationId === station.id && <ChevronRight className="size-4 text-terminal-muted" />}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="p-4 border-b border-terminal-border shrink-0">
        <div className="flex items-center justify-between mb-4">
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
          <div className={`flex items-center gap-1 ${isMobile ? 'mr-8' : ''}`}>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isSyncing}
                  title="Sync Data"
                  className="h-8 w-8 text-terminal-muted hover:text-terminal-text"
                >
                  <RefreshCw className={`size-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-terminal-green">Sync Data</DialogTitle>
                  <DialogDescription className="text-terminal-muted">
                    This will fetch the latest schedule data from the API. This process might take a few moments. Are you sure you want to proceed?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-terminal-border hover:bg-terminal-surface text-terminal-text">
                      Cancel
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={() => sync()} className="bg-terminal-green text-black hover:bg-terminal-green/80">
                      Sync Now
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-terminal-muted" />
          <Input
            placeholder="Search station..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-terminal-surface border-terminal-border focus-visible:ring-terminal-green"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex justify-center p-8 text-terminal-muted">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 text-terminal-red flex items-center gap-2">
              <AlertCircle className="size-4" />
              <span>Failed to load stations</span>
            </div>
          ) : (
            <div className="flex flex-col p-2 space-y-1">
              {favoriteStations && favoriteStations.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs font-bold text-terminal-muted uppercase tracking-wider">
                    Favorites
                  </div>
                  {favoriteStations.map(renderStationItem)}
                  <div className="my-2 border-t border-terminal-border/50 mx-3" />
                  <div className="px-3 py-2 text-xs font-bold text-terminal-muted uppercase tracking-wider">
                    All Stations
                  </div>
                </>
              )}
              {otherStations?.map(renderStationItem)}
              {filteredStations?.length === 0 && (
                <div className="p-4 text-center text-terminal-muted text-sm">
                  No stations found
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
