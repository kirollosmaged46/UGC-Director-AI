import { z } from "zod";

export const AD_ANGLE_ENUM = ["us-vs-them", "before-after", "social-proof"] as const;
export type AdAngle = typeof AD_ANGLE_ENUM[number];

export const ModelConceptSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(z.object({ description: z.string().min(1) })).length(3),
});

export function buildAngleNarrative(angle: AdAngle): string {
  switch (angle) {
    case "us-vs-them":
      return `Comparative UGC narrative. The creator has tried the "old way" or a competitor product and is done with it. 
The scene implies frustration with what came before — then the moment of switching. 
Visual language: two worlds side by side. One looks tired, one looks elevated. 
The product is held confidently, not demonstrated — it speaks for itself. 
Body language says "I finally found it." No corporate comparison charts. No text callouts. Just the feeling of upgrading.`;

    case "before-after":
      return `Transformation UGC narrative. The creator shows a real before-state — no filter, no polish, a genuine problem moment. 
Then the after: the product has done its job and the result is undeniable. 
The transition must feel accidental or organic — not a wipe, not a flash cut. More like life continuing. 
Emotion carries the story: the before feels like a bad Tuesday morning, the after feels like exhaling. 
Product is the quiet catalyst — not the hero, just the reason everything changed.`;

    case "social-proof":
      return `Community/unboxing UGC narrative. Real person, real moment — could be unboxing, could be a mid-use discovery, could be showing a friend. 
The energy is "I can't believe I didn't have this before." Genuine surprise or quiet satisfaction. 
Setting feels lived-in: a real kitchen counter, a real bedroom, a real commute bag. 
No rehearsed lines, no benefit lists. One specific personal detail that makes it feel real — 
the color they chose, something unexpected about the product, how it arrived faster than expected.`;
  }
}

