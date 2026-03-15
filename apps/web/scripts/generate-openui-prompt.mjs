// Pre-generates the OpenUI system prompt at build time.
// Uses esbuild to bundle the "use client" library so it runs in Node.
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

const src = `
import { openuiChatLibrary, openuiChatPromptOptions } from "@openuidev/react-ui/genui-lib";
globalThis.__OPENUI_PROMPT__ = openuiChatLibrary.prompt(openuiChatPromptOptions);
`;

const result = await build({
  stdin: { contents: src, resolveDir: webRoot },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  loader: { ".css": "empty" },
});

const fn = new Function("require", "module", "exports", result.outputFiles[0].text);
fn(require, {}, {});

const prompt = globalThis.__OPENUI_PROMPT__;
const outPath = resolve(webRoot, "lib/openui-prompt.txt");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, prompt, "utf-8");
console.log(`[openui] wrote ${prompt.length} chars → lib/openui-prompt.txt`);
