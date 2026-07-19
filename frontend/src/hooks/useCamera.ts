import { useRef, useCallback } from 'react';
import type * as PIXI from 'pixi.js';
import { CameraController, CameraConfig } from '../camera/CameraController';

/**
 * Simple hook that manages a CameraController instance.
 * Call `init` inside a useEffect to create the controller.
 */
export function useCamera() {
  const ctrlRef = useRef<CameraController | null>(null);

  const init = useCallback(
    (container: PIXI.Container, config: CameraConfig): CameraController => {
      ctrlRef.current = new CameraController(container, config);
      return ctrlRef.current;
    },
    [],
  );

  const get = useCallback((): CameraController | null => ctrlRef.current, []);

  return { init, get };
}
