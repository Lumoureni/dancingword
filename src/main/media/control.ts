import { execFile } from 'child_process'
import type { TransportCommand, TransportResult } from '../../shared/media'

/**
 * Playback control for the followed SMTC session (default: NetEase).
 *
 * Strategy:
 * 1. WinRT GlobalSystemMediaTransportControlsSession — exact AUMID only
 * 2. No media-key injection — that would hijack Edge/Bilibili web playback
 *
 * PowerShell 5.1 lacks the fluent `.AsTask()` extension on WinRT IAsyncOperation,
 * so scripts use the classic Await helper.
 */

const CONTROL_TIMEOUT_MS = 5000

/** Shared preamble: load System.Runtime.WindowsRuntime + Await helper. */
const PS_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [System.WindowsRuntimeSystemExtensions]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.IsGenericMethod -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $null = $netTask.Wait(-1)
  return $netTask.Result
}
`

function escapeForPowerShell(value: string): string {
  return value.replace(/'/g, "''")
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script
      ],
      {
        windowsHide: true,
        timeout: CONTROL_TIMEOUT_MS,
        maxBuffer: 1024 * 512,
        encoding: 'utf8'
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr.trim() || err.message))
          return
        }
        resolve(stdout.trim())
      }
    )
  })
}

function smtcScript(aumid: string | null, action: TransportCommand): string {
  const aumidLiteral = aumid ? `'${escapeForPowerShell(aumid)}'` : '$null'
  const actionLiteral = `'${action}'`

  return `
${PS_PRELUDE}

$aumid = ${aumidLiteral}
$action = ${actionLiteral}

$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$manager = Await ($mgrType::RequestAsync()) $mgrType
if (-not $manager) { Write-Output 'NO_MANAGER'; exit 0 }

$sessions = @($manager.GetSessions())
$session = $null

if ($aumid) {
  # Always bind the exact player we follow — never GetCurrentSession() (that can
  # be Edge/Bilibili and would hijack web playback).
  foreach ($s in $sessions) {
    if ($s.SourceAppUserModelId -eq $aumid) { $session = $s; break }
  }
  if (-not $session) { Write-Output 'NOT_FOUND'; exit 0 }
} else {
  # No target AUMID: prefer NetEase, then any playing session.
  foreach ($s in $sessions) {
    $id = ([string]$s.SourceAppUserModelId).ToLowerInvariant()
    if ($id -match 'cloudmusic|netease') { $session = $s; break }
  }
  if (-not $session) {
    foreach ($s in $sessions) {
      if ([string]$s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { $session = $s; break }
    }
  }
  if (-not $session -and $sessions.Count -gt 0) { $session = $sessions[0] }
}

if (-not $session) { Write-Output 'NO_SESSION'; exit 0 }

$playback = $session.GetPlaybackInfo()
$status = [string]$playback.PlaybackStatus

# NetEase often reports IsSkipNextEnabled=false but TrySkipNextAsync still works —
# always attempt the WinRT call against THIS session only.
$ok = $false
switch ($action) {
  'playPause' {
    if ($status -eq 'Playing') {
      try {
        $null = Await ($session.TryPauseAsync()) ([bool])
        $ok = $true
      } catch {
        try { $null = Await ($session.TryTogglePlayPauseAsync()) ([bool]); $ok = $true } catch { $ok = $false }
      }
    } else {
      try {
        $null = Await ($session.TryPlayAsync()) ([bool])
        $ok = $true
      } catch {
        try { $null = Await ($session.TryTogglePlayPauseAsync()) ([bool]); $ok = $true } catch { $ok = $false }
      }
    }
  }
  'next' {
    try {
      $null = Await ($session.TrySkipNextAsync()) ([bool])
      $ok = $true
    } catch { $ok = $false }
  }
  'previous' {
    try {
      $null = Await ($session.TrySkipPreviousAsync()) ([bool])
      $ok = $true
    } catch { $ok = $false }
  }
}

Write-Output ("RESULT:" + $(if ($ok) { 'OK' } else { 'DENIED' }))
`
}

async function controlViaSmtc(
  aumid: string | null,
  action: TransportCommand
): Promise<TransportResult> {
  try {
    const out = await runPowerShell(smtcScript(aumid, action))
    if (out.includes('RESULT:OK')) {
      return { ok: true, method: 'smtc' }
    }
    if (out.includes('NOT_FOUND')) {
      return {
        ok: false,
        method: 'none',
        message: '未找到当前跟随的播放器会话'
      }
    }
    if (out.includes('NO_SESSION') || out.includes('NO_MANAGER')) {
      return { ok: false, method: 'none', message: '没有可用的媒体会话' }
    }
    return {
      ok: false,
      method: 'none',
      message: out.includes('DENIED') ? '该播放器未开放此控制' : 'SMTC 控制失败'
    }
  } catch (err) {
    return {
      ok: false,
      method: 'none',
      message: err instanceof Error ? err.message : 'SMTC 控制异常'
    }
  }
}

/**
 * Control the followed player only.
 *
 * Never inject system media keys — Windows routes those to the "current"
 * session (often Edge/Bilibili), which hijacks web playback.
 * Always target the AUMID of the track we are actually following.
 */
export async function controlPlayback(
  action: TransportCommand,
  targetAppId: string | null
): Promise<TransportResult> {
  return controlViaSmtc(targetAppId, action)
}
