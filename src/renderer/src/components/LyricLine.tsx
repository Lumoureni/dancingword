interface LyricLineProps {
  text: string
  role: 'prev' | 'current' | 'next' | 'far'
  beatPulse: boolean
  lineKey?: number
}

export function LyricLine({
  text,
  role,
  beatPulse,
  lineKey = 0
}: LyricLineProps): React.JSX.Element {
  const classes = [
    'lyric-line',
    `lyric-line--${role}`,
    role === 'current' ? 'lyric-line--enter' : '',
    role === 'prev' ? 'lyric-line--exit' : '',
    role === 'next' ? 'lyric-line--await' : '',
    beatPulse && role === 'current' ? 'is-beat' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <p className={classes} data-line={lineKey}>
      <span className="lyric-line__inner">{text || '\u00A0'}</span>
    </p>
  )
}
