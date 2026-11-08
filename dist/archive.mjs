export async function readArchive(path) {
  const response = await fetch(path, {signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Archive unavailable');
  return response.json();
}
export function runDuration(run) {
  return run.offsets.at(-1) + 1000;
}
export function runRpm(run, elapsed) {
  const index = run.offsets.findIndex(time => time > elapsed);
  const count = index < 0 ? run.offsets.length : index;
  const current = run.offsets[count - 1];
  const gap = current - run.offsets[count - 2];
  return elapsed < runDuration(run) && gap > 0 && elapsed - current < Math.max(gap * 1.6,1000) ? 60000 / gap : 0;
}

export function runPeak(run) {
  return run.offsets.reduce((peak,time,index) => {
    const gap = time - run.offsets[index-1];
    return gap > 0 ? Math.max(peak,60000/gap) : peak;
  },0);
}

export function runTrace(run, duration, ceiling) {
  const points = [];
  for (let index = 1; index < run.offsets.length; index++) {
    const time = run.offsets[index];
    const gap = time - run.offsets[index-1];
    if (gap <= 0) continue;
    const rpm = 60000/gap;
    const end = Math.min(run.offsets[index+1] ?? duration, time + Math.max(1000,gap*1.6), runDuration(run));
    const y = 94 - rpm/ceiling*88;
    points.push(`M${time/duration*600} ${y}H${end/duration*600}`);
  }
  return points.join(' ');
}
