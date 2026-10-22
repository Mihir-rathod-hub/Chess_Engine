import React, { useRef, useState, useEffect } from 'react';

export default function SeamlessVideoBackground({ 
  src, 
  fadeDuration = 1.2,
  pauseDuration = 1.2,
  videoClassName = "bg-video-element",
  baseOpacity = 1,
  style = {}
}) {
  const videoRef = useRef(null);
  const [opacity, setOpacity] = useState(0); // Start at 0 for smooth initial emergence
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.play().catch(() => {});

    // Initial page load: smooth 1.2s emergence out of black
    const mountTimer = setTimeout(() => {
      setOpacity(baseOpacity);
    }, 100);

    const checkTime = () => {
      if (!video || isTransitioningRef.current) return;

      const dur = video.duration;
      if (dur && !isNaN(dur) && dur > fadeDuration * 2) {
        const timeRemaining = dur - video.currentTime;

        // 1. Trigger slow fade-out as video approaches end
        if (timeRemaining <= fadeDuration || video.ended) {
          isTransitioningRef.current = true;
          setOpacity(0); // Fade out to 0 opacity

          // 2. Wait for video to finish AND hold in blackness for pauseDuration (1.2s)
          const waitTimeInBlack = (fadeDuration + pauseDuration) * 1000;

          setTimeout(() => {
            // 3. Reset video to 0.0s while completely transparent (opacity 0)
            video.currentTime = 0;
            video.play().catch(() => {});

            // 4. Smooth emergence: fade opacity back to baseOpacity after video begins frame 0
            setTimeout(() => {
              setOpacity(baseOpacity); // Slowly emerge out of black

              setTimeout(() => {
                isTransitioningRef.current = false;
              }, fadeDuration * 1000 + 200);
            }, 120);

          }, waitTimeInBlack);
        }
      }
    };

    const interval = setInterval(checkTime, 50);
    return () => {
      clearInterval(interval);
      clearTimeout(mountTimer);
    };
  }, [src, fadeDuration, pauseDuration, baseOpacity]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1, ...style }}>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        className={videoClassName}
        style={{
          opacity: opacity,
          transition: `opacity ${fadeDuration}s cubic-bezier(0.4, 0, 0.2, 1)`,
          willChange: 'opacity'
        }}
      />
    </div>
  );
}
