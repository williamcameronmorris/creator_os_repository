import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react';

interface AspectRatioOption {
  label: string;
  value: number | null; // null = original
  description: string;
}

const ASPECT_RATIOS: AspectRatioOption[] = [
  { label: '1:1', value: 1, description: 'Square (Feed)' },
  { label: '4:5', value: 4 / 5, description: 'Portrait (Feed)' },
  { label: '9:16', value: 9 / 16, description: 'Reel / Story' },
  { label: '16:9', value: 16 / 9, description: 'Landscape' },
  { label: 'Original', value: null, description: 'No crop' },
];

interface Offset {
  x: number;
  y: number;
}

interface ImageCropperProps {
  file: File;
  platform?: string;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
}

function defaultRatioForPlatform(platform?: string): number | null {
  if (platform === 'youtube') return 16 / 9;
  if (platform === 'tiktok') return 9 / 16;
  return 1; // instagram default: square
}

export function ImageCropper({ file, platform, onCrop, onCancel }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [selectedRatio, setSelectedRatio] = useState<number | null>(defaultRatioForPlatform(platform));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });

  // Load the image
  const objectUrl = useRef<string>('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Derive preview dimensions from the container
  const PREVIEW_SIZE = 380; // max px

  const cropW = selectedRatio === null
    ? PREVIEW_SIZE
    : selectedRatio >= 1
      ? PREVIEW_SIZE
      : Math.round(PREVIEW_SIZE * selectedRatio);

  const cropH = selectedRatio === null
    ? PREVIEW_SIZE
    : selectedRatio >= 1
      ? Math.round(PREVIEW_SIZE / selectedRatio)
      : PREVIEW_SIZE;

  // Image display size inside preview at current zoom
  const imgAspect = naturalSize.w / naturalSize.h;
  let baseW: number, baseH: number;
  if (selectedRatio === null) {
    // fit the image naturally
    if (imgAspect >= 1) {
      baseW = PREVIEW_SIZE;
      baseH = Math.round(PREVIEW_SIZE / imgAspect);
    } else {
      baseH = PREVIEW_SIZE;
      baseW = Math.round(PREVIEW_SIZE * imgAspect);
    }
  } else {
    // image must cover the crop box
    if (imgAspect > selectedRatio) {
      baseH = cropH;
      baseW = Math.round(cropH * imgAspect);
    } else {
      baseW = cropW;
      baseH = Math.round(cropW / imgAspect);
    }
  }
  const imgW = baseW * zoom;
  const imgH = baseH * zoom;

  // Clamp offset so image always covers the crop box
  const clampOffset = useCallback((ox: number, oy: number, iw: number, ih: number) => {
    const maxX = (iw - cropW) / 2;
    const maxY = (ih - cropH) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, [cropW, cropH]);

  // Re-clamp when ratio or zoom changes
  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y, imgW, imgH));
  }, [imgW, imgH, clampOffset]);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, imgW, imgH));
  };
  const onMouseUp = () => { setIsDragging(false); dragStart.current = null; };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStart.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, ox: offset.x, oy: offset.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dx = e.touches[0].clientX - dragStart.current.mx;
    const dy = e.touches[0].clientY - dragStart.current.my;
    setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, imgW, imgH));
  };
  const onTouchEnd = () => { setIsDragging(false); dragStart.current = null; };

  // Crop and export
  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    const canvas = canvasRef.current!;

    // Output resolution: use natural image dimensions where possible, capped at 2048
    const MAX_OUT = 2048;
    let outW: number, outH: number;
    if (selectedRatio === null) {
      outW = Math.min(naturalSize.w, MAX_OUT);
      outH = Math.round(outW / imgAspect);
    } else {
      const maxByRatio = selectedRatio >= 1 ? MAX_OUT : Math.round(MAX_OUT * selectedRatio);
      outW = Math.min(naturalSize.w, maxByRatio, MAX_OUT);
      outH = Math.round(outW / selectedRatio);
      // Ensure height also fits
      if (outH > MAX_OUT) {
        outH = MAX_OUT;
        outW = Math.round(outH * selectedRatio);
      }
    }

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    // Map preview coordinates back to natural image coordinates
    const scaleX = naturalSize.w / imgW;
    const scaleY = naturalSize.h / imgH;

    // Center of the crop box in preview space
    const cropCenterX = cropW / 2 - offset.x;
    const cropCenterY = cropH / 2 - offset.y;

    // In image space
    const imgCenterX = (imgW / 2 + (cropCenterX - imgW / 2)) * scaleX;
    const imgCenterY = (imgH / 2 + (cropCenterY - imgH / 2)) * scaleY;

    const srcW = cropW * scaleX / zoom * (selectedRatio === null ? 1 : 1);
    const srcH = cropH * scaleY / zoom * (selectedRatio === null ? 1 : 1);

    const sx = imgCenterX - srcW / 2;
    const sy = imgCenterY - srcH / 2;

    ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, outW, outH);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '_cropped.jpg', { type: 'image/jpeg' });
      onCrop(croppedFile);
    }, 'image/jpeg', 0.92);
  };

  const activeRatioIdx = ASPECT_RATIOS.findIndex((r) => r.value === selectedRatio);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">Crop Image</h3>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Aspect ratio tabs */}
        <div className="flex gap-2 px-5 pt-4 pb-1 overflow-x-auto">
          {ASPECT_RATIOS.map((r, i) => (
            <button
              key={r.label}
              onClick={() => { setSelectedRatio(r.value); setOffset({ x: 0, y: 0 }); setZoom(1); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                i === activeRatioIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
              <span className="block text-[9px] font-normal opacity-70">{r.description}</span>
            </button>
          ))}
        </div>

        {/* Preview area */}
        <div className="flex items-center justify-center p-5" style={{ minHeight: 300 }}>
          {imgLoaded ? (
            <div
              ref={previewRef}
              className="relative overflow-hidden rounded-xl select-none"
              style={{
                width: cropW,
                height: cropH,
                cursor: isDragging ? 'grabbing' : 'grab',
                backgroundColor: '#111',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <img
                src={objectUrl.current}
                draggable={false}
                style={{
                  position: 'absolute',
                  width: imgW,
                  height: imgH,
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
                alt="crop preview"
              />
              {/* Grid overlay */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
                backgroundSize: `${cropW / 3}px ${cropH / 3}px`,
              }} />
            </div>
          ) : (
            <div className="w-64 h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-3 px-5 pb-3">
          <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="range"
            min={100}
            max={300}
            value={Math.round(zoom * 100)}
            onChange={(e) => {
              const newZoom = parseInt(e.target.value) / 100;
              setZoom(newZoom);
              setOffset((prev) => clampOffset(prev.x, prev.y, baseW * newZoom, baseH * newZoom));
            }}
            className="flex-1 accent-purple-600"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(zoom * 100)}%</span>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-2">Drag to reposition · Pinch or slider to zoom</p>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
          >
            <Check className="w-4 h-4" />
            Apply Crop
          </button>
        </div>

        {/* Hidden canvas used for export */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
