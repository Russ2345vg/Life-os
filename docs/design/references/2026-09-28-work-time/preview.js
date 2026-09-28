// Visual-only proposal: these synthetic examples do not read or write application data.
const source = await fetch(
  '/docs/design/references/2026-09-27-weekly-transition/preview.html',
).then((response) => response.text());
const shell = new DOMParser()
  .parseFromString(source, 'text/html')
  .querySelector('.planner-sidebar');
document.querySelector('#shell').replaceChildren(...shell.childNodes);
for (const link of document.querySelectorAll('#shell a')) {
  link.removeAttribute('aria-current');
  if (link.getAttribute('href') === '#/v2/actions') link.setAttribute('aria-current', 'page');
  if (link.getAttribute('href')?.startsWith('#/v2/')) link.href = `/${link.getAttribute('href')}`;
}
let paused = false;
document.querySelector('#pause').onclick = () => {
  paused = !paused;
  document.querySelector('#pause').textContent = paused ? 'Продолжить' : 'Пауза';
  document.querySelector('#session-status').textContent = paused ? 'НА ПАУЗЕ' : 'РАБОТА ИДЁТ';
};
document.querySelector('#finish').onclick = () => {
  document.querySelector('#session-status').textContent = 'РАБОТА СОХРАНЕНА';
  document.querySelector('#pause').disabled = true;
  document.querySelector('#finish').disabled = true;
  document.querySelector('#feedback').hidden = false;
};
for (const name of ['day', 'week'])
  document.querySelector(`#${name}`).onclick = () => {
    for (const other of ['day', 'week'])
      document.querySelector(`#${other}`).setAttribute('aria-pressed', String(name === other));
    document.querySelector('#period').textContent =
      name === 'week' ? '28 сентября — 4 октября' : 'Понедельник, 28 сентября';
    document.querySelector('#planned').textContent = name === 'week' ? '18 ч 30 мин' : '3 ч 30 мин';
    document.querySelector('#actual').textContent = name === 'week' ? '14 ч 12 мин' : '2 ч 12 мин';
    document.querySelector('#done').textContent = name === 'week' ? '12 действий' : '2 действия';
  };
/* global fetch, DOMParser, document */
