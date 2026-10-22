import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * CompanionBot3D
 * 
 * Real-time 3D interactive companion bot rendered with Three.js.
 * Features:
 * - Smooth, glossy blue-purple pearlescent sphere with soft lighting & rim glow
 * - Two capsule/pill white eyes on an independent eye rig that accurately and smoothly follows cursor
 * - Correct vertical & horizontal orientation: cursor up -> eyes up, cursor down -> eyes down, left -> left, right -> right
 * - Frame-rate-independent exponential damping based on delta time (smooth at 60Hz, 120Hz, 144Hz+)
 * - Dedicated hierarchy decoupling idle floating transforms from eye-tracking rotations to prevent transform fighting
 * - Lifelike periodic blinking and gentle breathing pulsation
 * - Smooth easing back to neutral center when mouse stops moving or leaves the window
 * - Robust cleanup on unmount and WebGL fallback
 */
export default function CompanionBot3D({
  size = 130,
  hoverTarget = null,
  onClick = null
}) {
  const mountRef = useRef(null);
  const [webGLSupported, setWebGLSupported] = useState(true);

  // Normalized mouse target [-1, 1]
  const mouseRef = useRef({ x: 0, y: 0, active: false, lastMoveTime: 0 });
  const currentLookRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // 1. Check WebGL availability
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLSupported(false);
        return;
      }
    } catch (_) {
      setWebGLSupported(false);
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    const width = size;
    const height = size;

    // 2. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 4. Group Hierarchy: Decouple Idle Motion from Gaze Tracking
    // floatGroup: receives ONLY idle floating translation (Y) and subtle tilt (Z)
    const floatGroup = new THREE.Group();
    scene.add(floatGroup);

    // botGroup: child of floatGroup, receives ONLY body gaze tilt (X, Y)
    const botGroup = new THREE.Group();
    floatGroup.add(botGroup);

    // 5. Spherical Body Material & Geometry
    // Glossy blue-purple gradient with pearlescent sheen matching reference
    const bodyGeometry = new THREE.SphereGeometry(1.22, 64, 64);
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x3e38c8), // Deep vibrant blue-purple
      emissive: new THREE.Color(0x1a115c), // Subtle inner glow
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 0.95,
      clearcoatRoughness: 0.12,
      reflectivity: 0.85
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    botGroup.add(bodyMesh);

    // 6. Outer Glow / Rim Halo Mesh (slightly larger translucent shell)
    const haloGeometry = new THREE.SphereGeometry(1.26, 32, 32);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x6366f1),
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
    botGroup.add(haloMesh);

    // 7. Eye Rig
    // Independent eye rig rotating around center of sphere to follow cursor
    const eyeRigGroup = new THREE.Group();
    botGroup.add(eyeRigGroup);

    // Capsule Eye geometry (vertical pill shape)
    const eyeRadius = 0.095;
    const eyeHeight = 0.22;
    const eyeGeometry = new THREE.CapsuleGeometry(eyeRadius, eyeHeight, 16, 24);
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff)
    });

    // Left Eye
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    const eyeZ = 1.16;
    const eyeY = 0.22;
    const eyeSpacing = 0.32;
    leftEye.position.set(-eyeSpacing, eyeY, eyeZ);
    leftEye.rotation.z = -0.04; // Gentle outward tilt for cute companion feel
    eyeRigGroup.add(leftEye);

    // Right Eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(eyeSpacing, eyeY, eyeZ);
    rightEye.rotation.z = 0.04;
    eyeRigGroup.add(rightEye);

    // 8. Lighting Rig
    // Key Light: Crisp cyan/ice-blue from top-right front
    const keyLight = new THREE.DirectionalLight(0x7dd3fc, 2.4);
    keyLight.position.set(2.8, 3.2, 3.5);
    scene.add(keyLight);

    // Fill Light: Warm magenta/violet from bottom-left
    const fillLight = new THREE.DirectionalLight(0xd946ef, 1.8);
    fillLight.position.set(-3.2, -2.4, 2.8);
    scene.add(fillLight);

    // Rim Light: Cool indigo from behind-left for edge glow
    const rimLight = new THREE.DirectionalLight(0x818cf8, 2.2);
    rimLight.position.set(-2.5, 2.5, -3.0);
    scene.add(rimLight);

    // Specular Highlight Light (top center)
    const specLight = new THREE.PointLight(0xffffff, 1.2, 12);
    specLight.position.set(0.5, 3.5, 2.5);
    scene.add(specLight);

    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0x2e1065, 0.9);
    scene.add(ambientLight);

    // 9. Normalized Pointer Tracking
    const handlePointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      const botCenterX = rect.left + rect.width / 2;
      const botCenterY = rect.top + rect.height / 2;

      // Distance from bot center to cursor normalized by viewport half-extents
      // dx > 0 when cursor is right of bot; dx < 0 when left
      // dy > 0 when cursor is below bot; dy < 0 when above
      const halfWidth = Math.max(window.innerWidth / 2, 300);
      const halfHeight = Math.max(window.innerHeight / 2, 300);

      const dx = (e.clientX - botCenterX) / halfWidth;
      const dy = (e.clientY - botCenterY) / halfHeight;

      mouseRef.current = {
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
        active: true,
        lastMoveTime: performance.now()
      };
    };

    const handlePointerLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);

    // 10. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();
    let nextBlinkTime = 3.0;
    let blinkState = { isBlinking: false, progress: 0 };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      animationFrameId = requestAnimationFrame(render);

      const delta = Math.min(clock.getDelta(), 0.1); // Cap delta to avoid large jumps on tab switch
      const elapsed = clock.getElapsedTime();
      const now = performance.now();

      // Check if mouse has been still for > 4.5 seconds or pointer left window
      const isIdle = !mouseRef.current.active || (now - mouseRef.current.lastMoveTime > 4500);

      // Target Coordinates:
      // When tracking: target follows clamped mouseRef
      // When idle: target smoothly settles near neutral center with subtle curious idle drift
      let targetX = 0;
      let targetY = 0;

      if (!isIdle) {
        targetX = mouseRef.current.x;
        targetY = mouseRef.current.y;
      } else {
        // Soft lifelike curiosity drift when not actively tracking
        targetX = Math.sin(elapsed * 0.35) * 0.08;
        targetY = Math.cos(elapsed * 0.45) * 0.05;
      }

      // Frame-rate-independent exponential damping:
      // factor = 1 - e^(-decay * delta)
      // Produces silky-smooth, identical motion across 60Hz, 120Hz, and 144Hz+ monitors
      const decay = 9.5;
      const factor = 1 - Math.exp(-decay * delta);
      currentLookRef.current.x += (targetX - currentLookRef.current.x) * factor;
      currentLookRef.current.y += (targetY - currentLookRef.current.y) * factor;

      const lookX = currentLookRef.current.x;
      const lookY = currentLookRef.current.y;

      // Coordinate Mapping & Rotation Signs:
      // In Three.js (camera at +Z looking at origin):
      // - Yaw (horizontal):
      //   Cursor right (lookX > 0) -> rotation.y > 0 turns face RIGHT. Correct!
      // - Pitch (vertical):
      //   Cursor up (lookY < 0) -> rotation.x < 0 tilts face UP.
      //   Cursor down (lookY > 0) -> rotation.x > 0 tilts face DOWN.
      //   Therefore: rotation.x = lookY * maxAnglePitch (POSITIVE factor, NO negation!).
      const maxEyeYaw = 0.38;   // ~22 degrees max horizontal look
      const maxEyePitch = 0.25; // ~14 degrees max vertical look

      // Eye rig rotates to track cursor smoothly
      eyeRigGroup.rotation.y = lookX * maxEyeYaw;
      eyeRigGroup.rotation.x = lookY * maxEyePitch;

      // Body mesh subtly tilts in the same direction for natural character weight
      botGroup.rotation.y = lookX * 0.14;
      botGroup.rotation.x = lookY * 0.09;

      // Idle Floating Motion on dedicated floatGroup (never conflicts with eye tracking rotations)
      if (!prefersReducedMotion) {
        floatGroup.position.y = Math.sin(elapsed * 1.8) * 0.08;
        floatGroup.rotation.z = Math.sin(elapsed * 1.2) * 0.02;

        // Gentle breathing pulsation
        const breathe = 1 + Math.sin(elapsed * 2.0) * 0.01;
        bodyMesh.scale.set(breathe, breathe, breathe);
      }

      // Natural Blink Mechanism
      if (!blinkState.isBlinking) {
        if (elapsed > nextBlinkTime) {
          blinkState.isBlinking = true;
          blinkState.progress = 0;
          nextBlinkTime = elapsed + 3.2 + Math.random() * 3.2;
        }
      } else {
        // Snappy, cute blink: ~150ms
        blinkState.progress += delta * 7.5;
        if (blinkState.progress >= Math.PI) {
          blinkState.isBlinking = false;
          leftEye.scale.y = 1;
          rightEye.scale.y = 1;
        } else {
          const eyeScaleY = Math.max(0.08, Math.abs(Math.cos(blinkState.progress)));
          leftEye.scale.y = eyeScaleY;
          rightEye.scale.y = eyeScaleY;
        }
      }

      renderer.render(scene, camera);
    };

    render();

    // 11. Cleanup on Unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      // Dispose Three.js resources
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      eyeGeometry.dispose();
      eyeMaterial.dispose();
      renderer.dispose();
    };
  }, [size]);

  // Fallback if WebGL is unavailable
  if (!webGLSupported) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #818cf8 0%, #4338ca 45%, #1e1b4b 100%)',
          boxShadow: '0 0 25px rgba(99, 102, 241, 0.4), inset -5px -5px 15px rgba(217, 70, 239, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px'
        }}
        onClick={onClick}
      >
        <div style={{ width: '8px', height: '18px', backgroundColor: '#FFFFFF', borderRadius: '6px' }} />
        <div style={{ width: '8px', height: '18px', backgroundColor: '#FFFFFF', borderRadius: '6px' }} />
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      onClick={onClick}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none'
      }}
      title="Strategic Chess Companion Bot"
    />
  );
}
