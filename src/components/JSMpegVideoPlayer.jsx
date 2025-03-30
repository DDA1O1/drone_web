import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import JSMpeg from '@cycjimmy/jsmpeg-player';
import { setStreamEnabled, setError } from '@/store/slices/droneSlice';
import VideoContainer from '@/components/VideoContainer';

const JSMpegVideoPlayer = () => {
  // Refs to manage video element, player instance, and initialization state
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const isInitializedRef = useRef(false);
  
  const {
    streamEnabled
  } = useSelector(state => state.drone);
  const dispatch = useDispatch();

  // Cleanup effect: Destroy player and reset state on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      dispatch(setStreamEnabled(false));
      isInitializedRef.current = false;
    };
  }, []);

  // Handle video stream state changes
  useEffect(() => {
    // Initialize player on first stream enable
    if (!playerRef.current) {
      if (streamEnabled && !isInitializedRef.current) {
        initializePlayer();
      }
      return;
    }
    
    // Use player's built-in methods for subsequent play/pause
    if (streamEnabled) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, [streamEnabled]);

  // Initialize JSMpeg video player with WebSocket stream
  const initializePlayer = () => {
    if (playerRef.current || !streamEnabled) return;
    
    try {
      const url = `ws://${window.location.hostname}:3001`;
      // Create new JSMpeg player instance with configuration
      const player = new JSMpeg.VideoElement(videoRef.current, url, {
        videoWidth: 640,
        videoHeight: 480,
        videoBufferSize: 512 * 1024,
        streaming: true,
        decodeFirstFrame: true,
        chunkSize: 4096,
        disableGl: false,
        progressive: true,
        throttled: false,
        
        // Event hooks for player state management
        hooks: {
          play: () => {
            console.log('Video playback started');
            dispatch(setStreamEnabled(true));
          },
          pause: () => dispatch(setStreamEnabled(false)),
          stop: () => dispatch(setStreamEnabled(false)),
          error: (error) => {
            console.error('JSMpeg error:', error);
            dispatch(setError('Failed to connect to video stream: ' + error.message));
          }
        }
      });
      
      // Store player reference and mark as initialized
      playerRef.current = player.player;
      isInitializedRef.current = true;

      // Add WebSocket error handler
      if (playerRef.current?.source?.socket) {
        playerRef.current.source.socket.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          dispatch(setError('WebSocket connection error: ' + error.message));
        });
      }

    } catch (err) {
      console.error('Failed to initialize video:', err);
      dispatch(setError('Failed to initialize video: ' + err.message));
    }
  };

  return <VideoContainer ref={videoRef} />;
};

export default JSMpegVideoPlayer; 