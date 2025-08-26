// index.js - Cloudflare Worker main file
const BASE_URL = 'https://www.opensubtitles.org';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

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
      const sublanguageid = params.get('sublanguageid') || 'all';
      const page = params.get('page') || '1';
      
      const searchUrl = `${BASE_URL}/en/search2/sublanguageid-${sublanguageid}/moviename-${encodeURIComponent(query)}/page-${page}`;
      const searchResults = await scrapeSearchResults(searchUrl);
      
      return new Response(JSON.stringify({ success: true, data: searchResults }), { headers });
    }
    
    // Route: Get subtitles by movie ID
    else if (path === '/subtitles' && params.get('idmovie')) {
      const idmovie = params.get('idmovie');
      const sublanguageid = params.get('sublanguageid') || 'all';
      
      const searchUrl = `${BASE_URL}/en/search/sublanguageid-${sublanguageid}/idmovie-${idmovie}`;
      const subtitles = await scrapeSubtitlesList(searchUrl);
      
      return new Response(JSON.stringify({ success: true, data: subtitles }), { headers });
    }
    
    // Route: Get download link
    else if (path === '/download' && params.get('id')) {
      const id = params.get('id');
      
      const downloadUrl = await getDownloadLink(id);
      
      return new Response(JSON.stringify({ success: true, downloadUrl }), { headers });
    }
    
    // Route: Direct download (proxies the file)
    else if (path === '/direct' && params.get('id')) {
      const id = params.get('id');
      
      const downloadUrl = await getDownloadLink(id);
      
      // Fetch the subtitle file
      const subtitleResponse = await fetch(downloadUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': `${BASE_URL}/en/subtitles/${id}`
        }
      });
      
      if (!subtitleResponse.ok) {
        throw new Error(`Failed to fetch subtitle: ${subtitleResponse.status}`);
      }
      
      const subtitleContent = await subtitleResponse.text();
      
      return new Response(subtitleContent, { 
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': `attachment; filename="subtitle-${id}.srt"`
        }
      });
    }
    
    // Health check endpoint
    else if (path === '/health') {
      return new Response(JSON.stringify({ success: true, status: 'OK' }), { headers });
    }
    
    // Invalid route
    else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid endpoint. Available endpoints: /search?query=NAME, /subtitles?idmovie=ID, /download?id=ID, /direct?id=ID' 
        }), 
        { headers, status: 400 }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { headers, status: 500 }
    );
  }
}

// Scrape search results by movie name
async function scrapeSearchResults(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch search results: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Use regex to extract movie information
  const moviePattern = /<a href="\/en\/search\/sublanguageid-[^"]+\/idmovie-(\d+)"[^>]*>([^<]+)<\/a>/g;
  
  const movies = [];
  let match;
  
  while ((match = moviePattern.exec(html)) !== null) {
    movies.push({
      id: match[1],
      title: match[2].trim()
    });
  }
  
  return movies;
}

// Scrape subtitles list for a specific movie
async function scrapeSubtitlesList(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch subtitles list: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Use regex to extract subtitle information
  const subtitlePattern = /<tr[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<strong[^>]*>([^<]+)<\/strong>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<span class="[^"]*flags[^"]* ([^"]*)"[^>]*>[\s\S]*?<\/tr>/g;
  
  const subtitles = [];
  let match;
  
  while ((match = subtitlePattern.exec(html)) !== null) {
    subtitles.push({
      id: match[1],
      name: match[2].trim(),
      uploader: match[3].trim(),
      downloads: match[4].trim(),
      language: match[5],
      downloadUrl: `${BASE_URL}/en/subtitleserve/sub/${match[1]}`
    });
  }
  
  return subtitles;
}

// Get download link for a specific subtitle ID
async function getDownloadLink(id) {
  const detailUrl = `${BASE_URL}/en/subtitles/${id}`;
  
  const response = await fetch(detailUrl, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch subtitle details: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Look for the download form or link
  const downloadPattern = /<a href="(\/en\/subtitleserve\/sub\/\d+[^"]*)"[^>]*download[^>]*>/i;
  const match = html.match(downloadPattern);
  
  if (match && match[1]) {
    return BASE_URL + match[1];
  }
  
  // Alternative method: check for form action
  const formPattern = /<form[^>]*action="(\/en\/subtitleserve\/sub\/\d+[^"]*)"[^>]*>/i;
  const formMatch = html.match(formPattern);
  
  if (formMatch && formMatch[1]) {
    return BASE_URL + formMatch[1];
  }
  
  throw new Error('Download link not found');
}

// Event listener for Cloudflare Workers
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
