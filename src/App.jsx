import { useState, useEffect, useRef } from 'react'
import JSMpeg from '@cycjimmy/jsmpeg-player'
import './App.css'

function App() {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const initializePlayer = () => {
    if (videoRef.current && !playerRef.current) {
      try {
        const url = `ws://${window.location.hostname}:3001`;
        console.log('Connecting to stream at:', url);
        
        // Create new JSMpeg player instance with optimized settings
        playerRef.current = new JSMpeg.VideoElement(
          videoRef.current,
          url,
          {
            autoplay: true,
            audio: false,
            videoBufferSize: 256 * 1024,    // Reduced buffer size
            streaming: true,
            maxAudioLag: 0,
            disableGl: false,               // Enable WebGL for better performance
            progressive: true,              // Enable progressive loading
            chunkSize: 4096,               // Match server chunk size
            decodeFirstFrame: true,         // Decode first frame immediately
            preserveDrawingBuffer: false,   // Improve performance
            throttled: false,               // Disable throttling
            onSourceEstablished: () => {
              console.log('Stream source established');
              reconnectAttemptsRef.current = 0;
              setConnected(true);
              setError(null);
            },
            onSourceCompleted: () => {
              console.log('Stream completed');
            },
            onStalled: () => {
              console.log('Stream stalled');
              setError('Video stream stalled - attempting to reconnect...');
            },
            onEnded: () => {
              console.log('Stream ended');
              setConnected(false);
              
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
                reconnectTimeoutRef.current = setTimeout(() => {
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

        // Store the actual player instance for controls
        playerRef.current = playerRef.current.player;

        // Add performance monitoring
        if (playerRef.current) {
          setInterval(() => {
            const stats = playerRef.current.getVideoStats();
            console.log('Video Stats:', {
              fps: stats.fps.toFixed(1),
              decodedFrames: stats.decodedFrames,
              droppedFrames: stats.droppedFrames,
              bufferSize: (stats.bufferSize / 1024).toFixed(1) + 'KB'
            });
          }, 5000);
        }
      } catch (err) {
        console.error('Player initialization error:', err);
        setError(`Failed to initialize video: ${err.message}`);
      }
    }
  };

  useEffect(() => {
    initializePlayer();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

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
      <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
        Status: {connected ? 'Connected' : 'Disconnected'}
        {error && <div className="error">{error}</div>}
      </div>
      
      <div className="video-container">
        <div ref={videoRef}></div>
      </div>

      <div className="controls">
        <div className="control-row">
          <button onClick={() => sendCommand('takeoff')}>Take Off</button>
          <button onClick={() => sendCommand('land')}>Land</button>
          <button className="emergency" onClick={() => sendCommand('emergency')}>Emergency Stop</button>
        </div>

        <div className="control-row">
          <button onClick={() => sendCommand('up 20')}>Up</button>
          <button onClick={() => sendCommand('down 20')}>Down</button>
        </div>

        <div className="control-row">
          <button onClick={() => sendCommand('left 20')}>Left</button>
          <button onClick={() => sendCommand('forward 20')}>Forward</button>
          <button onClick={() => sendCommand('back 20')}>Back</button>
          <button onClick={() => sendCommand('right 20')}>Right</button>
        </div>

        <div className="control-row">
          <button onClick={() => sendCommand('ccw 45')}>Rotate Left</button>
          <button onClick={() => sendCommand('cw 45')}>Rotate Right</button>
        </div>
      </div>
    </div>
  )
}

export default App
