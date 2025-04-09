import { io } from "../src/server.js";
import { Chess } from "chess.js";
// In-memory storage for active switch timers.
const switchTimers = {};
// Starts a 5-second timer during which a player can use a token to cancel the switch.
export function initiateSwitchTimer(game, square, piece) {
    // Notify clients: highlight the square and start countdown.
    io.to(game.code).emit("switchCountdown", { square, piece, time: 5 });
    switchTimers[square] = setTimeout(() => {
        performSwitch(game, square, piece);
    }, 5000);
}
// Call this when a player uses a token to prevent a switch.
export function useToken(game, userId, square) {
    const player = game.white.id === userId ? "white" : "black";
    if (game.tokens?.[player] && game.tokens[player] > 0) {
        game.tokens[player]--;
        clearTimeout(switchTimers[square]);
        io.to(game.code).emit("tokenUsed", { player, square });
        return true;
    }
    return false;
}
// Performs the actual color switch on the given piece.
function performSwitch(game, square, piece) {
    const chess = new Chess();
    if (game.pgn)
        chess.loadPgn(game.pgn);
    const original = chess.get(square);
    if (original) {
        chess.remove(square);
        // Switch color.
        original.color = original.color === "w" ? "b" : "w";
        // Mark the piece so it can’t switch again.
        original.hasSwitched = true;
        chess.put(original, square);
        game.pgn = chess.pgn();
        io.to(game.code).emit("pieceSwitched", { square, newColor: original.color });
    }
}
