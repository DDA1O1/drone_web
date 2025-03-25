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
  const isToggling = useRef(false);   // Add this new ref for toggle state
  
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
    if (videoRef.current && !playerRef.current) {
      try {
        // Connect to WebSocket stream server
        const url = `ws://${window.location.hostname}:3001`;
        console.log('Connecting to stream at:', url);
        
        // Initialize JSMpeg player with optimized settings
        playerRef.current = new JSMpeg.VideoElement(
          videoRef.current,
          url,
          {
            // Basic configuration
            autoplay: true, // Automatically start the video stream
            audio: false, //drone doesn't have audio
            
            // Performance optimizations
            videoBufferSize: 256 * 1024,    // 256KB buffer for reduced latency
            streaming: true, //// Optimize for live streaming
            maxAudioLag: 0, // No audio lag
            disableGl: false,               // Use WebGL for hardware acceleration
            // Makes video decoding faster using GPU
            progressive: true,              // Load and play frames as they arrive
            // Don't wait for full buffer
            chunkSize: 3948,               // Matches server's MPEGTS_PACKET_SIZE * PACKETS_PER_CHUNK (188 * 21)
            decodeFirstFrame: true,         // Fast initial display
            preserveDrawingBuffer: false,   // Don't keep old frames in memory
            throttled: false,               // Real-time streaming
            
            // Event handlers for stream management
            onSourceEstablished: () => {
              console.log('Stream source established');
              // Clear any pending reconnection timeout
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
              }
              reconnectAttemptsRef.current = 0;
              setVideoConnected(true);
              setError(null);
            },
            onSourceCompleted: () => {
              console.log('Stream completed'); // Log when stream is completed like when the drone stops streaming
            },
            onStalled: () => {
              console.log('Stream stalled'); // Log when stream is stalled like for temporary network issues but connection is still exist
              setError('Video stream stalled - attempting to reconnect...');
            },
            onEnded: () => {
              console.log('Stream ended'); //log when connection is lost or terminated
              setVideoConnected(false);
              
              // Implement exponential backoff reconnection
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
                reconnectTimeoutRef.current = setTimeout(() => {
                  // This function lives independently
                  // even if the player instance is destroyed
                  console.log(`Reconnect attempt ${reconnectAttemptsRef.current}`);
                  if (playerRef.current) {
                    playerRef.current.destroy();
                    playerRef.current = null;
                  }
                  initializePlayer();
                }, delay);
              } else {
                setError('Failed to connect to video stream after multiple attempts. Please refresh the page.');
              }
            }
          }
        );

        // Extract actual player instance from VideoElement wrapper
        playerRef.current = playerRef.current.player;

        // Instead, we can use the supported player properties if needed
        if (playerRef.current) {
          console.log('Video player initialized');
        }
      } catch (err) {
        console.error('Player initialization error:', err);
        setError(`Failed to initialize video: ${err.message}`);
      }
    }
  };

  // ==== LIFE CYCLE MANAGEMENT ====
  useEffect(() => {
    return () => {
      // Clear timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Cleanup video player and intervals
      if (playerRef.current) {
        if (playerRef.current.statsInterval) {
          clearInterval(playerRef.current.statsInterval);
        }
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
    // Clear error at the start of new connection attempt
    setError(null);
    
    if (retryAttemptsRef.current >= MAX_SDK_RETRY_ATTEMPTS) {
        setError('Failed to connect to drone after maximum retry attempts');
        return false;
    }

    try {
        const response = await fetch('/drone/command');
        if (response.ok) {
            setDroneConnected(true);
            retryAttemptsRef.current = 0;
            return true;
        }
        // Set specific error for failed response
        setError('Failed to connect to drone - please try again');
    } catch (error) {
        console.error('Failed to enter SDK mode:', error);
        setError(`Connection error: ${error.message}`);
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
   * Toggle video stream with race condition protection
   */
  const toggleVideoStream = async () => {
    if (isToggling.current) return; // Prevent multiple simultaneous toggles
    
    const command = streamEnabled ? 'streamoff' : 'streamon';
    isToggling.current = true;
    
    try {
        const response = await fetch(`/drone/${command}`);
        
        if (response.ok) {
            if (command === 'streamoff' && playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
                setStreamEnabled(false);
            } else if (command === 'streamon') {
                await initializePlayer();
                setStreamEnabled(true);
            }
        }
    } catch (error) {
        console.error('Error toggling video stream:', error);
        setError(`Failed to ${command}: ${error.message}`);
    } finally {
        isToggling.current = false;
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
    // First check: Ensure video container reference exists
    if (!videoRef.current) return;
    
    try {
        // Find the canvas element inside the video container
        // JSMpeg creates this canvas automatically to display video
        const canvas = videoRef.current.querySelector('canvas');
        
        // Second check: Ensure canvas was found
        if (!canvas) {
            console.error('No canvas element found');
            return;
        }

        // Convert the current frame on canvas to a base64 PNG image
        // toDataURL() creates a data URL containing image representation
        // Format: "data:image/png;base64,<actual-base64-data>"
        const imageData = canvas.toDataURL('image/png');
        
        // Make POST request to server to save the image
        const response = await fetch('/save-photo', {
            method: 'POST',  // Using POST method
            headers: {
                'Content-Type': 'application/json'  // Tell server we're sending JSON
            },
            // Convert our data to JSON string
            // imageData contains the base64 image string
            body: JSON.stringify({ imageData })
        });

        // Check if server successfully saved the photo
        if (response.ok) {
            // Get the filename server used to save the image
            const { fileName } = await response.json();
            console.log('Photo saved:', fileName);
            setError(null);  // Clear any previous errors
        } else {
            // If server response wasn't ok, throw error
            throw new Error('Failed to save photo');
        }
    } catch (error) {
        // Handle any errors that occurred during the process
        console.error('Error capturing photo:', error);
        // Show error to user
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
                // Get the filenames (both .ts and .mp4) from server response
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
        <div ref={videoRef}></div>
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
            Recording in progress... (Will save as both MP4 and TS)
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
