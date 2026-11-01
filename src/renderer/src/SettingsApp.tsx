import { useCallback, useEffect, useMemo, useState } from 'react'
import { SourcePicker } from './components/SourcePicker'
import { useNowPlaying } from './hooks/useNowPlaying'

const PREFERRED_KEY = 'dancingword.preferredAppId'
const BEAT_KEY = 'dancingword.beatEnabled'

export function SettingsApp(): React.JSX.Element {
  const { payload, setPreferredApp } = useNowPlaying()
  const [beatEnabled, setBeatEnabled] = useState(() => {
    const raw = localStorage.getItem(BEAT_KEY)
    return raw === null ? true : raw === '1'
  })

  useEffect(() => {
    const saved = localStorage.getItem(PREFERRED_KEY)
    if (saved) void setPreferredApp(saved)
  }, [setPreferredApp])

  const onPreferredApp = useCallback(
    (appId: string | null) => {
      if (appId) localStorage.setItem(PREFERRED_KEY, appId)
      else localStorage.removeItem(PREFERRED_KEY)
      void setPreferredApp(appId)
    },
    [setPreferredApp]
  )

  const onBeatChange = (enabled: boolean): void => {
    setBeatEnabled(enabled)
    localStorage.setItem(BEAT_KEY, enabled ? '1' : '0')
    // Notify other windows in the same partition
    window.dispatchEvent(new StorageEvent('storage', { key: BEAT_KEY, newValue: enabled ? '1' : '0' }))
  }

  const preferredMissing =
    Boolean(payload.preferredAppId) &&
    !payload.sessions.some((s) => s.appId === payload.preferredAppId)

  const activeSession = useMemo(() => {
    if (payload.preferredAppId) {
      return payload.sessions.find((s) => s.appId === payload.preferredAppId) ?? null
    }
    // Auto mode follows NetEase only — report the actual track we bound.
    if (payload.track) {
      return {
        appId: payload.track.appId,
        appName: payload.track.appName,
        playbackStatus: payload.track.playbackStatus,
        title: payload.track.title,
        artist: payload.track.artist
      }
    }
    return null
  }, [payload])

  const followLabel = activeSession
    ? `正在跟随：${activeSession.appName}${activeSession.title ? ` · ${activeSession.title}` : ''}`
    : payload.preferredAppId
      ? '尚未检测到所选来源的播放'
      : '自动模式：仅跟随网易云'

  return (
    <div className="settings">
      <header className="settings__header">
        <h1>设置</h1>
        <p>配置音乐来源与沉浸式播放选项</p>
      </header>

      <section className="settings__section" aria-labelledby="settings-source-heading">
        <h2 id="settings-source-heading">音乐来源</h2>
        <p className="settings__desc">
          默认仅跟随网易云。也可手动指定 QQ 音乐、B 站等其它播放器，选定后只跟随该来源。
        </p>
        <SourcePicker
          sessions={payload.sessions}
          preferredAppId={payload.preferredAppId}
          onChange={onPreferredApp}
        />
        <p className="settings__status" aria-live="polite">
          {followLabel}
        </p>
        {payload.sessions.length === 0 ? (
          <p className="settings__note">
            当前没有可用媒体会话。请先在网易云中开始播放；官方客户端可能需要 SMTC 插件。
          </p>
        ) : null}
        {preferredMissing ? (
          <p className="settings__note settings__note--warn">
            已选择来源，但该播放器暂无媒体会话，请确认正在播放。
          </p>
        ) : null}
      </section>

      <section className="settings__section" aria-labelledby="settings-beat-heading">
        <h2 id="settings-beat-heading">鼓点检测</h2>
        <p className="settings__desc">
          通过系统音频回环驱动歌词脉冲动效。关闭后歌词仍正常显示，仅失去节拍动效。
        </p>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={beatEnabled}
            onChange={(e) => onBeatChange(e.target.checked)}
          />
          <span>启用鼓点驱动</span>
        </label>
      </section>
    </div>
  )
}
