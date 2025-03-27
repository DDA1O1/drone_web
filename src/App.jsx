/**
 * Tello Drone Control Interface
 * This component handles the video streaming and control interface for the Tello drone.
 * It uses JSMpeg for video decoding and WebSocket for real-time communication.
 */

import { useState, useEffect, useRef } from 'react'
import JSMpeg from '@cycjimmy/jsmpeg-player'
import './App.css'

function App() {
  // Refs for managing video player and container
  const videoRef = useRef(null);      // Reference to video container div and since it is a container, that doesn't change often we use useRef
  const playerRef = useRef(null);     // Reference to JSMpeg player instance
  
  // State management
  const [videoConnected, setVideoConnected] = useState(false);  // Video stream status
  const [droneConnected, setDroneConnected] = useState(false);  // Drone connection status
  const [error, setError] = useState(null);          // Error message state
  const [streamEnabled, setStreamEnabled] = useState(false);    // Track if stream is enabled
  const retryAttemptsRef = useRef(0);               // Track SDK mode entry attempts
  
  // Reconnection handling
  const MAX_SDK_RETRY_ATTEMPTS = 2;                  // Maximum attempts to enter SDK mode

  // Add new states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingFiles, setRecordingFiles] = useState(null);

  /**
   * Initializes the JSMpeg video player with optimized settings
   * Handles connection, error states, and reconnection logic
   */
  const initializePlayer = () => {
    if (!videoRef.current || playerRef.current) return;
    
    try {
      const url = `ws://${window.location.hostname}:3001`;
      playerRef.current = new JSMpeg.VideoElement(videoRef.current, url, {
        // Video dimensions
        videoWidth: 640,
        videoHeight: 480,
        
        // Performance optimizations
        videoBufferSize: 1024 * 1024,
        streaming: true,
        autoplay: true,
        decodeFirstFrame: true,
        chunkSize: 3948,
        
        // Enhanced connection handling
        hooks: {
          play: () => setVideoConnected(true),
          pause: () => setVideoConnected(false),
          stop: () => setVideoConnected(false),
          load: () => setVideoConnected(true),
          error: (error) => {
            console.error('JSMpeg error:', error);
            setError('Failed to connect to video stream server');
            setVideoConnected(false);
          }
        }
      });

      // Store the player instance for API access
      playerRef.current = playerRef.current.player;
      
    } catch (err) {
      console.error('Player initialization error:', err);
      setError(`Failed to initialize video: ${err.message}`);
    }
  };

  // ==== LIFE CYCLE MANAGEMENT ====
  useEffect(() => {
    // Initialize player on component mount
    if (!playerRef.current) {
        initializePlayer();
    }
    
    return () => {
        // Destroy player on component unmount
        if (playerRef.current) {
            playerRef.current.destroy();
            playerRef.current = null;
        }
        
        // Reset states
        setVideoConnected(false);
        setDroneConnected(false);
        setStreamEnabled(false);
        setError(null);
        
        // Reset attempt counters
        retryAttemptsRef.current = 0;
    };
  }, []);

  /**
   * Attempts to enter SDK mode with limited retries
   */
  const enterSDKMode = async () => {
    if (retryAttemptsRef.current >= MAX_SDK_RETRY_ATTEMPTS) {
      setError('Failed to connect to drone after maximum retry attempts');
      return false;
    }

    try {
      const response = await fetch('/drone/command');
      if (response.ok) {
        setDroneConnected(true);
        setError(null);
        retryAttemptsRef.current = 0;
        return true;
      }
    } catch (error) {
      console.error('Failed to enter SDK mode:', error);
    }

    retryAttemptsRef.current++;
    return false;
  };

  // Handle video stream status changes
  useEffect(() => {
    if (!videoConnected && droneConnected) {
      // If video stream is lost while drone was connected, check drone connection
      enterSDKMode();
    }
  }, [videoConnected]);

  /**
   * Sends commands to the drone via HTTP API
   * @param {string} command - The command to send to the drone
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
      console.error('Error sending command:', error);
      setError(`Failed to send command: ${error.message}`);
      // If command fails, attempt to re-enter SDK mode
      setDroneConnected(false);
      enterSDKMode();
    }
  };

  /**
   * Toggle video stream
   */
  const toggleVideoStream = async () => {
    const command = streamEnabled ? 'streamoff' : 'streamon';
    console.log('Attempting to', command);
    try {
        const response = await fetch(`/drone/${command}`);
        
        if (response.ok) {
            console.log('Command successful:', command);
            
            // Initialize player if it doesn't exist
            if (!playerRef.current && command === 'streamon') {
                console.log('Initializing player');
                initializePlayer();
            } else if (playerRef.current) {
                // Use player hooks to pause/resume instead of destroying
                if (command === 'streamoff') {
                    console.log('Pausing player');
                    playerRef.current.pause();
                } else {
                    console.log('Resuming player');
                    playerRef.current.play();
                }
            }
            setStreamEnabled(!streamEnabled);
        }
    } catch (error) {
        console.error('Error toggling video stream:', error);
        setError(`Failed to ${command}: ${error.message}`);
    }
  };

  /**
   * Capture a photo from the video stream
   */
  const capturePhoto = async () => {
    if (!videoConnected) {
      setError('Video stream not available');
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
      console.error('Error capturing photo:', error);
      setError('Failed to capture photo: ' + error.message);
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
            setRecordingFiles(files);
        } else {
            setRecordingFiles(null);
        }
        setIsRecording(!isRecording);
    } catch (error) {
        console.error('Error toggling recording:', error);
        setError('Failed to toggle recording: ' + error.message);
    }
  };

  // Add useEffect to monitor state changes
  useEffect(() => {
    console.log('Video Connected:', videoConnected);
    console.log('Drone Connected:', droneConnected);
    console.log('Stream Enabled:', streamEnabled);
    console.log('Is Recording:', isRecording);
  }, [videoConnected, droneConnected, streamEnabled, isRecording]);

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

      {/* Add media controls after video container */}
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
  )
}

export default App
