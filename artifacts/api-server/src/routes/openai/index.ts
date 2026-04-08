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
  referenceImageBase64: z.string().max(10_000_000).optional(),
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

const UGC_CHAT_SYSTEM_PROMPT = `You are a world-class creative director specializing in authentic UGC (User-Generated Content) for social media. You help creators understand exactly how to position, angle, and present products so the content feels genuinely real — not staged or generic.

When the user describes their product or vision, ask insightful questions about:
- The target audience and platform vibe
- The story they want to tell with the product
- What emotions the content should evoke
- Specific details about the product's unique selling points

If the user shares a reference image or UGC example:
- Analyze the visual style, lighting, composition, and mood
- Identify the ad angle being used (us-vs-them, before-after, or social proof)
- Extract the authentic elements that make it feel real (not staged)
- Use what you see to shape your creative direction recommendations
- Be specific: "I see you're going for X lighting, Y composition, Z vibe..."

Based on the conversation, extract a concise creative brief that can guide image generation. Always be specific, directorial, and opinionated — you have a strong aesthetic point of view.

NEVER use emojis. Be concise and direct.`;

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
