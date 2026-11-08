# Squeek Hub

Squeek Hub combines three tools around real Squeekchain wheel data.

- **Radio** synthesizes Burrow FM and Night Run in the browser. A fresh hardware RPM reading drives the tempo and note density. Compatible audio plays a rendered version of each original arrangement through the browser’s media player and still follows wheel tempo.
- **Studio** previews and exports configurable OBS overlays. Download the HTML for OBS Local file or use a public Browser Source URL. A replay export embeds its timing data.
- **Oracle** shows seven-day measurement coverage, an experimental next-round activity probability, and selected hardware excerpts. Open any excerpt in Radio or Studio.

## Data and limits

The Radio and Studio read the public Squeekchain status API. Oracle’s heatmap reads its public measurement stats. The replay archive consists of excerpts assembled from eligible hardware passages in `/v1/measurement/runs`, grouped by continuity and gaps of up to six seconds. Replay RPM is estimated from adjacent recorded passages. It is displayed separately from live telemetry.

The forecast uses a fixed snapshot of 527 settled Sepolia rounds through 2026-11-07 11:40 UTC at block 12083455. Its probability is the smoothed activity frequency for the same UTC clock slot. The retrospective test walks forward chronologically and compares it to the overall activity rate. It does not model settlement arrival time, and the live estimate expires after seven days without a refreshed snapshot. A quiet or missing wheel reading does not establish sleep, and the project does not infer feeding.

The radio cover is generated illustration, not a live camera image.

## Chrome extension

1. Unzip `dist/squeek-hub-chrome-extension.zip`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted folder that contains `manifest.json`.
4. Click **Squeek Hub** in the Chrome toolbar to open the floating wheel card.
