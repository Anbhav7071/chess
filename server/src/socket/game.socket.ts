import type { Game } from "@chessu/types";
import { Chess } from "chess.js";
import type { DisconnectReason, Socket } from "socket.io";
import { chessEngine } from "../service/stockfish.js";

import GameModel, { activeGames } from "../db/models/game.model.js";
import { io } from "../server.js";
import { evaluateBoardWithStockfish } from "../utils/colorSwitchManager.js";

// TODO: clean up

export async function joinLobby(this: Socket, gameCode: string) {
    const game = activeGames.find((g) => g.code === gameCode);
    if (!game) return;

    if (game.host && game.host?.id === this.request.session.user.id) {
        game.host.connected = true;
        if (game.host.name !== this.request.session.user.name) {
            game.host.name = this.request.session.user.name;
        }
    }
    if (game.white && game.white?.id === this.request.session.user.id) {
        game.white.connected = true;
        game.white.disconnectedOn = undefined;
        if (game.white.name !== this.request.session.user.name) {
            game.white.name = this.request.session.user.name;
        }
    } else if (game.black && game.black?.id === this.request.session.user.id) {
        game.black.connected = true;
        game.black.disconnectedOn = undefined;
        if (game.black.name !== this.request.session.user.name) {
            game.black.name = this.request.session.user.name;
        }
    } else {
        if (game.observers === undefined) game.observers = [];
        const user = {
            id: this.request.session.user.id,
            name: this.request.session.user.name
        };
        game.observers?.push(user);
    }

    if (this.rooms.size >= 2) {
        await leaveLobby.call(this);
    }

    if (game.timeout) {
        clearTimeout(game.timeout);
        game.timeout = undefined;
    }

    await this.join(gameCode);
    io.to(game.code as string).emit("receivedLatestGame", game);
}

export async function leaveLobby(this: Socket, reason?: DisconnectReason, code?: string) {
    if (this.rooms.size >= 3 && !code) {
        console.log(`leaveLobby: room size is ${this.rooms.size}, aborting...`);
        return;
    }
    const game = activeGames.find(
        (g) =>
            g.code === (code || this.rooms.size === 2 ? Array.from(this.rooms)[1] : 0) ||
            (g.black?.connected && g.black?.id === this.request.session.user.id) ||
            (g.white?.connected && g.white?.id === this.request.session.user.id) ||
            g.observers?.find((o) => this.request.session.user.id === o.id)
    );

    if (game) {
        const user = game.observers?.find((o) => o.id === this.request.session.user.id);
        if (user) {
            game.observers?.splice(game.observers?.indexOf(user), 1);
        }
        if (game.black && game.black?.id === this.request.session.user.id) {
            game.black.connected = false;
            game.black.disconnectedOn = Date.now();
        } else if (game.white && game.white?.id === this.request.session.user.id) {
            game.white.connected = false;
            game.white.disconnectedOn = Date.now();
        }

        // count sockets
        const sockets = await io.in(game.code as string).fetchSockets();

        if (sockets.length <= 0 || (reason === undefined && sockets.length <= 1)) {
            if (game.timeout) clearTimeout(game.timeout);

            let timeout = 1000 * 60; // 1 minute
            if (game.pgn) {
                timeout *= 20; // 20 minutes if game has started
            }
            game.timeout = Number(
                setTimeout(() => {
                    activeGames.splice(activeGames.indexOf(game), 1);
                }, timeout)
            );
        } else {
            this.to(game.code as string).emit("receivedLatestGame", game);
        }
    }
    await this.leave(code || Array.from(this.rooms)[1]);
}

