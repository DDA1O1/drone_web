import { configureStore } from '@reduxjs/toolkit';
import droneReducer from './slices/droneSlice';

export const store = configureStore({
  reducer: {
    drone: droneReducer
  }
});

export default store; 