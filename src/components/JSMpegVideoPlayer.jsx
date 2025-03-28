import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import JSMpeg from '@cycjimmy/jsmpeg-player';
import { setVideoConnection } from '@/store/slices/droneSlice';

const JSMpegVideoPlayer = ({ onError }) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const dispatch = useDispatch();

  useEffect(() => {
    initializePlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      dispatch(setVideoConnection(false));
    };
  }, [dispatch]);

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
            onError('Failed to connect to video stream: ' + error.message);
          }
        }
      });
      
      playerRef.current = player.player;

      if (player?.player?.source?.socket) {
        player.player.source.socket.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          onError('WebSocket connection error: ' + error.message);
        });
      }

    } catch (err) {
      onError('Failed to initialize video: ' + err.message);
    }
  };

  const getPlayer = () => playerRef.current;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black">
      <div 
        ref={videoRef} 
        className="w-full h-full"
      ></div>
    </div>
  );
};

export default JSMpegVideoPlayer; 