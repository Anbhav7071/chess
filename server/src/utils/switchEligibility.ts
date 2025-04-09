// Determines if a given piece at a square is eligible for a color switch.
export function isSwitchEligible(
    square: string,
    piece: any,
    chess: any,
    game: any
  ): boolean {
    const { type, color } = piece;
    // Kings never switch.
    if (type === "k") return false;
    // A piece that has switched once cannot switch again.
    if (piece.hasSwitched) return false;
    // Prevent pawns at their starting rank or near promotion.
    if (type === "p" && (square.endsWith("2") || square.endsWith("7"))) return false;
    if (piece.promoted) return false;
  
    // Temporarily remove the piece and check if switching would put the opponent's king in check.
    chess.remove(square);
    const causesCheck = chess.inCheck();
    chess.put(piece, square);
    if (causesCheck) return false;
  
    // Prevent switching for pieces too close to their king.
    const kingSquare = findKing(chess, color);
    if (distance(square, kingSquare) <= 2) return false;
  
    return true;
  }
  
  function findKing(chess: any, color: "w" | "b"): string {
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === "k" && piece.color === color) {
          return String.fromCharCode(97 + file) + (8 - rank);
        }
      }
    }
    return "";
  }
  
  function distance(a: string, b: string): number {
    const [af, ar] = [a.charCodeAt(0), parseInt(a[1])];
    const [bf, br] = [b.charCodeAt(0), parseInt(b[1])];
    return Math.max(Math.abs(af - bf), Math.abs(ar - br));
  }
  