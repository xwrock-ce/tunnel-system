import React, { useState, useRef, useEffect } from 'react';

interface ImageComparisonProps {
  leftImage: string;
  rightImage: string;
  leftLabel?: string;
  rightLabel?: string;
  height?: number | string;
}

const ImageComparison: React.FC<ImageComparisonProps> = ({
  leftImage,
  rightImage,
  leftLabel = 'Original',
  rightLabel = 'Overlay',
  height = '500px'
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  const handleTouchStart = () => {
    setIsResizing(true);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  const handleMouseMove = (e: MouseEvent | TouchEvent) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    
    // Calculate percentage
    let newPos = ((clientX - containerRect.left) / containerRect.width) * 100;
    
    // Clamp between 0 and 100
    newPos = Math.max(0, Math.min(100, newPos));
    
    setSliderPosition(newPos);
  };

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: typeof height === 'number' ? `${height}px` : height, 
        overflow: 'hidden',
        borderRadius: '8px',
        userSelect: 'none',
        cursor: isResizing ? 'ew-resize' : 'default',
        backgroundColor: '#f0f2f5'
      }}
    >
      {/* Right Image (Background - Overlay) */}
      <img
        src={rightImage}
        alt={rightLabel}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block'
        }}
        draggable={false}
      />

      {/* Label for Right Image */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        background: 'rgba(0,0,0,0.6)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        pointerEvents: 'none',
        zIndex: 10
      }}>
        {rightLabel}
      </div>

      {/* Left Image (Foreground - Original) - Clipped */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${sliderPosition}%`,
          height: '100%',
          overflow: 'hidden',
          borderRight: '2px solid white',
          zIndex: 20
        }}
      >
        <img
          src={leftImage}
          alt={leftLabel}
          style={{
            width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100vw', // Approximation initially
            // Better approach: use object-fit logic or precise width. 
            // For simple implementation, assuming container width is stable or using 100% width of parent and translating.
            // Let's try a different approach: absolute positioning with same dimensions as parent
            height: '100%',
            objectFit: 'contain',
            maxWidth: 'none' // Important to prevent squishing
          }}
          // We need to ensure the image inside the clipped div aligns perfectly with the background image
          // Since we use object-fit: contain, it centers. 
          // If the aspect ratios match, this is fine. 
          // To be safe, we really need the image natural dimensions or force 100% width/height stretch if acceptable.
          // For engineering, aspect ratio preservation is key. 
          // object-fit: contain centers the image.
          // If we use the SAME object-fit: contain on both, they will align if the container size is the same.
          // The issue is the inner image needs to be the full width of the CONTAINER, not the clipped div.
        />
         {/* Fix for the inner image width: */}
         {containerRef.current && (
           <style>
             {`
               .clipped-image {
                 width: ${containerRef.current.clientWidth}px !important;
               }
             `}
           </style>
         )}
      </div>
      
      {/* We need a better way to handle the width of the clipped image without JS recalculation if possible. 
          Actually, if we set the image width to the container's width (100% of parent), it refers to the clipped parent.
          So we need to set the image width to 100% of the *comparison container*, not the *clip div*.
          Since we can't use 100% of grandparent in CSS easily, we might need a fixed aspect ratio or JS.
          
          Let's try a simpler approach often used: 
          Both images absolute. Top one uses clip-path.
      */}
    </div>
  );
};

// Re-implementing with clip-path for better stability
const ImageComparisonV2: React.FC<ImageComparisonProps> = ({
  leftImage,
  rightImage,
  leftLabel = 'Original',
  rightLabel = 'Overlay',
  height = '500px'
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    setIsResizing(true);
    setHasInteracted(true);
  };

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = (x / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, percent)));
  };

  useEffect(() => {
    const handleWindowMove = (e: MouseEvent) => {
      if (isResizing) handleMove(e.clientX);
    };
    const handleWindowUp = () => {
      setIsResizing(false);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isResizing) handleMove(e.touches[0].clientX);
    };

    window.addEventListener('mousemove', handleWindowMove);
    window.addEventListener('mouseup', handleWindowUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleWindowUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleWindowUp);
    };
  }, [isResizing]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: typeof height === 'number' ? `${height}px` : height, 
        overflow: 'hidden', 
        borderRadius: '8px', 
        backgroundColor: '#000', // Dark background for engineering contrast
        cursor: 'ew-resize'
      }}
      onMouseDown={(e) => { handleStart(); handleMove(e.clientX); }}
      onTouchStart={(e) => { handleStart(); handleMove(e.touches[0].clientX); }}
    >
      {!hasInteracted && (
        <div className="image-compare-hint">拖动分隔线对比</div>
      )}
      {/* Right Image (Background) */}
      <img
        src={rightImage}
        alt={rightLabel}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none'
        }}
      />
      
      {/* Right Label */}
       <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 20
      }}>
        {rightLabel}
      </div>

      {/* Left Image (Foreground) - Clipped */}
      <img
        src={leftImage}
        alt={leftLabel}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`
        }}
      />
      
      {/* Left Label */}
       <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 20
      }}>
        {leftLabel}
      </div>

      {/* Slider Handle */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${sliderPosition}%`,
          width: '2px',
          background: '#fff',
          cursor: 'ew-resize',
          zIndex: 30,
          boxShadow: '0 0 5px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '24px',
          height: '24px',
          background: '#fff',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          color: '#333',
          fontSize: '12px'
        }}>
          ⬌
        </div>
      </div>
    </div>
  );
};

export default ImageComparisonV2;
