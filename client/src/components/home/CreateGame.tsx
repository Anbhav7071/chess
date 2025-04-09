"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useContext, useState } from "react";

import { SessionContext } from "@/context/session";
import { createGame } from "@/lib/game";

export default function CreateGame() {
  const session = useContext(SessionContext);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [gameType, setGameType] = useState("user");
  const [isAI, setIsAI] = useState(false);
  const [switchType, setSwitchType] = useState<"move" | "time" | "player" | "random">("move");
  const [movePoints, setMovePoints] = useState("10,20,30");
  const [timeInterval, setTimeInterval] = useState("30"); // in seconds

  const router = useRouter();

  async function submitCreateGame(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session?.user?.id) return;
    setButtonLoading(true);

    const target = e.target as HTMLFormElement;
    const unlisted = (target.elements.namedItem("createUnlisted") as HTMLInputElement).checked;
    const startingSide = (target.elements.namedItem("createStartingSide") as HTMLSelectElement).value;

    const switchConfig: any = {};

    if (switchType === "move") {
      const points = movePoints.split(",").map(Number).filter((n) => !isNaN(n));
      switchConfig.points = points;
    } else if (switchType === "time") {
      switchConfig.interval = parseInt(timeInterval, 10);
    }

    const game = await createGame({
      side: startingSide as "white" | "black" | "random",
      unlisted,
      isAIGame: isAI,
      switchType,
      switchConfig,
    });

    if (game) {
      router.push(`/${game.code}`);
    } else {
      setButtonLoading(false);
      // TODO: Show error message
    }
  }

  return (
    <form className="form-control space-y-4" onSubmit={submitCreateGame}>
      <label className="label cursor-pointer">
        <span className="label-text">Unlisted/invite-only</span>
        <input type="checkbox" className="checkbox" name="createUnlisted" />
      </label>

      <div className="flex gap-4">
        <label className="label cursor-pointer">
          <input
            type="radio"
            className="radio"
            name="gameType"
            value="user"
            checked={gameType === "user"}
            onChange={() => {
              setGameType("user");
              setIsAI(false);
            }}
          />
          <span className="ml-2">User vs User</span>
        </label>
        <label className="label cursor-pointer">
          <input
            type="radio"
            className="radio"
            name="gameType"
            value="ai"
            checked={gameType === "ai"}
            onChange={() => {
              setGameType("ai");
              setIsAI(true);
            }}
          />
          <span className="ml-2">User vs AI</span>
        </label>
      </div>

      <label className="label" htmlFor="createStartingSide">
        <span className="label-text">Select your side</span>
      </label>
      <select
        className="select select-bordered"
        name="createStartingSide"
        id="createStartingSide"
      >
        <option value="random">Random</option>
        <option value="white">White</option>
        <option value="black">Black</option>
      </select>

      {/* Color Switching Logic */}
      <label className="label">
        <span className="label-text">Switch Type</span>
      </label>
      <select
        className="select select-bordered"
        value={switchType}
        onChange={(e) => setSwitchType(e.target.value as any)}
      >
        <option value="move">Move-Based</option>
        <option value="time">Time-Based</option>
        <option value="player">Player-Triggered</option>
        <option value="random">Random</option>
      </select>

      {/* Conditionally show configs */}
      {switchType === "move" && (
        <div>
          <label className="label-text">Move Numbers (comma-separated):</label>
          <input
            type="text"
            className="input input-bordered"
            value={movePoints}
            onChange={(e) => setMovePoints(e.target.value)}
            placeholder="e.g. 10,20,30"
          />
        </div>
      )}

      {switchType === "time" && (
        <div>
          <label className="label-text">Interval (in seconds):</label>
          <input
            type="number"
            className="input input-bordered"
            value={timeInterval}
            onChange={(e) => setTimeInterval(e.target.value)}
            min={5}
          />
        </div>
      )}

      <button
        className={`btn w-full ${buttonLoading ? "loading" : ""} ${
          !session?.user?.id ? "btn-disabled text-base-content" : ""
        }`}
        type="submit"
      >
        Create Game
      </button>
    </form>
  );
}
