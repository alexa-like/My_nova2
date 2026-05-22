import axios from "axios";
import { logger } from "../../lib/logger.js";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function extractRealUrl(href: string): string {
  const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    try { return decodeURIComponent(uddgMatch[1]); } catch {}
  }
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return "https:" + href;
  return href;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function scrapeHtmlResults(query: string): Promise<SearchResult[]> {
  const resp = await axios.post(
    "https://lite.duckduckgo.com/lite/",
    new URLSearchParams({ q: query, kl: "us-en" }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 12000,
      responseType: "text",
    }
  );

  const html = resp.data as string;
  const results: SearchResult[] = [];

  const linkPatternClass = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const linkPatternUddg = /<a[^>]+href="([^"]*uddg=[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;

  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = linkPatternClass.exec(html)) !== null && links.length < 8) {
    const url = extractRealUrl(m[1]);
    const title = stripHtml(m[2]);
    if (url.startsWith("http") && title.length > 2) {
      links.push({ url, title });
    }
  }

  if (links.length === 0) {
    while ((m = linkPatternUddg.exec(html)) !== null && links.length < 8) {
      const url = extractRealUrl(m[1]);
      const title = stripHtml(m[2]);
      if (url.startsWith("http") && !url.includes("duckduckgo.com") && title.length > 2) {
        links.push({ url, title });
      }
    }
  }

  const snippets: string[] = [];
  while ((m = snippetPattern.exec(html)) !== null && snippets.length < 8) {
    const snippet = stripHtml(m[1]);
    if (snippet.length > 10) snippets.push(snippet);
  }

  for (let i = 0; i < Math.min(links.length, 5); i++) {
    results.push({
      title: links[i].title,
      snippet: snippets[i] || links[i].title,
      url: links[i].url,
    });
  }

  return results;
}

async function instantAnswerFallback(query: string): Promise<SearchResult[]> {
  try {
    const resp = await axios.get("https://api.duckduckgo.com/", {
      params: { q: query, format: "json", no_html: "1", skip_disambig: "1", no_redirect: "1" },
      timeout: 10000,
      headers: { "User-Agent": "Nova-AI-Bot/1.0" },
    });
    const data = resp.data;
    const results: SearchResult[] = [];
    if (data.AbstractText && data.AbstractText.length > 10) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL || data.AbstractSource || "" });
    }
    for (const topic of (data.RelatedTopics || []).slice(0, 4)) {
      if (topic.Text && topic.FirstURL) {
        results.push({ title: topic.Text.split(" - ")[0].substring(0, 80), snippet: topic.Text, url: topic.FirstURL });
      }
    }
    for (const r of (data.Results || []).slice(0, 3)) {
      if (r.Text && r.FirstURL) {
        results.push({ title: r.Title || r.Text.substring(0, 60), snippet: r.Text, url: r.FirstURL });
      }
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  try {
    const results = await scrapeHtmlResults(query);
    if (results.length > 0) return results;
    logger.warn({ query }, "HTML scrape returned no results, falling back to instant answer API");
    return await instantAnswerFallback(query);
  } catch (err) {
    logger.warn({ err }, "Web search HTML scrape failed, falling back to instant answer API");
    return await instantAnswerFallback(query);
  }
}

export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `No results found for: "${query}"`;
  const lines = results.map((r, i) => {
    const title = r.title.substring(0, 80);
    const snippet = r.snippet.substring(0, 250);
    const url = r.url ? `\n🔗 ${r.url}` : "";
    return `${i + 1}. ${title}\n${snippet}${url}`;
  });
  return `🔍 Search: ${query}\n\n${lines.join("\n\n")}`;
}
