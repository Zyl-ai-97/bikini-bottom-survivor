# 气泡转场

解压后，在本目录运行下面的命令。

```sh
python -m http.server 8846
```

打开 [本地预览](http://127.0.0.1:8846/)，点击 **Play transition**。预览以原版 AAC 播放音轨，透明视频在原声开始后约 0.30 秒叠入。播放完可再次点击重播。

- `assets/dive-bubbles.webm` 是透明气泡主视频。
- `assets/dive-bubbles-software.webm` 是供软件渲染使用的轻量透明视频。
- `assets/dive-bubbles-original.m4a` 是完整的原版 AAC 音轨。

预览只使用此目录内的文件。整合页面可从 `dive-transition.js` 导入 `createDiveTransition` 和 `bubbleSoundUrl`。
