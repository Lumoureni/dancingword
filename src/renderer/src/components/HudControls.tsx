interface HudControlsProps {
  visible: boolean
  alwaysOnTop: boolean
  beatEnabled: boolean
  beatActive: boolean
  onOpenSettings: () => void
  onToggleAlwaysOnTop: () => void
  onToggleFullscreen: () => void
  onToggleBeat: () => void
  onMinimize: () => void
  onClose: () => void
}

export function HudControls({
  visible,
  alwaysOnTop,
  beatEnabled,
  beatActive,
  onOpenSettings,
  onToggleAlwaysOnTop,
  onToggleFullscreen,
  onToggleBeat,
  onMinimize,
  onClose
}: HudControlsProps): React.JSX.Element {
  return (
    <div className={`hud ${visible ? 'hud--visible' : ''}`}>
      <div className="hud__drag" />
      <div className="hud__left">
        <button type="button" onClick={onOpenSettings} title="打开设置">
          设置
        </button>
      </div>
      <div className="hud__right">
        <button
          type="button"
          className={beatEnabled ? 'is-on' : ''}
          onClick={onToggleBeat}
          title="鼓点检测"
        >
          鼓点{beatEnabled ? (beatActive ? ' · 开' : ' · 等待') : ' · 关'}
        </button>
        <button
          type="button"
          className={alwaysOnTop ? 'is-on' : ''}
          onClick={onToggleAlwaysOnTop}
          title="窗口置顶"
        >
          置顶
        </button>
        <button type="button" onClick={onToggleFullscreen} title="全屏 (F)">
          全屏
        </button>
        <button type="button" onClick={onMinimize} title="最小化">
          —
        </button>
        <button type="button" className="hud__close" onClick={onClose} title="关闭">
          ×
        </button>
      </div>
    </div>
  )
}
