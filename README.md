# Squeek Hub

Squeek Hub is a web project powered by wheel data from Squeektoshi the hamster. **Radio** turns wheel speed into musical tempo, **Studio** displays a floating speed card, and **Oracle** lets you explore past runs and make predictions.

[Open Squeek Hub](https://squeek-hub.yummymusic1.chatgpt.site)

The hosted site currently requires private access. You can run the project on your computer by following the [local setup instructions](#5-run-locally).

## 1. Radio

1. Press **▶** on the home page.
2. Choose **Burrow FM** or **Night Run**. Adjust the sound with the **Volume** slider.
3. **RPM** measures wheel revolutions per minute. **BPM** measures musical beats per minute. The tempo rises as the wheel spins faster.
4. Select **Try sample signal** to preview a sample run. The hamster animation starts running on desktop. Select **Back to live signal** to return to live data.
5. If audio fails to play, select **Use compatible audio**. This mode plays a prerecorded audio file and adjusts its playback speed using wheel data.

If you switch to Studio or Oracle while Radio is playing, you can control playback from the mini player. The **Wheel activity** chart at the bottom of the home page shows up to five minutes of live speed readings collected while the page is open.

The hamster scene shows a sleeping pose when the live wheel speed is zero and a running animation when the wheel spins.

## 2. Studio

1. Open **Studio** and choose **Retro Radio**, **Minimal**, or **Neon**.
2. Use **Customize** to adjust the title, color, card size, and counters.
3. To add a speed alert, enable **Show Wheel Surge alert** and enter an **Alert RPM** value. Select **Test alert** to preview it.
4. If you see **Open Studio in its own tab**, select it first. In the separate tab, select **Open floating card**.
5. Drag the card by its top edge to position it on your screen. Keep the Studio tab open while switching to another tab, such as YouTube or X.

The floating card requires Chrome's **Document Picture-in-Picture** support. Chrome manages the window position. Use **Sample** to preview the card. The floating card displays either the live signal or a recorded run you select.

### Install the Chrome extension

The extension gives you quick access to Studio from Chrome's Extensions menu.

1. In Studio, select **Download Chrome extension** and extract the ZIP file.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** and select **Load unpacked**.
4. Select the extracted folder that contains `manifest.json`.
5. Open **Squeek Hub** from Chrome's Extensions menu. In the tab that opens, select **Open floating card**.

To update the extension, extract the new ZIP, copy its contents into the existing extension folder, and select **Reload** on the extension card at `chrome://extensions`. The extension stores its appearance settings separately from the website.

## 3. Oracle

- **Activity map** shows wheel activity over the past seven days. Brighter green indicates more activity, gray indicates a recorded zero, and a dotted area indicates missing data. Times are shown in UTC.
- **Chance of wheel activity** estimates the probability of movement in the next 10-minute round. It uses historical activity from the same UTC time slot and the overall activity rate. The probability is hidden when the archive is stale or has too little data.
- **Guess the next run** lets you choose **Yes** or **No**. Keep the Oracle tab open so it can collect readings. If the outcome can be verified, your guess is scored and compared with Oracle's prediction when one is available. Your score is stored in your browser.
- **Oracle Report Card** tests predictions against archived rounds in chronological order. Each prediction uses only earlier rounds. The table shows predicted probabilities, observed activity rates, and the number of rounds tested in each probability range.

### Explore a recorded run

1. Go to **Oracle → Hear a past run**. The **Explore recorded runs** link on the home page also takes you there.
2. Sort runs by most recent, longest duration, or highest peak RPM. Use **Compare two runs** to view two speed charts on the same scale.
3. Select **Listen in Radio** to hear the run and seek through it using the chart. Select **Open in Studio** to play the same run in the Studio card.
4. Select **Download recap PNG** to save an image with the run duration, peak RPM, and speed chart.
5. Use **Radio Postcard** to save a clip of up to 15 seconds. It selects the most active segment by default. You can change the start time and station. The browser's recording support determines whether the clip is saved as MP4 or WebM.

## 4. Data sources

- Live RPM and counters come from Squeekchain's public `/v1/status` endpoint. The activity chart uses `/v1/measurement/stats`.
- The run archive contains selected sensor records from `/v1/measurement/runs`. Replay speed is calculated from the time between recorded wheel passes.
- The prediction archive is a fixed snapshot of 527 completed Sepolia rounds through November 7, 2026, at 11:40 UTC. The live prediction is hidden once the newest archive entry is more than seven days old. The historical report card continues to use the archive.
- The interface marks missing readings and labels sample signals, recorded runs, and live data separately.

[Squeekchain API documentation](https://docs.squeekchain.com/developers/api/)

## 5. Run locally

Clone the repository or download and extract its ZIP. Open a terminal in the project folder, then run:

```bash
python3 -m http.server 4173 --directory dist
```

Open [http://localhost:4173](http://localhost:4173) in your browser. The site uses static HTML, CSS, and JavaScript and runs without installing npm dependencies or building the project. Live data requires an internet connection.

### Project files

| Path | Contents |
| --- | --- |
| `dist/index.html` and `dist/radio.mjs` | Home page, player, and live RPM |
| `dist/music.mjs` | Radio stations and music engine |
| `dist/studio.html` | Studio settings and floating card |
| `dist/oracle.html`, `dist/oracle.mjs`, and `dist/prediction.mjs` | Charts, run archive, and predictions |
| `dist/runs.json` and `dist/rounds.json` | Recorded runs and historical round data |
| `dist/assets/` | Images, animations, and audio files |
| `dist/squeek-hub-chrome-extension.zip` | Downloadable Chrome extension package |

If your checkout includes the `extension/` source folder and you change the Studio or extension sources, rebuild the downloadable package:

```bash
python3 extension/package.py
```

The script writes the new ZIP to `dist/squeek-hub-chrome-extension.zip`.

Built by [@ramilashrff](https://x.com/ramilashrff).
