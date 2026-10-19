import type { ToolCallDelta } from "./types";

export type WireToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** Reassemble interleaved parallel calls without parsing partial JSON arguments. */
export class ToolCallAccumulator {
  private calls = new Map<number, WireToolCall>();

  add(deltas: ToolCallDelta[] = []) {
    for (const delta of deltas) {
      if (!Number.isInteger(delta.index) || delta.index < 0) {
        throw new Error("Model returned an invalid tool call index.");
      }
      const call = this.calls.get(delta.index) ?? {
        id: "", type: "function", function: { name: "", arguments: "" },
      };
      if (delta.id) call.id = delta.id;
      call.function.name += delta.function?.name ?? "";
      call.function.arguments += delta.function?.arguments ?? "";
      this.calls.set(delta.index, call);
    }
  }

  result(): WireToolCall[] {
    const calls = [...this.calls].sort(([a], [b]) => a - b).map(([, call]) => call);
    if (calls.some((call) => !call.id || !call.function.name)) {
      throw new Error("Model returned an incomplete tool call.");
    }
    return calls;
  }
}
