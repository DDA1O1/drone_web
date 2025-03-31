import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setDroneState } from '@/store/slices/droneSlice';

export function useDroneStateEventSource() {
    const dispatch = useDispatch();

    useEffect(() => {
        // Create EventSource connection
        const eventSource = new EventSource(`http://${window.location.hostname}:3000/drone-state-stream`);

        // Handle incoming messages
        eventSource.onmessage = (event) => {
            try {
                const state = JSON.parse(event.data);
                dispatch(setDroneState(state));
            } catch (error) {
                console.error('Error processing drone state:', error);
            }
        };

        // Handle connection errors
        eventSource.onerror = (error) => {
            // Log the error but don't close the connection
            // EventSource will automatically attempt to reconnect
            console.error('EventSource error - attempting automatic reconnection:', error);
            
            // Log the connection state
            console.log('EventSource readyState:', 
                eventSource.readyState === 0 ? 'CONNECTING' :
                eventSource.readyState === 1 ? 'OPEN' :
                eventSource.readyState === 2 ? 'CLOSED' : 'UNKNOWN'
            );
        };

        // Cleanup on unmount
        return () => {
            eventSource.close();
        };
    }, []); // Empty dependency array since we only want to create the connection once
} 