(() => {
  const { useEffect, useMemo, useRef, useState } = React;

  const TYPE_EMOJI = {
    Valve: '⚙️',
    Switch: '⚡️',
    Hydrant: '🧯',
    Exit: '🚪'
  };
  const FALLBACK_COMPONENTS = [
    {
      id: 'VX248B',
      type: 'Valve',
      x: 1240,
      y: 860,
      defaultPosition: 'closed',
      flammable: true,
      lastInspected: '2025-07-28'
    },
    {
      id: 'SW102A',
      type: 'Switch',
      x: 740,
      y: 420,
      defaultPosition: 'on',
      flammable: false,
      lastInspected: '2025-06-15'
    },
    {
      id: 'HY330C',
      type: 'Hydrant',
      x: 1680,
      y: 980,
      defaultPosition: 'closed',
      flammable: false,
      lastInspected: '2025-05-02'
    },
    {
      id: 'EX017D',
      type: 'Exit',
      x: 320,
      y: 120,
      defaultPosition: 'open',
      flammable: false,
      lastInspected: '2025-08-01'
    }
  ];

  const HIT_RADIUS = 26;
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 4.5;
  const VERSION_POLL_MS = 60000;

  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // Convert screen pixels into world coordinates using the camera transform.
  function screenToWorld(point, camera, viewport) {
    return {
      x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
      y: (point.y - viewport.height / 2) / camera.zoom + camera.y
    };
  }

  // Convert world coordinates into screen pixels for hit tests and UI anchors.
  function worldToScreen(point, camera, viewport) {
    return {
      x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
      y: (point.y - camera.y) * camera.zoom + viewport.height / 2
    };
  }

  function formatDate(value) {
    if (!value) return 'Unknown';
    const parts = value.split('-');
    if (parts.length !== 3) return value;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function App() {
    const canvasRef = useRef(null);
    const popupRef = useRef(null);
    const cameraRef = useRef({ x: 800, y: 600, zoom: 1 });
    const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });
      const gestureRef = useRef({
        panning: false,
        lastX: 0,
        lastY: 0,
        pointers: new Map(),
        startDistance: 0,
        startZoom: 1,
        startWorld: null,
        dragged: false
      });
    const animationRef = useRef(null);
    const rafRef = useRef(null);
    const boundsRef = useRef({ minX: 0, minY: 0, maxX: 2000, maxY: 1200 });

    const [components, setComponents] = useState([]);
    const [version, setVersion] = useState('');
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [activeComponent, setActiveComponent] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [popupPosition, setPopupPosition] = useState(null);

    useEffect(() => {
      let debounce = null;
      debounce = setTimeout(() => setDebouncedQuery(query.trim()), 200);
      return () => clearTimeout(debounce);
    }, [query]);

    const fetchComponents = async () => {
      try {
        const response = await fetch('/components');
        const data = await response.json();
        setComponents(data.components || []);
        setVersion(data.version || '');
        if (data.components && data.components.length > 0) {
          const xs = data.components.map((item) => item.x);
          const ys = data.components.map((item) => item.y);
          boundsRef.current = {
            minX: Math.min(...xs) - 400,
            minY: Math.min(...ys) - 300,
            maxX: Math.max(...xs) + 400,
            maxY: Math.max(...ys) + 300
          };
          const camera = cameraRef.current;
          camera.x = (boundsRef.current.minX + boundsRef.current.maxX) / 2;
          camera.y = (boundsRef.current.minY + boundsRef.current.maxY) / 2;
          scheduleDraw();
        }
      } catch (error) {
        setComponents(FALLBACK_COMPONENTS);
        setVersion('offline');
        const xs = FALLBACK_COMPONENTS.map((item) => item.x);
        const ys = FALLBACK_COMPONENTS.map((item) => item.y);
        boundsRef.current = {
          minX: Math.min(...xs) - 400,
          minY: Math.min(...ys) - 300,
          maxX: Math.max(...xs) + 400,
          maxY: Math.max(...ys) + 300
        };
        const camera = cameraRef.current;
        camera.x = (boundsRef.current.minX + boundsRef.current.maxX) / 2;
        camera.y = (boundsRef.current.minY + boundsRef.current.maxY) / 2;
        scheduleDraw();
      }
    };

    useEffect(() => {
      fetchComponents();
      const interval = setInterval(async () => {
        const response = await fetch('/components/version');
        const data = await response.json();
        if (data.version && data.version !== version) {
          fetchComponents();
        }
      }, VERSION_POLL_MS);
      return () => clearInterval(interval);
    }, [version]);

    useEffect(() => {
      const handleResize = () => {
        viewportRef.current = {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1
        };
        scheduleDraw();
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    const results = useMemo(() => {
      if (!debouncedQuery) return [];
      const normalized = debouncedQuery.toLowerCase();
      return components
        .filter((item) => item.id.toLowerCase().includes(normalized))
        .slice(0, 20);
    }, [components, debouncedQuery]);

    const cancelAnimation = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    const scheduleDraw = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        draw();
      });
    };

    const drawFloorGrid = (ctx, bounds) => {
      const gridSize = 160;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = bounds.minX; x <= bounds.maxX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, bounds.minY);
        ctx.lineTo(x, bounds.maxY);
        ctx.stroke();
      }
      for (let y = bounds.minY; y <= bounds.maxY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(bounds.minX, y);
        ctx.lineTo(bounds.maxX, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const { width, height, dpr } = viewportRef.current;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0e0f12';
      ctx.fillRect(0, 0, width, height);

      const camera = cameraRef.current;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      const bounds = boundsRef.current;
      ctx.fillStyle = '#15171c';
      ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      drawFloorGrid(ctx, bounds);

      // Slightly soften scaling so emoji weight feels consistent across zoom levels.
      const symbolSize = 20 * Math.pow(camera.zoom, 0.8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${symbolSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

      components.forEach((component) => {
        const emoji = TYPE_EMOJI[component.type] || '📍';
        ctx.fillText(emoji, component.x, component.y);
      });

      if (selectedId) {
        const selected = components.find((item) => item.id === selectedId);
        if (selected) {
          ctx.strokeStyle = 'rgba(88,178,255,0.9)';
          ctx.lineWidth = 3 / camera.zoom;
          ctx.beginPath();
          ctx.arc(selected.x, selected.y, 30 / camera.zoom, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();

      updatePopupPosition();
    };

    const updatePopupPosition = () => {
      if (!activeComponent) {
        setPopupPosition(null);
        return;
      }
      const { width, height } = viewportRef.current;
      const camera = cameraRef.current;
      const screenPoint = worldToScreen({ x: activeComponent.x, y: activeComponent.y }, camera, { width, height });
      setPopupPosition({
        left: Math.min(screenPoint.x + 16, width - 220),
        top: Math.max(screenPoint.y - 20, 80)
      });
    };

    const focusCameraOn = (component) => {
      cancelAnimation();
      const camera = cameraRef.current;
      const start = { x: camera.x, y: camera.y, zoom: camera.zoom };
      const end = { x: component.x, y: component.y, zoom: clamp(camera.zoom, 0.8, 2.2) };
      const duration = 650;
      const startTime = performance.now();

      const animate = (now) => {
        const t = clamp((now - startTime) / duration, 0, 1);
        const eased = easeInOutCubic(t);
        camera.x = start.x + (end.x - start.x) * eased;
        camera.y = start.y + (end.y - start.y) * eased;
        camera.zoom = start.zoom + (end.zoom - start.zoom) * eased;
        scheduleDraw();
        if (t < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    };

    const pickComponentAt = (point) => {
      const { width, height } = viewportRef.current;
      const camera = cameraRef.current;
      let closest = null;
      let closestDistance = Infinity;
      components.forEach((component) => {
        const screenPoint = worldToScreen({ x: component.x, y: component.y }, camera, { width, height });
        const dx = screenPoint.x - point.x;
        const dy = screenPoint.y - point.y;
        const distance = Math.hypot(dx, dy);
        if (distance < HIT_RADIUS && distance < closestDistance) {
          closest = component;
          closestDistance = distance;
        }
      });
      return closest;
    };

    const handlePointerDown = (event) => {
      cancelAnimation();
      const canvas = canvasRef.current;
      canvas.setPointerCapture(event.pointerId);
      const gesture = gestureRef.current;
      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (gesture.pointers.size === 1) {
        gesture.panning = true;
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        gesture.dragged = false;
      }

      if (gesture.pointers.size === 2) {
        const points = Array.from(gesture.pointers.values());
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        gesture.startDistance = Math.hypot(dx, dy);
        gesture.startZoom = cameraRef.current.zoom;
        const midX = (points[0].x + points[1].x) / 2;
        const midY = (points[0].y + points[1].y) / 2;
        const { width, height } = viewportRef.current;
        gesture.startWorld = screenToWorld({ x: midX, y: midY }, cameraRef.current, { width, height });
      }
    };

    const handlePointerMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture.pointers.has(event.pointerId)) return;
      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (gesture.pointers.size === 1 && gesture.panning) {
        const dx = event.clientX - gesture.lastX;
        const dy = event.clientY - gesture.lastY;
        const camera = cameraRef.current;
        camera.x -= dx / camera.zoom;
        camera.y -= dy / camera.zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          gesture.dragged = true;
        }
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        scheduleDraw();
        return;
      }

      if (gesture.pointers.size === 2) {
        const points = Array.from(gesture.pointers.values());
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        const distance = Math.hypot(dx, dy);
        const zoom = clamp((gesture.startZoom * distance) / gesture.startDistance, MIN_ZOOM, MAX_ZOOM);
        const midX = (points[0].x + points[1].x) / 2;
        const midY = (points[0].y + points[1].y) / 2;
        const { width, height } = viewportRef.current;
        const camera = cameraRef.current;
        camera.zoom = zoom;
        if (gesture.startWorld) {
          camera.x = gesture.startWorld.x - (midX - width / 2) / camera.zoom;
          camera.y = gesture.startWorld.y - (midY - height / 2) / camera.zoom;
        }
        scheduleDraw();
      }
    };

    const handlePointerUp = (event) => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.releasePointerCapture(event.pointerId);
      }
      const gesture = gestureRef.current;
      gesture.pointers.delete(event.pointerId);
      if (gesture.pointers.size === 0) {
        gesture.panning = false;
        if (!gesture.dragged) {
          const rect = canvas.getBoundingClientRect();
          const hit = pickComponentAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          if (hit) {
            setSelectedId(hit.id);
            setActiveComponent(hit);
            focusCameraOn(hit);
          } else {
            setSelectedId(null);
            setActiveComponent(null);
          }
        }
      }
    };

    const handleWheel = (event) => {
      event.preventDefault();
      cancelAnimation();
      const camera = cameraRef.current;
      const { width, height } = viewportRef.current;
      const rect = canvasRef.current.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const worldPoint = screenToWorld(point, camera, { width, height });
      // Zoom toward the cursor so the focused area stays under the pointer.
      const zoom = clamp(camera.zoom * (event.deltaY > 0 ? 0.92 : 1.08), MIN_ZOOM, MAX_ZOOM);
      camera.zoom = zoom;
      camera.x = worldPoint.x - (point.x - width / 2) / camera.zoom;
      camera.y = worldPoint.y - (point.y - height / 2) / camera.zoom;
      scheduleDraw();
    };

    const handleResultSelect = (component) => {
      setSelectedId(component.id);
      setActiveComponent(component);
      focusCameraOn(component);
    };

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    };

    useEffect(() => {
      scheduleDraw();
    }, [components, selectedId, activeComponent]);

    return React.createElement(
      'div',
      { className: 'app' },
      React.createElement('canvas', {
        ref: canvasRef,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerUp,
        onWheel: handleWheel
      }),
      React.createElement(
        'div',
        { className: 'overlay' },
        React.createElement(
          'div',
          { className: 'search-panel' },
          React.createElement('input', {
            value: query,
            onChange: (event) => setQuery(event.target.value),
            placeholder: 'Search component ID...'
          }),
          results.length > 0 &&
            React.createElement(
              'div',
              { className: 'search-results' },
              results.map((item) =>
                React.createElement(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    onClick: () => handleResultSelect(item)
                  },
                  `${item.id} · ${item.type}`
                )
              )
            )
        ),
        React.createElement(
          'div',
          { className: 'controls' },
          React.createElement(
            'button',
            { type: 'button', onClick: toggleFullscreen },
            'Fullscreen'
          )
        ),
        popupPosition && activeComponent &&
          React.createElement(
            'div',
            {
              ref: popupRef,
              className: 'popup',
              style: {
                left: `${popupPosition.left}px`,
                top: `${popupPosition.top}px`
              }
            },
            React.createElement('strong', null, `${activeComponent.id}`),
            React.createElement('div', null, `Type: ${activeComponent.type}`),
            React.createElement('div', null, `Default Position: ${activeComponent.defaultPosition}`),
            React.createElement('div', null, `Flammable: ${activeComponent.flammable ? 'Yes' : 'No'}`),
            React.createElement('div', null, `Last Inspected: ${formatDate(activeComponent.lastInspected)}`)
          ),
        React.createElement(
          'div',
          { className: 'status-pill' },
          `Components: ${components.length} · Version: ${version.slice(0, 8) || 'loading'}`
        )
      )
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
})();