export function buildUgcPrompt(params: {
  angle: AdAngle;
  lighting: string;
  aspectRatio: string;
  platform: string;
  productName?: string;
  productCategory?: string;
  creativeVision?: string;
  sceneContext?: string;
}): string {
  const { angle, lighting, aspectRatio, platform, productName, productCategory, creativeVision, sceneContext } = params;

  const angleNarrative = buildAngleNarrative(angle);

  const lightingMap: Record<string, string> = {
    "golden-hour": `Warm golden-hour light pouring in from the side — long soft shadows, slightly overexposed highlights, the kind of light that makes skin glow and products look desirable. 
Feels like 5pm on a good day. Not a photography studio — a real room with real windows.`,

    "studio-white": `Soft diffused bright light — like a well-lit bathroom or a north-facing bedroom. 
Slightly warm, no harsh shadows. Feels like a good selfie setup, not a commercial shoot. 
Clean but human — you can see texture, you can see imperfection.`,

    "moody-dark": `Low-key dramatic lighting. Deep shadows, one warm light source — a lamp, a candle, a phone screen. 
Cinematic and intimate. The product catches the light while the background falls into darkness. 
Feels like a late-night discovery, not a daytime ad.`,

    "outdoor-natural": `Bright open natural daylight — slightly overcast sky or open shade. 
The kind of light you get when you step outside on a clear morning. 
Skin looks real, colors look saturated but not fake. Background is soft and out of focus.`,

    neon: `Vibrant neon accent light — pink, purple, or teal glow reflecting off surfaces and skin. 
Urban night energy. The product glows. Background is dark with colored light bleeding in. 
Feels like a cool apartment or creative studio at night.`,
  };

  const ratioMap: Record<string, string> = {
    "9:16": "Vertical 9:16 full-bleed. Fill every pixel. Subject close to camera. TikTok and Reels native framing.",
    "1:1": "Square 1:1. Subject centered with breathing room. Instagram feed optimized.",
    "4:5": "Portrait 4:5. Slightly wider than a Story. Instagram feed — elegant, editorial proportions.",
    "16:9": "Landscape 16:9. Wide framing with context. YouTube thumbnail-worthy. Subject left or right of center.",
  };

  const platformMap: Record<string, string> = {
    tiktok: `TikTok-native aesthetic. Shot on iPhone, slightly shaky, one take energy. 
Gen Z authentic — imperfect framing is a feature, not a bug. 
Feels like the creator filmed this between two other things. Real, fast, human.`,

    instagram: `Instagram creator aesthetic. Slightly more composed than TikTok but still organic. 
The kind of content a real lifestyle creator with 50k followers would post. 
Warm, aspirational, personal. Not brand content — human content.`,

    youtube: `YouTube thumbnail energy. Dynamic, clear, expressive. 
Subject facing camera with an expression that invites a click. 
Wide enough to feel like a real space, close enough to feel like a real person.`,
  };

  const lightingDesc = lightingMap[lighting] ?? lighting;
  const ratioDesc = ratioMap[aspectRatio] ?? aspectRatio;
  const platformDesc = platformMap[platform] ?? platform;

  // Build product context line
  const productLine = productName
    ? `The product is: ${productName}${productCategory ? ` (${productCategory})` : ""}. `
    : productCategory
    ? `Product category: ${productCategory}. `
    : "";

  let prompt = `AUTHENTIC UGC CONTENT — NOT A STOCK PHOTO, NOT A STUDIO AD.\n\n`;

  prompt += `CORE DIRECTIVE:\n`;
  prompt += `This must look like a real person filmed or photographed this on their smartphone. `;
  prompt += `Slightly imperfect. Lived-in. Human. The kind of content that stops a scroll because it feels real, not because it's polished.\n\n`;

  prompt += `PRODUCT:\n${productLine}`;
  prompt += `Product is visible and prominent but held or used naturally — not posed, not floating, not centered like a product shot. `;
  prompt += `Hands, fingers, or forearms must be present. The product exists in a real moment, not a photoshoot.\n\n`;

  prompt += `AD ANGLE / NARRATIVE DIRECTION:\n${angleNarrative}\n\n`;

  prompt += `SETTING & ENVIRONMENT:\n`;
  prompt += `Real-world location only: kitchen counter, bathroom vanity, bedroom shelf, gym bag, car seat, cafe table, outdoor steps. `;
  prompt += `Background is slightly out of focus and slightly imperfect — not messy, not dirty, just lived-in. `;
  prompt += `NO white studio backdrop. NO seamless paper. NO professional prop styling.\n\n`;

  prompt += `LIGHTING:\n${lightingDesc}\n\n`;

  prompt += `COMPOSITION & FORMAT:\n${ratioDesc}\n\n`;

  prompt += `PLATFORM AESTHETIC:\n${platformDesc}\n\n`;

  prompt += `AUTHENTICITY RULES (non-negotiable):\n`;
  prompt += `- No text overlays, no watermarks, no logos, no captions burned into the image\n`;
  prompt += `- No perfect symmetry — real people don't center everything\n`;
  prompt += `- Skin texture is visible and real — no AI smoothing, no plastic skin\n`;
  prompt += `- Clothing is casual and real — not styled, not ironed, not "influencer outfit"\n`;
  prompt += `- Expression is natural — not a forced smile, not a model face\n`;
  prompt += `- If there's a face, it looks like someone you'd see at a grocery store, not a casting call\n\n`;

  prompt += `WHAT TO AVOID AT ALL COSTS:\n`;
  prompt += `- Stock photography energy (too clean, too posed, too perfect)\n`;
  prompt += `- AI image tells (plastic skin, symmetrical everything, fake background blur)\n`;
  prompt += `- Corporate ad energy (product floating on white, benefit callouts, brand colors everywhere)\n`;
  prompt += `- Over-styled scenes (too many props, too curated, too "aesthetic")\n`;

  if (creativeVision) {
    prompt += `\nCREATIVE DIRECTOR NOTE:\n${creativeVision}\n`;
  }

  if (sceneContext) {
    prompt += `\nSCENE CONTEXT:\n${sceneContext}\n`;
  }

  return prompt;
}
