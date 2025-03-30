import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setDroneState } from '@/store/slices/droneSlice';

export function useDroneStateWebSocket() {
    const dispatch = useDispatch();

    useEffect(() => {
        // Create WebSocket connection
        const ws = new WebSocket(`ws://${window.location.hostname}:3001/state`);

        // Handle incoming messages
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'droneState') {
                    dispatch(setDroneState(data.value));
                }
            } catch (error) {
                console.error('Error processing drone state:', error);
            }
        };

        // Handle connection errors
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        // Cleanup on unmount
        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, []); // Empty dependency array since we only want to create the connection once
} 