import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import JSMpeg from '@cycjimmy/jsmpeg-player';
import { setStreamEnabled, setError } from '@/store/slices/droneSlice';
import VideoContainer from '@/components/VideoContainer';

const JSMpegVideoPlayer = () => {
  const videoRef = useRef(null);
  const playerRef = useRef(null); // for storing reference to the JSMpeg player instance
  
  const {
    streamEnabled
  } = useSelector(state => state.drone);
  const dispatch = useDispatch();

  useEffect(() => {
    initializePlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      dispatch(setStreamEnabled(false));
    };
  }, []);

  useEffect(() => {
    if (!playerRef.current) return;
    
    if (streamEnabled) {
      playerRef.current.play();
      dispatch(setStreamEnabled(true));
    } else {
      playerRef.current.pause();
      dispatch(setStreamEnabled(false));
    }
  }, [streamEnabled]);

  const initializePlayer = () => {
    if (playerRef.current) return;
    
    try {
      const url = `ws://${window.location.hostname}:3001`;
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
      
      playerRef.current = player.player;

      if (playerRef.current?.source?.socket) {
        playerRef.current.source.socket.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          dispatch(setError('WebSocket connection error: ' + error.message));
        });
      }

    } catch (err) {
      dispatch(setError('Failed to initialize video: ' + err.message));
    }
  };

  return <VideoContainer ref={videoRef} />;
};

export default JSMpegVideoPlayer; 