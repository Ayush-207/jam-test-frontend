import React, { useState, useEffect, useRef } from 'react';
import { Music, Users, Play, Pause, SkipForward, RefreshCw, LogOut, Search, X } from 'lucide-react';

// Backend API base URL
const API_BASE = 'https://jam-test-backend.onrender.com'; // Update with your backend URL

const SpotifyJamRooms = () => {
  const [view, setView] = useState('auth');
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  
  const [roomState, setRoomState] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  
  const pollInterval = useRef(null);
  const playerRef = useRef(null);

  // PKCE Helper Functions
  const generateCodeVerifier = () => {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
  };

  const generateCodeChallenge = async (verifier) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  // Exchange authorization code for access token
  const exchangeCodeForToken = async (code) => {
    const clientId = 'd373e1bcfb9344c093cb0eaac9525b15';
    const redirectUri = 'https://jamroomstest.vercel.app/';
    const codeVerifier = localStorage.getItem('code_verifier');
    
    if (!codeVerifier) {
      console.error('No code verifier found');
      alert('OAuth Error: No code verifier found. Please try logging in again.');
      localStorage.clear();
      return;
    }
    
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Token exchange failed:', data);
        alert(`Spotify Error: ${data.error} - ${data.error_description || 'Token exchange failed'}`);
        localStorage.clear();
        return;
      }
      
      if (data.access_token) {
        console.log('Token received successfully!');
        setAccessToken(data.access_token);
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        localStorage.removeItem('code_verifier');
        fetchUserProfile(data.access_token);
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code) {
      console.log('Authorization code received');
      exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    const storedToken = localStorage.getItem('spotify_access_token');
    if (storedToken) {
      setAccessToken(storedToken);
      fetchUserProfile(storedToken);
    }
  }, []);

  const handleSpotifyLogin = async () => {
    const clientId = 'd373e1bcfb9344c093cb0eaac9525b15';
    const redirectUri = 'https://jamroomstest.vercel.app/';
    const scopes = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state streaming';
    
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    localStorage.setItem('code_verifier', codeVerifier);
    
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge_method=S256&code_challenge=${codeChallenge}`;
    
    window.location.href = authUrl;
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Spotify API Error:', response.status, errorData);
        
        if (response.status === 403) {
          alert('❌ Access Denied! Your account needs to be added to the app allowlist.');
          logout();
          return;
        }
        
        return;
      }
      
      const data = await response.json();
      console.log('User profile loaded:', data.display_name, 'Type:', data.product);
      setUser(data);
      
      // Initialize Web Playback SDK
      initializeWebPlayer(token);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const initializeWebPlayer = (token) => {
    console.log('Initializing Web Playback SDK...');
    
    if (!window.Spotify) {
      console.log('Loading Spotify SDK script...');
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
      
      window.onSpotifyWebPlaybackSDKReady = () => {
        createWebPlayer(token);
      };
    } else {
      createWebPlayer(token);
    }
  };

  const createWebPlayer = (token) => {
    const player = new window.Spotify.Player({
      name: 'Jam Rooms Player',
      getOAuthToken: cb => { cb(token); },
      volume: 0.8
    });

    player.addListener('ready', ({ device_id }) => {
      console.log('Web Player ready! Device ID:', device_id);
      setDeviceId(device_id);
      setView('lobby');
    });

    player.addListener('not_ready', ({ device_id }) => {
      console.log('Device has gone offline', device_id);
    });

    player.addListener('player_state_changed', (state) => {
      if (!state) return;
      
      const track = state.track_window.current_track;
      setCurrentTrack({
        uri: track.uri,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        image: track.album.images[0]?.url
      });
      
      setIsPlaying(!state.paused);
    });

    player.connect().then(success => {
      if (success) {
        console.log('Successfully connected to Spotify!');
      }
    });

    playerRef.current = player;
  };

  // Spotify Search
  const searchTracks = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      const data = await response.json();
      setSearchResults(data.tracks?.items || []);
    } catch (error) {
      console.error('Error searching tracks:', error);
    }
  };

  const handleSearchInput = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Debounce search
    if (window.searchTimeout) clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      searchTracks(query);
    }, 300);
  };

  const selectTrack = (track) => {
    playTrack(track.uri, 0);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(newRoomId);
    setCurrentRoom(newRoomId);
    setIsHost(true);
    setView('room');
  };

  const joinRoom = () => {
    if (roomId.trim()) {
      setCurrentRoom(roomId.trim().toUpperCase());
      setIsHost(false);
      setView('room');
      startPolling();
    }
  };

  const startPolling = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    pollInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/rooms/${currentRoom}/state`);
        const data = await response.json();
        
        if (data.trackUri) {
          setRoomState(data);
          
          if (!isHost && data.trackUri !== currentTrack?.uri) {
            const elapsedMs = Date.now() - data.timestamp;
            const currentPosition = data.positionMs + elapsedMs;
            syncPlayback(data.trackUri, currentPosition);
          }
        }
      } catch (error) {
        console.error('Error polling room state:', error);
      }
    }, 10000);
  };

  const updateRoomState = async (trackUri, positionMs, playing) => {
    try {
      await fetch(`${API_BASE}/rooms/${currentRoom}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackUri,
          positionMs,
          isPlaying: playing,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('Error updating room state:', error);
    }
  };

  const playTrack = async (trackUri, positionMs = 0) => {
    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [trackUri],
          position_ms: Math.floor(positionMs)
        })
      });
      
      if (isHost && currentRoom) {
        updateRoomState(trackUri, positionMs, true);
      }
    } catch (error) {
      console.error('Error playing track:', error);
    }
  };

  const pausePlayback = async () => {
    try {
      await playerRef.current?.pause();
      setIsPlaying(false);
      
      if (isHost && roomState) {
        const elapsedMs = Date.now() - roomState.timestamp;
        updateRoomState(roomState.trackUri, roomState.positionMs + elapsedMs, false);
      }
    } catch (error) {
      console.error('Error pausing playback:', error);
    }
  };

  const resumePlayback = async () => {
    try {
      await playerRef.current?.resume();
      setIsPlaying(true);
    } catch (error) {
      console.error('Error resuming playback:', error);
    }
  };

  const skipTrack = async () => {
    try {
      await playerRef.current?.nextTrack();
      
      setTimeout(async () => {
        const state = await playerRef.current?.getCurrentState();
        if (state && state.track_window.current_track) {
          const track = state.track_window.current_track;
          if (isHost && currentRoom) {
            updateRoomState(track.uri, 0, true);
          }
        }
      }, 500);
    } catch (error) {
      console.error('Error skipping track:', error);
    }
  };

  const syncPlayback = async (trackUri, positionMs) => {
    await playTrack(trackUri, positionMs);
  };

  const leaveRoom = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    setCurrentRoom(null);
    setRoomId('');
    setIsHost(false);
    setRoomState(null);
    setView('lobby');
  };

  const logout = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    if (playerRef.current) {
      playerRef.current.disconnect();
    }
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('code_verifier');
    setAccessToken(null);
    setUser(null);
    setView('auth');
  };

  useEffect(() => {
    if (view === 'room' && !isHost) {
      startPolling();
    }
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [view, currentRoom, isHost]);

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <Music className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h1 className="text-3xl font-bold mb-2">Spotify Jam Rooms</h1>
          <p className="text-gray-600 mb-6">Listen together, stay in sync</p>
          <button
            onClick={handleSpotifyLogin}
            className="w-full bg-green-500 text-white py-3 px-6 rounded-full font-semibold hover:bg-green-600 transition"
          >
            Connect with Spotify
          </button>
          <p className="text-xs text-gray-500 mt-4">Works with Free & Premium accounts</p>
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Welcome, {user?.display_name}</h2>
                <p className="text-gray-600">{user?.email}</p>
                <p className="text-sm text-green-600 mt-1">
                  ✓ Web Player Active {user?.product === 'premium' ? '(Premium)' : '(Free - with ads)'}
                </p>
              </div>
              <button onClick={logout} className="text-gray-500 hover:text-gray-700">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-4">Create Room</h3>
              <button
                onClick={createRoom}
                className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition"
              >
                Start a Jam Room
              </button>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-4">Join Room</h3>
              <input
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full border rounded-lg p-2 mb-3"
              />
              <button
                onClick={joinRoom}
                disabled={!roomId.trim()}
                className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition disabled:bg-gray-300"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 to-pink-500 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6" />
                Room: {currentRoom}
              </h2>
              <p className="text-gray-600">{isHost ? 'Host' : 'Listener'}</p>
            </div>
            <button
              onClick={leaveRoom}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Search Section - Only for Host */}
        {isHost && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition flex items-center justify-center gap-2"
            >
              <Search className="w-5 h-5" />
              Search Songs
            </button>
            
            {showSearch && (
              <div className="mt-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search for a song..."
                    value={searchQuery}
                    onChange={handleSearchInput}
                    className="w-full border rounded-lg p-3 pr-10"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                
                {searchResults.length > 0 && (
                  <div className="mt-3 max-h-96 overflow-y-auto">
                    {searchResults.map((track) => (
                      <div
                        key={track.id}
                        onClick={() => selectTrack(track)}
                        className="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer transition"
                      >
                        {track.album.images[2] && (
                          <img
                            src={track.album.images[2].url}
                            alt={track.name}
                            className="w-12 h-12 rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{track.name}</p>
                          <p className="text-sm text-gray-600 truncate">
                            {track.artists.map(a => a.name).join(', ')}
                          </p>
                        </div>
                        <Play className="w-5 h-5 text-green-500 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
                
                {searchQuery && searchResults.length === 0 && (
                  <p className="text-center text-gray-500 mt-4">No results found</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Current Track */}
        {currentTrack ? (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex gap-4 mb-4">
              {currentTrack.image && (
                <img src={currentTrack.image} alt="Album" className="w-32 h-32 rounded-lg" />
              )}
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-1">{currentTrack.name}</h3>
                <p className="text-gray-600 mb-1">{currentTrack.artist}</p>
                <p className="text-gray-500 text-sm">{currentTrack.album}</p>
              </div>
            </div>

            {isHost ? (
              <div className="flex gap-3">
                <button
                  onClick={isPlaying ? pausePlayback : resumePlayback}
                  className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition flex items-center justify-center gap-2"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={skipTrack}
                  className="bg-blue-500 text-white py-3 px-6 rounded-lg hover:bg-blue-600 transition"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => syncPlayback(roomState?.trackUri, roomState?.positionMs)}
                className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                Sync Now
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <p className="text-gray-500 mb-4">
              {isHost ? 'Search and play a song to get started' : 'Waiting for host to play music...'}
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-4">
          <p className="text-sm text-gray-600">
            <strong>Instructions:</strong> {isHost ? 'Search for songs and control playback. Changes sync to all listeners every 2 seconds.' : 'Playback syncs every 2 seconds. Use "Sync Now" to realign manually.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SpotifyJamRooms;