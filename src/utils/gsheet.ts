import axios from "axios";
import { parse } from "csv-parse/sync";
import type { SheetStory } from "../commands/library.js";
import { CONFIG } from "../config/resolved.js";

/**
 * Pure CSV-row → story mapping. Columns: title, genre, content, [author].
 * Rows missing any required field (title/genre/content) are dropped; a blank
 * author column is omitted rather than stored as "".
 */
export function rowsToStories(records: string[][]): SheetStory[] {
  const stories: SheetStory[] = [];
  for (const row of records) {
    const title = row[0]?.trim();
    const genre = row[1]?.trim();
    const content = row[2]?.trim();
    if (!title || !genre || !content) continue;
    const author = row[3]?.trim() || undefined;
    stories.push({ title, genre, content, ...(author ? { author } : {}) });
  }
  return stories;
}

export async function fetchStoriesFromGoogleSheet(): Promise<SheetStory[]> {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.library.sheetId}/export?format=csv&gid=0`;

  const response = await axios.get<string>(url, {
    responseType: "text",
    timeout: 10_000,
    validateStatus: (status) => status === 200,
  });

  // Basic sanity check: Google sometimes returns HTML error pages
  if (response.data.startsWith("<")) {
    throw new Error("Google Sheet returned non-CSV content");
  }

  const records = parse(response.data, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  return rowsToStories(records);
}
