export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  injectedMemoryIds?: string[];
  streaming?: boolean;
  /** Tool calls the assistant made during this turn (memory ops). */
  toolEvents?: {
    name: string;
    summary: string; // human-readable: "saved memory", "searched 'X' → 3 hits"
    ok: boolean;
  }[];
};

export const seedMessages: Message[] = [];
