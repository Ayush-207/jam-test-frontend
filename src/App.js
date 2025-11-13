import React, { useState, useEffect } from 'react';
import { Music, Users, ArrowLeft, Heart, Search, X, Plus, LogOut } from 'lucide-react';

// Backend API base URL
const API_BASE = 'https://jam-test-backend.onrender.com'; // Update with your backend URL

const SpotifyJamRooms = () => {
  const [view, setView] = useState('auth'); // auth, home, jamRoom, mixtape
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);

  // Jam Rooms
  const [jamRooms, setJamRooms] = useState([]);
  const [currentJamRoom, setCurrentJamRoom] = useState(null);
  const [showCreateJamRoom, setShowCreateJamRoom] = useState(false);
  const [newJamRoomTitle, setNewJamRoomTitle] = useState('');
  const [newJamRoomDesc, setNewJamRoomDesc] = useState('');

  // Mixtapes
  const [mixtapes, setMixtapes] = useState([]);
  const [currentMixtape, setCurrentMixtape] = useState(null);
  const [mixtapeSongs, setMixtapeSongs] = useState([]);
  const [showCreateMixtape, setShowCreateMixtape] = useState(false);
  const [newMixtapeTitle, setNewMixtapeTitle] = useState('');
  const [newMixtapeDesc, setNewMixtapeDesc] = useState('');

  // Song Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [songPrompt, setSongPrompt] = useState('');

  const [activeTab, setActiveTab] = useState('jamrooms'); // jamrooms, mixtapes

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

  const exchangeCodeForToken = async (code) => {
    const clientId = 'd373e1bcfb9344c093cb0eaac9525b15';
    const redirectUri = 'https://jamroomstest.vercel.app/';
    const codeVerifier = localStorage.getItem('code_verifier');

    if (!codeVerifier) return;

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    const scopes = 'user-read-private user-read-email';

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

      if (!response.ok) return;

      const data = await response.json();
      setUser(data);
      setView('home');
      fetchJamRooms();
      fetchMixtapes();
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  // Jam Rooms API
  const fetchJamRooms = async () => {
    try {
      const response = await fetch(`${API_BASE}/jamrooms`);
      const data = await response.json();
      setJamRooms(data);
    } catch (error) {
      console.error('Error fetching jam rooms:', error);
    }
  };

  const createJamRoom = async () => {
    if (!newJamRoomTitle.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/jamrooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newJamRoomTitle,
          description: newJamRoomDesc,
          createdBy: user.id,
          createdByName: user.display_name
        })
      });

      const data = await response.json();
      setShowCreateJamRoom(false);
      setNewJamRoomTitle('');
      setNewJamRoomDesc('');
      fetchJamRooms();
    } catch (error) {
      console.error('Error creating jam room:', error);
    }
  };

  const joinJamRoom = async (room) => {
    setCurrentJamRoom(room);
    setView('jamRoom');
  };

  const leaveJamRoom = () => {
    if (window.confirm('Are you sure you want to leave this Jam Room?')) {
      setCurrentJamRoom(null);
      setView('home');
    }
  };

  // Mixtapes API
  const fetchMixtapes = async () => {
    try {
      const response = await fetch(`${API_BASE}/mixtapes`);
      const data = await response.json();
      setMixtapes(data);
    } catch (error) {
      console.error('Error fetching mixtapes:', error);
    }
  };

  const createMixtape = async () => {
    if (!newMixtapeTitle.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/mixtapes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newMixtapeTitle,
          description: newMixtapeDesc,
          createdBy: user.id,
          createdByName: user.display_name
        })
      });

      const data = await response.json();
      setShowCreateMixtape(false);
      setNewMixtapeTitle('');
      setNewMixtapeDesc('');
      fetchMixtapes();
    } catch (error) {
      console.error('Error creating mixtape:', error);
    }
  };

  const openMixtape = async (mixtape) => {
    setCurrentMixtape(mixtape);
    setView('mixtape');
    fetchMixtapeSongs(mixtape.id);
  };

  const fetchMixtapeSongs = async (mixtapeId) => {
    try {
      const response = await fetch(`${API_BASE}/mixtapes/${mixtapeId}/songs`);
      const data = await response.json();
      setMixtapeSongs(data);
    } catch (error) {
      console.error('Error fetching mixtape songs:', error);
    }
  };

  const leaveMixtape = () => {
    if (window.confirm('Are you sure you want to leave this Mixtape?')) {
      setCurrentMixtape(null);
      setMixtapeSongs([]);
      setView('home');
    }
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
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
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

    if (window.searchTimeout) clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => searchTracks(query), 300);
  };

  const addSongToMixtape = async (track) => {
    if (songPrompt.length > 80) {
      alert('Prompt must be 80 characters or less');
      return;
    }

    const updateRoomState = async (trackUri, positionMs, playing) => {
      try {
        await fetch(`${API_BASE}/mixtapes/${currentMixtape.id}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackId: track.id,
            trackName: track.name,
            artistName: track.artists.map(a => a.name).join(', '),
            albumImage: track.album.images[0]?.url,
            prompt: songPrompt,
            addedBy: user.id,
            addedByName: user.display_name
          })
        });

        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
        setSongPrompt('');
        fetchMixtapeSongs(currentMixtape.id);
      } catch (error) {
        console.error('Error adding song:', error);
      }
    };

    const likeSong = async (songId) => {
      try {
        await fetch(`${API_BASE}/mixtapes/songs/${songId}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        });

        fetchMixtapeSongs(currentMixtape.id);
      } catch (error) {
        console.error('Error liking song:', error);
      }
    };

    const logout = () => {
      localStorage.removeItem('spotify_access_token');
      setAccessToken(null);
      setUser(null);
      setView('auth');
    };

    // Random colors for jam room cards
    const cardColors = [
      'bg-gradient-to-br from-purple-400 to-purple-600',
      'bg-gradient-to-br from-blue-400 to-blue-600',
      'bg-gradient-to-br from-green-400 to-green-600',
      'bg-gradient-to-br from-pink-400 to-pink-600',
      'bg-gradient-to-br from-orange-400 to-orange-600',
      'bg-gradient-to-br from-red-400 to-red-600',
    ];

    // Auth View
    if (view === 'auth') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
            <Music className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h1 className="text-3xl font-bold mb-2">Jam Rooms & Mixtapes</h1>
            <p className="text-gray-600 mb-6">Connect, share, and discover music together</p>
            <button
              onClick={handleSpotifyLogin}
              className="w-full bg-green-500 text-white py-3 px-6 rounded-full font-semibold hover:bg-green-600 transition"
            >
              Connect with Spotify
            </button>
          </div>
        </div>
      );
    }

    // Home View
    if (view === 'home') {
      return (
        <div className="min-h-screen bg-gray-100">
          {/* Header */}
          <div className="bg-white shadow-sm sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Music className="w-7 h-7 text-green-500" />
                Jam Rooms
              </h1>
              <button onClick={logout} className="text-gray-500 hover:text-gray-700">
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="max-w-6xl mx-auto px-4 flex gap-4 border-t">
              <button
                onClick={() => setActiveTab('jamrooms')}
                className={`py-3 px-4 font-semibold border-b-2 transition ${activeTab === 'jamrooms'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500'
                  }`}
              >
                Jam Rooms
              </button>
              <button
                onClick={() => setActiveTab('mixtapes')}
                className={`py-3 px-4 font-semibold border-b-2 transition ${activeTab === 'mixtapes'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500'
                  }`}
              >
                Mixtapes
              </button>
            </div>
          </div>

          <div className="max-w-6xl mx-auto p-4">
            {/* Jam Rooms Tab */}
            {activeTab === 'jamrooms' && (
              <>
                <div className="mb-6 flex justify-between items-center">
                  <h2 className="text-xl font-bold">Available Jam Rooms</h2>
                  <button
                    onClick={() => setShowCreateJamRoom(true)}
                    className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Create Room
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jamRooms.map((room, index) => (
                    <div
                      key={room.id}
                      onClick={() => joinJamRoom(room)}
                      className={`${cardColors[index % cardColors.length]} rounded-xl p-6 text-white cursor-pointer hover:scale-105 transition-transform shadow-lg h-48 flex flex-col justify-between relative overflow-hidden`}
                    >
                      <div className="absolute inset-0 bg-black opacity-20"></div>
                      <div className="relative z-10">
                        <h3 className="text-2xl font-bold mb-2">{room.title}</h3>
                        <p className="text-sm opacity-90">{room.description}</p>
                      </div>
                      <div className="relative z-10 flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4" />
                        <span>Created by {room.createdByName}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {jamRooms.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No jam rooms yet. Create the first one!</p>
                  </div>
                )}
              </>
            )}

            {/* Mixtapes Tab */}
            {activeTab === 'mixtapes' && (
              <>
                <div className="mb-6 flex justify-between items-center">
                  <h2 className="text-xl font-bold">Mixtapes</h2>
                  <button
                    onClick={() => setShowCreateMixtape(true)}
                    className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Create Mixtape
                  </button>
                </div>

                <div className="grid gap-4">
                  {mixtapes.map((mixtape) => (
                    <div
                      key={mixtape.id}
                      onClick={() => openMixtape(mixtape)}
                      className="bg-white rounded-lg p-6 shadow hover:shadow-lg transition cursor-pointer"
                    >
                      <h3 className="text-xl font-bold mb-2">{mixtape.title}</h3>
                      <p className="text-gray-600 mb-3">{mixtape.description}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Music className="w-4 h-4" />
                          {mixtape.songCount || 0} songs
                        </span>
                        <span>Created by {mixtape.createdByName}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {mixtapes.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No mixtapes yet. Create the first one!</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Create Jam Room Modal */}
          {showCreateJamRoom && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4">Create Jam Room</h2>
                <input
                  type="text"
                  placeholder="Room Title"
                  value={newJamRoomTitle}
                  onChange={(e) => setNewJamRoomTitle(e.target.value)}
                  className="w-full border rounded-lg p-3 mb-3"
                  maxLength={50}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newJamRoomDesc}
                  onChange={(e) => setNewJamRoomDesc(e.target.value)}
                  className="w-full border rounded-lg p-3 mb-4 h-24"
                  maxLength={200}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateJamRoom(false)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createJamRoom}
                    disabled={!newJamRoomTitle.trim()}
                    className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition disabled:bg-gray-300"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create Mixtape Modal */}
          {showCreateMixtape && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4">Create Mixtape</h2>
                <input
                  type="text"
                  placeholder="Mixtape Title"
                  value={newMixtapeTitle}
                  onChange={(e) => setNewMixtapeTitle(e.target.value)}
                  className="w-full border rounded-lg p-3 mb-3"
                  maxLength={50}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newMixtapeDesc}
                  onChange={(e) => setNewMixtapeDesc(e.target.value)}
                  className="w-full border rounded-lg p-3 mb-4 h-24"
                  maxLength={200}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateMixtape(false)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createMixtape}
                    disabled={!newMixtapeTitle.trim()}
                    className="flex-1 bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600 transition disabled:bg-gray-300"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Jam Room View
    if (view === 'jamRoom') {
      return (
        <div className="min-h-screen bg-gray-100">
          <div className="bg-white shadow-sm sticky top-0 z-10">
            <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
              <button onClick={leaveJamRoom} className="text-gray-600 hover:text-gray-800">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">{currentJamRoom.title}</h1>
                <p className="text-sm text-gray-600">{currentJamRoom.description}</p>
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto p-4">
            <div className="bg-white rounded-lg p-8 text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Welcome to {currentJamRoom.title}</h2>
              <p className="text-gray-600">Playback features coming soon...</p>
            </div>
          </div>
        </div>
      );
    }

    // Mixtape View
    if (view === 'mixtape') {
      return (
        <div className="min-h-screen bg-gray-100">
          <div className="bg-white shadow-sm sticky top-0 z-10">
            <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
              <button onClick={leaveMixtape} className="text-gray-600 hover:text-gray-800">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{currentMixtape.title}</h1>
                <p className="text-sm text-gray-600">{currentMixtape.description}</p>
              </div>
              <button
                onClick={() => setShowSearch(true)}
                className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Song
              </button>
            </div>
          </div>

          <div className="max-w-4xl mx-auto p-4">
            {mixtapeSongs.length === 0 ? (
              <div className="bg-white rounded-lg p-8 text-center">
                <Music className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">No songs yet. Be the first to add one!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {mixtapeSongs.map((song) => (
                  <div key={song.id} className="bg-white rounded-lg p-4 shadow">
                    <div className="flex gap-4">
                      {song.albumImage && (
                        <img src={song.albumImage} alt={song.trackName} className="w-20 h-20 rounded" />
                      )}
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{song.trackName}</h3>
                        <p className="text-gray-600 text-sm mb-2">{song.artistName}</p>
                        {song.prompt && (
                          <p className="text-gray-700 italic text-sm mb-2">"{song.prompt}"</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Added by {song.addedByName}</span>
                          <button
                            onClick={() => likeSong(song.id)}
                            className="flex items-center gap-1 hover:text-red-500 transition"
                          >
                            <Heart className={`w-4 h-4 ${song.likedByUser ? 'fill-red-500 text-red-500' : ''}`} />
                            <span>{song.likes || 0}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Song Modal */}
          {showSearch && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold">Add Song</h2>
                  <button onClick={() => {
                    setShowSearch(false);
                    setSearchQuery('');
                    setSearchResults([]);
                    setSongPrompt('');
                  }} className="text-gray-500 hover:text-gray-700">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search for a song..."
                    value={searchQuery}
                    onChange={handleSearchInput}
                    className="w-full border rounded-lg p-3"
                    autoFocus
                  />
                </div>

                <textarea
                  placeholder="Add a short prompt (max 80 characters)"
                  value={songPrompt}
                  onChange={(e) => setSongPrompt(e.target.value)}
                  className="w-full border rounded-lg p-3 mb-4 h-20"
                  maxLength={80}
                />
                <p className="text-xs text-gray-500 mb-4">{songPrompt.length}/80 characters</p>

                <div className="flex-1 overflow-y-auto">
                  {searchResults.map((track) => (
                    <div
                      key={track.id}
                      onClick={() => addSongToMixtape(track)}
                      className="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer transition"
                    >
                      {track.album.images[2] && (
                        <img src={track.album.images[2].url} alt={track.name} className="w-12 h-12 rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{track.name}</p>
                        <p className="text-sm text-gray-600 truncate">
                          {track.artists.map(a => a.name).join(', ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };
}

export default SpotifyJamRooms;