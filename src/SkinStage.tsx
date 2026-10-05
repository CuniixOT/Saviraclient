import { useEffect, useRef } from 'react';

export function SkinStage({ skin, name }: { skin: string | null; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let viewer: import('skinview3d').SkinViewer | undefined;
    let resize: ResizeObserver | undefined;
    void import('skinview3d').then(({ IdleAnimation, SkinViewer }) => {
      if (disposed) return;
      viewer = new SkinViewer({ canvas, width: canvas.clientWidth, height: canvas.clientHeight, skin: skin || './default-skin.png' });
      viewer.background = null;
      viewer.fov = 38;
      viewer.zoom = .8;
      viewer.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      viewer.autoRotateSpeed = 0.35;
      const idle = new IdleAnimation();
      idle.speed = 0.7;
      viewer.animation = idle;
      viewer.globalLight.intensity = 2.7;
      viewer.cameraLight.intensity = 0.55;
      resize = new ResizeObserver(([entry]) => {
        if (!viewer) return;
        viewer.width = Math.max(1, Math.round(entry.contentRect.width));
        viewer.height = Math.max(1, Math.round(entry.contentRect.height));
      });
      resize.observe(canvas);
    });
    return () => { disposed = true; resize?.disconnect(); viewer?.dispose(); };
  }, [skin]);

  return <div className="skin-stage"><span className="nametag pixel">{name}</span><canvas ref={canvasRef} aria-label={`3D-Skin von ${name}, mit der Maus drehbar`} /><div className="skin-shadow" /></div>;
}
