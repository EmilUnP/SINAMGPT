export type ParsedSseChunk = {
  event: string;
  data: unknown;
};

export const parseSseChunk = (raw: string): ParsedSseChunk | null => {
  const lines = raw.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (!dataLines.length) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) };
};
