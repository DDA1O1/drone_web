import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setError } from '@/store/slices/droneSlice';

const DroneControl = () => {
  const dispatch = useDispatch();
  const { droneConnected } = useSelector(state => state.drone);
  const [speed, setSpeed] = useState(10); // Default speed 10 cm/s
  const [activeKeys, setActiveKeys] = useState(new Set());

  // Basic command sender
  const sendCommand = async (command) => {
    if (!droneConnected) {
      dispatch(setError('Drone not connected'));
      return;
    }

    try {
      const response = await fetch(`/drone/${command}`);
      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }
      const data = await response.text();
      console.log('Command response:', data);
    } catch (error) {
      console.error(error);
      dispatch(setError(error.message));
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        setActiveKeys(prev => {
          const updated = new Set(prev);
          updated.add(e.key);
          return updated;
        });

        // Map keys to drone commands
        switch (e.key) {
          case 'w': sendCommand(`forward ${20}`); break;
          case 's': sendCommand(`back ${20}`); break;
          case 'a': sendCommand(`left ${20}`); break;
          case 'd': sendCommand(`right ${20}`); break;
          case 'ArrowUp': sendCommand(`up ${20}`); break;
          case 'ArrowDown': sendCommand(`down ${20}`); break;
          case 'ArrowLeft': sendCommand(`ccw ${45}`); break;
          case 'ArrowRight': sendCommand(`cw ${45}`); break;
        }
      }
    };

    const handleKeyUp = (e) => {
      const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        setActiveKeys(prev => {
          const updated = new Set(prev);
          updated.delete(e.key);
          return updated;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [droneConnected]);

  // Basic flight controls
  const handleTakeoff = () => sendCommand('takeoff');
  const handleLand = () => sendCommand('land');
  const handleEmergency = () => sendCommand('emergency');

  // Speed control
  const handleSpeedChange = async (newSpeed) => {
    if (newSpeed >= 10 && newSpeed <= 100) {
      setSpeed(newSpeed);
      await sendCommand(`speed ${newSpeed}`);
    }
  };

  return (
    <>
      {/* Takeoff/Land Controls - Top Left */}
      <div className="absolute top-8 left-8 z-30 flex gap-4">
        {/* Takeoff button */}
        <button
          onClick={handleTakeoff}
          disabled={!droneConnected}
          className={`group relative p-3 rounded-full ${
            droneConnected 
              ? 'bg-gradient-to-br from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 ring-2 ring-green-400/50' 
              : 'bg-gray-500/50 cursor-not-allowed'
          } transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-green-500/25`}
          title="Takeoff"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 text-white drop-shadow" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2.5} 
              d="M5 10l7-7m0 0l7 7m-7-7v18" 
            />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Takeoff (T)
          </span>
        </button>

        {/* Land button */}
        <button
          onClick={handleLand}
          disabled={!droneConnected}
          className={`group relative p-3 rounded-full ${
            droneConnected 
              ? 'bg-gradient-to-br from-gray-100 to-white hover:from-white hover:to-gray-100 ring-2 ring-gray-200' 
              : 'bg-gray-500/50 cursor-not-allowed'
          } transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-gray-200/50`}
          title="Land"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 text-gray-700" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2.5} 
              d="M19 14l-7 7m0 0l-7-7m7 7V3" 
            />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Land (L)
          </span>
        </button>

        {/* Emergency button */}
        <button
          onClick={handleEmergency}
          disabled={!droneConnected}
          className={`group relative p-3 rounded-full ${
            droneConnected 
              ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 ring-2 ring-red-500/50 animate-pulse' 
              : 'bg-gray-500/50 cursor-not-allowed'
          } transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-red-500/25`}
          title="Emergency Stop"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 text-white drop-shadow" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={3} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Emergency Stop (ESC)
          </span>
        </button>
      </div>

      {/* Left corner - WASD Movement Controls */}
      <div className="absolute bottom-8 left-8 z-30">
        <div className="bg-black bg-opacity-70 p-6 rounded-lg text-white">
          <h3 className="text-center font-bold mb-4">Movement</h3>
          
          {/* WASD keys */}
          <div className="grid grid-cols-3 gap-2 w-40 mx-auto">
            <div></div>
            <div className={`border-2 ${activeKeys.has('w') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>W</div>
            <div></div>
            <div className={`border-2 ${activeKeys.has('a') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>A</div>
            <div className={`border-2 ${activeKeys.has('s') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>S</div>
            <div className={`border-2 ${activeKeys.has('d') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>D</div>
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-400">
            <p>Forward / Backward</p>
            <p>Left / Right</p>
          </div>
        </div>
      </div>
      
      {/* Right corner - Arrow keys for Altitude & Rotation */}
      <div className="absolute bottom-8 right-8 z-30">
        <div className="bg-black bg-opacity-70 p-6 rounded-lg text-white">
          <h3 className="text-center font-bold mb-4">Altitude & Rotation</h3>
          
          {/* Arrow keys */}
          <div className="grid grid-cols-3 gap-2 w-40 mx-auto">
            <div></div>
            <div className={`border-2 ${activeKeys.has('ArrowUp') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>↑</div>
            <div></div>
            <div className={`border-2 ${activeKeys.has('ArrowLeft') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>←</div>
            <div className={`border-2 ${activeKeys.has('ArrowDown') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>↓</div>
            <div className={`border-2 ${activeKeys.has('ArrowRight') ? 'bg-blue-500 border-blue-300' : 'border-gray-600'} rounded-md p-3 text-center font-bold`}>→</div>
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-400">
            <p>Up / Down</p>
            <p>Rotate Left / Right</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default DroneControl; 