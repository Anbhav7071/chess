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
  const [switchType, setSwitchType] = useState<"move" | "time" | "player" | null>(null);
  const [movePoints, setMovePoints] = useState("10,20,30");
  const [timeInterval, setTimeInterval] = useState("30"); // in seconds
  const [gameTimerType, setGameTimerType] = useState<"time-based" | "infinite">("time-based");
  const [totalTimePerPlayer, setTotalTimePerPlayer] = useState("10"); // in minutes

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

    try {
      const response = await createGame({
        unlisted,
        isAIGame: isAI,
        side: startingSide as "white" | "black" | "random",
        switchType,
        switchConfig,
        totalTimePerPlayer: gameTimerType === "time-based" ? parseInt(totalTimePerPlayer, 10) : undefined,
      });

      if (response?.code) {
        router.push(`/${response.code}`);
      } else {
        setButtonLoading(false);
      }
    } catch (error) {
      console.error("Error creating game:", error);
      setButtonLoading(false);
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

      {/* Timer Type */}
      <label className="label">
        <span className="label-text">Game Timer Type</span>
      </label>
      <select
        className="select select-bordered"
        value={gameTimerType}
        onChange={(e) => setGameTimerType(e.target.value as any)}
      >
        <option value="time-based">Time-Based</option>
        <option value="infinite">Infinite</option>
      </select>

      {gameTimerType === "time-based" && (
        <div>
          <label className="label-text">Total Time Per Player (in minutes):</label>
          <input
            type="number"
            className="input input-bordered"
            value={totalTimePerPlayer}
            onChange={(e) => setTotalTimePerPlayer(e.target.value)}
            min={1}
          />
        </div>
      )}

      {/* Color Switching Logic */}
      <label className="label">
        <span className="label-text">Switch Type</span>
      </label>
      <select
        className="select select-bordered"
        value={switchType ?? ""}
        onChange={(e) =>
          setSwitchType(
            e.target.value === "" ? null : (e.target.value as "move" | "time" | "player")
          )
        }
      >
        <option value="">Select switch type</option>
        <option value="move">Move-Based</option>
        <option value="time">Time-Based</option>
        <option value="player">Player-Triggered</option>
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