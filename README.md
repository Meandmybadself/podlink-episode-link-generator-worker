# Podlink Cloudflare Worker

A Cloudflare Worker that generates Podlink URLs from podcast show names and episode titles.

## Features

- Searches Apple Podcasts API for podcast shows
- Fetches and parses RSS feeds to find specific episodes
- Generates Podlink URLs for cross-platform podcast sharing
- Fuzzy matching for show names and episode titles
- CORS-enabled for browser requests

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
npm run dev
```

3. Configure DNS (Required before deployment):
   - Ensure `meandmybadself.com` is added to your Cloudflare account
   - Create a DNS record for `podlink.meandmybadself.com` (can be a dummy A/AAAA record or proxied CNAME)
   - The Worker route binding will intercept requests to this subdomain

4. Deploy to Cloudflare:
```bash
npm run deploy
```

## API Usage

### Endpoint

```
POST /
```

### Request Body

```json
{
  "showName": "The Daily",
  "episodeTitle": "Episode Title Here"
}
```

### Success Response

```json
{
  "podlinkUrl": "https://pod.link/1234567890/episode/abc123def",
  "podcast": {
    "name": "The Daily",
    "appleId": 1234567890
  },
  "episode": {
    "title": "Episode Title Here",
    "guid": "episode-guid-from-rss"
  }
}
```

### Error Responses

- `400` - Invalid request body
- `404` - Podcast or episode not found
- `405` - Method not allowed (only POST accepted)
- `500` - Internal server error

## Example Request

```bash
curl -X POST https://podlink.meandmybadself.com \
  -H "Content-Type: application/json" \
  -d '{
    "showName": "The Daily",
    "episodeTitle": "Latest Episode"
  }'
```

## Development

- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run tail` - Stream logs from deployed worker

## License

ISC
