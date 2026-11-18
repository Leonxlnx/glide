// One icon language: Phosphor, two weights only — "bold" for UI chrome, "fill" for tool glyphs.
import {
  PushPin, PushPinSlash, SlidersHorizontal, MagnifyingGlass, X, Copy, Trash, ArrowUpRight, Globe, EnvelopeSimple,
  Folder, FolderOpen, File, Image, TextAlignLeft, Code, Palette, LinkSimple, ClipboardText, ImagesSquare, Tray,
  Play, Pause, SkipBack, SkipForward, MusicNotesSimple, CaretLeft, CaretRight, CaretUp, CaretDown, Plus,
  Power, ArrowClockwise, Check, HandGrabbing, Sparkle, BatteryFull, BatteryHigh, BatteryMedium, BatteryLow,
  BatteryCharging, ImageBroken, Aperture, Scan, Crop, Camera, Record, VideoCamera, FilmSlate, FilmStrip, Monitor,
  Microphone, MagicWand, Robot, Brain, ChatCircle, TerminalWindow, Lightning, Star, MusicNote, Timer, Translate,
  Calculator, Command, RocketLaunch, Ghost, Fire, Heart, Coffee, GameController, Feather, Notebook, AppWindow,
  CursorClick, Selection, PaintBrush, ListChecks, ArrowSquareOut, DownloadSimple,
} from '@phosphor-icons/react';

const UI = {
  pin: PushPin, unpin: PushPinSlash, settings: SlidersHorizontal, search: MagnifyingGlass, close: X, copy: Copy,
  trash: Trash, external: ArrowUpRight, globe: Globe, mail: EnvelopeSimple, folder: Folder, folderOpen: FolderOpen,
  file: File, image: Image, text: TextAlignLeft, code: Code, color: Palette, link: LinkSimple, clipboard: ClipboardText,
  captures: ImagesSquare, shelf: Tray, notes: ListChecks, play: Play, pause: Pause, prev: SkipBack, next: SkipForward,
  music: MusicNotesSimple, back: CaretLeft, chevRight: CaretRight, chevUp: CaretUp, chevDown: CaretDown, plus: Plus,
  power: Power, restart: ArrowClockwise, check: Check, grab: HandGrabbing, sparkle: Sparkle, imageBroken: ImageBroken,
  aperture: Aperture, video: VideoCamera, todo: ListChecks, open: ArrowSquareOut, download: DownloadSimple,
};

export function Icon({ name, size = 17, weight = 'bold', ...rest }) {
  const C = UI[name] || Sparkle;
  return <C size={size} weight={weight} {...rest} />;
}

export function BatteryGlyph({ level, charging, size = 17 }) {
  const C = charging ? BatteryCharging : level > 0.85 ? BatteryFull : level > 0.55 ? BatteryHigh : level > 0.25 ? BatteryMedium : BatteryLow;
  return <C size={size} weight="bold" />;
}

export const TOOL_ICONS = {
  scan: Scan, selection: Selection, crop: Crop, camera: Camera, aperture: Aperture, record: Record, video: VideoCamera,
  clapper: FilmSlate, film: FilmStrip, monitor: Monitor, mic: Microphone, sparkles: Sparkle, wand: MagicWand,
  bot: Robot, brain: Brain, message: ChatCircle, terminal: TerminalWindow, code: Code, globe: Globe, folder: Folder,
  app: AppWindow, zap: Lightning, star: Star, music: MusicNote, palette: Palette, brush: PaintBrush, timer: Timer,
  search: MagnifyingGlass, languages: Translate, calculator: Calculator, clipboard: ClipboardText, image: Image,
  command: Command, rocket: RocketLaunch, ghost: Ghost, flame: Fire, heart: Heart, coffee: Coffee,
  gamepad: GameController, feather: Feather, notebook: Notebook, click: CursorClick, todo: ListChecks,
};

export function ToolIcon({ name, size = 24, weight = 'fill' }) {
  const C = TOOL_ICONS[name] || Sparkle;
  return <C size={size} weight={weight} />;
}
