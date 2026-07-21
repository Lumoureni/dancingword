import type { MediaSessionInfo } from '../../../shared/media'

interface SourcePickerProps {
  sessions: MediaSessionInfo[]
  preferredAppId: string | null
  onChange: (appId: string | null) => void
}

export function SourcePicker({
  sessions,
  preferredAppId,
  onChange
}: SourcePickerProps): React.JSX.Element {
  return (
    <div className="source-picker">
      <select
        value={preferredAppId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="音乐来源"
      >
        <option value="">自动（正在播放）</option>
        {sessions.map((s) => (
          <option key={s.appId} value={s.appId}>
            {s.appName}
            {s.playbackStatus === 'playing' ? ' · 播放中' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
