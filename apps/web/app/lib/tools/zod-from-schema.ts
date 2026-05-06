import { z, type ZodTypeAny } from "zod";

/**
 * Field definition stored in the `tools.input_schema` jsonb column.
 * One source of truth that drives both the Zod schema (for the AI SDK)
 * and the admin form UI.
 */
export type ToolInputField = {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  optional?: boolean;
  description?: string;
  min?: number;
  max?: number;
  enum?: string[];
};

/**
 * Compile a `ToolInputField[]` array into a `z.object({...})` schema.
 * Returns an empty object schema if `fields` is null/empty.
 */
export function zodFromSchema(
  fields: ToolInputField[] | null | undefined,
): z.ZodObject<Record<string, ZodTypeAny>> {
  if (!fields || fields.length === 0) {
    return z.object({});
  }
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    let s: ZodTypeAny;
    switch (f.type) {
      case "string":
        s = z.string();
        break;
      case "number": {
        let n = z.number();
        if (typeof f.min === "number") n = n.min(f.min);
        if (typeof f.max === "number") n = n.max(f.max);
        s = n;
        break;
      }
      case "boolean":
        s = z.boolean();
        break;
      case "enum":
        if (!f.enum || f.enum.length === 0) {
          s = z.string();
        } else {
          s = z.enum(f.enum as [string, ...string[]]);
        }
        break;
      default:
        s = z.unknown();
    }
    if (f.description) s = s.describe(f.description);
    if (f.optional) s = s.optional();
    shape[f.name] = s;
  }
  return z.object(shape);
}
