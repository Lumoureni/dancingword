# Dancingword

鼓点驱动的沉浸式桌面歌词（Windows）。跟随网易云、QQ 音乐或其他桌面播放器的当前曲目，拉取同步歌词，并根据系统音频鼓点做沉浸式脉冲动效。

## 要求

- Windows 10 (1809+) / Windows 11
- Node.js 20+
- 播放器需向系统注册媒体会话（SMTC）

## 快速开始

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 使用说明

1. 在网易云 / QQ 音乐或其他支持 SMTC 的播放器中开始播放。
2. 打开 Dancingword，将鼠标移入窗口顶部打开 HUD；**鼠标离开窗口后边缘按钮会自动隐藏**。
3. 点击 HUD 中的「设置」（或 `Ctrl+,`）打开独立设置窗口，在其中选择音乐来源。
4. 「鼓点」可在 HUD 或设置窗口中开关：会捕获系统回环音频做低频 onset，驱动当前歌词脉冲。
5. 快捷键：`F` 切换全屏，`Esc` 退出全屏，`Ctrl+,` 打开设置。

## 播放器 SMTC 兼容

| 播放器 | 说明 |
| --- | --- |
| QQ 音乐 | 较新版本已自带 SMTC；若来源列表为空，请升级客户端并确认正在播放。 |
| 网易云音乐 | 官方客户端可能不暴露 SMTC。可安装 [BetterNCM](https://github.com/MicroCBer/BetterNCM) 的 InfLink 等插件以注册媒体会话。 |
| 其他 | Spotify、Edge / Chrome 内网页播放、部分本地播放器等，只要出现在 Windows 媒体浮层即可被识别。 |

若已选择某来源但舞台提示「没有该播放器的媒体会话」，请先在对应软件中点播放，并确认系统音量浮层能显示该曲目。

## 功能概览

- **来源选择**：基于 Windows SMTC（`windows-media-sessions`），只跟随用户选定的 App，避免串台。
- **歌词**：优先 [LRCLIB](https://lrclib.net/)，失败后依次尝试网易云、QQ 音乐接口（按歌名/歌手搜索匹配）；支持 LRC 同步与纯文本降级。
- **同步时钟**：以媒体会话进度为主，本地 `requestAnimationFrame` 外推，减少卡顿。
- **鼓点**：桌面音频回环 + Web Audio 低频能量检测；失败时仍可正常跟词。

## 技术栈

Electron + Vite + React + TypeScript（electron-vite）

## 许可

MIT
