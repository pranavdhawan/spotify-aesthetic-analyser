const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { OpenAI } = require('openai');
const JSON5 = require('json5')
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors({
    origin: "*"
}))
app.use(express.json())
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const REDIRECT_URI = process.env.REDIRECT_URI
const FRONTEND_URL = process.env.FRONTEND_URL

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


let tokenStore = {}

const sanitizeGPTResponse = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      // Remove common GPT formatting issues
      const sanitized = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/[\u2018\u2019]/g, "'")   // Smart single quotes
        .replace(/[\u201C\u201D]/g, '"')   // Smart double quotes
        .replace(/\\'/g, "'")              // Unescape single quotes
        .replace(/(\w)\s*:\s*([^,}]+)(?=,|})/g, '$1:"$2"') // Fix unquoted values
        .replace(/,(\s*})/g, '$1')         // Remove trailing commas
        .replace(/({|,)\s*(\w+)\s*:/g, '$1"$2":') // Quote keys
        .replace(/\/\/.*$/gm, '')          // Remove comments
        .replace(/\n/g, ' ')               // Remove newlines
        .trim();
  
      // Try parsing the sanitized version
      try {
        return JSON.parse(sanitized);
      } catch {
        // Fallback: Find valid JSON substring
        const jsonMatch = sanitized.match(/{.*}/s);
        if (jsonMatch) {
          return JSON5.parse(jsonMatch[0]);
        }
        throw new Error('Could not extract valid JSON');
      }
    }
  };

  const searchTrackWithImage = async (trackName, artistName, accessToken) => {
    try {
      const response = await axios.get(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${trackName} ${artistName}`)}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
  
      if (response.data.tracks.items.length > 0) {
        const track = response.data.tracks.items[0];
        return {
          name: trackName,
          artist: artistName,
          image: track.album.images[0]?.url || null,
          genre: track.album.genres?.[0] || "Unknown"
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch track image:', error);
      return null;
    }
  };
  
app.get('/login', (req, res) => {
    const scope = 'user-top-read playlist-read-private';
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=${scope}&show_dialog=true`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    try {
        const code = req.query.code;
        const tokenResponse = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
                },
            }
        );

        tokenStore = {
            accessToken: tokenResponse.data.access_token,
            refreshToken: tokenResponse.data.refresh_token,
            expiresAt: Date.now() + (tokenResponse.data.expires_in * 1000)
        };

        // res.redirect(`http://localhost:3000?access_token=${tokenStore.accessToken}`);
        res.redirect(`${process.env.FRONTEND_URL}#access_token=${tokenStore.accessToken}`)
    } catch (error) {
        console.error('Callback error:', error.response.data);
        res.status(500).send('Failed to fetch access token');
    }
});

app.get('/refresh', async (req, res) => {
    try {
        const refreshResponse = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokenStore.refreshToken,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                },
            }
        );

        tokenStore.accessToken = refreshResponse.data.access_token;
        res.json({ accessToken: tokenStore.accessToken });
    } catch (error) {
        console.error('Refresh failed:', error.response.data);
        res.status(500).send('Token refresh failed');
    }
});


