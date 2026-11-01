import type { Session } from "./model";
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
