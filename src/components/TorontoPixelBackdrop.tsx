import { StyleSheet, View } from "react-native";

const BUILDINGS = [
  { left: "2%", width: "7%", height: 90, day: "#C6A476", night: "#34435D" },
  { left: "11%", width: "8%", height: 132, day: "#D8B980", night: "#40516C" },
  { left: "22%", width: "6%", height: 112, day: "#B99260", night: "#2B3C58" },
  { left: "31%", width: "8%", height: 148, day: "#D4B27D", night: "#3B4D69" },
  { left: "60%", width: "7%", height: 124, day: "#C7A373", night: "#33445F" },
  { left: "70%", width: "8%", height: 150, day: "#D8B980", night: "#40516C" },
  { left: "81%", width: "7%", height: 105, day: "#B99260", night: "#2B3C58" },
  { left: "91%", width: "8%", height: 136, day: "#C6A476", night: "#34435D" },
];

function Cloud({ style }: { style: object }) {
  return (
    <View pointerEvents="none" style={[styles.cloud, style]}>
      <View style={styles.cloudTop} />
      <View style={styles.cloudBase} />
    </View>
  );
}

export function TorontoPixelBackdrop({ nightMode }: { nightMode: boolean }) {
  const scene = nightMode
    ? { sky: "#202B49", cloud: "#52607A", buildingWindow: "#F2C14E", tower: "#CAB68D", towerDeck: "#D8C59A", park: "#426344", grass: "#52734B", water: "#355D7B", shimmer: "#A3C5D0" }
    : { sky: "#F6E7C1", cloud: "#FFF8E6", buildingWindow: "#F6E7C1", tower: "#A97A4D", towerDeck: "#C8412F", park: "#759A50", grass: "#9BCB6B", water: "#8FD3F4", shimmer: "#D7F0F8" };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scene.sky }]}>
      {nightMode ? (
        <>
          <View style={[styles.moonHalo, { backgroundColor: "#E9D9A633" }]}>
            <View style={styles.moon} />
            <View style={[styles.moonCutout, { backgroundColor: scene.sky }]} />
          </View>
          <View style={[styles.star, styles.starA]} />
          <View style={[styles.star, styles.starB]} />
          <View style={[styles.star, styles.starC]} />
          <View style={[styles.star, styles.starD]} />
          <View style={[styles.star, styles.starE]} />
        </>
      ) : (
        <>
          <View style={styles.sunHalo}><View style={styles.sun} /></View>
          <Cloud style={[styles.cloudOne, { opacity: 0.9 }]} />
          <Cloud style={[styles.cloudTwo, { opacity: 0.7 }]} />
          <View style={styles.sparkleOne}><View style={styles.sparkleVertical} /><View style={styles.sparkleHorizontal} /></View>
          <View style={styles.sparkleTwo}><View style={styles.sparkleVerticalSmall} /><View style={styles.sparkleHorizontalSmall} /></View>
        </>
      )}

      <View style={styles.skyline}>
        {BUILDINGS.map((building, index) => (
          <View key={index} style={[styles.building, { left: building.left, width: building.width, height: building.height, backgroundColor: nightMode ? building.night : building.day }]}>
            {Array.from({ length: Math.floor(building.height / 24) * 3 }, (_, i) => (
              <View key={i} style={[styles.window, { backgroundColor: scene.buildingWindow, opacity: nightMode ? 1 : 0.7 }]} />
            ))}
          </View>
        ))}

        {/* Toronto's skyline profile: CN Tower, downtown towers, and the Rogers Centre roof. */}
        <View style={[styles.towerNeedle, { backgroundColor: scene.tower }]} />
        <View style={[styles.towerTop, { backgroundColor: scene.towerDeck }]} />
        <View style={[styles.towerDeck, { backgroundColor: scene.towerDeck, borderColor: scene.towerDeck }]} />
        <View style={[styles.towerShaft, { backgroundColor: scene.tower }]} />
        <View style={[styles.towerBase, { backgroundColor: scene.tower }]} />
        <View style={[styles.stadiumRoof, { backgroundColor: nightMode ? "#52627A" : "#AEB9AA", borderColor: nightMode ? "#8C9A9D" : "#E8DFC9" }]} />
      </View>

      <View style={[styles.tree, styles.treeLeft]}><View style={[styles.treeTop, { backgroundColor: scene.park, borderColor: nightMode ? "#304D3D" : "#557641" }]} /><View style={styles.treeTrunk} /></View>
      <View style={[styles.tree, styles.treeRight]}><View style={[styles.treeTop, { backgroundColor: scene.park, borderColor: nightMode ? "#304D3D" : "#557641" }]} /><View style={styles.treeTrunk} /></View>
      <View style={[styles.grassBank, { backgroundColor: scene.grass, borderColor: nightMode ? "#304D3D" : "#73984D" }]} />
      <View style={[styles.lake, { backgroundColor: scene.water, borderColor: nightMode ? "#283F5B" : "#6FB7D9" }]} />
      <View style={[styles.lakeShimmer, { backgroundColor: scene.shimmer }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sunHalo: { position: "absolute", top: "7%", right: "12%", width: 124, height: 124, alignItems: "center", justifyContent: "center", backgroundColor: "#F2C14E33", borderRadius: 62 },
  sun: { width: 70, height: 70, backgroundColor: "#F2C14E", borderWidth: 6, borderColor: "#E3A846", borderRadius: 3 },
  moonHalo: { position: "absolute", top: "7%", right: "12%", width: 124, height: 124, alignItems: "center", justifyContent: "center", borderRadius: 62 },
  moon: { width: 66, height: 66, backgroundColor: "#F6E7C1", borderRadius: 33 },
  moonCutout: { position: "absolute", top: 22, right: 21, width: 54, height: 54, borderRadius: 27 },
  star: { position: "absolute", width: 5, height: 5, backgroundColor: "#FFF8E6" },
  starA: { top: "12%", left: "23%" },
  starB: { top: "21%", left: "43%", width: 4, height: 4 },
  starC: { top: "33%", right: "26%", width: 6, height: 6 },
  starD: { top: "38%", left: "11%", width: 4, height: 4 },
  starE: { top: "10%", right: "39%", width: 3, height: 3 },
  cloud: { position: "absolute", width: 116, height: 42 },
  cloudTop: { position: "absolute", left: 30, top: 0, width: 44, height: 22, backgroundColor: "#FFF8E6" },
  cloudBase: { position: "absolute", left: 8, top: 18, width: 100, height: 22, backgroundColor: "#FFF8E6" },
  cloudOne: { top: "13%", left: "9%", transform: [{ scale: 1.15 }] },
  cloudTwo: { top: "22%", right: "8%", transform: [{ scale: 0.78 }] },
  sparkleOne: { position: "absolute", top: "31%", left: "18%", width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  sparkleTwo: { position: "absolute", top: "18%", right: "27%", width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  sparkleVertical: { position: "absolute", width: 5, height: 22, backgroundColor: "#E3A846" },
  sparkleHorizontal: { position: "absolute", width: 22, height: 5, backgroundColor: "#E3A846" },
  sparkleVerticalSmall: { position: "absolute", width: 3, height: 16, backgroundColor: "#FFF8E6" },
  sparkleHorizontalSmall: { position: "absolute", width: 16, height: 3, backgroundColor: "#FFF8E6" },
  skyline: { position: "absolute", left: 0, right: 0, bottom: 38, height: 220, flexDirection: "row", alignItems: "flex-end" },
  building: { position: "absolute", bottom: 0, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", justifyContent: "space-evenly", paddingTop: 12, paddingHorizontal: 4, borderTopWidth: 5, borderTopColor: "#B08A5C" },
  window: { width: 4, height: 7, margin: 3 },
  towerNeedle: { position: "absolute", left: "49.7%", bottom: 205, width: 4, height: 68 },
  towerTop: { position: "absolute", left: "48.7%", bottom: 204, width: "2.6%", minWidth: 18, height: 10 },
  towerDeck: { position: "absolute", left: "46.6%", bottom: 180, width: "7%", minWidth: 44, height: 24, borderTopWidth: 6 },
  towerShaft: { position: "absolute", left: "49.1%", bottom: 0, width: 18, height: 182 },
  towerBase: { position: "absolute", left: "47.8%", bottom: 0, width: 44, height: 12 },
  stadiumRoof: { position: "absolute", left: "55%", bottom: 0, width: "9%", height: 54, borderTopWidth: 5, borderTopLeftRadius: 36, borderTopRightRadius: 36 },
  tree: { position: "absolute", bottom: 47, alignItems: "center" },
  treeLeft: { left: "5%" },
  treeRight: { right: "5%", transform: [{ scale: 1.25 }] },
  treeTop: { width: 48, height: 42, borderWidth: 4 },
  treeTrunk: { width: 12, height: 24, backgroundColor: "#8B5A2B" },
  grassBank: { position: "absolute", left: 0, right: 0, bottom: 30, height: 28, borderTopWidth: 5 },
  lake: { position: "absolute", left: 0, right: 0, bottom: 0, height: 32, borderTopWidth: 4 },
  lakeShimmer: { position: "absolute", right: "20%", bottom: 15, width: 78, height: 4 },
});
