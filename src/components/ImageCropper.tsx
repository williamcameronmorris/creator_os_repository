import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Check, Instagram, Youtube } from 'lucide-react';
import { Sparkles } from 'lucide-react';

// ─── Platform templates ─────────────────────────────────────────────────────
// Pixel dimensions reflect each platform's recommended export size.
// The cropper uses the aspect ratio; the canvas exports at the specified
// output resolution.

interface CropTemplate {
  id: string;
  label: string;
  sublabel: string;       // e.g. "1080 × 1080"
  ratio: number;          // width / height
  outW: number;           // canvas export width
  outH: number;           // canvas export height
  platforms: string[];    // which platform pills to show this under
}

const TEMPLATES: CropTemplate[] = [
  // ── Instagram ─────────────────────────────────────────────────────
  { id: 'ig-square',   label: 'Square Post',     sublabel: '1080 × 1080',   ratio: 1,        outW: 1080, outH: 1080, platforms: ['instagram'] },
  { id: 'ig-portrait', label: 'Portrait Post',   sublabel: '1080 × 1350',   ratio: 4 / 5,    outW: 1080, outH: 1350, platforms: ['instagram'] },
  { id: 'ig-landscape',label: 'Landscape Post',  sublabel: '1080 × 566',    ratio: 1.91,     outW: 1080, outH: 566,  platforms: ['instagram'] },
  { id: 'ig-story',    label: 'Story / Reel',    sublabel: '1080 × 1920',   ratio: 9 / 16,   outW: 1080, outH: 1920, platforms: ['instagram'] },

  // ── TikTok ────────────────────────────────────────────────────────
  { id: 'tt-vertical', label: 'TikTok Video',    sublabel: '1080 × 1920',   ratio: 9 / 16,   outW: 1080, outH: 1920, platforms: ['tiktok'] },
  { id: 'tt-square',   label: 'TikTok Square',   sublabel: '1080 × 1080',   ratio: 1,        outW: 1080, outH: 1080, platforms: ['tiktok'] },
  { id: 'tt-horizontal',label: 'TikTok Landscape',sublabel: '1920 × 1080',  ratio: 16 / 9,   outW: 1920, outH: 1080, platforms: ['tiktok'] },

  // ── YouTube ───────────────────────────────────────────────────────
  { id: 'yt-thumb',    label: 'Thumbnail',       sublabel: '1280 × 720',    ratio: 16 / 9,   outW: 1280, outH: 720,  platforms: ['youtube'] },
  { id: 'yt-banner',   label: 'Channel Banner',  sublabel: '2560 × 1440',   ratio: 16 / 9,   outW: 2560, outH: 1440, platforms: ['youtube'] },
  { id: 'yt-short',    label: 'YouTube Short',   sublabel: '1080 × 1920',   ratio: 9 / 16,   outW: 1080, outH: 1920, platforms: ['youtube'] },

  // ── Universal ─────────────────────────────────────────────────────
  { id: 'original',    label: 'Original',        sublabel: 'No crop',       ratio: 0,        outW: 0,    outH: 0,    platforms: ['instagram', 'tiktok', 'youtube'] },
];

function defaultTemplateForPlatform(platform?: string): CropTemplate {
  if (platform === 'youtube') return TEMPLATES.find((t) => t.id === 'yt-thumb')!;
  if (platform === 'tiktok')  return TEMPLATES.find((t) => t.id === 'tt-vertical')!;
  return TEMPLATES.find((t) => t.id === 'ig-square')!;
}

// ─── Component ──────────────────────────────────────────────────────────────

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

const PLATFORM_TABS = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'tiktok',    label: 'TikTok',    Icon: Sparkles },
  { key: 'youtube',   label: 'YouTube',   Icon: Youtube },
];

