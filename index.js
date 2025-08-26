const BASE_URL = 'https://www.opensubtitles.org';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const params = url.searchParams;

  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    // Route: Search by movie name
    if (path === '/search' && params.get('query')) {
      const query = params.get('query');
      const language = params.get('lang') || 'all';
      const results = await searchSubtitles(query, language);
      return new Response(JSON.stringify({ success: true, data: results }), { headers });
    }
    
    // Route: Get download link
    else if (path === '/download' && params.get('id')) {
      const id = params.get('id');
      const downloadUrl = await getDownloadLink(id);
      return new Response(JSON.stringify({ success: true, downloadUrl }), { headers });
    }
    
    // Route: Direct download
    else if (path === '/direct' && params.get('id')) {
      const id = params.get('id');
      const subtitleContent = await downloadSubtitle(id);
      return new Response(subtitleContent, { 
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': `attachment; filename="subtitle-${id}.srt"`
        }
      });
    }
    
    // Health check
    else if (path === '/health') {
      return new Response(JSON.stringify({ success: true, status: 'OK', timestamp: new Date().toISOString() }), { headers });
    }
    
    // Help endpoint
    else {
      const help = {
        endpoints: {
          search: '/search?query=MOVIE_NAME&lang=LANGUAGE_CODE',
          download: '/download?id=SUBTITLE_ID',
          direct: '/direct?id=SUBTITLE_ID',
          health: '/health'
        },
        examples: {
          search: '/search?query=inception&lang=en',
          download: '/download?id=123456',
          direct: '/direct?id=123456'
        }
      };
      return new Response(JSON.stringify(help), { headers });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { headers, status: 500 }
    );
  }
}

// Search subtitles by movie name
async function searchSubtitles(query, language = 'all') {
  const searchUrl = `${BASE_URL}/en/search2/sublanguageid-${language}/moviename-${encodeURIComponent(query)}`;
  
  const response = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });
  
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  
  const html = await response.text();
  const results = [];
  
  // Simple regex to extract movie information
  const regex = /idmovie-(\d+)[^>]*>([^<]+)</g;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    if (match[1] && match[2]) {
      results.push({
        id: match[1],
        title: match[2].trim(),
        searchUrl: `${BASE_URL}/en/search/sublanguageid-${language}/idmovie-${match[1]}`
      });
    }
  }
  
  return results;
}

// Get download link for a subtitle ID
async function getDownloadLink(id) {
  return `${BASE_URL}/en/subtitleserve/sub/${id}`;
}

// Download subtitle content
async function downloadSubtitle(id) {
  const downloadUrl = await getDownloadLink(id);
  
  const response = await fetch(downloadUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': `${BASE_URL}/en/subtitles/${id}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  
  return await response.text();
}

// Cloudflare Worker event listener
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
