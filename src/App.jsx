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
  const reconnectTimeoutRef = useRef(null);          // Timeout for reconnection attempts
  const reconnectAttemptsRef = useRef(0);            // Counter for reconnection attempts
  const MAX_RECONNECT_ATTEMPTS = 5;                  // Maximum reconnection attempts
  const MAX_SDK_RETRY_ATTEMPTS = 2;                  // Maximum attempts to enter SDK mode

  // Add new states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingFiles, setRecordingFiles] = useState(null);

  /**
   * Initializes the JSMpeg video player with optimized settings
   * Handles connection, error states, and reconnection logic
   */
  const initializePlayer = () => {
    console.log('Initialize player called');
    if (videoRef.current && !playerRef.current) {
      try {
        const url = `ws://${window.location.hostname}:3001`;
        console.log('Attempting WebSocket connection to:', url);
        
        // Test the WebSocket connection first
        const testWs = new WebSocket(url);
        
        testWs.onopen = () => {
          console.log('Test WebSocket connection successful');
          testWs.close(); // Close test connection
          
          // Now initialize the actual player
          try {
            playerRef.current = new JSMpeg.VideoElement(videoRef.current, url, {
              // Video dimensions
              videoWidth: 640,
              videoHeight: 480,
              
              // Performance optimizations
              videoBufferSize: 1024 * 1024,    // Increased buffer size for better frame handling
              streaming: true,                 // Enable streaming mode
              autoplay: true,                 // Start playing immediately
              control: true,                  // Show video controls
              loop: false,                    // Don't loop the video
              decodeFirstFrame: true,         // Decode and display first frame
              progressive: true,              // Load and play frames as they arrive
              chunkSize: 3948,
              maxAudioLag: 0,                // No audio, so disable audio lag compensation
              disableGl: false,              // Enable WebGL when available
              disableWebAssembly: false,     // Enable WebAssembly for better performance
              preserveDrawingBuffer: true,    // Enable reliable canvas capture
              canvas: null,                   // Let JSMpeg create its own canvas
              
              // WebGL specific options
              webgl: {
                preserveDrawingBuffer: true,  // Crucial for frame capture
                antialias: false,            // Disable antialiasing for better performance
                depth: false,                // Disable depth buffer as we don't need it
                alpha: false,                // Disable alpha channel as we don't need it
              },
              
              // Hook functions
              hooks: {
                  play: () => {
                      console.log('Video started playing');
                      setVideoConnected(true);
                  },
                  pause: () => {
                      console.log('Video paused');
                  },
                  stop: () => {
                      console.log('Video stopped');
                      setVideoConnected(false);
                  },
                  load: () => {
                      console.log('Source established');
                      setVideoConnected(true);
                      reconnectAttemptsRef.current = 0;
                      setError(null);
                  },
                  drawFrame: (decoder, time) => {
                      console.log('Frame rendered at time:', time, 'Decoder state:', {
                          currentTime: decoder.currentTime,
                          frameCount: decoder.frameCount
                      });
                  }
              }
            });

            // Store the player instance for API access
            playerRef.current = playerRef.current.player;
            console.log('Video player initialized successfully');
            
          } catch (err) {
            console.error('JSMpeg initialization error:', err);
            setError(`Failed to initialize video player: ${err.message}`);
          }
        };
        
        testWs.onerror = (error) => {
          console.error('WebSocket connection failed:', error);
          setError('Failed to connect to video stream server. Please check if the server is running.');
        };
        
      } catch (err) {
        console.error('Player initialization error:', err);
        setError(`Failed to initialize video: ${err.message}`);
      }
    } else {
      console.log('Initialize player conditions not met:', {
        videoRefExists: !!videoRef.current,
        playerRefExists: !!playerRef.current
      });
    }
  };

  // ==== LIFE CYCLE MANAGEMENT ====
  useEffect(() => {
    return () => {
      // Clear timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Cleanup video player
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
      reconnectAttemptsRef.current = 0;
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
            if (command === 'streamoff' && playerRef.current) {
                console.log('Cleaning up player');
                playerRef.current.destroy();
                playerRef.current = null;
                setVideoConnected(false);
            } else if (command === 'streamon' && !playerRef.current) {
                console.log('Initializing player');
                initializePlayer();
            }
            setStreamEnabled(!streamEnabled);
        }
    } catch (error) {
        console.error('Error toggling video stream:', error);
        setError(`Failed to ${command}: ${error.message}`);
    }
  };

  // Add cleanup effect for stream state changes
  useEffect(() => {
    return () => {
        if (playerRef.current) {
            playerRef.current.destroy();
            playerRef.current = null;
        }
    };
  }, [streamEnabled]); // Cleanup when stream state changes

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
      setError(null);
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
        // Check if we're not currently recording
        if (!isRecording) {
            // Make POST request to start recording endpoint
            const response = await fetch('/start-recording', { method: 'POST' });
            
            if (response.ok) {
                // Get the filenames from server response
                const files = await response.json();
                // Save filenames in state for later reference
                setRecordingFiles(files);
                // Update recording status to true
                setIsRecording(true);
                // Clear any previous errors
                setError(null);
            } else {
                // If server response wasn't ok, throw error
                throw new Error('Failed to start recording');
            }
        } else {
            // We are currently recording, so stop it
            const response = await fetch('/stop-recording', { method: 'POST' });
            
            if (response.ok) {
                // Update recording status to false
                setIsRecording(false);
                // Log the saved files info
                console.log('Recording saved:', recordingFiles);
                // Clear the stored filenames
                setRecordingFiles(null);
                // Clear any previous errors
                setError(null);
            } else {
                // If server response wasn't ok, throw error
                throw new Error('Failed to stop recording');
            }
        }
    } catch (error) {
        // Handle any errors in the process
        console.error('Error toggling recording:', error);
        // Show error to user
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
          style={{
            width: '640px',
            height: '480px',
            backgroundColor: '#000',
            margin: '0 auto',
            position: 'relative',
            overflow: 'hidden'
          }}
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
