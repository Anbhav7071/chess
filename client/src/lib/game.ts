import { API_URL } from "@/config";
import type { Game } from "@chessu/types";

// export const createGame = async (side: string, unlisted: boolean, isAIGame:boolean) => {
//     try {
//         const res = await fetch(`${API_URL}/v1/games`, {
//             method: "POST",
//             credentials: "include",
//             headers: {
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({ side, unlisted, isAIGame }),
//             cache: "no-store"
//         });

//         if (res && res.status === 201) {
//             const game: Game = await res.json();
//             return game;
//         }
//     } catch (err) {
//         console.error(err);
//     }
// };


interface SwitchConfig {
    points?: number[];
    interval?: number;
  }
  
  interface SwitchConfig {
    points?: number[]; // Used for move-based switching
    interval?: number; // Used for time-based switching
  }
  
  interface CreateGamePayload {
    unlisted: boolean; // Whether the game is unlisted
    isAIGame: boolean; // Whether the game is against AI
    side: "white" | "black" | "random"; // Starting side
    switchType: "move" | "time" | "player" | null; // Type of switching
    switchConfig: SwitchConfig; // Configuration for switching
    totalTimePerPlayer?: number; // Optional for infinite games
  }
  
  export const createGame = async (payload: CreateGamePayload) => {
    try {
      const res = await fetch(`${API_URL}/v1/games`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
  
      if (res && res.status === 201) {
        const game: Game = await res.json();
        return game;
      }
    } catch (err) {
      console.error(err);
    }
  };
  

export const fetchActiveGame = async (code: string) => {
    try {
        const res = await fetch(`${API_URL}/v1/games/${code}`, { cache: "no-store" });

        if (res && res.status === 200) {
            const game: Game = await res.json();
            return game;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchPublicGames = async () => {
    try {
        const res = await fetch(`${API_URL}/v1/games`, { cache: "no-store" });

        if (res && res.status === 200) {
            const games: Game[] = await res.json();
            return games;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchArchivedGame = async ({ id, userid }: { id?: number; userid?: number }) => {
    let url = `${API_URL}/v1/games?`;
    if (id) {
        url += `id=${id}`;
    } else {
        url += `userid=${userid}`;
    }
    try {
        // TODO: handle caching more efficiently
        const res = await fetch(url, {
            next: { revalidate: 20 }
        });

        if (res && res.status === 200) {
            if (id) {
                const game: Game = await res.json();
                if (game.id) return game;
            } else {
                const games: Game[] = await res.json();
                if (games.length && games[0].id) return games;
            }
        }
    } catch (err) {
        console.error(err);
    }
};
