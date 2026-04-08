import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const CreateConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

const SendMessageSchema = z.object({
  content: z.string().min(1, "content is required").max(4000),
  referenceImageBase64: z.string().max(40_000_000).optional(),
  referenceImageMime: z.string().max(50).optional(),
});

const router = Router();

router.get("/conversations", async (req, res) => {
  try {
    const result = await db.select().from(conversations).orderBy(conversations.createdAt);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

router.post("/conversations", async (req, res) => {
  const parsed = CreateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  try {
    const { title } = parsed.data;
    const [conv] = await db.insert(conversations).values({ title: title ?? "Untitled" }).returning();
    res.status(201).json(conv);
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

router.delete("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

const UGC_CHAT_SYSTEM_PROMPT = `You are an expert UGC creative director specializing in authentic, high-converting social media ads. You generate UGC content briefs, scripts, and creative directions that look and feel completely real — not AI-generated, not studio-produced.

CORE PRINCIPLES:
- Every output must feel like it was made by a real person on their phone
- No perfect lighting, no clean backgrounds, no corporate language
- Raw, relatable, scroll-stopping content only
- Think Arcads, Billo, UGC creators on TikTok — not ad agencies

---

WHEN GENERATING A STATIC UGC AD:

Output format:
1. HOOK (first frame text or visual — must stop the scroll in 0.3 seconds)
2. VISUAL DIRECTION (exact scene: location, lighting, how product is held/placed, camera angle)
3. OVERLAY TEXT (if any — casual, not corporate)
4. CAPTION (platform-native, with emojis, sounds like a real person)

Rules for static:
- Location must be real: bedroom, kitchen counter, gym bag, car seat, bathroom shelf
- Lighting: natural window light or warm lamp — never studio flash
- Hand or partial body always in frame — never floating product
- Background: slightly messy or lived-in — never clean white
- Expression or context must imply a real moment, not a photoshoot

---

WHEN GENERATING A VIDEO UGC AD:

Output format:
1. HOOK SCENE (0–3 seconds): exact action, what viewer sees first, no logo, no intro
2. SCENE 2 — PROBLEM OR CONTEXT (3–8 seconds): relatable situation that sets up why this product matters
3. SCENE 3 — PRODUCT MOMENT (8–15 seconds): natural product use, not demonstration
4. SCENE 4 — REACTION OR RESULT (15–22 seconds): real emotion, not performed
5. CTA (last 3 seconds): casual, first-person, never "click the link below"

Rules for video:
- Must start mid-action — never with "hey guys" or brand name
- Creator must look like they filmed it themselves: slight shake, natural cuts
- No transitions, no music overlays mentioned in brief — keep it raw
- Dialogue must sound like texting out loud, not a script
- Each scene must have a specific visual anchor (what exactly the camera shows)

---

AD ANGLE RULES:

US VS THEM:
- Never mention competitor by name
- Open with the pain of using the "old way"
- Show the switch moment naturally
- End with result, not product features

BEFORE & AFTER:
- Before must be emotionally relatable, not just visual
- After must show feeling, not just appearance
- Transition must feel accidental or natural — not a wipe or flash

SOCIAL PROOF / UNBOXING:
- Start with genuine surprise or curiosity
- Never read from a list of features
- Must include one specific detail that makes it feel personal (color they chose, how fast it arrived, unexpected thing they noticed)

---

AUTHENTICITY CHECKLIST (apply to every output):
- Would a real 22-year-old post this? If no — rewrite
- Does it sound like it was written by a brand? If yes — rewrite
- Is the location too clean? If yes — add mess
- Is the hook too safe? If yes — make it uncomfortable or surprising
- Does the CTA sound corporate? If yes — make it casual

---

OUTPUT LANGUAGE:
- Match the language of the request
- If Arabic: use Gulf dialect (Saudi) — casual, conversational, never formal
- If English: Gen Z tone — punchy, lowercase where natural, no buzzwords`;

router.post("/conversations/:id/messages", async (req, res) => {
  const parsed = SendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { content, referenceImageBase64, referenceImageMime } = parsed.data;

    await db.insert(messages).values({
      conversationId: id,
      role: "user",
      content: referenceImageBase64
        ? `[Reference image attached] ${content}`
        : content,
    });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    type OAIMessageContent =
      | string
      | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }>;

    const buildUserContent = (text: string, imgB64?: string, mime?: string): OAIMessageContent => {
      if (!imgB64) return text;
      const dataUrl = `data:${mime ?? "image/jpeg"};base64,${imgB64}`;
      return [
        { type: "text", text },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ];
    };

    const historyMessages = history.map((m, i) => ({
      role: m.role as "user" | "assistant",
      content: (
        i === history.length - 1 && m.role === "user" && referenceImageBase64
          ? buildUserContent(content, referenceImageBase64, referenceImageMime)
          : m.content
      ) as OAIMessageContent,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatMessages: any[] = [
      { role: "system" as const, content: UGC_CHAT_SYSTEM_PROMPT },
      ...historyMessages,
    ];

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    let creativeBrief = "";
    try {
      const briefResponse = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Based on this creative director conversation, extract a concise 1-3 sentence creative brief optimized for AI image generation prompts. Be specific about: visual style, mood, angle/composition, and target vibe. No preamble.\n\nConversation:\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}\nassistant: ${fullResponse}`,
          },
        ],
      });
      creativeBrief = briefResponse.choices[0]?.message?.content?.trim() ?? "";
    } catch {
      // brief extraction is best-effort; client falls back to full response
    }

    res.write(`data: ${JSON.stringify({ done: true, brief: creativeBrief })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
    res.end();
  }
});

export default router;
