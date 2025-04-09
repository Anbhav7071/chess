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
    endedAt?: number;
    isAIGame?: boolean;
    turn?: "white" | "black";
    switchType?: "move" | "time" | "player" | "random";
    switchConfig?: any;
    tokens?: { white: number; black: number };
    switchPoints?: number[];  
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
