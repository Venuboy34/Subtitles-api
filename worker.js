// Cloudflare Worker for Movie Subtitle API
// Deploy this to Cloudflare Workers

const TMDB_API_KEY = '3a08a646f83edac9a48438ac670a78b2';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const OPENSUBTITLES_BASE_URL = 'https://api.opensubtitles.org/en';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route: Get subtitles by TMDB ID
      if (path.startsWith('/api/subtitles/tmdb/')) {
        const tmdbId = path.split('/').pop();
        return await getSubtitlesByTmdbId(tmdbId, url.searchParams);
      }
      
      // Route: Get subtitles by IMDb ID
      if (path.startsWith('/api/subtitles/imdb/')) {
        const imdbId = path.split('/').pop();
        return await getSubtitlesByImdbId(imdbId, url.searchParams);
      }
      
      // Route: Get subtitle download link
      if (path.startsWith('/api/download/')) {
        const subtitleId = path.split('/').pop();
        return await getSubtitleDownloadLink(subtitleId);
      }
      
      // Route: Search subtitles by query
      if (path.startsWith('/api/search/')) {
        const query = path.split('/').pop();
        return await searchSubtitles(query, url.searchParams);
      }
      
      // Route: API documentation
      if (path === '/' || path === '/api') {
        return getApiDocumentation();
      }
      
      return new Response('Endpoint not found', { 
        status: 404,
        headers: corsHeaders 
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }
  }
};

