/**
 * Tello Drone Control Interface
 * This component handles the video streaming and control interface for the Tello drone.
 */

import JSMpegVideoPlayer from '@/components/JSMpegVideoPlayer'
import DroneControl from '@/components/control/DroneControl'
import DroneStateDisplay from '@/components/DroneStateDisplay'

function App() {
  return (
    <div className="relative h-screen">
      {/* JSMpegVideoPlayer - renders the video stream */}
      <JSMpegVideoPlayer />
      
      {/* Drone state display */}
      <DroneStateDisplay />
      
      {/* Drone controls overlay */}
      <DroneControl />
    </div>
  );
}

export default App;