app.get('/user-data', async (req, res) => {
    const accessToken = req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
        return res.status(401).send('Access token missing');
    }

    try {

        const playlistsResponse = await axios.get(
            'https://api.spotify.com/v1/me/playlists?limit=5',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const playlistsWithContent = await Promise.all(
            playlistsResponse.data.items.map(async (playlist) => {
              try {
                const tracksResponse = await axios.get(
                  `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=50`,
                  { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                
                return {
                  name: playlist.name || "Unnamed Playlist",
                  tracks: tracksResponse.data.items.map(item => ({
                    name: item.track?.name || "Unknown Track",
                    artist: item.track?.artists[0]?.name || "Unknown Artist",
                    popularity: item.track?.popularity || 0
                  }))
                };
              } catch (playlistError) {
                console.error(`Failed to fetch playlist ${playlist.id}:`, playlistError);
                return {
                  name: playlist.name || "Unnamed Playlist",
                  tracks: [],
                  error: true
                };
              }
            })
          );
      
      



        const [topArtists, topTracks] = await Promise.all([
            axios.get('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            }),
            axios.get('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            }),
        ])

          const tracks = topTracks.data.items.map(t => ({
            name: t.name,
            artist: t.artists[0].name,
            image: t.album.images.find(img => img.height === 300)?.url || t.album.images[0]?.url
          }));
          
          // For top artists
          const artists = topArtists.data.items.map(a => ({
            name: a.name,
            image: a.images.find(img => img.height === 300)?.url || a.images[0]?.url
          }));
          
          const playlists = playlistsResponse.data.items.map(p => ({
            name: p.name,
            image: p.images.find(img => img.height === 300)?.url || p.images[0]?.url
          }));
          

        res.json({
            topArtists: artists,
            topTracks: tracks,
            playlists: playlists
        });

    } catch (error) {
        console.error('Error fetching user data', error.response.data);
        res.status(500).send('Failed to fetch user data');
    }
});

app.post('/analyze', async (req, res) => {
    try {
        const { artists = [], tracks = [], playlists = [] } = req.body

        if (!Array.isArray(artists) || !Array.isArray(tracks) || !Array.isArray(playlists)) {
            return res.status(400).json({ error: "Invalid data format" });
          }

          const playlistAnalysis = playlists.map(p => {
            const playlistName = p?.name || "Unnamed Playlist";
            const playlistTracks = p?.tracks?.map(t => 
              `${t?.name || "Unknown Track"} by ${t?.artist || "Unknown Artist"}`
            ) || [];
            
            return `${playlistName}: ${playlistTracks.slice(0, 5).join(', ')}${playlistTracks.length > 5 ? '...' : ''}`;
          });
      
    const prompt = `Analyze user's Spotify data in three categories with specific tones:

1. Based on their top tracks (${tracks.map(t => t?.name).filter(Boolean).join(', ')}):
   - Nice: Complimentary analysis
   - Funny: Humorous observation
   - Roast: Savage but lighthearted critique

2. Based on their top artists (${artists.map(a => a?.name).filter(Boolean).join(', ')}):
   - Nice: Positive interpretation
   - Funny: Amusing perspective
   - Roast: Playful mockery


   3. Based on their playlist CONTENTS:
   ${playlistAnalysis.map(p => `   - "${p.name}" includes: ${p.tracks}`).join('\n')}
      - Nice: Insight about music curation patterns
      - Funny: Witty take on playlist organization
      - Roast: Savage observation about collection themes
   
Respond in strict JSON format:
{
  "tracks": {
    "nice": { "emoji": "🎧", "text": "..." },
    "funny": { "emoji": "🤣", "text": "..." },
    "roast": { "emoji": "🔥", "text": "..." }
  },
  "artists": { ... },
  "playlists": {
    "nice": { "emoji": "📚", "text": "..." },
    "funny": { "emoji": "🎢", "text": "..." },
    "roast": { "emoji": "💣", "text": "..." }
  },
  "recommendations": [
    { "name": "...", "artist": "..." },
    { "name": "...", "artist": "..." },
    { "name": "...", "artist": "..." },
    { "name": "...", "artist": "..." },
    { "name": "...", "artist": "..." }
  ]
}

Guidelines:
- For playlists, focus on ACTUAL TRACK CONTENT not just titles
- Highlight patterns like genre mix, era consistency, mood swings
- Reference specific track examples from playlist data
- Make roast funny but not mean-spirited
- Use emojis that match the analysis tone



Additional Guidelines for Recommendations:
- Suggest 5 songs from artists NOT in their current listening data
- Choose songs from different genres that match their taste profile
- Include song name and artist for each recommendation
- Focus on introducing them to new artists they might enjoy based on their current preferences
- Ensure recommended artists are different from ${artists.map(a => a?.name).filter(Boolean).join(', ')}


CRITICAL FORMATTING RULES:
1. Use ONLY valid JSON with proper escaping
2. Never use markdown formatting
3. Follow this EXACT structure:
{
  "tracks": {
    "nice": { "emoji": "🎧", "text": "..." },
    "funny": { "emoji": "🤣", "text": "..." },
    "roast": { "emoji": "🔥", "text": "..." }
  },
  "artists": { ... },
  "playlists": { ... },
  "recommendations": [
    { 
      "name": "...", 
      "artist": "...",
      "image": "https://i.scdn.co/image/...",
      "genre": "..."
    },
    { 
      "name": "...", 
      "artist": "...",
      "image": "https://i.scdn.co/image/...",
      "genre": "..."
    },
    { 
      "name": "...", 
      "artist": "...",
      "image": "https://i.scdn.co/image/...",
      "genre": "..."
    },
    { 
      "name": "...", 
      "artist": "...",
      "image": "https://i.scdn.co/image/...",
      "genre": "..."
    },
    { 
      "name": "...", 
      "artist": "...",
      "image": "https://i.scdn.co/image/...",
      "genre": "..."
    }
  ]
}

4. Never include comments or trailing commas
5. Keep text values under 150 characters
6. Use only regular quotes (no smart quotes)
7. Escape any internal quotes like \\"

`;

const gptResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 800,
    response_format: { type: "json_object" }
  });

  const rawResponse = gptResponse.choices[0].message.content;
  const analysis = sanitizeGPTResponse(rawResponse);
  
  if (analysis.recommendations) {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const updatedRecommendations = await Promise.all(
        analysis.recommendations.map(async (rec) => {
            const trackWithImage = await searchTrackWithImage(rec.name, rec.artist, accessToken);
            return trackWithImage || {
                name: rec.name,
                artist: rec.artist,
                image: 'https://placehold.co/300x300?text=Album+Art',
                genre: rec.genre || 'Unknown'
            };
        })
    );
    analysis.recommendations = updatedRecommendations;
}

  const requiredKeys = ['tracks', 'artists', 'playlists', 'recommendations'];
  if (!requiredKeys.every(k => analysis[k])) {
    throw new Error('Missing required analysis sections');
  }
  res.json(analysis);

    } catch (error) {
        console.error('GPT analysis failed:', error);
        res.status(500).json({
            error: "Analysis failed",
            details: error.message,
        });
      
    }
})




// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});