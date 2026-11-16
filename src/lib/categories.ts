export const CATEGORIES = [
  { value: "power_tools", label: "Power tools" },
  { value: "hand_tools", label: "Hand tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "cleaning", label: "Cleaning" },
  { value: "other", label: "Other" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export const CONDITIONS = ["Like new", "Good", "Fair", "Worn but works"] as const;

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