export function ImageCropper({ file, platform, onCrop, onCancel }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [activePlatformTab, setActivePlatformTab] = useState(platform || 'instagram');
  const [selectedTemplate, setSelectedTemplate] = useState<CropTemplate>(defaultTemplateForPlatform(platform));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });

  const objectUrl = useRef<string>('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isOriginal = selectedTemplate.ratio === 0;
  const PREVIEW_SIZE = 320;

  const cropW = isOriginal
    ? PREVIEW_SIZE
    : selectedTemplate.ratio >= 1
      ? PREVIEW_SIZE
      : Math.round(PREVIEW_SIZE * selectedTemplate.ratio);

  const cropH = isOriginal
    ? PREVIEW_SIZE
    : selectedTemplate.ratio >= 1
      ? Math.round(PREVIEW_SIZE / selectedTemplate.ratio)
      : PREVIEW_SIZE;

  const imgAspect = naturalSize.w / naturalSize.h;

  let baseW: number, baseH: number;
  if (isOriginal) {
    if (imgAspect >= 1) { baseW = PREVIEW_SIZE; baseH = Math.round(PREVIEW_SIZE / imgAspect); }
    else { baseH = PREVIEW_SIZE; baseW = Math.round(PREVIEW_SIZE * imgAspect); }
  } else {
    if (imgAspect > selectedTemplate.ratio) { baseH = cropH; baseW = Math.round(cropH * imgAspect); }
    else { baseW = cropW; baseH = Math.round(cropW / imgAspect); }
  }
  const imgW = baseW * zoom;
  const imgH = baseH * zoom;

  const clampOffset = useCallback((ox: number, oy: number, iw: number, ih: number) => {
    const maxX = Math.max(0, (iw - cropW) / 2);
    const maxY = Math.max(0, (ih - cropH) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, ox)), y: Math.max(-maxY, Math.min(maxY, oy)) };
  }, [cropW, cropH]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [selectedTemplate]);

  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y, imgW, imgH));
  }, [imgW, imgH, clampOffset]);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => { setIsDragging(true); dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    setOffset(clampOffset(dragStart.current.ox + e.clientX - dragStart.current.mx, dragStart.current.oy + e.clientY - dragStart.current.my, imgW, imgH));
  };
  const onMouseUp = () => { setIsDragging(false); dragStart.current = null; };
  const onTouchStart = (e: React.TouchEvent) => { setIsDragging(true); dragStart.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, ox: offset.x, oy: offset.y }; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !dragStart.current) return;
    setOffset(clampOffset(dragStart.current.ox + e.touches[0].clientX - dragStart.current.mx, dragStart.current.oy + e.touches[0].clientY - dragStart.current.my, imgW, imgH));
  };
  const onTouchEnd = () => { setIsDragging(false); dragStart.current = null; };

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = canvasRef.current!;

    let outW: number, outH: number;
    if (isOriginal) {
      const MAX = 2048;
      outW = Math.min(naturalSize.w, MAX);
      outH = Math.round(outW / imgAspect);
      if (outH > MAX) { outH = MAX; outW = Math.round(outH * imgAspect); }
    } else {
      outW = selectedTemplate.outW;
      outH = selectedTemplate.outH;
    }

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    if (isOriginal) {
      ctx.drawImage(img, 0, 0, outW, outH);
    } else {
      const scaleX = naturalSize.w / imgW;
      const scaleY = naturalSize.h / imgH;
      const cropCenterX = cropW / 2 - offset.x;
      const cropCenterY = cropH / 2 - offset.y;
      const imgCenterX = cropCenterX * scaleX;
      const imgCenterY = cropCenterY * scaleY;
      const srcW = cropW * scaleX / zoom;
      const srcH = cropH * scaleY / zoom;
      const sx = imgCenterX - srcW / 2;
      const sy = imgCenterY - srcH / 2;
      ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, outW, outH);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const name = file.name.replace(/\.[^.]+$/, '') + `_${selectedTemplate.id}.jpg`;
      onCrop(new File([blob], name, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  const visibleTemplates = TEMPLATES.filter((t) => t.platforms.includes(activePlatformTab));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-foreground">Crop Image</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isOriginal ? 'No crop applied' : `${selectedTemplate.label} — ${selectedTemplate.sublabel}`}
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Platform tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {PLATFORM_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActivePlatformTab(key);
                const first = TEMPLATES.find((t) => t.platforms.includes(key) && t.id !== 'original');
                if (first) setSelectedTemplate(first);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors ${
                activePlatformTab === key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Template picker */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0 border-b border-border/50">
          {visibleTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-left transition-all border ${
                selectedTemplate.id === t.id
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-accent/50 border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <p className="text-xs font-bold whitespace-nowrap">{t.label}</p>
              <p className="text-[10px] opacity-70 whitespace-nowrap">{t.sublabel}</p>
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="flex items-center justify-center py-4 flex-shrink-0" style={{ background: '#0a0a0a' }}>
          {imgLoaded ? (
            <div
              className="relative overflow-hidden rounded-xl select-none"
              style={{ width: cropW, height: cropH, cursor: isDragging ? 'grabbing' : 'grab', backgroundColor: '#111', flexShrink: 0 }}
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
                alt="crop preview"
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
              />
              {/* Rule-of-thirds grid */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                  backgroundSize: `${cropW / 3}px ${cropH / 3}px`,
                }}
              />
            </div>
          ) : (
            <div style={{ width: cropW, height: cropH }} className="flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Zoom */}
        {!isOriginal && (
          <div className="flex items-center gap-3 px-5 py-2 flex-shrink-0">
            <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="range"
              min={100}
              max={300}
              value={Math.round(zoom * 100)}
              onChange={(e) => {
                const z = parseInt(e.target.value) / 100;
                setZoom(z);
                setOffset((prev) => clampOffset(prev.x, prev.y, baseW * z, baseH * z));
              }}
              className="flex-1 accent-purple-600"
            />
            <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(zoom * 100)}%</span>
          </div>
        )}

        {!isOriginal && (
          <p className="text-center text-[11px] text-muted-foreground pb-1">Drag to reposition</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5 pt-2 flex-shrink-0">
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

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
