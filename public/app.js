(() => {
  const { useEffect, useMemo, useRef, useState } = React;

  const TYPE_EMOJI = {
    Valve: '⚙️',
    Switch: '⚡️',
    Hydrant: '🧯',
    Exit: '🚪',
    WashPoint: '🚿',
    ChemicalTank: '🛢',
    Gauge: '⏲️',
    ElectricalOutlet: '🔌'

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
      x: 450,
      y: 200,
      defaultPosition: 'open',
      flammable: false,
      lastInspected: '2025-08-01'
    }
  ];
  const FALLBACK_POLYGONS = [
    {
      id: 'footprint-a',
      label: 'Footprint A',
      x: 300,
      y: 200,
      width: 1640,
      height: 930,
      fill: '#2b2f36',
      stroke: 'rgba(0,0,0,0.35)',
      z: 0
    },
    {
      id: 'structure-1',
      label: 'Structure 1',
      x: 497,
      y: 367,
      width: 459,
      height: 223,
      fill: '#3a3f47',
      stroke: 'rgba(0,0,0,0.35)',
      z: 1
    },
    {
      id: 'structure-2',
      label: 'Structure 2',
      x: 1251,
      y: 684,
      width: 426,
      height: 279,
      fill: '#3a3f47',
      stroke: 'rgba(0,0,0,0.35)',
      z: 1
    }
  ];

  const BASE_HIT_RADIUS = 34;
  const MIN_HIT_RADIUS = 28;
  const MAX_HIT_RADIUS = 52;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4.5;
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getHitRadius(camera) {
    return clamp(BASE_HIT_RADIUS / Math.sqrt(camera.zoom), MIN_HIT_RADIUS, MAX_HIT_RADIUS);
  }

  function getGridBounds(bounds) {
    const gridPadding = 200;
    return {
      minX: bounds.minX - gridPadding,
      minY: bounds.minY - gridPadding,
      maxX: bounds.maxX + gridPadding,
      maxY: bounds.maxY + gridPadding
    };
  }

  function clampCameraToBounds(camera, bounds, viewport) {
    const gridBounds = getGridBounds(bounds);
    const halfWidth = viewport.width / (2 * camera.zoom);
    const halfHeight = viewport.height / (2 * camera.zoom);
    const minX = gridBounds.minX + halfWidth;
    const maxX = gridBounds.maxX - halfWidth;
    const minY = gridBounds.minY + halfHeight;
    const maxY = gridBounds.maxY - halfHeight;

    if (minX > maxX) {
      camera.x = (gridBounds.minX + gridBounds.maxX) / 2;
    } else {
      camera.x = clamp(camera.x, minX, maxX);
    }

    if (minY > maxY) {
      camera.y = (gridBounds.minY + gridBounds.maxY) / 2;
    } else {
      camera.y = clamp(camera.y, minY, maxY);
    }
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

  function formatValue(key, value) {
    if (value === null || value === undefined) return 'Unknown';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key === 'lastInspected') return formatDate(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function getComponentAttributes(component) {
    if (component.attributes && typeof component.attributes === 'object') {
      return component.attributes;
    }
    const reserved = new Set(['id', 'type', 'x', 'y', 'defaultPosition', 'lastInspected', 'flammable', 'attributes']);
    return Object.fromEntries(
      Object.entries(component).filter(([key]) => !reserved.has(key))
    );
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
    const [polygons, setPolygons] = useState(FALLBACK_POLYGONS);
    const [version, setVersion] = useState('static');
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [activeComponent, setActiveComponent] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [popupPosition, setPopupPosition] = useState(null);
    const componentsRef = useRef([]);
    const selectedIdRef = useRef(null);
    const activeComponentRef = useRef(null);

    useEffect(() => {
      let debounce = null;
      debounce = setTimeout(() => setDebouncedQuery(query.trim()), 200);
      return () => clearTimeout(debounce);
    }, [query]);

    const clearSearchResults = () => {
      setQuery('');
      setDebouncedQuery('');
    };

    useEffect(() => {
      componentsRef.current = components;
    }, [components]);

    useEffect(() => {
      selectedIdRef.current = selectedId;
    }, [selectedId]);

    useEffect(() => {
      activeComponentRef.current = activeComponent;
    }, [activeComponent]);

    const fetchComponents = async () => {
      try {
        const response = await fetch('/data/components.json');
        const data = await response.json();
        setComponents(data || []);
        setVersion('static');
        if (data && data.length > 0) {
          const xs = data.map((item) => item.x);
          const ys = data.map((item) => item.y);
          boundsRef.current = {
            minX: 0,
            minY: 0,
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
          minX: 0,
          minY: 0,
          maxX: Math.max(...xs) + 400,
          maxY: Math.max(...ys) + 300
        };
        const camera = cameraRef.current;
        camera.x = (boundsRef.current.minX + boundsRef.current.maxX) / 2;
        camera.y = (boundsRef.current.minY + boundsRef.current.maxY) / 2;
        scheduleDraw();
      }
    };

    const fetchPolygons = async () => {
      try {
        const response = await fetch('/data/polygons.json');
        const data = await response.json();
        if (Array.isArray(data)) {
          setPolygons(data);
        }
      } catch (error) {
        setPolygons(FALLBACK_POLYGONS);
      }
    };

    useEffect(() => {
      fetchComponents();
      fetchPolygons();
    }, []);

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
      const minorGrid = 10;
      const majorGrid = 100;
      const gridBounds = getGridBounds(bounds);
      const minX = Math.floor(gridBounds.minX / minorGrid) * minorGrid;
      const maxX = Math.ceil(gridBounds.maxX / minorGrid) * minorGrid;
      const minY = Math.floor(gridBounds.minY / minorGrid) * minorGrid;
      const maxY = Math.ceil(gridBounds.maxY / minorGrid) * minorGrid;

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.lineWidth = 1;
      for (let x = minX; x <= maxX; x += minorGrid) {
        ctx.beginPath();
        ctx.moveTo(x, gridBounds.minY);
        ctx.lineTo(x, gridBounds.maxY);
        ctx.stroke();
      }
      for (let y = minY; y <= maxY; y += minorGrid) {
        ctx.beginPath();
        ctx.moveTo(gridBounds.minX, y);
        ctx.lineTo(gridBounds.maxX, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1.2;
      for (let x = Math.floor(gridBounds.minX / majorGrid) * majorGrid; x <= gridBounds.maxX; x += majorGrid) {
        ctx.beginPath();
        ctx.moveTo(x, gridBounds.minY);
        ctx.lineTo(x, gridBounds.maxY);
        ctx.stroke();
      }
      for (let y = Math.floor(gridBounds.minY / majorGrid) * majorGrid; y <= gridBounds.maxY; y += majorGrid) {
        ctx.beginPath();
        ctx.moveTo(gridBounds.minX, y);
        ctx.lineTo(gridBounds.maxX, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawGridLabels = (ctx, bounds, camera, viewport) => {
      const labelStep = 100;
      const gridBounds = getGridBounds(bounds);
      const halfWidth = viewport.width / (2 * camera.zoom);
      const halfHeight = viewport.height / (2 * camera.zoom);
      const visibleMinX = camera.x - halfWidth;
      const visibleMaxX = camera.x + halfWidth;
      const visibleMinY = camera.y - halfHeight;
      const visibleMaxY = camera.y + halfHeight;

      const minLabelX = Math.max(gridBounds.minX, visibleMinX);
      const maxLabelX = Math.min(gridBounds.maxX, visibleMaxX);
      const minLabelY = Math.max(gridBounds.minY, visibleMinY);
      const maxLabelY = Math.min(gridBounds.maxY, visibleMaxY);

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      for (let x = Math.ceil(minLabelX / labelStep) * labelStep; x <= maxLabelX; x += labelStep) {
        const screenX = (x - camera.x) * camera.zoom + viewport.width / 2;
        ctx.fillText(`${x}`, screenX, 8);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let y = Math.ceil(minLabelY / labelStep) * labelStep; y <= maxLabelY; y += labelStep) {
        const screenY = (y - camera.y) * camera.zoom + viewport.height / 2;
        ctx.fillText(`${y}`, 8, screenY);
      }
      ctx.restore();
    };

    const drawPolygons = (ctx, items) => {
      if (!items || items.length === 0) return;
      const sorted = [...items].sort((a, b) => (a.z || 0) - (b.z || 0));
      ctx.save();
      sorted.forEach((polygon) => {
        const fill = polygon.fill || '#2b2f36';
        const stroke = polygon.stroke || 'rgba(0,0,0,0.35)';
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.fillRect(polygon.x, polygon.y, polygon.width, polygon.height);
        ctx.strokeRect(polygon.x, polygon.y, polygon.width, polygon.height);

        if (polygon.label) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = polygon.z ? '12px "Segoe UI", sans-serif' : '14px "Segoe UI", sans-serif';
          ctx.textBaseline = 'top';
          ctx.textAlign = 'left';
          ctx.fillText(polygon.label, polygon.x + 8, polygon.y + 8);
        }
      });
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
      clampCameraToBounds(camera, bounds, { width, height });
      ctx.fillStyle = '#15171c';
      ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      drawPolygons(ctx, polygons);
      drawFloorGrid(ctx, bounds);

      // Slightly soften scaling so emoji weight feels consistent across zoom levels.
      const symbolSize = 20 * Math.pow(camera.zoom, 0.8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${symbolSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

      const componentsToRender = componentsRef.current;
      componentsToRender.forEach((component) => {
        const emoji = TYPE_EMOJI[component.type] || '📍';
        ctx.fillText(emoji, component.x, component.y);
      });

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${Math.max(10, symbolSize * 0.55)}px "Segoe UI", sans-serif`;
      componentsToRender.forEach((component) => {
        ctx.fillText(component.id, component.x, component.y + symbolSize * 0.6);
      });

      const selectedIdCurrent = selectedIdRef.current;
      if (selectedIdCurrent) {
        const selected = componentsToRender.find((item) => item.id === selectedIdCurrent);
        if (selected) {
          ctx.strokeStyle = 'rgba(88,178,255,0.9)';
          ctx.lineWidth = 3 / camera.zoom;
          ctx.beginPath();
          ctx.arc(selected.x, selected.y, 30 / camera.zoom, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();

      drawGridLabels(ctx, bounds, camera, { width, height });
      updatePopupPosition();
    };

    const updatePopupPosition = () => {
      const component = activeComponentRef.current;
      if (!component) {
        setPopupPosition(null);
        return;
      }
      const { width, height } = viewportRef.current;
      const camera = cameraRef.current;
      const screenPoint = worldToScreen({ x: component.x, y: component.y }, camera, { width, height });
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
        clampCameraToBounds(camera, boundsRef.current, viewportRef.current);
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
      const hitRadius = getHitRadius(camera);
      let closest = null;
      let closestDistance = Infinity;
      components.forEach((component) => {
        const screenPoint = worldToScreen({ x: component.x, y: component.y }, camera, { width, height });
        const dx = screenPoint.x - point.x;
        const dy = screenPoint.y - point.y;
        const distance = Math.hypot(dx, dy);
        if (distance < hitRadius && distance < closestDistance) {
          closest = component;
          closestDistance = distance;
        }
      });
      return closest;
    };

    const handlePointerDown = (event) => {
      clearSearchResults();
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
        clampCameraToBounds(camera, boundsRef.current, viewportRef.current);
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
        clampCameraToBounds(camera, boundsRef.current, viewportRef.current);
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
        clampCameraToBounds(cameraRef.current, boundsRef.current, viewportRef.current);
        if (!gesture.dragged) {
          const rect = canvas.getBoundingClientRect();
          const hit = pickComponentAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          if (hit) {
            setSelectedId(hit.id);
            setActiveComponent(hit);
            selectedIdRef.current = hit.id;
            activeComponentRef.current = hit;
            focusCameraOn(hit);
          } else {
            setSelectedId(null);
            setActiveComponent(null);
            selectedIdRef.current = null;
            activeComponentRef.current = null;
          }
        }
      }
    };

    const handleWheel = (event) => {
      clearSearchResults();
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
      clampCameraToBounds(camera, boundsRef.current, viewportRef.current);
      scheduleDraw();
    };

    const handleResultSelect = (component) => {
      setSelectedId(component.id);
      setActiveComponent(component);
      selectedIdRef.current = component.id;
      activeComponentRef.current = component;
      focusCameraOn(component);
      clearSearchResults();
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
    }, [components, polygons, selectedId, activeComponent]);

    const activeAttributes = activeComponent ? getComponentAttributes(activeComponent) : {};

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
            ['type', 'defaultPosition', 'lastInspected']
              .filter((key) => activeComponent[key] !== null && activeComponent[key] !== undefined)
              .map((key) =>
                React.createElement('div', { key }, `${key}: ${formatValue(key, activeComponent[key])}`)
              ),
            Object.keys(activeAttributes)
              .filter(
                (key) =>
                  activeAttributes[key] !== null &&
                  activeAttributes[key] !== undefined
              )
              .map((key) =>
                React.createElement(
                  'div',
                  { key: `attr-${key}` },
                  `${key}: ${formatValue(key, activeAttributes[key])}`
                )
              )
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
