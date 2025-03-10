import { useState, useEffect } from 'react'
import './App.css'
import React from 'react'
import axios from '../node_modules/axios';

function App() {

  const [accessToken, setAccessToken] = useState('')
  const [userData, setUserData] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.substring(1)).get('access_token')
    if (token) {
      setAccessToken(token)
      localStorage.setItem('spotify_token', token);
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  // useEffect(() => {
  //   if (analysisData) {
  //     console.log('Analysis data updated:', analysisData);
  //   }
  // }, [analysisData]);

  const fetchUserData = async () => {
    try {
      const response = await axios.get('https://spotify-aesthetic-analyser-backend.vercel.app/user-data', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      setUserData(response.data)
    } catch (error) {
      console.error('Failed to fetch data: ', error)
      alert('Failed to load music data!')
    }
  }


  const analyzeAesthetic = async () => {
    try {
      const response = await axios.post(
        'https://spotify-aesthetic-analyser-backend.vercel.app/analyze',
        {
          artists: userData?.topArtists || [],
          tracks: userData?.topTracks || [],
          playlists: userData?.playlists || []
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        })
      if (response.data.error) {
        alert(`Error: ${response.data.error}\n${response.data.gptResponse || ''}`);
      } else {
        console.log('Setting analysis data:', response.data);
        setAnalysisData(response.data);
      }
    } catch (error) {
      console.error('Analysis failed:', error.response?.data || error.message);
      alert(`Analysis failed: ${error.response?.data?.details || error.message}`);
    }
  };
const ImageRow = ({ title, items }) => (
  <div className="mb-8 w-full">
    <h3 className="text-xl font-bold mb-4">{title}</h3>
    <div className="flex flex-row gap-4 overflow-x-auto pb-4 w-full">
      {items?.map((item, index) => (
        <div key={index} className="flex-shrink-0 w-32">
          <img
            src={item.image || '/placeholder-music.jpg'}
            alt={item.name}
            className="w-32 h-32 rounded-lg object-cover shadow-lg hover:scale-105 transition-transform"
          />
          <p className="mt-2 text-sm text-gray-600 truncate">
            {item.name}
          </p>
        </div>
      ))}
    </div>
  </div>
);
  const AnalysisSection = ({ title, data, testId }) => {
    if (!data || typeof data !== 'object') {
      console.error('Invalid AnalysisSection data:', data);
      return null;
    }

    return (
      <div data-testid={testId} className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(data).map(([type, content]) => (
            <div key={type} className={`p-4 rounded-lg ${type === 'nice' ? 'bg-green-50' :
              type === 'funny' ? 'bg-yellow-50' : 'bg-red-50'
              }`}>
              {content?.emoji && content?.text ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    {/* <h3 className="font-medium capitalize">{type}</h3> */}
                    <span className="text-2xl">{content.text} {content.emoji}</span>
                  </div>
                </>
              ) : (
                <div className="text-red-500">
                  Invalid analysis content for {type}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };


  const RecommendationsSection = ({ recommendations }) => {
    if (!recommendations || !Array.isArray(recommendations)) return null;

    return (
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Recommended Songs</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {recommendations.map((song, index) => (
            <a
              key={index}
              href={`https://open.spotify.com/search/${encodeURIComponent(`${song.name} ${song.artist}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:bg-purple-50 p-3 rounded-lg transition-colors"
            >
              <div className="aspect-square w-full">
                <img
                  src={song.image || 'https://placehold.co/300x300?text=Album+Art'}
                  alt={`${song.name} album art`}
                  className="w-full h-full object-cover rounded-lg shadow-lg"
                />
              </div>
              <div className="mt-4 text-center">
                <h3 className="font-medium text-sm truncate">{song.name}</h3>
                <p className="text-xs text-gray-600 truncate">{song.artist}</p>
                <p className="text-xs text-gray-500 mt-1">{song.genre}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Spotify Aesthetic Analyzer</h1>

        {!accessToken ? (
          <a
            href="https://spotify-aesthetic-analyser-backend.vercel.app/login"
            className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition"
          >
            Login with Spotify
          </a>
        ) : (
          <div className="space-y-6 max-w-full">
            <button
              onClick={fetchUserData}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition"
            >
              Load My Music Data
            </button>

            {userData && (
              <div className="space-y-8 overflow-hidden">
                {/* Artists Row */}
                <ImageRow
                  title="Top Artists"
                  items={userData.topArtists}
                />

                {/* Tracks Row */}
                <ImageRow
                  title="Top Tracks"
                  items={userData.topTracks}
                />

                {/* Playlists Row */}
                <ImageRow
                  title="Your Playlists"
                  items={userData.playlists}
                />
              </div>
            )}

            {userData && (
              // Update the button to:
              <button
                onClick={analyzeAesthetic}
                className="w-full bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 transition"
              >
                Analyze My Aesthetic
              </button>
            )}

            {analysisData && (
              <div className="space-y-8">

                {analysisData.artists && (
                  <AnalysisSection
                    title="Based on Your Artists"
                    data={analysisData.artists}
                    testId="artists-analysis"
                  />
                )}

                {analysisData.playlists && (
                  <AnalysisSection
                    title="Based on Your Playlists"
                    data={analysisData.playlists}
                    testId="playlists-analysis"
                  />
                )}

                {analysisData.tracks && (
                  <AnalysisSection
                    title="Based on Your Tracks"
                    data={analysisData.tracks}
                    testId="tracks-analysis"
                  />
                )}

                {analysisData.recommendations && (
                  <RecommendationsSection recommendations={analysisData.recommendations} />
                )}

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
