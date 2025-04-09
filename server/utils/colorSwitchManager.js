import { Chess } from "chess.js";
import { initiateSwitchTimer } from "./tokenManager.js";
// This function checks (based on move count) whether a switch should be attempted.
export function checkAndHandleSwitch(game, moveCount) {
    const switchPoints = game.switchPoints || [];
    // For move-based and random switching, the configured move numbers trigger a switch.
    if (switchPoints.includes(moveCount)) {
        return attemptSwitch(game);
    }
    return null;
}
export function attemptSwitch(game) {
    const chess = new Chess();
    if (game.pgn)
        chess.loadPgn(game.pgn);
    const switchCandidates = getSwitchablePieces(chess, game);
    switchCandidates.forEach(({ square, piece }) => {
        // Start the 5-second timer for token usage.
        initiateSwitchTimer(game, square, piece);
    });
}
function getSwitchablePieces(chess, game) {
    const board = chess.board();
    const result = [];
    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = board[rank][file];
            if (piece) {
                const square = String.fromCharCode(97 + file) + (8 - rank);
                if (isSwitchEligible(square, piece, chess, game)) {
                    result.push({ square, piece });
                }
            }
        }
    }
    return result;
}
// Import eligibility logic from a separate module.
import { isSwitchEligible } from "./switchEligibility.js";
