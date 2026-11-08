import {setupPrediction} from './prediction.mjs';
import {downloadRecap, setupPostcard} from './run-media.mjs';
import {readArchive, runDuration, runRpm, runPeak, runTrace} from './archive.mjs';

const get = id => document.getElementById(id);
const updatePrediction = setupPrediction();
const fmt = new Intl.NumberFormat('en');
const clock = new Intl.DateTimeFormat('en', {hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone:'UTC'});
const percent = new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:1});
const reportDate = new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC'});
const day = new Intl.DateTimeFormat('en', {month:'short', day:'numeric', timeZone:'UTC'});
const slot = time => Math.floor(time / 600) % 144;
const probability = (seen, active, total, positive) => (active + 4 * ((positive + 1) / (total + 2))) / (seen + 4);

function showForecast({start, seconds, work, through, address}) {
  if (!Array.isArray(work) || work.length < 145 || seconds !== 600) throw new Error('Incomplete data');
  const history = Array.from({length:144}, () => [0,0]);
  const bands = [0,0,0];
  let active = 0;
  let score = 0;
  let baselineScore = 0;
  const warmup = 144;
  const forecasts = [];
  work.forEach((units, index) => {
    const time = start + index * seconds;
    const stats = history[slot(time)];
    const positive = Number(units > 0);
    if (index >= warmup) {
      const forecast = probability(...stats,index,active);
      forecasts.push({time,forecast,positive});
      score += (forecast - positive) ** 2;
      baselineScore += ((active + 1)/(index + 2) - positive) ** 2;
    }
    stats[0]++;
    stats[1] += positive;
    active += positive;
    bands[units === 0 ? 0 : units < 500 ? 1 : 2]++;
  });
  const tested = forecasts.length;
  showReport(forecasts);
  get('backtest').textContent = 'Backtest on ' + fmt.format(tested) + ' rounds. Brier error ' + (score/tested).toFixed(3) + ' vs ' + (baselineScore/tested).toFixed(3) + ' for the overall-rate baseline. Lower is better.';
  get('distribution').querySelectorAll('dd').forEach((item, i) => item.textContent = fmt.format(bands[i]));
  const throughTime = start + through * seconds;
  get('round-source').append(document.createTextNode('Archived through ' + day.format(throughTime * 1000) + ', ' + clock.format(throughTime * 1000) + ' UTC · '));
  const source = document.createElement('a');
  source.href = 'https://sepolia.etherscan.io/address/' + address;
  source.textContent = 'SqueekCore ↗';
  get('round-source').append(source);
  function estimate() {
    const now = Math.floor(Date.now() / 1000);
    const next = start + (Math.floor((now - start)/seconds)+1) * seconds;
    const stats = history[slot(next)];
    if (now - throughTime > 7*86400 || !stats[0]) {
      updatePrediction(next,null);
      get('chance').textContent = '—';
      get('forecast-detail').textContent = 'The archive is too old or too sparse for a current estimate.';
      return;
    }
    const percentage = Math.round(100*probability(...stats,work.length,active));
    updatePrediction(next,percentage);
    get('chance').textContent = percentage + '%';
    get('forecast-detail').textContent = 'Next round begins ' + clock.format(next * 1000) + ' UTC. This clock slot has ' + stats[0] + ' observations, blended with the overall rate. Live accuracy is unverified.';
  }
  estimate();
  setInterval(estimate,10000);
}

function showReport(forecasts) {
  const buckets = Array.from({length:5},() => ({count:0,forecast:0,positive:0}));
  for (const {forecast,positive} of forecasts) {
    const bucket = buckets[Math.min(4,Math.floor(Math.round(forecast*100)/20))];
    bucket.count++;
    bucket.forecast += forecast;
    bucket.positive += positive;
  }

  function row(values) {
    const tr = document.createElement('tr');
    values.forEach((value,index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = value;
      tr.append(cell);
    });
    return tr;
  }

  get('report-calibration').replaceChildren(...buckets.map(({count,forecast,positive},index) => {
    const range = (index*20) + '–' + (index === 4 ? 100 : index*20+19) + '%';
    return row([range,count ? percent.format(forecast/count) : '—',
      count ? percent.format(positive/count) + ' (' + positive + '/' + count + ')' : '—',fmt.format(count)]);
  }));
  get('report-rounds').replaceChildren(...forecasts.slice(-12).reverse().map(({time,forecast,positive}) =>
    row([reportDate.format(time*1000),percent.format(forecast),positive ? 'Wheel moved' : 'No work recorded'])
  ));
  get('report-status').textContent = fmt.format(forecasts.length) + ' archived rounds tested after a 24-hour warm-up. Forecast ranges use whole-percent bands and empty ranges have no test rounds.';
  get('report-tables').hidden = false;
}

