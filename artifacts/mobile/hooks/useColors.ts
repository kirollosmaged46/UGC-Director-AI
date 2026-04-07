import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

export function useColors() {
  const scheme = useColorScheme();
  const hasDark = "dark" in colors;
  const palette =
    scheme === "dark" && hasDark
      ? (colors as unknown as { light: typeof colors.light; dark: typeof colors.light }).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
