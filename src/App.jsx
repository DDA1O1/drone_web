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
import VideoContainer from '@/components/VideoContainer'
import DroneControl from '@/components/control/DroneControl'

function App() {
  // Refs for managing video player
  const videoRef = useRef(null);
  
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
      console.error(error);
      dispatch(setError(error.message));
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
        throw new Error(`Failed to capture photo`);
      }

      const data = await response.json();
      console.log('Photo captured:', data.fileName);
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
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
      console.error(error);
      dispatch(setError(error.message));
    }
  };

  return (
    <div className="relative h-screen">
      {/* Video container - renders as background */}
      <VideoContainer ref={videoRef} />
      
      {/* Drone controls overlay */}
      <DroneControl />

      {/* Connection status and media controls */}
      <div className="absolute top-0 right-0 m-4 z-30">
        <div className="space-y-4">
          {/* Connection status */}
          <div className={`p-4 rounded-lg ${droneConnected ? 'bg-green-500/70' : 'bg-red-500/70'}`}>
            <span className="text-white font-medium">
              Drone: {droneConnected ? 'Connected' : 'Disconnected'}
            </span>
            {!droneConnected && (
              <button 
                onClick={enterSDKMode}
                className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Connect
              </button>
            )}
          </div>

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
    </div>
  );
}

export default App;
