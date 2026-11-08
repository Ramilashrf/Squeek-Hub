import {selectRun} from './radio.mjs';

const iframe = document.getElementById('hub-view');
const sections = {studio:'studio.html',oracle:'oracle.html'};
const main = document.querySelector('main');
const footer = document.querySelector('footer');
const nav = [...document.querySelectorAll('.mast nav a')];
let frameRoute;
let radioRun = new URLSearchParams(location.search).get('run');

function currentRoute(url) {
  const view = url.searchParams.get('view');
  return {view:Object.hasOwn(sections, view) ? view : 'radio', run:url.searchParams.get('run'), hash:url.hash};
}

function show(route) {
  const {view, run, hash} = route;
  const radio = view === 'radio';
  document.body.dataset.hubView = view;
  main.hidden = footer.hidden = !radio;
  iframe.hidden = radio;
  nav.forEach((link,index) => {
    if (view === ['radio','studio','oracle'][index]) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  document.title = 'Squeek Hub — ' + view[0].toUpperCase() + view.slice(1);
  if (radio) {
    radioRun = run;
    selectRun(run);
    requestAnimationFrame(() => {
      if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
      else window.scrollTo(0,0);
    });
    return;
  }
  const page = new URL('./' + sections[view], location.href);
  if (run) page.searchParams.set('run', run);
  page.hash = hash;
  if (frameRoute !== page.href) {
    frameRoute = page.href;
    iframe.contentWindow.location.replace(page.href);
  }
  iframe.title = 'Squeek Hub ' + view;
}

function linkClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[href]');
  if (!link || link.target || link.hasAttribute('download')) return;
  const destination = new URL(link.href);
  const root = new URL('./',location.href);
  if (destination.origin !== root.origin) return;
  const view = Object.keys(sections).find(name => destination.pathname === root.pathname + sections[name]);
  if (!view && destination.pathname !== root.pathname) return;
  if (destination.searchParams.has('mode')) return;
  event.preventDefault();
  const target = new URL(root);
  if (view) target.searchParams.set('view',view);
  const preserveRun = !view && (!destination.hash || link.closest('#mini-player'));
  const run = destination.searchParams.get('run') || (preserveRun ? radioRun : null);
  if (run) target.searchParams.set('run',run);
  target.hash = destination.hash;
  history.pushState(null,'',target);
  show(currentRoute(target));
}

document.addEventListener('click',linkClick);
iframe.addEventListener('load',() => {
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.querySelector('.mast')?.setAttribute('hidden','');
  doc.addEventListener('click',linkClick);
  if (doc.location.hash) doc.getElementById(doc.location.hash.slice(1))?.scrollIntoView();
});
window.addEventListener('popstate',() => show(currentRoute(new URL(location.href))));
show(currentRoute(new URL(location.href)));
