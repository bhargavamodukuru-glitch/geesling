import { memo } from "react";
import { View } from "react-native";

// Geesling's egg and eggshell, as pixel art, for the hatching intro.

export const PALETTE: Record<string, string> = {
  O: "#5B3A1E", // shell outline
  E: "#FFF4D6", // shell
  H: "#FFFFFF", // shine
  S: "#C9A66B", // speckle
  C: "#3B2412", // crack
};

export const EGG = [
  ".....OOOO.....",
  "....OEEEEO....",
  "...OEHEEEEO...",
  "..OEHEEEEEEO..",
  "..OEEEESEEEO..",
  ".OEEEEEEEEEEO.",
  ".OESEEEEEEEEO.",
  ".OEEEEEEESEEO.",
  ".OEEEEEEEEEEO.",
  ".OEEESEEEEEEO.",
  ".OEEEEEEEEEEO.",
  "..OEEEEEESEO..",
  "..OEEEEEEEEO..",
  "...OEEEEEEO...",
  "....OOOOOO....",
];
// A zigzag across the middle: the first crack is part of it, the second all of it.
const CRACK: [number, number][] = [[2, 8], [3, 7], [4, 8], [5, 7], [6, 8], [7, 7], [8, 8], [9, 7], [10, 8], [11, 7]];
const withCrack = (points: [number, number][]) =>
  EGG.map((row, y) => row.split("").map((cell, x) => (points.some(([px, py]) => px === x && py === y) ? "C" : cell)).join(""));
export const EGG_CRACKED = withCrack(CRACK.slice(3, 7));
export const EGG_SPLIT = withCrack(CRACK);

export const SHELL_BOTTOM = [
  ".O.O.O.OO.O.O.",
  ".OEOEOEEOEOEO.",
  ".OEEEEEEEEEEO.",
  ".OEEESEEEEEEO.",
  "..OEEEEEESEO..",
  "..OEEEEEEEEO..",
  "...OEEEEEEO...",
  "....OOOOOO....",
];
export const SHELL_CAP = [
  "..OOOO..",
  ".OEEEEO.",
  "OEESEEEO",
  "O.O.O.OO",
];

export const Pixels = memo(function Pixels({ grid, size }: { grid: string[]; size: number }) {
  return (
    <View style={{ width: grid[0].length * size, height: grid.length * size }}>
      {grid.map((row, y) => (
        <View key={y} style={{ flexDirection: "row", height: size }}>
          {row.split("").map((cell, x) => (
            <View key={x} style={{ width: size, height: size, backgroundColor: PALETTE[cell] ?? "transparent" }} />
          ))}
        </View>
      ))}
    </View>
  );
});
