export interface AvatarPreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  style: string;
  color: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "sarah",
    name: "Sarah",
    emoji: "👩",
    description: "Early 30s lifestyle creator, warm and relatable, speaks from personal experience",
    style: "Casual bedroom or bathroom setting, natural morning light, oversized tee, genuine smile",
    color: "#f472b6",
  },
  {
    id: "maya",
    name: "Maya",
    emoji: "💄",
    description: "Mid-20s beauty and wellness reviewer, brutally honest, tells it like it is",
    style: "Vanity mirror close-ups, ring light from the side, minimal makeup, direct eye contact",
    color: "#a78bfa",
  },
  {
    id: "alex",
    name: "Alex",
    emoji: "💪",
    description: "Late-20s fitness and health enthusiast, high energy, always testing new things",
    style: "Gym bag on the floor, post-workout glow, kitchen counter, natural daylight",
    color: "#34d399",
  },
  {
    id: "jordan",
    name: "Jordan",
    emoji: "💼",
    description: "Early 30s working professional, sophisticated but approachable, solution-focused",
    style: "Home office or cafe setting, clean background, smart-casual, confident composure",
    color: "#60a5fa",
  },
  {
    id: "sam",
    name: "Sam",
    emoji: "🎮",
    description: "22-year-old Gen-Z, raw and unfiltered, speaks the way they text",
    style: "Bedroom desk, poster in background, hoodie, casual handheld filming, no-filter vibe",
    color: "#fb923c",
  },
  {
    id: "layla",
    name: "Layla",
    emoji: "🌙",
    description: "Gulf Arabic creator, 27, confident and charming, connects in Arabic naturally",
    style: "Cozy indoor setting, warm lighting, modest fashion, speaks Gulf dialect",
    color: "#f59e0b",
  },
  {
    id: "rachel",
    name: "Rachel",
    emoji: "🏠",
    description: "32-year-old mom creator, relatable and warm, shares real life moments",
    style: "Kitchen or living room, toddler toys in background, no-fuss look, heartfelt energy",
    color: "#ec4899",
  },
  {
    id: "marcus",
    name: "Marcus",
    emoji: "🔬",
    description: "Late-20s skeptic-turned-believer, tech-savvy, needs proof before recommending",
    style: "Desk setup, analytical tone, before/after comparisons, measured enthusiasm",
    color: "#6366f1",
  },
];