export async function claimAbandoned(this: Socket, type: "win" | "draw") {
    const game = activeGames.find((g) => g.code === Array.from(this.rooms)[1]);
    if (
        !game ||
        !game.pgn ||
        !game.white ||
        !game.black ||
        (game.white.id !== this.request.session.user.id &&
            game.black.id !== this.request.session.user.id)
    ) {
        console.log(`claimAbandoned: Invalid game or user is not a player.`);
        return;
    }

    if (
        (game.white &&
            game.white.id === this.request.session.user.id &&
            (game.black?.connected ||
                Date.now() - (game.black?.disconnectedOn as number) < 50000)) ||
        (game.black &&
            game.black.id === this.request.session.user.id &&
            (game.white?.connected || Date.now() - (game.white?.disconnectedOn as number) < 50000))
    ) {
        console.log(
            `claimAbandoned: Invalid claim by ${this.request.session.user.name}. Opponent is still connected or disconnected less than 50 seconds ago.`
        );
        return;
    }

    game.endReason = "abandoned";

    if (type === "draw") {
        game.winner = "draw";
    } else if (game.white && game.white?.id === this.request.session.user.id) {
        game.winner = "white";
    } else if (game.black && game.black?.id === this.request.session.user.id) {
        game.winner = "black";
    }

    const { id } = (await GameModel.save(game)) as Game;
    game.id = id;

    const gameOver = {
        reason: game.endReason,
        winnerName: this.request.session.user.name,
        winnerSide: game.winner === "draw" ? undefined : game.winner,
        id
    };

    io.to(game.code as string).emit("gameOver", gameOver);

    if (game.timeout) clearTimeout(game.timeout);
    activeGames.splice(activeGames.indexOf(game), 1);
}

// eslint-disable-next-line no-unused-vars
export async function getLatestGame(this: Socket) {
    const game = activeGames.find((g) => g.code === Array.from(this.rooms)[1]);
    if (game) this.emit("receivedLatestGame", game);
}

export function logUpdatedFen(fen: string, context: string = "Updated FEN") {
    console.log(`SSSSSSS, ${context}: ${fen}`);
}

function handleGameOver(game: Game, chess: Chess) {
    console.debug("handleGameOver: Handling game over logic...");

    let reason: Game["endReason"];
    if (chess.isCheckmate()) reason = "checkmate";
    else if (chess.isStalemate()) reason = "stalemate";
    else if (chess.isThreefoldRepetition()) reason = "repetition";
    else if (chess.isInsufficientMaterial()) reason = "insufficient";
    else if (chess.isDraw()) reason = "draw";

    const winnerSide = reason === "checkmate" ? 
                      (chess.turn() === 'b' ? 'white' : 'black') : 
                      undefined;

    game.winner = winnerSide ?? "draw";
    game.endReason = reason;

    // Ensure timestamps are valid
    if (!game.startedAt) {
        console.debug("handleGameOver: Setting default startedAt timestamp...");
        game.startedAt = Date.now(); // Default to current time if missing
    }
    game.endedAt = Date.now(); // Set endedAt to current time

    console.debug("handleGameOver: Game object before saving:", game);

    io.to(game.code as string).emit("gameOver", { 
        reason, 
        winner: game.winner,
        winnerName: game[game.winner === 'white' ? 'white' : 'black']?.name
    });

    // Save to database and clean up
    GameModel.save(game).then((savedGame) => {
        if (!savedGame) {
            console.error('handleGameOver: Failed to save game to database');
            return;
        }
        game.id = savedGame.id;
        console.debug("handleGameOver: Game saved successfully with ID:", savedGame.id);

        const gameIndex = activeGames.indexOf(game);
        if (gameIndex !== -1) {
            activeGames.splice(gameIndex, 1);
        }
    }).catch((error) => {
        console.error('handleGameOver: Error saving game:', error);
    });
}

export async function joinAsPlayer(this: Socket) {
    const game = activeGames.find((g) => g.code === Array.from(this.rooms)[1]);
    if (!game) return;
    const user = game.observers?.find((o) => o.id === this.request.session.user.id);
    if (!game.white) {
        const sessionUser = {
            id: this.request.session.user.id,
            name: this.request.session.user.name,
            connected: true
        };
        game.white = sessionUser;
        if (user) game.observers?.splice(game.observers?.indexOf(user), 1);
        io.to(game.code as string).emit("userJoinedAsPlayer", {
            name: this.request.session.user.name,
            side: "white"
        });
        game.startedAt = Date.now();
    } else if (!game.black) {
        const sessionUser = {
            id: this.request.session.user.id,
            name: this.request.session.user.name,
            connected: true
        };
        game.black = sessionUser;
        if (user) game.observers?.splice(game.observers?.indexOf(user), 1);
        io.to(game.code as string).emit("userJoinedAsPlayer", {
            name: this.request.session.user.name,
            side: "black"
        });
        game.startedAt = Date.now();
    } else {
        console.log("joinAsPlayer: attempted to join a game with already 2 players");
    }
    io.to(game.code as string).emit("receivedLatestGame", game);
}

