import { forwardRef } from 'react';

const VideoContainer = forwardRef((props, ref) => {
  return (
    <div className="fixed inset-0 w-screen h-screen bg-black">
      <div 
        ref={ref}
        className="w-full h-full object-contain"
      ></div>
    </div>
  );
});

export default VideoContainer; 