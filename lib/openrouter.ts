import "server-only";
import { z } from "zod";

// Minimal OpenRouter chat completions client (OpenAI-compatible API).
// https://openrouter.ai/docs/api-reference/chat-completion

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-opus-5.5";

export type ContentPart =
  | { type: "text"; text: string }
  // fileData is a URL or a base64 data URL, e.g. "data:application/pdf;base64,…".
  | { type: "file"; file: { filename: string; file_data: string } };

export type Message = { role: "system" | "user"; content: string | ContentPart[] };

const responseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

// Chat completion whose answer must match the given schema (structured output).
// The model is OPENROUTER_MODEL, or Claude Opus by default. With `webSearch`, the model can
// search the web (the provider's own search when it has one).
export async function structuredCompletion<T>({
  messages,
  schema,
  schemaName,
  webSearch = false,
}: {
  messages: Message[];
  schema: z.ZodType<T>;
  schemaName: string;
  webSearch?: boolean;
}): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema: jsonSchema },
      },
      // Let models that read PDFs natively (like Claude) see the file as is, tables included.
      plugins: [
        { id: "file-parser", pdf: { engine: "native" } },
        ...(webSearch ? [{ id: "web", max_results: 5 }] : []),
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const content = responseSchema.parse(await response.json()).choices[0].message.content;
  if (!content) throw new Error("OpenRouter returned no content");
  // Validate even though the API enforces the schema: the answer is still external input.
  return schema.parse(JSON.parse(content));
}
