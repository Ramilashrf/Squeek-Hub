import {readWheel} from './music.mjs';

const roundLength = 600000;
const grace = 120000;
const key = 'squeek-hub-guesses-v1';
const clock = new Intl.DateTimeFormat('en',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC'});

function validReading(payload) {
  const data = payload?.measurement;
  if (readWheel(payload).state !== 'live' || !/^\d{1,30}$/.test(data.cumulativeWorkUnits)
      || typeof data.installationId !== 'string' || typeof data.counterEpoch !== 'string') return null;
  return {time:Date.parse(data.observedAt),count:String(data.cumulativeWorkUnits),source:JSON.stringify([data.installationId,data.counterEpoch])};
}

export function setupPrediction() {
  const details = document.getElementById('guess-status');
  const totals = document.getElementById('guess-score');
  const history = document.getElementById('guess-history');
  const buttons = [...document.querySelectorAll('[data-guess]')];
  let entries = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) entries = saved.filter(item => item && Number.isFinite(item.start) && typeof item.guess === 'boolean');
  } catch {}
  let nextRound;
  let oracle;
  let loading = false;
  let retryAt = 0;
  let saveFailed = false;

  function persist() {
    try { localStorage.setItem(key,JSON.stringify(entries)); }
    catch { saveFailed = true; }
  }
  const pending = () => entries.find(entry => entry.result == null);
  const roundLabel = entry => clock.format(entry.start) + '–' + clock.format(entry.start+roundLength) + ' UTC';
  const answer = value => value === true ? 'Moves' : value === false ? 'Still' : '—';

  function paint() {
    const current = pending();
    const now = Date.now();
    for (const button of buttons) button.disabled = Boolean(current) || !nextRound || now >= nextRound;
    details.textContent = current
      ? roundLabel(current) + ' · You: ' + answer(current.guess) + ' · Oracle: ' + (current.oracle == null ? 'unavailable' : current.oracle + '% moves') + ' · ' +
        (now < current.start ? 'Waiting for the round' : now < current.start+roundLength ? 'Round in progress' : 'Checking wheel data')
      : nextRound ? 'Next round starts at ' + clock.format(nextRound) + ' UTC.' : 'Waiting for the round schedule.';
    if (saveFailed) details.textContent += ' Browser storage is unavailable.';
    const scored = entries.filter(entry => typeof entry.result === 'boolean');
    const model = scored.filter(entry => Number.isFinite(entry.oracle));
    totals.textContent = 'You ' + scored.filter(entry => entry.guess === entry.result).length + '/' + scored.length
      + ' correct · Oracle ' + model.filter(entry => (entry.oracle >= 50) === entry.result).length + '/' + model.length + ' correct';
    history.replaceChildren(...entries.filter(entry => entry.result != null).slice(0,5).map(entry => {
      const row = document.createElement('li');
      row.textContent = roundLabel(entry) + ' · You: ' + answer(entry.guess) + ' · Oracle: '
        + (entry.oracle == null ? 'unavailable' : entry.oracle + '% moves') + ' · '
        + (entry.result === 'unknown' ? 'Unverified, no score' : 'Result: ' + answer(entry.result));
      return row;
    }));
  }

  for (const button of buttons) button.addEventListener('click',() => {
    if (pending() || !nextRound || Date.now() >= nextRound) return;
    entries.unshift({start:nextRound,guess:button.dataset.guess === 'moves',oracle});
    entries = entries.slice(0,40);
    retryAt = 0;
    persist();
    paint();
    check();
  });

  async function check() {
    const entry = pending();
    if (!entry || loading) return;
    const end = entry.start+roundLength;
    if (Date.now() > end+grace) {
      entry.result = entry.moved ? true : 'unknown';
      persist();
      paint();
      return;
    }
    if (entry.moved) {
      if (Date.now() >= end) {
        entry.result = true;
        persist();
        paint();
      }
      return;
    }
    if (Date.now() < entry.start-grace || Date.now() < retryAt) return;
    loading = true;
    try {
      const response = await fetch('https://api.squeekchain.com/v1/status',{credentials:'omit',signal:AbortSignal.timeout(6500)});
      if (!response.ok) {
        retryAt = Date.now() + (Number(response.headers.get('Retry-After')) || 10)*1000;
        return;
      }
      const sample = validReading(await response.json());
      if (!sample) return;
      if (sample.time <= entry.start && sample.time >= entry.start-grace && sample.time > (entry.before?.time ?? 0)) entry.before = sample;
      if (sample.time >= entry.start && sample.time < end) {
        const prior = entry.inside;
        if (prior && prior.source === sample.source && prior.time < sample.time && BigInt(sample.count) > BigInt(prior.count)) entry.moved = true;
        if (!prior || sample.time > prior.time) entry.inside = sample;
      }
      if (Date.now() >= end && sample.time >= end && entry.before?.source === sample.source && entry.before.count === sample.count && !entry.moved) entry.result = false;
      if (Date.now() >= end && entry.moved) entry.result = true;
      persist();
      paint();
    } catch {
      // Leave the round pending while the feed can still provide evidence.
    } finally {
      loading = false;
    }
  }

  paint();
  check();
  setInterval(check,10000);
  return (start,percentage) => {
    nextRound = start*1000;
    oracle = percentage;
    paint();
  };
}
