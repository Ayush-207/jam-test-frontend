import React, { useState, useEffect, useRef } from 'react';
import { Music, Users, Play, Pause, SkipForward, RefreshCw, LogOut } from 'lucide-react';

// Backend API base URL
const API_BASE = 'http://localhost:3001'; // Update with your backend URL

const SpotifyJamRooms = () => {
  const [view, setView] = useState('auth');
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  
  const [roomState, setRoomState] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  
  const pollInterval = useRef(null);

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
    const clientId = '782920ac9d3941e78c812052465ef7d1';
    const redirectUri = 'https://jamroomstest.vercel.app/';
    const codeVerifier = localStorage.getItem('code_verifier');
    
    if (!codeVerifier) {
      console.error('No code verifier found');
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
      
      if (data.access_token) {
        setAccessToken(data.access_token);
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        localStorage.removeItem('code_verifier'); // Clean up
        fetchUserProfile(data.access_token);
        fetchDevices(data.access_token);
      } else {
        console.error('Token exchange failed:', data);
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
    }
  };

  // Check for OAuth callback or existing token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code) {
      console.log('Authorization code received, exchanging for token...');
      exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    // Check for existing token
    const storedToken = localStorage.getItem('spotify_access_token');
    if (storedToken) {
      console.log('Found stored token');
      setAccessToken(storedToken);
      fetchUserProfile(storedToken);
      fetchDevices(storedToken);
    }
  }, []);

  // Spotify OAuth Login with PKCE
  const handleSpotifyLogin = async () => {
    const clientId = '782920ac9d3941e78c812052465ef7d1';
    const redirectUri = 'https://jamroomstest.vercel.app/';
    const scopes = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state';
    
    console.log('Generating PKCE verifier and challenge...');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    console.log('Code verifier generated:', codeVerifier.substring(0, 20) + '...');
    localStorage.setItem('code_verifier', codeVerifier);
    
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge_method=S256&code_challenge=${codeChallenge}`;
    
    console.log('Redirecting to Spotify...');
    window.location.href = authUrl;
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUser(data);
      setView('lobby');
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchDevices = async (token) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setDevices(data.devices || []);
      if (data.devices && data.devices.length > 0) {
        setSelectedDevice(data.devices[0].id);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
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
          
          const elapsedMs = Date.now() - data.timestamp;
          const currentPosition = data.positionMs + elapsedMs;
          
          if (data.trackUri !== currentTrack?.uri) {
            fetchTrackInfo(data.trackUri);
          }
          
          if (!isHost && data.trackUri !== currentTrack?.uri) {
            syncPlayback(data.trackUri, currentPosition);
          }
        }
      } catch (error) {
        console.error('Error polling room state:', error);
      }
    }, 2000);
  };

  const fetchTrackInfo = async (trackUri) => {
    try {
      const trackId = trackUri.split(':')[2];
      const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setCurrentTrack({
        uri: trackUri,
        name: data.name,
        artist: data.artists.map(a => a.name).join(', '),
        album: data.album.name,
        image: data.album.images[0]?.url
      });
    } catch (error) {
      console.error('Error fetching track info:', error);
    }
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
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${selectedDevice}`, {
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
      setIsPlaying(true);
      
      if (isHost) {
        updateRoomState(trackUri, positionMs, true);
      }
    } catch (error) {
      console.error('Error playing track:', error);
    }
  };

  const pausePlayback = async () => {
    try {
      await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${selectedDevice}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      setIsPlaying(false);
      
      if (isHost && roomState) {
        const elapsedMs = Date.now() - roomState.timestamp;
        updateRoomState(roomState.trackUri, roomState.positionMs + elapsedMs, false);
      }
    } catch (error) {
      console.error('Error pausing playback:', error);
    }
  };

  const skipTrack = async () => {
    try {
      await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${selectedDevice}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      setTimeout(async () => {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data && data.item) {
          updateRoomState(data.item.uri, 0, true);
          fetchTrackInfo(data.item.uri);
        }
      }, 500);
    } catch (error) {
      console.error('Error skipping track:', error);
    }
  };

  const syncPlayback = async (trackUri = null, positionMs = null) => {
    const uri = trackUri || roomState?.trackUri;
    let position = positionMs;
    
    if (!position && roomState) {
      const elapsedMs = Date.now() - roomState.timestamp;
      position = roomState.positionMs + elapsedMs;
    }
    
    if (uri) {
      await playTrack(uri, position);
    }
  };

  const leaveRoom = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    setCurrentRoom(null);
    setRoomId('');
    setIsHost(false);
    setRoomState(null);
    setCurrentTrack(null);
    setView('lobby');
  };

  const logout = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('code_verifier');
    setAccessToken(null);
    setUser(null);
    setView('auth');
  };

  useEffect(() => {
    if (view === 'room') {
      startPolling();
    }
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [view, currentRoom, isHost]);

  // Auth View
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
          <p className="text-xs text-gray-500 mt-4">Requires Spotify Premium</p>
        </div>
      </div>
    );
  }

  // Lobby View
  if (view === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Welcome, {user?.display_name}</h2>
                <p className="text-gray-600">{user?.email}</p>
              </div>
              <button onClick={logout} className="text-gray-500 hover:text-gray-700">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-3">Select Playback Device</h3>
            {devices.length === 0 ? (
              <p className="text-gray-500">No devices found. Open Spotify on a device first.</p>
            ) : (
              <select
                value={selectedDevice || ''}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full border rounded-lg p-2"
              >
                {devices.map(device => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.type})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => fetchDevices(accessToken)}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              Refresh Devices
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-4">Create Room</h3>
              <button
                onClick={createRoom}
                disabled={!selectedDevice}
                className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition disabled:bg-gray-300"
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
                disabled={!roomId.trim() || !selectedDevice}
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

  // Room View
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
                  onClick={isPlaying ? pausePlayback : () => playTrack(currentTrack.uri)}
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
                onClick={() => syncPlayback()}
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
              {isHost ? 'Play a song in Spotify to get started' : 'Waiting for host to play music...'}
            </p>
            {isHost && (
              <button
                onClick={async () => {
                  const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  const data = await response.json();
                  if (data && data.item) {
                    updateRoomState(data.item.uri, data.progress_ms, data.is_playing);
                    fetchTrackInfo(data.item.uri);
                  }
                }}
                className="bg-green-500 text-white py-2 px-6 rounded-lg hover:bg-green-600 transition"
              >
                Sync Current Playback
              </button>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-4">
          <p className="text-sm text-gray-600">
            <strong>Instructions:</strong> {isHost ? 'Control playback here. Others will sync automatically.' : 'Playback syncs every 2 seconds. Use "Sync Now" to realign manually.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SpotifyJamRooms;