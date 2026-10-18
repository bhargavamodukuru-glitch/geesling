import { memo, useEffect, useState } from "react";
import { View } from "react-native";

// 14×16 pixel Canada goose in a red Toronto toque, facing right. Two walking frames.
const BODY = [
  "........RRR...",
  ".......RRRRR..",
  ".......WWWWW..",
  ".......KKKKK..",
  ".......KWKEKK.",
  ".......KWWKKKO",
  ".......KWWKK..",
  "........KKK...",
  "........KK....",
  "........KK....",
  "..BB....KK....",
  ".WBBBBBBBBB...",
  "WWBDDDDDBBBB..",
  ".WBBDDDDBBBB..",
];
const LEGS_A = ["....K...K.....", "...KK..KK....."];
const LEGS_B = [".....K.K......", "....KK.KK....."];

const PALETTE: Record<string, string> = {
  R: "#C8412F",
  W: "#FDFDF5",
  K: "#1F1F1F",
  E: "#FDFDF5",
  O: "#2B2B2B",
  B: "#B08A5C",
  D: "#6E4B2A",
};

interface Props {
  size?: number; // pixel size in points
  walking?: boolean;
  flip?: boolean;
}

function GooseSprite({ size = 4, walking = true, flip = false }: Props) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!walking) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % 2), 280);
    return () => clearInterval(id);
  }, [walking]);

  const rows = [...BODY, ...(frame === 0 ? LEGS_A : LEGS_B)];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Geesling the goose"
      style={{ width: 14 * size, height: rows.length * size, transform: [{ scaleX: flip ? -1 : 1 }, { translateY: walking && frame === 1 ? -size / 2 : 0 }] }}
    >
      {rows.map((row, y) => (
        <View key={y} style={{ flexDirection: "row", height: size }}>
          {row.split("").map((cell, x) => (
            <View key={x} style={{ width: size, height: size, backgroundColor: PALETTE[cell] ?? "transparent" }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export const Goose = memo(GooseSprite);