function showHeat(data) {
  if (!Array.isArray(data.activity?.days)) throw new Error('History unavailable');
  const target = get('heat');
  const ordered = Array.from({length:48}, (_,i) => (720 + i * 30) % 1440);
  const header = document.createElement('span');
  header.className = 'axis';
  header.textContent = 'UTC';
  target.append(header);
  ordered.forEach((minute,i) => {
    const label = document.createElement('span');
    label.className = 'axis';
    if (i % 8 === 0) label.textContent = String(minute/60).padStart(2,'0') + ':00';
    target.append(label);
  });
  const days = data.activity.days.slice(-7);
  const maximum = Math.max(1,...days.flatMap(entry => entry.buckets.map(bucket => Number(bucket.workUnits) || 0)));
  for (const entry of days) {
    const row = document.createElement('span');
    row.className = 'date';
    row.textContent = day.format(Date.parse(entry.date+'T12:00:00Z'));
    target.append(row);
    const byMinute = new Map(entry.buckets.map(bucket => [bucket.startMinuteUtc,bucket]));
    for (const minute of ordered) {
      const cell = document.createElement('span');
      const bucket = byMinute.get(minute);
      const time = String(Math.floor(minute/60)).padStart(2,'0') + ':' + String(minute%60).padStart(2,'0');
      cell.className = 'cell';
      const missing = bucket?.coverage !== 'complete' || bucket.workUnits == null;
      cell.dataset.missing = String(missing);
      const work = missing ? 0 : Number(bucket.workUnits);
      if (work > 0) cell.style.setProperty('--cell','color-mix(in srgb, #c9f57a ' + (22 + 78*Math.sqrt(work/maximum)) + '%, #26322a)');
      cell.title = entry.date + ' row · ' + time + ' UTC · ' + (missing ? (bucket?.coverage ?? 'missing') : fmt.format(work) + ' work');
      cell.setAttribute('aria-label',cell.title);
      cell.setAttribute('role','img');
      target.append(cell);
    }
  }
  const count = data.activity.coverage;
  get('coverage').textContent = fmt.format(count.observedRoundCount) + ' of ' + fmt.format(count.expectedRoundCount) + ' rounds observed in the past 7 days. Each row starts at 12:00 UTC.';
}

const sort = get('run-sort');
const openPostcard = setupPostcard();
let runs = [];
const rpmFormat = new Intl.NumberFormat('en',{maximumFractionDigits:1});

function sparkline(samples, peak) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 120 28');
  svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('aria-hidden','true');
  svg.classList.add('run-sparkline');
  const line = document.createElementNS(svg.namespaceURI,'polyline');
  line.setAttribute('points',samples.map((rpm,index) => (index*120/(samples.length-1)) + ',' + (26-rpm/Math.max(1,peak)*24)).join(' '));
  svg.append(line);
  return svg;
}

function showRuns() {
  const list = get('runs');
  if (!runs.length) return;
  const order = sort.value;
  const records = [...runs].sort((a,b) => (order === 'duration' ? b.duration-a.duration :
    order === 'peak' ? b.peak-a.peak : 0) || b.record.start-a.record.start);
  list.replaceChildren();
  for (const {record, duration, peak, samples} of records) {
    const item = document.createElement('article');
    item.className = 'run';
    const title = document.createElement('strong');
    title.textContent = day.format(record.start) + ' · ' + clock.format(record.start) + ' UTC';
    const stats = document.createElement('small');
    stats.textContent = Math.round(duration/1000) + 's replay · ' + rpmFormat.format(peak) + ' peak RPM';
    item.append(title,stats,sparkline(samples,peak));
    for (const [path,label] of [['./','Listen in Radio'],['./studio.html','Open in Studio']]) {
      const link = document.createElement('a');
      link.href = path + '?run=' + encodeURIComponent(record.id) + (path === './' ? '#player' : '');
      link.textContent = label + ' ↗';
      item.append(link);
    }
    for (const [label,action] of [['Download recap PNG',downloadRecap],['Radio Postcard',openPostcard]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'run-action';
      button.textContent = label;
      button.addEventListener('click',() => action(record));
      item.append(button);
    }
    list.append(item);
  }
}

readArchive('./rounds.json').then(showForecast).catch(() => {
  get('forecast-detail').textContent = 'Settled round archive unavailable.';
  get('report-status').textContent = 'The report card is unavailable. Reload to retry.';
});
readArchive('https://api.squeekchain.com/v1/measurement/stats?range=7d').then(showHeat)
  .catch(() => get('coverage').textContent = 'The activity API is unavailable. Reload to retry.');
sort.addEventListener('change',showRuns);
readArchive('./runs.json').then(records => {
  if (!records.length) throw new Error('No recorded runs');
  runs = records.map(record => {
    const duration = runDuration(record);
    const peak = runPeak(record);
    const samples = Array.from({length:40},(_,index) => runRpm(record,duration*index/39));
    return {record,duration,peak,samples};
  });
  showRuns();
  setupCompare();
}).catch(() => get('runs').textContent = 'Recorded runs unavailable.');


function setupCompare() {
  const selectors = ['a','b'].map(key => get('compare-'+key));
  for (const selector of selectors) {
    for (const {record} of [...runs].sort((a,b) => b.record.start-a.record.start)) {
      selector.add(new Option(day.format(record.start) + ' · ' + clock.format(record.start) + ' UTC',record.id));
    }
    selector.addEventListener('change',paintCompare);
  }
  selectors[1].selectedIndex = Math.min(1,runs.length-1);
  paintCompare();

  function paintCompare() {
    const selected = selectors.map(selector => runs.find(run => run.record.id === selector.value));
    const duration = Math.max(...selected.map(run => run.duration));
    const ceiling = Math.max(20,Math.ceil(Math.max(...selected.map(run => run.peak))/20)*20);
    get('compare-end').textContent = (duration/1000).toFixed(1) + ' s';
    get('compare-scale').textContent = '0–' + ceiling + ' RPM';
    get('compare-chart').setAttribute('aria-label','Run A and Run B speed on a shared scale from 0 to ' + ceiling + ' RPM, over ' + (duration/1000).toFixed(1) + ' seconds');
    selected.forEach(({record,duration:runLength,peak},index) => {
      const key = index === 0 ? 'a' : 'b';
      get('compare-line-'+key).setAttribute('d',runTrace(record,duration,ceiling));
      get('compare-stats-'+key).textContent = 'Run ' + key.toUpperCase() + ' · ' + (runLength/1000).toFixed(1) + ' s · ' + rpmFormat.format(peak) + ' peak RPM';
    });
  }
}
