import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  setError, 
  setDroneConnection, 
  setStreamEnabled, 
  setRecordingStatus, 
  setRecordingFiles,
  incrementRetryAttempts,
  resetRetryAttempts
} from '@/store/slices/droneSlice';

const DroneControl = () => {
  const dispatch = useDispatch();
  const { 
    droneConnected,
    videoConnected,
    streamEnabled,
    isRecording,
    recordingFiles,
    error,
    retryAttempts 
  } = useSelector(state => state.drone);
  const [activeKeys, setActiveKeys] = useState(new Set());

  // Constants
  const MAX_SDK_RETRY_ATTEMPTS = 5;

  // ==== LIFE CYCLE MANAGEMENT ====
  const enterSDKMode = async () => {
    if (retryAttempts >= MAX_SDK_RETRY_ATTEMPTS) {
      dispatch(setError('Failed to connect to drone after maximum retry attempts'));
      return false;
    }

    try {
      const response = await fetch('/drone/command');
      const data = await response.json();
      const success = data.status === 'connected';
      
      if (success) {
        dispatch(setDroneConnection(true));
        dispatch(setError(null));
        dispatch(resetRetryAttempts());
      } else {
        dispatch(setError(`Connection failed: ${data.response}`));
        dispatch(incrementRetryAttempts());
      }
      return success;
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
      dispatch(incrementRetryAttempts());
      return false;
    }
  };

  // Basic command sender
  const sendCommand = async (command) => {
    if (!droneConnected) {
      dispatch(setError('Drone not connected'));
      return;
    }

    try {
      const response = await fetch(`/drone/${command}`);
      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }
      const data = await response.text();
      console.log('Command response:', data);
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
    }
  };

  // ==== VIDEO CONTROLS ====
  const toggleVideoStream = async () => {
    const command = streamEnabled ? 'streamoff' : 'streamon';
    try {
      const response = await fetch(`/drone/${command}`);
      if (!response.ok) throw new Error(`Failed to ${command}`);
      dispatch(setStreamEnabled(!streamEnabled));
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
    }
  };

  const capturePhoto = async () => {
    if (!videoConnected) {
      dispatch(setError('Video stream not available'));
      return;
    }

    try {
      const response = await fetch('/capture-photo', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to capture photo`);
      }

      const data = await response.json();
      console.log('Photo captured:', data.fileName);
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
    }
  };

  const toggleRecording = async () => {
    try {
      const endpoint = isRecording ? '/stop-recording' : '/start-recording';
      const response = await fetch(endpoint, { method: 'POST' });
      
      if (!response.ok) {
        throw new Error(`Failed to ${isRecording ? 'stop' : 'start'} recording`);
      }
      
      if (!isRecording) {
        const files = await response.json();
        dispatch(setRecordingFiles(files));
      } else {
        dispatch(setRecordingFiles(null));
      }
      dispatch(setRecordingStatus(!isRecording));
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
    }
  };

  // ==== KEYBOARD CONTROLS ====
  useEffect(() => {
    const handleKeyDown = (e) => {
      const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        setActiveKeys(prev => {
          const updated = new Set(prev);
          updated.add(e.key);
          return updated;
        });

        // Map keys to drone commands
        switch (e.key) {
          case 'w': sendCommand(`forward ${20}`); break;
          case 's': sendCommand(`back ${20}`); break;
          case 'a': sendCommand(`left ${20}`); break;
          case 'd': sendCommand(`right ${20}`); break;
          case 'ArrowUp': sendCommand(`up ${20}`); break;
          case 'ArrowDown': sendCommand(`down ${20}`); break;
          case 'ArrowLeft': sendCommand(`ccw ${45}`); break;
          case 'ArrowRight': sendCommand(`cw ${45}`); break;
        }
      }
    };

    const handleKeyUp = (e) => {
      const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        setActiveKeys(prev => {
          const updated = new Set(prev);
          updated.delete(e.key);
          return updated;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [droneConnected]);

  // Basic flight controls
  const handleTakeoff = () => sendCommand('takeoff');
  const handleLand = () => sendCommand('land');
  const handleEmergency = () => sendCommand('emergency');

  // Speed control
  const handleSpeedChange = async (newSpeed) => {
    if (newSpeed >= 10 && newSpeed <= 100) {
      setSpeed(newSpeed);
      await sendCommand(`speed ${newSpeed}`);
    }
  };

  return (
    <>
      {/* Connection status and connect button - centered top */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${droneConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
        {!droneConnected && (
          <button 
            onClick={enterSDKMode}
            className="px-3 py-1.5 bg-white/10 backdrop-blur-sm text-white text-sm font-medium rounded-full 
                     hover:bg-white/20 transition-all duration-200 flex items-center gap-2 group"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 transition-transform group-hover:rotate-180" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Connect Drone
          </button>
        )}
      </div>

      {/* Takeoff/Land Controls - Top Left */}
      <div className="absolute top-8 left-8 z-30 flex gap-3">
        {/* Takeoff button */}
        <button
          onClick={handleTakeoff}
          disabled={!droneConnected}
          className={`group relative p-2.5 rounded-lg ${
            droneConnected 
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50' 
              : 'bg-gray-500/20 border border-gray-500/30 cursor-not-allowed'
          } backdrop-blur-sm transition-all duration-200 hover:scale-105`}
          title="Takeoff"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-5 w-5 ${droneConnected ? 'text-emerald-400' : 'text-gray-400'}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M5 10l7-7m0 0l7 7m-7-7v18" 
            />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Takeoff (T)
          </span>
        </button>

        {/* Land button */}
        <button
          onClick={handleLand}
          disabled={!droneConnected}
          className={`group relative p-2.5 rounded-lg ${
            droneConnected 
              ? 'bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/50' 
              : 'bg-gray-500/20 border border-gray-500/30 cursor-not-allowed'
          } backdrop-blur-sm transition-all duration-200 hover:scale-105`}
          title="Land"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-5 w-5 ${droneConnected ? 'text-sky-400' : 'text-gray-400'}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 14l-7 7m0 0l-7-7m7 7V3" 
            />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Land (L)
          </span>
        </button>

        {/* Emergency button */}
        <button
          onClick={handleEmergency}
          disabled={!droneConnected}
          className={`group relative p-2.5 rounded-lg ${
            droneConnected 
              ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 animate-pulse' 
              : 'bg-gray-500/20 border border-gray-500/30 cursor-not-allowed'
          } backdrop-blur-sm transition-all duration-200 hover:scale-105`}
          title="Emergency Stop"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-5 w-5 ${droneConnected ? 'text-red-400' : 'text-gray-400'}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2.5} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Emergency Stop (ESC)
          </span>
        </button>
      </div>

      {/* Left corner - WASD Movement Controls */}
      <div className="absolute bottom-8 left-8 z-30">
        <div className="bg-black bg-opacity-70 p-6 rounded-lg text-white">
          <h3 className="text-center font-bold mb-4">Movement</h3>
          
          {/* WASD keys */}
          <div className="grid grid-cols-3 gap-2 w-40 mx-auto">
            <div></div>
            <div className={`border-2 ${activeKeys.has('w') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>W</div>
            <div></div>
            <div className={`border-2 ${activeKeys.has('a') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>A</div>
            <div className={`border-2 ${activeKeys.has('s') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>S</div>
            <div className={`border-2 ${activeKeys.has('d') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>D</div>
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-400">
            <p>Forward / Backward</p>
            <p>Left / Right</p>
          </div>
        </div>
      </div>
      
      {/* Right corner - Arrow keys for Altitude & Rotation */}
      <div className="absolute bottom-8 right-8 z-30">
        <div className="bg-black bg-opacity-70 p-6 rounded-lg text-white">
          <h3 className="text-center font-bold mb-4">Altitude & Rotation</h3>
          
          {/* Arrow keys */}
          <div className="grid grid-cols-3 gap-2 w-40 mx-auto">
            <div></div>
            <div className={`border-2 ${activeKeys.has('ArrowUp') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>↑</div>
            <div></div>
            <div className={`border-2 ${activeKeys.has('ArrowLeft') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>←</div>
            <div className={`border-2 ${activeKeys.has('ArrowDown') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>↓</div>
            <div className={`border-2 ${activeKeys.has('ArrowRight') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>→</div>
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-400">
            <p>Up / Down</p>
            <p>Rotate Left / Right</p>
          </div>
        </div>
      </div>

      {/* Connection status and media controls */}
      <div className="absolute top-0 right-0 m-4 z-30">
        <div className="space-y-4">
          {/* Video status */}
          <div className={`p-4 rounded-lg ${videoConnected ? 'bg-green-500/70' : 'bg-red-500/70'}`}>
            <span className="text-white font-medium">
              Video: {videoConnected ? 'Connected' : 'Disconnected'}
            </span>
            {droneConnected && (
              <button 
                onClick={toggleVideoStream}
                className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                {streamEnabled ? 'Stop Video' : 'Start Video'}
              </button>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="p-4 bg-red-500/70 text-white rounded-lg">
              {error}
            </div>
          )}

          {/* Media controls */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={capturePhoto}
              disabled={!videoConnected}
              className={`px-6 py-3 rounded-lg font-medium ${
                videoConnected 
                  ? 'bg-green-500/70 text-white hover:bg-green-600/70' 
                  : 'bg-gray-500/70 text-gray-300 cursor-not-allowed'
              } transition-colors`}
            >
              Capture Photo
            </button>
            <button 
              onClick={toggleRecording}
              disabled={!videoConnected}
              className={`px-6 py-3 rounded-lg font-medium ${
                videoConnected
                  ? isRecording 
                    ? 'bg-red-500/70 text-white hover:bg-red-600/70'
                    : 'bg-blue-500/70 text-white hover:bg-blue-600/70'
                  : 'bg-gray-500/70 text-gray-300 cursor-not-allowed'
              } transition-colors`}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>
        </div>

        {/* Recording files list */}
        {recordingFiles && recordingFiles.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Recording Files</h2>
            <ul className="space-y-2">
              {recordingFiles.map((file, index) => (
                <li key={index} className="p-3 bg-black/70 rounded flex items-center justify-between">
                  <span className="text-white">{file}</span>
                  <a 
                    href={`/recordings/${file}`} 
                    download
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
};

export default DroneControl; 