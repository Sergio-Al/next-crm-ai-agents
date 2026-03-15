// Plugin hook system (inspired by DenchClaw's architecture)

export type HookEvent =
  | "before_tool_call"
  | "after_tool_call"
  | "agent_end"
  | "message_received"
  | "session_start"
  | "session_end";

type HookFn = (data: unknown, ctx: unknown) => Promise<void> | void;

type HookEntry = {
  fn: HookFn;
  priority: number;
  name?: string;
};

export class PluginManager {
  private hooks = new Map<HookEvent, HookEntry[]>();

  /**
   * Register a hook for a specific event.
   * Lower priority numbers execute first.
   */
  on(event: HookEvent, fn: HookFn, opts?: { priority?: number; name?: string }) {
    const list = this.hooks.get(event) ?? [];
    list.push({
      fn,
      priority: opts?.priority ?? 0,
      name: opts?.name,
    });
    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, list);
  }

  /**
   * Remove a hook by reference or name.
   */
  off(event: HookEvent, fnOrName: HookFn | string) {
    const list = this.hooks.get(event);
    if (!list) return;

    const filtered = list.filter((entry) =>
      typeof fnOrName === "string"
        ? entry.name !== fnOrName
        : entry.fn !== fnOrName,
    );
    this.hooks.set(event, filtered);
  }

  /**
   * Emit an event, calling all registered hooks in priority order.
   */
  async emit(event: HookEvent, data: unknown, ctx: unknown): Promise<void> {
    const list = this.hooks.get(event);
    if (!list) return;

    for (const hook of list) {
      await hook.fn(data, ctx);
    }
  }

  /**
   * Get the count of registered hooks for an event.
   */
  count(event: HookEvent): number {
    return this.hooks.get(event)?.length ?? 0;
  }

  /**
   * List all registered hook events and their counts.
   */
  listEvents(): Record<HookEvent, number> {
    const result = {} as Record<HookEvent, number>;
    for (const [event, list] of this.hooks) {
      result[event] = list.length;
    }
    return result;
  }
}

// Singleton plugin manager instance
export const pluginManager = new PluginManager();
