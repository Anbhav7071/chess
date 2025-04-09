import { Chess, Square } from "chess.js";
import { chessEngine } from "../service/stockfish.js";

let lastSwitchDirection: "blackToWhite" | "whiteToBlack" | null = null;

export async function checkAndHandleSwitch(game: any, moveCount: number) {
  const switchPoints = game.switchPoints || [];
  if (switchPoints.includes(moveCount)) {
    return await attemptSwitch(game);
  }
  return null;
}

export async function attemptSwitch(game: any): Promise<any> {
  console.debug("Attempting switch for game:", game.id);
  const chess = new Chess();
  if (game.pgn) {
    chess.loadPgn(game.pgn);
  }

  const switchCandidates = getSwitchablePieces(chess, game);
  let selectedSwitch = null;

  for (const candidate of switchCandidates) {
    const { square, piece } = candidate;

    if (
      (lastSwitchDirection === "blackToWhite" && piece.color === "b") ||
      (lastSwitchDirection === "whiteToBlack" && piece.color === "w")
    ) {
      continue;
    }

    const originalPiece = chess.get(square as Square);
    chess.remove(square as Square);
    chess.put({ type: piece.type, color: piece.color === "w" ? "b" : "w" }, square as Square);

    const probabilities = await evaluateBoardWithStockfish(chess.fen());
    const { whiteWinProb, blackWinProb } = probabilities;

    if (Math.abs(whiteWinProb - blackWinProb) <= 0.05) {
      selectedSwitch = { square, piece };
      lastSwitchDirection = piece.color === "w" ? "whiteToBlack" : "blackToWhite";
      break;
    }

    chess.remove(square as Square);
    chess.put(originalPiece, square as Square);
  }

  return selectedSwitch ? [selectedSwitch] : null;
}

async function evaluateBoardWithStockfish(fen: string): Promise<{ whiteWinProb: number; blackWinProb: number }> {
  try {
    const { whiteWinProb, blackWinProb } = await chessEngine.getWinProbabilities(fen);
    return { whiteWinProb, blackWinProb };
  } catch (error) {
    console.error("Error evaluating board with Stockfish:", error);
    return { whiteWinProb: 0.5, blackWinProb: 0.5 };
  }
}

function getSwitchablePieces(chess: Chess, game: any) {
  const board = chess.board();
  const result: { square: string; piece: any }[] = [];

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

function isSwitchEligible(square: string, piece: any, chess: Chess, game: any): boolean {
  if (piece.type === "k") return false;
  if (game.endReason || game.winner) return false;

  const kingSquare = findOwnKingSquare(piece.color, chess);
  if (!kingSquare) return false;

  const distance = getManhattanDistance(square, kingSquare);
  if (distance <= 2) return false;

  if (isAttackingOpponentKing(square as Square, piece, chess)) return false;

  return true;
}

function findOwnKingSquare(color: "w" | "b", chess: Chess): string | null {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece?.type === "k" && piece.color === color) {
        return String.fromCharCode(97 + file) + (8 - rank);
      }
    }
  }
  return null;
}

function getManhattanDistance(squareA: string, squareB: string): number {
  const fileA = squareA.charCodeAt(0) - 97;
  const rankA = parseInt(squareA[1]);
  const fileB = squareB.charCodeAt(0) - 97;
  const rankB = parseInt(squareB[1]);
  return Math.abs(fileA - fileB) + Math.abs(rankA - rankB);
}

function isAttackingOpponentKing(fromSquare: Square, piece: any, chess: Chess): boolean {
  const color = piece.color;
  const tempChess = new Chess(chess.fen());

  const moves = tempChess.moves({ square: fromSquare, verbose: true });
  const opponentKingSquare = findOwnKingSquare(color === "w" ? "b" : "w", tempChess);
  if (!opponentKingSquare) return false;

  return moves.some(move => move.to === opponentKingSquare);
}
