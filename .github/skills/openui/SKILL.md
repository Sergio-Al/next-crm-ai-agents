---
name: openui
description: 'Use when building or modifying generative UI responses with openui-lang. Covers the OpenUI Renderer, openuiChatLibrary, openui-lang DSL syntax, component signatures, streaming behavior, action handling, tool output hiding, and system prompt regeneration.'
---

# OpenUI Skill — Generative UI with openui-lang

This skill provides conventions for building generative UI responses using the OpenUI framework in this project.

## Stack

- **`@openuidev/react-lang@^0.2.0`** — Parser & `Renderer` component for openui-lang DSL
- **`@openuidev/react-ui@^0.11.0`** — Pre-built component library (`openuiChatLibrary`)
- **`@openuidev/react-headless@^0.8.0`** — Headless component primitives
- **`@openuidev/cli@^0.0.5`** — Dev tooling (devDependency)

## Architecture

```
apps/web/
├── lib/
│   └── openui-prompt.txt          # Pre-generated system prompt with full DSL spec
├── scripts/
│   └── generate-openui-prompt.mjs # Builds openui-prompt.txt from library metadata
├── app/
│   ├── globals.css                # Imports @openuidev/react-ui/components.css
│   ├── components/
│   │   └── chat-message.tsx       # Renders openui-lang via <Renderer>
│   └── api/
│       └── chat/
│           └── route.ts           # Injects openui-prompt.txt into system prompt
```

## How It Works

1. **Build time**: `generate-openui-prompt.mjs` bundles the library's prompt spec → `lib/openui-prompt.txt`
2. **Runtime (server)**: The chat API route reads `openui-prompt.txt` and appends it to the LLM system prompt
3. **Runtime (client)**: `chat-message.tsx` detects openui-lang in assistant text parts and renders them with `<Renderer>`

### Detection Logic (chat-message.tsx)

```tsx
// Heuristic: openui-lang starts with identifier = Expression
function looksLikeOpenUI(text: string): boolean {
  const trimmed = stripOpenUIFence(text).trimStart();
  return /^[a-zA-Z_]\w*\s*=\s*/.test(trimmed);
}
```

If a text part matches, it's rendered with the OpenUI `Renderer`:
```tsx
<Renderer
  library={openuiChatLibrary}
  response={openUISource}
  isStreaming={isStreaming}
  onAction={onAction}
/>
```

If rendering fails, an `ErrorBoundary` falls back to plain text.

### Actions

The `onAction` callback in `chat-panel.tsx` handles:
- **`continue_conversation`**: Sends `event.humanFriendlyMessage` as a new user message
- **`open_url`**: Opens `event.params.url` in a new tab

## openui-lang Syntax Reference

Every response is wrapped in `root = Card([children])`. The `root` line must come first for optimal streaming.

### Core Components

| Component | Purpose |
|-----------|---------|
| `Card([children])` | Root container — children stack vertically |
| `CardHeader(title, subtitle)` | Header with title/subtitle |
| `TextContent(text, size?)` | Text block, supports markdown. Sizes: `"small"`, `"default"`, `"large"`, `"small-heavy"`, `"large-heavy"` |
| `MarkDownRenderer(text, variant?)` | Full markdown renderer |
| `ListBlock([items], variant?)` | Numbered/image list. Variants: `"number"`, `"image"` |
| `ListItem(title, subtitle?, image?, actionLabel?, action?)` | Item in a ListBlock |
| `FollowUpBlock([items])` | Clickable follow-up suggestions (place at end of Card) |
| `FollowUpItem(text)` | Single follow-up — clicking sends text as user message |

### Data Display

| Component | Purpose |
|-----------|---------|
| `Table([columns])` | Column-oriented data table |
| `Col(label, data, type?)` | Column definition with label + data array |
| `TagBlock(tags)` | Array of tag strings |
| `Tag(text, icon?, size?, variant?)` | Styled tag/badge |

### Charts

| Component | Purpose |
|-----------|---------|
| `BarChart(labels, series, variant?)` | Vertical bars |
| `LineChart(labels, series, variant?)` | Lines over categories |
| `AreaChart(labels, series, variant?)` | Filled area |
| `PieChart(labels, values, variant?)` | Circular slices |
| `RadarChart(labels, series)` | Spider/web chart |
| `HorizontalBarChart(labels, series)` | Horizontal bars |
| `ScatterChart(datasets)` | X/Y scatter plot |
| `Series(category, values)` | One data series |

### Forms

| Component | Purpose |
|-----------|---------|
| `Form(name, buttons, fields?)` | Form container |
| `FormControl(label, input, hint?)` | Field with label |
| `Input(name, placeholder?, type?, rules?, value?)` | Text input |
| `TextArea(name, placeholder?, rows?, rules?)` | Multi-line input |
| `Select(name, items, placeholder?, rules?)` | Dropdown |
| `DatePicker(name, mode?, rules?)` | Date picker |
| `Slider(name, variant, min, max, step?)` | Numeric slider |
| `Button(label, action?, variant?, type?, size?)` | Clickable button |
| `Buttons([buttons], direction?)` | Button group |

### Layout

| Component | Purpose |
|-----------|---------|
| `Tabs([items])` | Tabbed container |
| `TabItem(value, trigger, content)` | Single tab |
| `SectionBlock([sections], isFoldable?)` | Collapsible sections |
| `SectionItem(value, trigger, content)` | Single section |
| `Accordion([items])` | Collapsible panels |
| `Carousel([slides], variant?)` | Horizontal scrollable slides |
| `Steps([items])` | Step-by-step guide |
| `Callout(variant, title, description)` | Alert banner |

### Actions

```
Action([@steps...])
```
- `@ToAssistant("message")` — Send message to assistant
- `@OpenUrl("https://...")` — Navigate to URL
- Buttons without explicit Action auto-send their label text

## Key Rules

1. **Arguments are POSITIONAL** — order matters, not names. Never use `key: value` syntax
2. **`root = Card(...)` must be the FIRST line** — enables progressive streaming
3. **Every variable must be referenced** — unreferenced variables are silently dropped
4. **References can be hoisted** — a variable can be used before it's defined
5. **Define each FormControl as its own reference** — don't inline all fields
6. **Never nest Form inside Form**
7. **Card is the only layout container** — no Stack component exists
8. **Carousel slides must have identical structure** — same component types in same order

## Streaming Behavior

The parser re-evaluates on every chunk. Write structure first (root → component refs) and data last (leaf values) so the UI shell appears immediately and fills in progressively.

**Recommended order:**
1. `root = Card([...])` — shell appears immediately
2. Component definitions — fill in as they stream
3. Data values — leaf content last

## Adding New Tool Renderers

When a tool returns data the LLM renders via openui-lang, hide the raw tool output in `tool-invocation-renderer.tsx`:

```tsx
// In the output-available fallback section:
if (toolName === "myNewTool") {
  return null; // LLM renders this via openui-lang text part
}
```

## Regenerating the System Prompt

After upgrading `@openuidev/react-ui`, regenerate the prompt file:

```bash
cd apps/web
node scripts/generate-openui-prompt.mjs
```

This updates `lib/openui-prompt.txt` with the latest component signatures.