export async function chat(this: Socket, message: string) {
    this.to(Array.from(this.rooms)[1]).emit("chat", {
        author: this.request.session.user,
        message
    });
}
export async function sendMove(this: Socket, m: { from: string; to: string; promotion?: string }) {
    try {
      const game = findActiveGame(this);
      if (!game) return emitError(this, "Game not found");
  
      if (isGameOver(game)) return emitError(this, "Game is already over");
  
      const chess = initializeGame(game);
      if (!isUserTurn(this, game, chess)) return emitError(this, "Not your turn to move");
  
      const newMove = chess.move(m);
      if (!newMove) return emitError(this, "Invalid move");
  
      updateGameState(game, chess);
      this.to(game.code as string).emit("receivedMove", m);
  
      await emitProbabilities(game.code!, chess.fen());
  
      if (chess.isGameOver()) {
        handleGameOver(game, chess);
        return;
      }
  
      if (game.isAIGame) {
        await handleAIMove(this, game, chess);
      }
    } catch (e) {
      console.error("sendMove: Unexpected error", e);
      emitError(this, "An unexpected error occurred");
    }
  }
  
  function findActiveGame(socket: Socket) {
    const roomCode = Array.from(socket.rooms)[1];
    const game = activeGames.find((g) => g.code === roomCode);
    if (!game) {
      console.error("sendMove: Game not found");
    } else {
      console.debug("sendMove: Game found", game.code);
    }
    return game;
  }
  
  function isGameOver(game: any): boolean {
    return !!(game.endReason || game.winner);
  }
  
  function initializeGame(game: any) {
    const chess = new Chess();
    if (game.pgn) {
      chess.loadPgn(game.pgn);
    }
    return chess;
  }
  
  function isUserTurn(socket: Socket, game: any, chess: Chess): boolean {
    const currentTurn = chess.turn(); // 'w' or 'b'
    const userId = socket.request.session.user?.id;
    const isUserTurn =
      (currentTurn === "w" && userId === game.white?.id) ||
      (currentTurn === "b" && userId === game.black?.id);
  
    if (!isUserTurn) {
      console.error("sendMove: Not the user's turn");
    }
  
    return isUserTurn;
  }
  
  function updateGameState(game: any, chess: Chess) {
    game.pgn = chess.pgn();
    game.turn = chess.turn() === "w" ? "white" : "black";
  }
  
  async function emitProbabilities(roomCode: string, fen: string) {
    const probabilities = await evaluateBoardWithStockfish(fen);
    console.log("Probabilities updated:", probabilities);
    io.to(roomCode).emit("probabilitiesUpdated", probabilities);
  }
  
  async function handleAIMove(socket: Socket, game: any, chess: Chess) {
    const isAiWhite = game.white?.id === -1;
    const isAiBlack = game.black?.id === -1;
    const isAiTurn =
      (isAiWhite && chess.turn() === "w") ||
      (isAiBlack && chess.turn() === "b");
  
    if (!isAiTurn) return;
  
    try {
      const aiMove = await chessEngine.getBestMove({
        fen: chess.fen(),
        depth: 15,
      });
  
      if (!aiMove || aiMove.length < 4) {
        console.error("AI move is invalid or incomplete:", aiMove);
        return emitError(socket, "AI move is invalid");
      }
  
      const aiMoveObj = {
        from: aiMove.slice(0, 2),
        to: aiMove.slice(2, 4),
        promotion: aiMove.length > 4 ? aiMove[4] : undefined,
      };
  
      const aiNewMove = chess.move(aiMoveObj);
      if (!aiNewMove) {
        console.error("sendMove: AI made an invalid move", aiMoveObj);
        return emitError(socket, "AI made an invalid move");
      }
  
      updateGameState(game, chess);
      io.to(game.code as string).emit("receivedMove", aiMoveObj);
  
      await emitProbabilities(game.code, chess.fen());
  
      if (chess.isGameOver()) {
        console.debug("sendMove: Game over after AI move");
        handleGameOver(game, chess);
      }
    } catch (error) {
      console.error("sendMove: Error during AI move calculation", error);
      emitError(socket, "Error during AI move calculation");
    }
  }
  
  function emitError(socket: Socket, message: string) {
    socket.emit("error", message);
  }
  

