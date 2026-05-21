import axios from "axios";
import { logger } from "../../lib/logger.js";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  try {
    const resp = await axios.get("https://api.duckduckgo.com/", {
      params: {
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
        no_redirect: "1",
      },
      timeout: 10000,
      headers: { "User-Agent": "Nova-AI-Bot/1.0" },
    });

    const data = resp.data;
    const results: SearchResult[] = [];

    if (data.AbstractText && data.AbstractText.length > 10) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || data.AbstractSource || "",
      });
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] || topic.Text.substring(0, 60),
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
      }
    }

    if (data.Results && Array.isArray(data.Results)) {
      for (const r of data.Results.slice(0, 3)) {
        if (r.Text && r.FirstURL) {
          results.push({ title: r.Title || r.Text.substring(0, 60), snippet: r.Text, url: r.FirstURL });
        }
      }
    }

    return results.slice(0, 5);
  } catch (err) {
    logger.warn({ err }, "Web search failed");
    return [];
  }
}

export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No results found for: "${query}"`;
  }
  const lines = results.map((r, i) => {
    const title = r.title.substring(0, 80);
    const snippet = r.snippet.substring(0, 200);
    const url = r.url ? `\n🔗 ${r.url}` : "";
    return `${i + 1}. ${title}\n${snippet}${url}`;
  });
  return `🔍 Search: ${query}\n\n${lines.join("\n\n")}`;
}
