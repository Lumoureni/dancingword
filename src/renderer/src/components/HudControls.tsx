interface HudControlsProps {
  visible: boolean
  alwaysOnTop: boolean
  beatEnabled: boolean
  beatActive: boolean
  hasTrack: boolean
  playbackStatus: 'playing' | 'paused' | 'stopped' | 'unknown'
  transportBusy: boolean
  onOpenSettings: () => void
  onToggleAlwaysOnTop: () => void
  onToggleFullscreen: () => void
  onToggleBeat: () => void
  onMinimize: () => void
  onClose: () => void
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
}

export function HudControls({
  visible,
  alwaysOnTop,
  beatEnabled,
  beatActive,
  hasTrack,
  playbackStatus,
  transportBusy,
  onOpenSettings,
  onToggleAlwaysOnTop,
  onToggleFullscreen,
  onToggleBeat,
  onMinimize,
  onClose,
  onPlayPause,
  onNext,
  onPrevious
}: HudControlsProps): React.JSX.Element {
  const isPlaying = playbackStatus === 'playing'
  const beatLabel = !beatEnabled ? '鼓点 · 关' : beatActive ? '鼓点 · 开' : '鼓点 · 等待'

  return (
    <div
      className={`hud ${visible ? 'hud--visible' : ''}`}
      role="toolbar"
      aria-label="窗口控制"
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="hud__drag" />
      <div className="hud__left">
        <div className="hud__transport" role="group" aria-label="播放控制">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasTrack || transportBusy}
            title="上一首"
            aria-label="上一首"
          >
            ⏮
          </button>
          <button
            type="button"
            className="hud__play"
            onClick={onPlayPause}
            disabled={!hasTrack || transportBusy}
            title={transportBusy ? '处理中…' : isPlaying ? '暂停' : '播放'}
            aria-label={isPlaying ? '暂停' : '播放'}
            aria-busy={transportBusy}
          >
            {transportBusy ? '…' : isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasTrack || transportBusy}
            title="下一首"
            aria-label="下一首"
          >
            ⏭
          </button>
        </div>
        <button type="button" onClick={onOpenSettings} title="打开设置 (Ctrl+,)" aria-label="打开设置">
          设置
        </button>
      </div>
      <div className="hud__right">
        <button
          type="button"
          className={`hud__beat${beatEnabled ? ' is-on' : ''}${beatEnabled && !beatActive ? ' is-waiting' : ''}`}
          onClick={onToggleBeat}
          title={beatEnabled ? '鼓点检测已开启，点击关闭' : '鼓点检测已关闭，点击开启'}
          aria-pressed={beatEnabled}
          aria-label={beatLabel}
        >
          {beatLabel}
        </button>
        <button
          type="button"
          className={alwaysOnTop ? 'is-on' : ''}
          onClick={onToggleAlwaysOnTop}
          title={alwaysOnTop ? '窗口已置顶，点击取消' : '窗口未置顶，点击置顶'}
          aria-pressed={alwaysOnTop}
          aria-label={alwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
        >
          置顶
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          title="全屏 (F)"
          aria-label="切换全屏"
        >
          全屏
        </button>
        <button type="button" onClick={onMinimize} title="最小化" aria-label="最小化">
          —
        </button>
        <button
          type="button"
          className="hud__close"
          onClick={onClose}
          title="关闭"
          aria-label="关闭窗口"
        >
          ×
        </button>
      </div>
    </div>
  )
}
