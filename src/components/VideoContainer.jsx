import { forwardRef } from 'react';

{/* VideoContainer is a simple presentational component that creates a full-screen black container
It uses forwardRef to pass a ref down to its inner div
It's purely responsible for layout and styling
Acts as a wrapper/container where video content can be rendered */}
const VideoContainer = forwardRef((_, ref) => {
  return (
    <div className="fixed inset-0 w-screen h-screen bg-black">
      <div 
        ref={ref}
        className="w-full h-full object-contain"
      ></div>
    </div>
  );
});

VideoContainer.displayName = 'VideoContainer';

export default VideoContainer; 