// Get subtitles by TMDB ID
async function getSubtitlesByTmdbId(tmdbId, searchParams) {
  try {
    // First get movie details from TMDB
    const tmdbResponse = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
    );
    
    if (!tmdbResponse.ok) {
      throw new Error('Movie not found in TMDB');
    }
    
    const movieData = await tmdbResponse.json();
    const imdbId = movieData.imdb_id;
    
    if (!imdbId) {
      throw new Error('IMDb ID not found for this movie');
    }
    
    // Get subtitles using IMDb ID
    return await getSubtitlesByImdbId(imdbId.replace('tt', ''), searchParams, movieData);
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch subtitles',
      message: error.message 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

// Get subtitles by IMDb ID
async function getSubtitlesByImdbId(imdbId, searchParams, movieData = null) {
  try {
    const language = searchParams.get('lang') || 'all';
    const limit = searchParams.get('limit') || '50';
    
    // Clean IMDb ID (remove 'tt' if present)
    const cleanImdbId = imdbId.replace('tt', '');
    
    let searchUrl;
    if (language === 'all') {
      searchUrl = `${OPENSUBTITLES_BASE_URL}/search/sublanguageid-all/idmovie-${cleanImdbId}`;
    } else {
      searchUrl = `${OPENSUBTITLES_BASE_URL}/search/sublanguageid-${language}/idmovie-${cleanImdbId}`;
    }
    
    const response = await fetch(searchUrl);
    const html = await response.text();
    
    // Parse the HTML to extract subtitle information
    const subtitles = parseSubtitleResults(html);
    
    // Limit results
    const limitedSubtitles = subtitles.slice(0, parseInt(limit));
    
    return new Response(JSON.stringify({
      success: true,
      movie: movieData,
      imdb_id: `tt${cleanImdbId}`,
      total_results: subtitles.length,
      returned_results: limitedSubtitles.length,
      subtitles: limitedSubtitles
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch subtitles',
      message: error.message 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

// Get subtitle download link
async function getSubtitleDownloadLink(subtitleId) {
  try {
    const downloadUrl = `${OPENSUBTITLES_BASE_URL}/subtitleserve/sub/${subtitleId}`;
    
    // Test if the download link is valid
    const response = await fetch(downloadUrl, { method: 'HEAD' });
    
    if (response.ok) {
      return new Response(JSON.stringify({
        success: true,
        subtitle_id: subtitleId,
        download_url: downloadUrl,
        direct_download: true
      }), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    } else {
      throw new Error('Subtitle download link not available');
    }
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to get download link',
      message: error.message 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

// Search subtitles by query
async function searchSubtitles(query, searchParams) {
  try {
    const language = searchParams.get('lang') || 'all';
    const limit = searchParams.get('limit') || '50';
    
    // First search TMDB for movies matching the query
    const tmdbSearchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    const tmdbResponse = await fetch(tmdbSearchUrl);
    const tmdbData = await tmdbResponse.json();
    
    if (tmdbData.results && tmdbData.results.length > 0) {
      // Get the first movie result
      const movie = tmdbData.results[0];
      
      // Get full movie details to get IMDb ID
      const movieDetailsUrl = `${TMDB_BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}`;
      const movieDetailsResponse = await fetch(movieDetailsUrl);
      const movieDetails = await movieDetailsResponse.json();
      
      if (movieDetails.imdb_id) {
        // Get subtitles for this movie
        const subtitleParams = new URLSearchParams();
        if (language !== 'all') subtitleParams.set('lang', language);
        subtitleParams.set('limit', limit);
        
        return await getSubtitlesByImdbId(
          movieDetails.imdb_id.replace('tt', ''), 
          subtitleParams, 
          movieDetails
        );
      }
    }
    
    // Fallback: direct search on OpenSubtitles
    let searchUrl = `${OPENSUBTITLES_BASE_URL}/search/subs`;
    const response = await fetch(searchUrl);
    const html = await response.text();
    
    return new Response(JSON.stringify({
      success: true,
      query: query,
      message: 'No specific movie found. Try using TMDB ID or IMDb ID for better results.',
      suggestion: 'Use /api/subtitles/tmdb/{tmdb_id} or /api/subtitles/imdb/{imdb_id}'
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Search failed',
      message: error.message 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  }
}

// Parse subtitle results from HTML
function parseSubtitleResults(html) {
  const subtitles = [];
  
  // This is a simplified parser - in production you'd want a more robust HTML parser
  // Look for subtitle links and information in the HTML
  const subtitleRegex = /<a[^>]*href="\/en\/subtitles\/(\d+)\/[^"]*"[^>]*>([^<]+)<\/a>/g;
  const languageRegex = /<span[^>]*class="[^"]*flag[^"]*"[^>]*title="([^"]+)"/g;
  
  let subtitleMatch;
  let languageMatch;
  let index = 0;
  
  while ((subtitleMatch = subtitleRegex.exec(html)) !== null && index < 50) {
    const subtitleId = subtitleMatch[1];
    const subtitleName = subtitleMatch[2].trim();
    
    // Try to find corresponding language
    languageMatch = languageRegex.exec(html);
    const language = languageMatch ? languageMatch[1] : 'Unknown';
    
    subtitles.push({
      id: subtitleId,
      name: subtitleName,
      language: language,
      download_url: `${OPENSUBTITLES_BASE_URL}/subtitleserve/sub/${subtitleId}`,
      view_url: `${OPENSUBTITLES_BASE_URL}/subtitles/${subtitleId}`,
      api_download_endpoint: `/api/download/${subtitleId}`
    });
    
    index++;
  }
  
  return subtitles;
}

// API Documentation
function getApiDocumentation() {
  const documentation = {
    title: "Movie Subtitle API",
    version: "1.0.0",
    description: "API for fetching movie subtitles with TMDB integration",
    endpoints: {
      "GET /api/subtitles/tmdb/{tmdb_id}": {
        description: "Get subtitles by TMDB movie ID",
        parameters: {
          "lang": "Language code (optional, default: 'all')",
          "limit": "Number of results (optional, default: 50)"
        },
        example: "/api/subtitles/tmdb/550?lang=en&limit=20"
      },
      "GET /api/subtitles/imdb/{imdb_id}": {
        description: "Get subtitles by IMDb movie ID",
        parameters: {
          "lang": "Language code (optional, default: 'all')",
          "limit": "Number of results (optional, default: 50)"
        },
        example: "/api/subtitles/imdb/0137523?lang=en&limit=20"
      },
      "GET /api/download/{subtitle_id}": {
        description: "Get direct download link for a subtitle",
        parameters: {},
        example: "/api/download/13241133"
      },
      "GET /api/search/{query}": {
        description: "Search for movie subtitles by title",
        parameters: {
          "lang": "Language code (optional, default: 'all')",
          "limit": "Number of results (optional, default: 50)"
        },
        example: "/api/search/Fight Club?lang=en&limit=10"
      }
    },
    supported_languages: [
      "en (English)", "es (Spanish)", "fr (French)", "de (German)", 
      "it (Italian)", "pt (Portuguese)", "ru (Russian)", "ja (Japanese)",
      "ko (Korean)", "zh (Chinese)", "ar (Arabic)", "all (All languages)"
    ],
    response_format: {
      success: true,
      movie: "Movie information from TMDB (when available)",
      imdb_id: "IMDb ID",
      total_results: "Total number of subtitles found",
      returned_results: "Number of subtitles returned",
      subtitles: [
        {
          id: "Subtitle ID",
          name: "Subtitle filename",
          language: "Subtitle language",
          download_url: "Direct download URL",
          view_url: "OpenSubtitles page URL",
          api_download_endpoint: "API endpoint for download"
        }
      ]
    },
    usage_examples: {
      curl: [
        "curl 'https://your-worker.your-subdomain.workers.dev/api/subtitles/tmdb/550'",
        "curl 'https://your-worker.your-subdomain.workers.dev/api/subtitles/imdb/0137523?lang=en'",
        "curl 'https://your-worker.your-subdomain.workers.dev/api/download/13241133'",
        "curl 'https://your-worker.your-subdomain.workers.dev/api/search/Inception?lang=en&limit=10'"
      ],
      javascript: [
        "fetch('/api/subtitles/tmdb/550').then(r => r.json()).then(console.log)",
        "fetch('/api/download/13241133').then(r => r.json()).then(console.log)"
      ]
    }
  };

  return new Response(JSON.stringify(documentation, null, 2), {
    headers: { 
      'Content-Type': 'application/json',
      ...corsHeaders 
    }
  });
}
