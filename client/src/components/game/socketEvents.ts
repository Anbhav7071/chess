import type { Action, CustomSquares, Lobby, Message } from "@/types";
import type { Game, User } from "@chessu/types";
import type { Dispatch, SetStateAction } from "react";
import type { Socket } from "socket.io-client";

import { syncPgn, syncSide, swapPieceColors } from "./utils";
import { Chess } from "chess.js";

export function initSocket(
    user: User,
    socket: Socket,
    lobby: Lobby,
    actions: {
        updateLobby: Dispatch<Action>;
        addMessage: Function;
        updateCustomSquares: Dispatch<Partial<CustomSquares>>;
        makeMove: Function;
        setNavFen: Dispatch<SetStateAction<string | null>>;
        setNavIndex: Dispatch<SetStateAction<number | null>>;
    }
) {
    socket.on("connect", () => {
        socket.emit("joinLobby", lobby.code);
        console.log("connected to lobby", lobby.code);
    });
    // TODO: handle disconnect

    socket.on("chat", (message: Message) => {
        actions.addMessage(message);
        console.log("chat", message);
    });

    socket.on("receivedLatestGame", (latestGame: Game) => {
        if (latestGame.pgn && latestGame.pgn !== lobby.actualGame.pgn()) {
            syncPgn(latestGame.pgn, lobby, actions);
        }
        actions.updateLobby({ type: "updateLobby", payload: latestGame });

        syncSide(user, latestGame, lobby, actions);
        console.log("receivedLatestGame", latestGame);
    });
    let movecount = 0;

    socket.on("receivedMove", (m: { from: string; to: string; promotion?: string }) => {
        console.log("Attempting to make move:", m);
        const success = actions.makeMove(m);
        console.log("Move success:", success, movecount++);
        if (!success) {
            socket.emit("getLatestGame");
        }
        console.log("receivedMove", m);
    });

    /**
 * Processes piece color switching based on timeSwitchData
 * Compatible with chess.js
 * @param timeSwitchData Array of pieces with their squares and colors
 * @param game The chess game instance (chess.js)
 * @returns Updated game instance with switched piece colors
 */
    function processPieceColorSwitch(timeSwitchData: any[], game: any) {
        // Create a new Chess instance to manipulate
        const newGame = new Chess(game.fen());

        // Remove all existing pieces from the squares listed in timeSwitchData
        timeSwitchData.forEach(item => {
            const square = item.square;
            if (newGame.get(square)) {
                newGame.remove(square);
            }
        });

        // Add the pieces back with swapped colors
        timeSwitchData.forEach(item => {
            const square = item.square;
            const piece = item.piece || {};

            if (piece.type) {
                // Swap the color
                const newColor = piece.color === 'w' ? 'b' : 'w';

                // Put the piece with the new color
                newGame.put({ type: piece.type, color: newColor }, square);
            }
        });

        return newGame;
    }

    /**
     * Update the socket handler to use the modified function
     */
    socket.on("switchPlayers", ({ white, black, timeSwitchData }: { white: User; black: User; timeSwitchData?: any[] }) => {
        console.log("Switch players event received:", { white, black, timeSwitchData });

        // Update the lobby with the new player information
        actions.updateLobby({
            type: "updateLobby",
            payload: { white, black },
        });

        // Handle the timeSwitchData to swap piece colors
        let updatedFen: string;
        if (timeSwitchData && timeSwitchData.length > 0) {
            console.log("Time-based switch data:", timeSwitchData);

            // Process the specific pieces
            const updatedGame = processPieceColorSwitch(timeSwitchData, lobby.actualGame);
            updatedFen = updatedGame.fen();
            console.log("Updated FEN after piece-specific switch:", updatedFen);

            // Update the chessboard state
            lobby.actualGame.load(updatedFen);
            actions.updateLobby({
                type: "updateLobby",
                payload: { actualGame: lobby.actualGame },
            });
        } else {
            // Fallback to general piece color swapping if no specific data
            console.log("Original FEN:", lobby.actualGame.fen());
            updatedFen = swapPieceColors(lobby.actualGame.fen());
            console.log("Updated FEN:", updatedFen);

            // Update the chessboard state
            lobby.actualGame.load(updatedFen);
            actions.updateLobby({
                type: "updateLobby",
                payload: { actualGame: lobby.actualGame },
            });
        }

        // Emit the updated FEN string to the backend
        socket.emit("updateFen", { fen: updatedFen, gameCode: lobby.code });

        console.log("Players switched:", { white, black });
    });

    socket.on("probabilitiesUpdated", (probabilities: { whiteWinProb: number; blackWinProb: number }) => {
        console.log("Probabilities updated:", probabilities);
    })


    socket.on("userJoinedAsPlayer", ({ name, side }: { name: string; side: "white" | "black" }) => {
        actions.addMessage({
            author: { name: "server" },
            message: `${name} is now playing as ${side}.`
        });
        console.log("userJoinedAsPlayer", name, side);
    });

    socket.on(
        "gameOver",
        ({
            reason,
            winnerName,
            winnerSide,
            id
        }: {
            reason: Game["endReason"];
            winnerName?: string;
            winnerSide?: "white" | "black" | "draw";
            id: number;
        }) => {
            const m = {
                author: { name: "server" }
            } as Message;

            if (reason === "abandoned") {
                if (!winnerSide) {
                    m.message = `${winnerName} has claimed a draw due to abandonment.`;
                } else {
                    m.message = `${winnerName} (${winnerSide}) has claimed the win due to abandonment.`;
                }
            } else if (reason === "checkmate") {
                m.message = `${winnerName} (${winnerSide}) has won by checkmate.`;
            } else {
                let message = "The game has ended in a draw";
                if (reason === "repetition") {
                    message = message.concat(" due to threefold repetition");
                } else if (reason === "insufficient") {
                    message = message.concat(" due to insufficient material");
                } else if (reason === "stalemate") {
                    message = "The game has been drawn due to stalemate";
                }
                m.message = message.concat(".");
            }
            actions.updateLobby({
                type: "updateLobby",
                payload: { endReason: reason, winner: winnerSide || "draw", id }
            });
            actions.addMessage(m);
        }
    );
}

