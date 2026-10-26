import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { HALLOWEEN } from "@/lib/season";

// 14×16 pixel Canada goose in a red Toronto toque (a witch hat in Halloween week), facing right. Two walking frames.
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
// Halloween week: a purple witch hat with an orange band instead of the toque.
const WITCH_HAT = [
  ".........PP...",
  "........PPPP..",
  "......PPAAAPP.",
];
const SPRITE = HALLOWEEN ? [...WITCH_HAT, ...BODY.slice(3)] : BODY;

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
  P: "#4B2266",
  A: "#E8731F",
};

interface Props {
  size?: number; // pixel size in points
  walking?: boolean;
  flapping?: boolean;
  flip?: boolean;
}

function GooseSprite({ size = 4, walking = true, flapping = false, flip = false }: Props) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!walking && !flapping) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % 2), flapping ? 170 : 280);
    return () => clearInterval(id);
  }, [walking, flapping]);

  const body = flapping ? SPRITE.map((row, y) => {
    // Pixel wings lift and lower around Geesling's body in alternating frames.
    const wing = frame === 0
      ? ({ 7: "..W.........W.", 8: ".WW.........WW", 9: "WW...........W" } as Record<number, string>)[y]
      : ({ 9: "..............", 10: ".WW.........WW", 11: "..WW.......WW." } as Record<number, string>)[y];
    return wing ? row.split("").map((cell, x) => wing[x] === "W" ? "W" : cell).join("") : row;
  }) : SPRITE;
  const rows = [...body, ...(walking && !flapping ? (frame === 0 ? LEGS_A : LEGS_B) : LEGS_A)];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Geesling the goose"
      style={{ width: 14 * size, height: rows.length * size, transform: [{ scaleX: flip ? -1 : 1 }, { translateY: walking && frame === 1 ? -size / 2 : 0 }, { scaleY: flapping && frame === 1 ? 0.96 : 1 }] }}
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
