/**
 * Tello Drone Control Interface
 * This component handles the video streaming and control interface for the Tello drone.
 * It uses JSMpeg for video decoding and WebSocket for real-time communication.
 */

import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import JSMpeg from '@cycjimmy/jsmpeg-player'
import {
  setDroneConnection,
  setVideoConnection,
  setStreamEnabled,
  setRecordingStatus,
  setRecordingFiles,
  setError,
  incrementRetryAttempts,
  resetRetryAttempts
} from './store/slices/droneSlice'
import './App.css'

function App() {
  // Refs for managing video player and container
  const videoRef = useRef(null);
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

  /**
   * Initializes the JSMpeg video player with optimized settings
   */
  const initializePlayer = () => {
    if (!videoRef.current || playerRef.current) return;
    
    try {
      const url = `ws://${window.location.hostname}:3001`;
      const player = new JSMpeg.VideoElement(videoRef.current, url, {
        videoWidth: 640,
        videoHeight: 480,
        videoBufferSize: 512 * 1024,
        streaming: true,
        autoplay: true,
        decodeFirstFrame: true,
        chunkSize: 4096,
        disableGl: false,
        progressive: true,
        throttled: false,
        
        hooks: {
          play: () => {
            console.log('Video playback started');
            dispatch(setVideoConnection(true));
          },
          pause: () => dispatch(setVideoConnection(false)),
          stop: () => dispatch(setVideoConnection(false)),
          error: (error) => {
            console.error('JSMpeg error:', error);
            handleOperationError('connect to video stream', error);
          }
        }
      });
      
      playerRef.current = player.player;

      if (player?.player?.source?.socket) {
        player.player.source.socket.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          handleOperationError('WebSocket connection', error);
        });
      }

    } catch (err) {
      handleOperationError('initialize video', err);
    }
  };

  // ==== LIFE CYCLE MANAGEMENT ====
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      
      dispatch(setVideoConnection(false));
      dispatch(setDroneConnection(false));
      dispatch(setStreamEnabled(false));
      dispatch(setError(null));
      dispatch(resetRetryAttempts());
    };
  }, [dispatch]);

  // Handle video stream status changes
  useEffect(() => {
    if (!videoConnected && droneConnected) {
      enterSDKMode();
    }
  }, [videoConnected, droneConnected]);

  /**
   * Attempts to enter SDK mode with limited retries
   */
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
      
      if (command === 'streamon' && !playerRef.current) {
        initializePlayer();
      } else if (playerRef.current) {
        playerRef.current[command === 'streamoff' ? 'pause' : 'play']();
      }
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
    <div className="container">
      <h1>Tello Drone Control</h1>
      
      {/* Connection status indicators */}
      <div className="status-container">
        <div className={`status ${droneConnected ? 'connected' : 'disconnected'}`}>
          Drone: {droneConnected ? 'Connected' : 'Disconnected'}
          {!droneConnected && (
            <button 
              onClick={enterSDKMode}
              className="connect-btn"
            >
              Connect Drone
            </button>
          )}
        </div>
        <div className={`status ${videoConnected ? 'connected' : 'disconnected'}`}>
          Video: {videoConnected ? 'Connected' : 'Disconnected'}
          {droneConnected && (
            <button 
              onClick={toggleVideoStream}
              className="connect-btn"
            >
              {streamEnabled ? 'Stop Video' : 'Start Video'}
            </button>
          )}
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      
      {/* Video stream container */}
      <div className="video-container">
        <div 
          ref={videoRef} 
          className="jsmpeg-player"
        ></div>
      </div>

      {/* Media controls */}
      <div className="media-controls">
        <button 
          onClick={capturePhoto}
          disabled={!videoConnected}
          className="media-btn"
        >
          Take Photo
        </button>
        <button 
          onClick={toggleRecording}
          disabled={!videoConnected}
          className={`media-btn ${isRecording ? 'recording' : ''}`}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
        {isRecording && (
          <span className="recording-info">
            Recording in progress... (Saving as MP4)
          </span>
        )}
      </div>

      {/* Drone control interface */}
      <div className="controls">
        {/* Basic flight controls */}
        <div className="control-row">
          <button onClick={() => sendCommand('takeoff')}>Take Off</button>
          <button onClick={() => sendCommand('land')}>Land</button>
          <button className="emergency" onClick={() => sendCommand('emergency')}>Emergency Stop</button>
        </div>

        {/* Vertical movement controls */}
        <div className="control-row">
          <button onClick={() => sendCommand('up 20')}>Up</button>
          <button onClick={() => sendCommand('down 20')}>Down</button>
        </div>

        {/* Horizontal movement controls */}
        <div className="control-row">
          <button onClick={() => sendCommand('left 20')}>Left</button>
          <button onClick={() => sendCommand('forward 20')}>Forward</button>
          <button onClick={() => sendCommand('back 20')}>Back</button>
          <button onClick={() => sendCommand('right 20')}>Right</button>
        </div>

        {/* Rotation controls */}
        <div className="control-row">
          <button onClick={() => sendCommand('ccw 45')}>Rotate Left</button>
          <button onClick={() => sendCommand('cw 45')}>Rotate Right</button>
        </div>
      </div>
    </div>
  );
}

export default App;
