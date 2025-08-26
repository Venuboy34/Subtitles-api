# Movie Subtitle API

A Cloudflare Workers API for fetching movie subtitles with TMDB integration.

## Features
- Get subtitles by TMDB ID or IMDb ID
- Search subtitles by movie title
- Direct download links
- Multiple language support
- CORS enabled for web/app/bot usage

## API Endpoints
- `GET /api/subtitles/tmdb/{tmdb_id}` - Get subtitles by TMDB ID
- `GET /api/subtitles/imdb/{imdb_id}` - Get subtitles by IMDb ID
- `GET /api/download/{subtitle_id}` - Get direct download link
- `GET /api/search/{query}` - Search subtitles by title

## Usage
```bash
curl 'https://your-worker.workers.dev/api/subtitles/tmdb/550?lang=en&limit=20'
