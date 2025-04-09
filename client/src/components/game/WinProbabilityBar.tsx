import React, { useRef, useEffect, useState } from "react";

interface ChessWinProbabilityProps {
  whiteProb: number; // between 0 and 100
}

const ChessWinProbability: React.FC<ChessWinProbabilityProps> = ({ whiteProb }) => {
  const [displayedProb, setDisplayedProb] = useState(whiteProb); // Smoothly update the displayed probability
  const prevProbRef = useRef(whiteProb);

  useEffect(() => {
    // Only update the displayed probability if the value changes significantly
    if (Math.abs(prevProbRef.current - whiteProb) > 0.5) {
      setDisplayedProb(whiteProb);
      prevProbRef.current = whiteProb;
    }
  }, [whiteProb]);

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.whiteProb,
          height: `${Math.min(100, Math.max(0, displayedProb))}%`, // Clamped
          transition: "height 0.3s ease-in-out", // Smooth transition
        }}
      />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: "15px",
    height: "480px",
    border: "2px solid #000",
    borderRadius: "10px",
    backgroundColor: "#333", // Black base
    position: "relative",
    overflow: "hidden",
  },
  whiteProb: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "#eee",
    transition: "height 0.3s ease-in-out", // Smooth transition
  },
};

export default ChessWinProbability;