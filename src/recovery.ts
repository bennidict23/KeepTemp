import type { Session, Message } from "./model";
export function context(s: Session) {
  return s.messages.map((m) => `[${m.role}]\n${m.text}`).join("\n\n");
}
export function markdown(s: Session) {
  return (
    `# ${s.title.replace(/[\r\n]/g, " ")}\n\n` +
    s.messages.map((m) => `## ${m.role}\n\n${m.text}`).join("\n\n")
  );
}
export function json(s: Session) {
  return JSON.stringify({ version: 1, session: s }, null, 2);
}
export function longContext(s: Session) {
  return context(s).length > 24000;
} // heuristic, not a token limit
export function importText(text: string, title: string): Session {
  if (!text.trim() || text.length > 2_000_000)
    throw new Error("invalid-import");
  // Strict JSON envelope or explicit role delimiters. Never guess roles from prose.
  let messages: Message[];
  const now = Date.now();
  if (text.trimStart().startsWith("{")) {
    const v = JSON.parse(text);
    if (v.version !== 1 || !v.session || !Array.isArray(v.session.messages))
      throw new Error("invalid-import");
    messages = v.session.messages.map((m: unknown, i: number) => {
      const x = m as Partial<Message>;
      if (
        !x ||
        (x.role !== "user" && x.role !== "assistant") ||
        typeof x.text !== "string"
      )
        throw new Error("invalid-import");
      return {
        id: crypto.randomUUID(),
        role: x.role,
        text: x.text,
        order: i,
        createdAt: now,
        updatedAt: now,
      };
    });
    title =
      title ||
      (typeof v.session.title === "string"
        ? v.session.title.slice(0, 100)
        : "Imported chat");
  } else {
    const re = /^\[(user|assistant)\]\r?\n/gm;
    const matches = [...text.matchAll(re)];
    if (!matches.length || matches[0]!.index !== 0)
      throw new Error("role-markers-required");
    messages = matches.map((m, i) => ({
      id: crypto.randomUUID(),
      role: m[1] as Message["role"],
      text: text
        .slice(m.index! + m[0].length, matches[i + 1]?.index ?? text.length)
        .replace(/\r?\n\r?\n$/, ""),
      order: i,
      createdAt: now,
      updatedAt: now,
    }));
  }
  if (!messages.length || messages.length > 10000)
    throw new Error("invalid-import");
  return {
    id: `manual:${crypto.randomUUID()}`,
    source: "manual",
    title: title || messages[0]!.text.slice(0, 70) || "Imported chat",
    createdAt: now,
    updatedAt: now,
    messages,
  };
}
