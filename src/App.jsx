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
  
  // Reconnection handling
  const reconnectTimeoutRef = useRef(null);          // Timeout for reconnection attempts
  const reconnectAttemptsRef = useRef(0);            // Counter for reconnection attempts
  const MAX_RECONNECT_ATTEMPTS = 5;                  // Maximum reconnection attempts

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

        // Monitor video performance
        if (playerRef.current) {
          setInterval(() => {
            const stats = playerRef.current.getVideoStats(); // Get video performance stats
            console.log('Video Stats:', {
              fps: stats.fps.toFixed(1), // FPS (frames per second)
              decodedFrames: stats.decodedFrames, // Number of frames decoded
              droppedFrames: stats.droppedFrames, // Number of frames dropped
              bufferSize: (stats.bufferSize / 1024).toFixed(1) + 'KB' // Buffer size in KB
            });
          }, 5000); // Update stats every 5 seconds
        }
      } catch (err) {
        console.error('Player initialization error:', err);
        setError(`Failed to initialize video: ${err.message}`);
      }
    }
  };

  // ==== LIFE CYCLE MANAGEMENT ====
  useEffect(() => {
    initializePlayer();
    return () => {
      // you have to clear the timeout even if you destroy the player instance cause timeout function is stored in browser memory otherwise it will keep running
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []); // Empty array means this will only run once on mount and unmount and not on re-render

  // Add event listener for drone connection
  useEffect(() => {
    const checkDroneStatus = async () => {
      try {
        const response = await fetch('/drone/command');
        setDroneConnected(response.ok);
      } catch (error) {
        setDroneConnected(false);
      }
    };
    
    // Check initially and every 5 seconds
    checkDroneStatus();
    const interval = setInterval(checkDroneStatus, 5000);
    
    return () => clearInterval(interval);
  }, []);

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
    }
  };

  return (
    <div className="container">
      <h1>Tello Drone Control</h1>
      
      {/* Connection status indicators */}
      <div className="status-container">
        <div className={`status ${droneConnected ? 'connected' : 'disconnected'}`}>
          Drone: {droneConnected ? 'Connected' : 'Disconnected'}
        </div>
        <div className={`status ${videoConnected ? 'connected' : 'disconnected'}`}>
          Video: {videoConnected ? 'Connected' : 'Disconnected'}
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      
      {/* Video stream container */}
      <div className="video-container">
        <div ref={videoRef}></div>
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
