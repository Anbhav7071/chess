import { attemptSwitch } from "./colorSwitchManager.js";

// For time-based switching: attempt a switch every 15 seconds.
export function scheduleTimeSwitch(game: any) {
  setInterval(() => {
    console.debug("Attempting time-based switch for game:", game.code);
    // Check if the game is still active and no switch has occurred yet.
    if (!game.endReason && !game.winner) {
      attemptSwitch(game);
    }
  }, 15000);
}
