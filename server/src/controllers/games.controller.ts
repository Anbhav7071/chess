import type { Game, User } from "@chessu/types";
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { chessEngine } from "../service/stockfish.js";
import { Chess } from "chess.js";
import GameModel, { activeGames } from "../db/models/game.model.js";
import { io } from "../server.js";
import { scheduleTimeSwitch } from "../utils/eventScheduler.js";

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

export const createGame = async (req: Request, res: Response) => {
  try {
    console.log("Request Body:", req.body);
    // Ensure the user is authenticated
    if (!req.session.user?.id) {
      console.log("Unauthorized createGame request");
      return res.status(401).end();
    }

    // Extract user information
    const user: User = {
      id: req.session.user.id,
      name: req.session.user.name,
      connected: false,
    };
    console.log("User:", user);
    // Extract game options from request body
    const unlisted: boolean = req.body.unlisted ?? false;
    const isAIGame: boolean = req.body.isAIGame ?? false;
    const userSide =
      req.body.side === "black"
        ? "black"
        : req.body.side === "white"
        ? "white"
        : "random";

    // NEW: Extract color switching configuration.
    // Expected switchType values: 'move', 'time', 'player', or 'random'
    const switchType: "move" | "time" | "player" | "random" =
      req.body.switchType || "move";
    const switchConfig = req.body.switchConfig || {};
    // Default tokens: Each player gets three tokens to prevent a switch.
    const tokens = { white: 3, black: 3 };

    console.debug("Is AI Game:", isAIGame);
    console.debug("User Side:", userSide);
    console.debug("Switch Type:", switchType, "Switch Config:", switchConfig);

    // Initialize the game object with new switching parameters.
    const game: Game = {
      code: nanoid(6),
      unlisted,
      host: user,
      pgn: "",
      isAIGame,
      turn: "white", // White always moves first
      switchType,
      switchConfig,
      tokens,
      // For move-based switching: if not provided, default to first switch at move 10.
      switchPoints:
        switchType === "move"
          ? switchConfig.points || [10]
          : switchType === "random"
          ? [] // will be generated below
          : undefined,
    };

    // For random variant: Generate three random move numbers in specified ranges.
    if (switchType === "random") {
      const randomPoint = (min: number, max: number) =>
        Math.floor(Math.random() * (max - min + 1)) + min;
      game.switchPoints = [
        randomPoint(10, 20),
        randomPoint(21, 40),
        randomPoint(41, 60),
      ];
    }
    console.debug("Switch Points:", game.switchPoints);
    console.debug("Switch Config:", game.switchConfig);
    console.debug("Switch Type:", game.switchType);
    console.debug("Tokens:", game.tokens);
    console.debug("Game Code:", game);
    // Setup AI game if applicable.
    if (isAIGame) {
      if (userSide === "random") {
        // Randomly assign user to white or black.
        game.white =
          Math.random() < 0.5
            ? user
            : {
                id: -1,
                name: "Stockfish AI",
                connected: true,
              };
        game.black =
          game.white.id === -1
            ? user
            : {
                id: -1,
                name: "Stockfish AI",
                connected: true,
              };
      } else {
        // Assign user to chosen side; AI to the opposite.
        game[userSide] = user;
        game[userSide === "white" ? "black" : "white"] = {
          id: -1,
          name: "Stockfish AI",
          connected: true,
        };
      }

      // If AI is white, make the first move immediately.
      if (game.turn === "white" && game.white?.id === -1) {
        const chess = new Chess();
        try {
          const aiMove = await chessEngine.getBestMove({
            fen: chess.fen(), // Starting position
            depth: 15,
          });
          const aiMoveObj = {
            from: aiMove.slice(0, 2),
            to: aiMove.slice(2, 4),
            promotion: aiMove.length > 4 ? aiMove[4] : undefined,
          };
          chess.move(aiMoveObj);
          game.pgn = chess.pgn();
          game.turn = "black"; // User's turn next
          console.debug("AI made the first move:", aiMoveObj);
          io.to(game.code!).emit("receivedMove", aiMoveObj);
        } catch (error) {
          console.error("Error making AI's first move:", error);
        }
      }
    } else {
      // Human vs Human game setup.
      if (userSide === "random") {
        game.white = Math.random() < 0.5 ? user : undefined;
        game.black = game.white ? undefined : user;
      } else {
        game[userSide] = user;
      }
    }

    // Push the game to active games.
    console.debug("Game created:", game);
    activeGames.push(game);

    // If time-based switching is enabled, schedule it.
    if (switchType === "time") {
      console.debug("Scheduling time-based switch for game:", game.code);
      // Schedule the switch using the provided configuration.
      scheduleTimeSwitch(game);
    }

    return res.status(201).json({ code: game.code });
  } catch (err: unknown) {
    console.error("Error creating game:", err);
    return res.status(500).end();
  }
};
