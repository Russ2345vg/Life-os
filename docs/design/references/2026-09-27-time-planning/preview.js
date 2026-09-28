/* global fetch, DOMParser, document */
// Isolated visual proposal: all examples remain in memory; no application data access.
const reference = await fetch(
  '/docs/design/references/2026-09-27-weekly-transition/preview.html',
).then((response) => response.text());
const shell = new DOMParser()
  .parseFromString(reference, 'text/html')
  .querySelector('.planner-sidebar');
document.querySelector('#shell').replaceChildren(...shell.childNodes);
for (const link of document.querySelectorAll('#shell a')) {
  link.removeAttribute('aria-current');
  if (link.getAttribute('href') === '#/v2/actions') link.setAttribute('aria-current', 'page');
  if (link.getAttribute('href')?.startsWith('#/v2/')) link.href = `/${link.getAttribute('href')}`;
}
const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const blocks = [
  { day: 0, start: 540, duration: 90, title: 'Подготовить проект', priority: true },
  { day: 0, start: 690, duration: 60, title: 'Разобрать материалы' },
  { day: 0, start: 840, duration: 60, title: 'Занятие английским' },
  { day: 1, start: 600, duration: 90, title: 'Работа над проектом' },
  { day: 1, start: 840, duration: 60, title: 'Тренировка' },
  { day: 2, start: 540, duration: 120, title: 'Работа над проектом', priority: true },
  { day: 2, start: 780, duration: 60, title: 'Английский' },
  { day: 3, start: 570, duration: 90, title: 'Работа над проектом' },
  { day: 3, start: 840, duration: 60, title: 'Тренировка' },
  { day: 4, start: 540, duration: 90, title: 'Подготовить результат', priority: true },
  { day: 4, start: 780, duration: 60, title: 'Обзор недели' },
  { day: 5, start: 660, duration: 120, title: 'Время для себя' },
];
let chosen = 0;
let selectedBlock = null;
const time = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const hours = (value) => `${Math.floor(value / 60)} ч${value % 60 ? ` ${value % 60} мин` : ''}`;
function render() {
  const select = document.querySelector('#day-select');
  select.replaceChildren();
  const gutter = document.createElement('span');
  gutter.className = 'gutter';
  select.append(gutter);
  weekdays.forEach((name, day) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(day === chosen));
    button.innerHTML = `<span>${name}</span><strong>${day < 3 ? 28 + day : day - 2}</strong>`;
    button.onclick = () => {
      chosen = day;
      render();
    };
    select.append(button);
  });
  const grid = document.querySelector('#time-grid');
  grid.replaceChildren();
  const axis = document.createElement('div');
  axis.className = 'hour-axis';
  for (let hour = 8; hour < 20; hour++) {
    const label = document.createElement('span');
    label.style.top = `${(hour - 8) * 48}px`;
    label.textContent = `${String(hour).padStart(2, '0')}:00`;
    axis.append(label);
  }
  grid.append(axis);
  for (let day = 0; day < 7; day++) {
    const column = document.createElement('div');
    column.className = `day-column${day === chosen ? ' chosen' : ''}`;
    for (const block of blocks.filter((block) => block.day === day)) {
      const button = document.createElement('button');
      button.className = `time-block${block.priority ? ' priority' : ''}${selectedBlock === block ? ' selected' : ''}`;
      button.style.top = `${(block.start - 480) * 0.8 + 4}px`;
      button.style.height = `${block.duration * 0.8 - 8}px`;
      const label = document.createElement('span');
      label.textContent = `${time(block.start)}–${time(block.start + block.duration)}`;
      button.append(label, block.title);
      button.onclick = () => {
        selectedBlock = block;
        chosen = block.day;
        document.querySelector('#block-details').hidden = false;
        document.querySelector('#block-title').textContent = block.title;
        document.querySelector('#block-description').textContent =
          `${weekdays[block.day]}, ${time(block.start)} · ${hours(block.duration)}`;
        render();
      };
      column.append(button);
    }
    grid.append(column);
  }
  const total = blocks
    .filter((block) => block.day === chosen)
    .reduce((sum, block) => sum + block.duration, 0);
  document.querySelector('.eyebrow').textContent =
    `${weekdays[chosen]}, ${chosen < 3 ? 28 + chosen : chosen - 2} ${chosen < 3 ? 'сентября' : 'октября'}`;
  document.querySelector('#planned-hours').textContent = hours(total);
  document.querySelector('#capacity').value = total;
  document.querySelector('.day-capacity h2').textContent =
    total > 360 ? 'Плану нужно больше времени' : 'Есть место для важного';
  document.querySelector('#capacity-note').textContent =
    total > 360
      ? `Не помещается ${hours(total - 360)}`
      : `Свободно ${hours(360 - total)} · перерывы учтены`;
}
document.querySelector('#day-mode').onclick = () => {
  document.querySelector('.time-calendar').classList.add('day-only');
  document.querySelector('#day-mode').setAttribute('aria-pressed', 'true');
  document.querySelector('#week-mode').setAttribute('aria-pressed', 'false');
};
document.querySelector('#week-mode').onclick = () => {
  document.querySelector('.time-calendar').classList.remove('day-only');
  document.querySelector('#day-mode').setAttribute('aria-pressed', 'false');
  document.querySelector('#week-mode').setAttribute('aria-pressed', 'true');
};
const dialog = document.querySelector('#schedule-dialog');
function open(title = 'Подготовить проект', duration = 60) {
  document.querySelector('#action-choice').value = title;
  document.querySelector('#duration').value = duration;
  document.querySelector('#form-error').hidden = true;
  dialog.showModal();
}
document.querySelector('#add').onclick = () => open();
for (const button of document.querySelectorAll('.schedule'))
  button.onclick = () => open(button.dataset.title, Number(button.dataset.duration));
document.querySelector('#cancel').onclick = () => dialog.close();
document.querySelector('#schedule-form').onsubmit = (event) => {
  event.preventDefault();
  const [hour, minute] = document.querySelector('#start-time').value.split(':').map(Number);
  const start = hour * 60 + minute;
  const duration = Number(document.querySelector('#duration').value);
  const conflict =
    start < 480 ||
    start + duration > 1200 ||
    blocks.some(
      (block) =>
        block.day === chosen &&
        start < block.start + block.duration &&
        start + duration > block.start,
    );
  if (conflict) {
    document.querySelector('#form-error').textContent =
      'Это время занято или выходит за пределы дня. Выберите другое окно.';
    document.querySelector('#form-error').hidden = false;
    return;
  }
  blocks.push({
    day: chosen,
    start,
    duration,
    title: document.querySelector('#action-choice').value,
  });
  dialog.close();
  render();
  const feedback = document.querySelector('#feedback');
  feedback.textContent = 'Время выбрано в макете. Данные приложения не изменены.';
  feedback.hidden = false;
};
document.querySelector('#move').onclick = () => {
  if (!selectedBlock || selectedBlock.start + selectedBlock.duration + 30 > 1200) return;
  selectedBlock.start += 30;
  render();
};
render();
