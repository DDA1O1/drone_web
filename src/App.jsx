/**
 * Tello Drone Control Interface
 * This component handles the video streaming and control interface for the Tello drone.
 */

import { useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  setDroneConnection,
  setStreamEnabled,
  setRecordingStatus,
  setRecordingFiles,
  setError,
  incrementRetryAttempts,
  resetRetryAttempts
} from '@/store/slices/droneSlice'
import JSMpegVideoPlayer from '@/components/JSMpegVideoPlayer'

function App() {
  // Refs for managing video player
  const playerRef = useRef(null);
  
  // Redux
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
  
  // Constants
  const MAX_SDK_RETRY_ATTEMPTS = 2;

  // Error handling utility
  const handleOperationError = (operation, error, additionalActions = null) => {
    console.error(`Error during ${operation}:`, error);
    dispatch(setError(`Failed to ${operation}: ${error.message}`));
    if (additionalActions) {
      additionalActions(error);
    }
  };

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
        dispatch(setError(`Drone connection failed: ${data.response}`));
        dispatch(incrementRetryAttempts());
      }
      return success;
    } catch (error) {
      handleOperationError('enter SDK mode', error, () => {
        dispatch(incrementRetryAttempts());
      });
      return false;
    }
  };

  /**
   * Sends commands to the drone via HTTP API
   */
  const sendCommand = async (command) => {
    try {
      const response = await fetch(`/drone/${command}`);
      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }
      const data = await response.text();
      console.log('Command response:', data);
    } catch (error) {
      handleOperationError(`send command: ${command}`, error, () => {
        dispatch(setDroneConnection(false));
        enterSDKMode();
      });
    }
  };

  /**
   * Toggle video stream
   */
  const toggleVideoStream = async () => {
    const command = streamEnabled ? 'streamoff' : 'streamon';
    try {
      const response = await fetch(`/drone/${command}`);
      if (!response.ok) throw new Error(`Failed to ${command}`);
      dispatch(setStreamEnabled(!streamEnabled));
    } catch (error) {
      handleOperationError(`${command} video stream`, error);
    }
  };

  /**
   * Capture a photo from the video stream
   */
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Photo captured:', data.fileName);
    } catch (error) {
      handleOperationError('capture photo', error);
    }
  };

  /**
   * Toggle video recording
   */
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
      handleOperationError(isRecording ? 'stop recording' : 'start recording', error);
    }
  };

  return (
    <div className="relative">
      {/* Video player component - render first to be in background */}
      <JSMpegVideoPlayer onError={(error) => dispatch(setError(error))} />
      
      {/* Controls overlay */}
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">Tello Drone Control</h1>
        
        {/* Connection status indicators */}
        <div className="space-y-4 mb-8">
          <div className={`p-4 rounded-lg flex items-center justify-between ${droneConnected ? 'bg-green-100' : 'bg-red-100'}`}>
            <span className={`font-medium ${droneConnected ? 'text-green-700' : 'text-red-700'}`}>
              Drone: {droneConnected ? 'Connected' : 'Disconnected'}
            </span>
            {!droneConnected && (
              <button 
                onClick={enterSDKMode}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Connect Drone
              </button>
            )}
          </div>
          <div className={`p-4 rounded-lg flex items-center justify-between ${videoConnected ? 'bg-green-100' : 'bg-red-100'}`}>
            <span className={`font-medium ${videoConnected ? 'text-green-700' : 'text-red-700'}`}>
              Video: {videoConnected ? 'Connected' : 'Disconnected'}
            </span>
            {droneConnected && (
              <button 
                onClick={toggleVideoStream}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                {streamEnabled ? 'Stop Video' : 'Start Video'}
              </button>
            )}
          </div>
          {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
        </div>

        {/* Media controls */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={capturePhoto}
            disabled={!videoConnected}
            className={`px-6 py-3 rounded-lg font-medium ${
              videoConnected 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
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
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            } transition-colors`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
        
        {/* Recording files list */}
        {recordingFiles && recordingFiles.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Recording Files</h2>
            <ul className="space-y-2">
              {recordingFiles.map((file, index) => (
                <li key={index} className="p-3 bg-gray-100 rounded flex items-center justify-between">
                  <span className="text-gray-700">{file}</span>
                  <a 
                    href={`/recordings/${file}`} 
                    download
                    className="text-blue-500 hover:text-blue-600"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
