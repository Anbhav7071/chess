export interface Game {
    id?: number;
    pgn?: string;
    white?: User;
    black?: User;
    winner?: "white" | "black" | "draw";
    endReason?: "draw" | "checkmate" | "stalemate" | "repetition" | "insufficient" | "abandoned";
    host?: User;
    code?: string;
    unlisted?: boolean;
    timeout?: number;
    observers?: User[];
    startedAt?: number;
    endedAt?: number | Date;
    isAIGame?: boolean;
    turn?: "white" | "black";
    switchType?: "move" | "time" | "player" | null;
    switchConfig?: any;
    tokens: {
        white: number;
        black: number;
      };
    totalTimePerPlayer?: number; // if undefined/null => untimed game
    whiteTimeLeft?: number;
    blackTimeLeft?: number;
    whiteTimeSpent?: number; // total elapsed time spent by white
    blackTimeSpent?: number; // total elapsed time spent by black
    lastMoveTimestamp?: number;
    result?: string;         // E.g., "white wins by timeout"
    isOver?: boolean;        // Optional: use to mark game over
}
export interface User {
    id?: number | string; // string for guest IDs
    name?: string | null;
    email?: string;
    wins?: number;
    losses?: number;
    draws?: number;

    // mainly for players, not spectators
    connected?: boolean;
    disconnectedOn?: number;
}
