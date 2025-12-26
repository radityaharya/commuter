import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { nanoid } from 'nanoid';


interface UIState {
  // Theme
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;

  // Favorites
  favoriteStations: string[];
  toggleFavoriteStation: (stationId: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Theme
      darkMode: true,
      setDarkMode: (dark) => {
        set({ darkMode: dark });
        document.documentElement.classList.toggle('dark', dark);
      },
      toggleDarkMode: () => {
        const newValue = !get().darkMode;
        set({ darkMode: newValue });
        document.documentElement.classList.toggle('dark', newValue);
      },

      // Favorites
      favoriteStations: [],
      toggleFavoriteStation: (stationId) => {
        const { favoriteStations } = get();
        if (favoriteStations.includes(stationId)) {
          set({ favoriteStations: favoriteStations.filter((id) => id !== stationId) });
        } else {
          set({ favoriteStations: [...favoriteStations, stationId] });
        }
      },
    }),
    {
      name: 'ui-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        darkMode: state.darkMode,
        favoriteStations: state.favoriteStations,
      }),
    }
  )
);

export const useDarkMode = () => useUIStore((s) => s.darkMode);
export const useFavorites = () => useUIStore(useShallow((s) => ({
  favorites: s.favoriteStations,
  toggleFavorite: s.toggleFavoriteStation
})));
