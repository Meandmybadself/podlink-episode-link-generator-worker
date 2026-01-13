import { XMLParser } from "fast-xml-parser";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RequestBody {
  showName: string;
  episodeTitle: string;
}

interface ApplePodcastResult {
  collectionId: number;
  collectionName: string;
  feedUrl: string;
}

interface AppleSearchResponse {
  resultCount: number;
  results: ApplePodcastResult[];
}

interface RSSItem {
  title: string;
  guid: string | { "#text": string };
}

interface RSSChannel {
  title: string;
  item: RSSItem | RSSItem[];
}

interface RSSFeed {
  rss: {
    channel: RSSChannel;
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Normalizes text for fuzzy matching (lowercase, trim, collapse whitespace)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Checks if two strings are a fuzzy match
 */
function fuzzyMatch(a: string, b: string): boolean {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

/**
 * Extracts the GUID value from either a string or an object with #text
 */
function extractGuid(guid: string | { "#text": string }): string {
  if (typeof guid === "string") {
    return guid;
  }
  return guid["#text"];
}

/**
 * Converts a string to URL-safe base64 without padding
 * Uses Web APIs instead of Node.js Buffer
 */
function toUrlSafeBase64(input: string): string {
  // Convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Convert to base64 using btoa with binary string
  const binaryString = String.fromCharCode(...data);
  const base64 = btoa(binaryString);

  // Make URL-safe: replace + with -, / with _, and strip = padding
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// -----------------------------------------------------------------------------
// Apple Podcasts Search
// -----------------------------------------------------------------------------

async function searchApplePodcasts(
  showName: string
): Promise<ApplePodcastResult | null> {
  const searchUrl = new URL("https://itunes.apple.com/search");
  searchUrl.searchParams.set("term", showName);
  searchUrl.searchParams.set("media", "podcast");
  searchUrl.searchParams.set("entity", "podcast");
  searchUrl.searchParams.set("limit", "10");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Apple Search API error: ${response.status}`);
  }

  const data: AppleSearchResponse = await response.json();

  if (data.resultCount === 0 || data.results.length === 0) {
    return null;
  }

  // Try to find an exact or fuzzy match on the show name
  const exactMatch = data.results.find(
    (r) => normalizeText(r.collectionName) === normalizeText(showName)
  );

  if (exactMatch) {
    return exactMatch;
  }

  // Fallback to fuzzy match
  const fuzzyMatchResult = data.results.find((r) =>
    fuzzyMatch(r.collectionName, showName)
  );

  // If no fuzzy match, return the first result
  return fuzzyMatchResult || data.results[0];
}

// -----------------------------------------------------------------------------
// RSS Feed Parsing
// -----------------------------------------------------------------------------

async function fetchAndParseRSSFeed(feedUrl: string): Promise<RSSItem[]> {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/xml, application/rss+xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status}`);
  }

  const xmlText = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  });

  const parsed: RSSFeed = parser.parse(xmlText);

  const channel = parsed.rss?.channel;
  if (!channel) {
    throw new Error("Invalid RSS feed structure");
  }

  // Handle both single item and array of items
  const items = channel.item;
  if (!items) {
    return [];
  }

  return Array.isArray(items) ? items : [items];
}

function findEpisode(episodes: RSSItem[], episodeTitle: string): RSSItem | null {
  // Try exact match first
  const exactMatch = episodes.find(
    (ep) => normalizeText(ep.title) === normalizeText(episodeTitle)
  );

  if (exactMatch) {
    return exactMatch;
  }

  // Try fuzzy match
  const fuzzyMatchResult = episodes.find((ep) =>
    fuzzyMatch(ep.title, episodeTitle)
  );

  return fuzzyMatchResult || null;
}

// -----------------------------------------------------------------------------
// Response Helpers
// -----------------------------------------------------------------------------

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Only allow POST
    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed. Use POST." },
        405
      );
    }

    // Parse and validate request body
    let body: Partial<RequestBody>;

    try {
      body = await request.json();
    } catch (error) {
      return jsonResponse(
        { error: "Invalid JSON body" },
        400
      );
    }

    if (!body.showName || typeof body.showName !== "string") {
      return jsonResponse(
        { error: "Missing or invalid 'showName' field" },
        400
      );
    }

    if (!body.episodeTitle || typeof body.episodeTitle !== "string") {
      return jsonResponse(
        { error: "Missing or invalid 'episodeTitle' field" },
        400
      );
    }

    const { showName, episodeTitle } = body;

    try {
      // Step 1: Search Apple Podcasts for the show
      const podcast = await searchApplePodcasts(showName);

      if (!podcast) {
        return jsonResponse(
          {
            error: "Podcast not found",
            message: `No podcast found matching "${showName}"`,
          },
          404
        );
      }

      if (!podcast.feedUrl) {
        return jsonResponse(
          {
            error: "No feed URL",
            message: `Podcast "${podcast.collectionName}" has no RSS feed URL`,
          },
          404
        );
      }

      // Step 2: Fetch and parse the RSS feed
      const episodes = await fetchAndParseRSSFeed(podcast.feedUrl);

      if (episodes.length === 0) {
        return jsonResponse(
          {
            error: "No episodes",
            message: `Podcast "${podcast.collectionName}" has no episodes`,
          },
          404
        );
      }

      // Step 3: Find the matching episode
      const episode = findEpisode(episodes, episodeTitle);

      if (!episode) {
        return jsonResponse(
          {
            error: "Episode not found",
            message: `No episode found matching "${episodeTitle}" in "${podcast.collectionName}"`,
            availableEpisodes: episodes.slice(0, 5).map((ep) => ep.title),
          },
          404
        );
      }

      // Step 4: Extract GUID and generate URL-safe base64
      const guid = extractGuid(episode.guid);
      const base64Guid = toUrlSafeBase64(guid);

      // Step 5: Build the Podlink URL
      const podlinkUrl = `https://pod.link/${podcast.collectionId}/episode/${base64Guid}`;

      return jsonResponse({
        podlinkUrl,
        podcast: {
          name: podcast.collectionName,
          appleId: podcast.collectionId,
        },
        episode: {
          title: episode.title,
          guid,
        },
      });
    } catch (error) {
      console.error("Error processing request:", error);

      const message =
        error instanceof Error ? error.message : "Unknown error occurred";

      return jsonResponse(
        {
          error: "Internal server error",
          message,
        },
        500
      );
    }
  },
};
