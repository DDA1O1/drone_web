/**
 * Tello Drone Control Interface
 * This component handles the video streaming and control interface for the Tello drone.
 */

import { useRef } from 'react'
import VideoContainer from '@/components/VideoContainer'
import DroneControl from '@/components/control/DroneControl'

function App() {
  // Refs for managing video player
  const videoRef = useRef(null);
  
  return (
    <div className="relative h-screen">
      {/* Video container - renders as background */}
      <VideoContainer ref={videoRef} />
      
      {/* Drone controls overlay */}
      <DroneControl />
    </div>
  );
}

export default App;
