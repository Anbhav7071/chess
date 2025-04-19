import type { Game, User } from "@chessu/types";
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { chessEngine } from "../service/stockfish.js";
import { Chess } from "chess.js";
import GameModel, { activeGames } from "../db/models/game.model.js";
import { io } from "../server.js";

type SwitchType = "move" | "time" | "player" | null;

interface SwitchConfig {
  points?: number[];     // Used for move-based
  interval?: number;     // Used for time-based
}


export const getGames = async (req: Request, res: Response) => {
  try {
    if (!req.query.id && !req.query.userid) {
      // get all active games
      res.status(200).json(activeGames.filter((g) => !g.unlisted && !g.winner));
      return;
    }

    let id, userid;
    if (req.query.id) {
      id = parseInt(req.query.id as string);
    }
    if (req.query.userid) {
      userid = parseInt(req.query.userid as string);
    }

    if (id && !isNaN(id)) {
      const game = await GameModel.findById(id);
      if (!game) {
        res.status(404).end();
      } else {
        res.status(200).json(game);
      }
    } else if (userid && !isNaN(userid)) {
      const games = await GameModel.findByUserId(userid);
      if (!games) {
        res.status(404).end();
      } else {
        res.status(200).json(games);
      }
    } else {
      res.status(400).end();
    }
  } catch (err: unknown) {
    console.log(err);
    res.status(500).end();
  }
};

export const getActiveGame = async (req: Request, res: Response) => {
  try {
    if (!req.params || !req.params.code) {
      res.status(400).end();
      return;
    }

    const game = activeGames.find((g) => g.code === req.params.code);
    if (!game) {
      res.status(404).end();
    } else {
      res.status(200).json(game);
    }
  } catch (err: unknown) {
    console.log(err);
    res.status(500).end();
  }
};

// Helper: Extract authenticated user from session
function getAuthenticatedUser(req: Request): User | null {
  const sessionUser = req.session?.user;
  if (!sessionUser?.id) return null;
  return {
    id: sessionUser.id,
    name: sessionUser.name,
    connected: false,
  };
}

// Helper: Validate and determine switchType
function parseSwitchType(raw: any): SwitchType {
  const allowed: SwitchType[] = ["move", "time", "player"];
  return allowed.includes(raw) ? raw : null;
}

// Helper: Setup switch points based on switchType and config
function setupSwitchPoints(type: SwitchType, config: SwitchConfig): number[] | undefined {
  if (type === "move") {
    return config.points ?? [10];
  } else if (type === "time") {
    if (typeof config.interval === "number") {
      return [config.interval];
    } else {
      throw new Error("Missing interval for time-based switching.");
    }
  } else {
    return undefined;
  }
}

// Helper: Assign players based on AI game or not
function assignPlayers(game: Game, user: User, side: "white" | "black"): void {
  const ai: User = { id: -1, name: "Stockfish AI", connected: true };
  game[side] = user;
  game[side === "white" ? "black" : "white"] = game.isAIGame ? ai : undefined;
}

// Main controller
export const createGame = async (req: Request, res: Response) => {
  try {
    console.log("Request Body:", req.body);

    const user = getAuthenticatedUser(req);
    if (!user) {
      console.warn("Unauthorized createGame request");
      return res.status(401).end();
    }

    const unlisted: boolean = req.body.unlisted ?? false;
    const isAIGame: boolean = req.body.isAIGame ?? false;
    const userSide: "white" | "black" = req.body.side === "black" ? "black" : "white";

    const rawSwitchType = req.body.switchType;
    const switchType: SwitchType = parseSwitchType(rawSwitchType);
    const switchConfig: SwitchConfig = req.body.switchConfig ?? {};

    // Handle total time (optional)
    const totalTimeMinutes: number | undefined = req.body.totalTimePerPlayer;
    const totalTime: number | undefined = typeof totalTimeMinutes === "number"
      ? totalTimeMinutes * 60 * 1000
      : undefined;

    // Timer & token setup
    const now = Date.now();
    const tokens = { white: 3, black: 3 };

    const game: Game = {
      code: nanoid(10),
      unlisted,
      host: user,
      isAIGame,
      turn: "white",
      pgn: "",
      switchType,
      switchConfig,
      tokens,

      totalTimePerPlayer: totalTime, // could be undefined
      whiteTimeLeft: totalTime ?? undefined,
      blackTimeLeft: totalTime ?? undefined,

      whiteTimeSpent: 0,
      blackTimeSpent: 0,

      lastMoveTimestamp: now,
    };

    assignPlayers(game, user, userSide);

    // Handle AI first move
    if (isAIGame && game.turn === "white" && game.white?.id === -1) {
      const chess = new Chess();
      try {
        const aiMove = await chessEngine.getBestMove({
          fen: chess.fen(),
          depth: 15,
        });

        const aiMoveObj = {
          from: aiMove.slice(0, 2),
          to: aiMove.slice(2, 4),
          promotion: aiMove.length > 4 ? aiMove[4] : undefined,
        };

        chess.move(aiMoveObj);
        game.pgn = chess.pgn();
        game.turn = "black";

        game.lastMoveTimestamp = Date.now(); // Update after AI move
        io.to(game.code!).emit("receivedMove", aiMoveObj);
        console.debug("AI made the first move:", aiMoveObj);
      } catch (error) {
        console.error("Error making AI move:", error);
      }
    }

    activeGames.push(game);
    console.info("Game created successfully:", game.code);
    return res.status(201).json({ code: game.code });

  } catch (err) {
    console.error("Unexpected error in createGame:", err);
    return res.status(500).end();
  }
};
