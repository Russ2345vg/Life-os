/* global fetch, DOMParser, document, window */
// Visual-only prototype. No application, storage or native alarm commands are called.
const source = await fetch('./shell.html').then((response) => response.text());
const shell = new DOMParser()
  .parseFromString(source, 'text/html')
  .querySelector('.planner-sidebar');
document.querySelector('#shell').replaceChildren(...shell.childNodes);
for (const link of document.querySelectorAll('#shell a')) {
  link.removeAttribute('aria-current');
  if (link.getAttribute('href') === '#/v2/sleep') link.setAttribute('aria-current', 'page');
  const route = link.getAttribute('href');
  if (route?.startsWith('#/v2/'))
    link.onclick = (event) => {
      event.preventDefault();
      window.location.assign(`/${route}`);
    };
}
const element = (id) => document.querySelector(`#${id}`);
const more = document.querySelector('.planner-nav-more');
more.setAttribute('aria-current', 'page');
more.onclick = () => {
  const menu = element('planner-more-menu');
  menu.hidden = !menu.hidden;
  more.setAttribute('aria-expanded', String(!menu.hidden));
};
const notify = (text) => {
  element('feedback').textContent = text;
  element('feedback').hidden = false;
};
let demoTime = '07:15';
let demoSound = 'Системный сигнал';
let skippedCount = 0;
let preparationFinished = false;
const demoDate = (offset = 0, includeWeekday = true) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    ...(includeWeekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(2026, 8, 29 + skippedCount + offset)));
const states = {
  ready: ['Установлен на Android', 'Приложение на телефоне подтвердило сигнал.'],
  permission: [
    'Нужно разрешение Android',
    'Доступ к точным будильникам выключен. Разрешите его в настройках телефона.',
  ],
  disabled: [
    'Расписание выключено',
    'Сигнал не назначен. Включите расписание сна, чтобы поставить будильник.',
  ],
  stale: ['Ожидает подтверждения', 'Расписание сохранено. Телефон ещё не подтвердил новый сигнал.'],
  error: [
    'Будильник не подтверждён',
    'Не удалось подтвердить постановку на Android. Проверьте снова.',
  ],
  ringing: [
    'Сигнал звучит',
    'Для выключения откройте будильник на телефоне: отсканируйте QR или введите аварийную фразу.',
  ],
  browser: [
    'Открыто в браузере',
    'Здесь можно изменить расписание. Для системного сигнала откройте LifeOS на Android.',
  ],
};
function updateSchedule() {
  element('schedule-summary').textContent = `22:30–${demoTime} · ежедневно`;
  element('schedule-detail').textContent =
    `Расписание ${element('state').value === 'disabled' ? 'выключено' : 'включено'} · 22:30–${demoTime}`;
  element('sound-label').textContent = demoSound;
}
function updatePreparation() {
  const checked = document.querySelectorAll('.wake-check input:checked').length;
  element('evening-summary').textContent =
    `${preparationFinished ? 'Завершена' : 'Сон в 22:30'} · ${checked} из 4 пунктов`;
  element('evening').textContent = preparationFinished
    ? 'Подготовка завершена'
    : 'Завершить подготовку';
  element('evening').disabled = preparationFinished;
}
function setState(value) {
  element('state').value = value;
  element('wake-card').dataset.state = value;
  element('wake-status').dataset.state = value;
  element('wake-status').textContent = states[value][0];
  element('wake-explanation').textContent = states[value][1];
  element('wake-explanation').hidden = value === 'ready';
  element('wake-date').textContent =
    value === 'ready'
      ? `${skippedCount === 0 ? 'Завтра, ' : ''}${demoDate()}`
      : value === 'ringing'
        ? 'Текущий сигнал'
        : 'Время по расписанию';
  element('test').hidden = value !== 'ready';
  element('skip').hidden = value !== 'ready';
  element('permission').hidden = value !== 'permission';
  element('retry').hidden = !['error', 'stale', 'permission'].includes(value);
  element('edit').hidden = value === 'ringing';
  element('edit').textContent = value === 'disabled' ? 'Включить расписание' : 'Изменить время';
  element('edit').classList.toggle(
    'planner-primary',
    !['permission', 'error', 'stale'].includes(value),
  );
  element('permission').classList.toggle('planner-primary', value === 'permission');
  element('retry').classList.toggle('planner-primary', ['error', 'stale'].includes(value));
  element('feedback').hidden = true;
  element('edit-form').hidden = true;
  element('skip-confirm').hidden = true;
  updateSchedule();
}
element('state').onchange = (event) => setState(event.target.value);
element('edit').onclick = () => {
  if (element('state').value === 'disabled') {
    setState('stale');
    notify('Макет: расписание включено; сигнал ожидает подтверждения телефона.');
    element('retry').focus();
    return;
  }
  element('skip-confirm').hidden = true;
  element('feedback').hidden = true;
  element('skip').hidden = element('state').value !== 'ready';
  element('time-input').value = demoTime;
  element('sound-input').value = demoSound;
  element('edit-form').hidden = false;
  element('time-input').focus();
};
element('cancel').onclick = () => {
  element('edit-form').hidden = true;
  element('edit').focus();
};
element('edit-form').onkeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    element('cancel').click();
  }
};
element('edit-form').onsubmit = (event) => {
  event.preventDefault();
  demoTime = element('time-input').value;
  demoSound = element('sound-input').value;
  element('wake-time').textContent = demoTime;
  const currentState = element('state').value;
  setState(['browser', 'permission', 'disabled'].includes(currentState) ? currentState : 'stale');
  notify(
    `Макет: подъём в ${demoTime}, ${demoSound.toLocaleLowerCase('ru')}. Реальный сигнал не изменён.`,
  );
  (element('retry').hidden ? element('edit') : element('retry')).focus();
};
element('test').onclick = () =>
  notify(
    'Макет: в приложении пробный сигнал прозвучит через 20 секунд. Здесь звук не запускается.',
  );
element('skip').onclick = () => {
  element('edit-form').hidden = true;
  element('feedback').hidden = true;
  element('skip-description').textContent =
    `Будет пропущен подъём ${demoDate(0, false)} в ${demoTime}. Следующий — ${demoDate(1, false)} в ${demoTime}.`;
  element('skip-confirm').hidden = false;
  element('skip').hidden = true;
  element('cancel-skip').focus();
};
element('cancel-skip').onclick = () => {
  element('skip-confirm').hidden = true;
  element('skip').hidden = false;
  element('skip').focus();
};
element('skip-confirm').onkeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    element('cancel-skip').click();
  }
};
element('confirm-skip').onclick = () => {
  skippedCount += 1;
  setState('ready');
  notify(`Макет: один подъём пропущен. Ближайший — ${demoDate()} в ${demoTime}.`);
  element('skip').focus();
};
element('permission').onclick = () =>
  notify('Макет: в приложении откроются разрешения Android. На этом экране доступ не меняется.');
element('retry').onclick = () => {
  if (element('state').value === 'permission') {
    notify('Макет: сначала нужен доступ к точным будильникам на телефоне.');
    return;
  }
  setState('ready');
  notify('Макет: показано подтверждение Android. Реальная постановка сигнала не выполнялась.');
  element('edit').focus();
};
for (const id of ['qr', 'phrase'])
  element(id).onclick = () =>
    notify('Макет: в приложении откроется существующая настройка LifeOS. Данные не меняются.');
for (const input of document.querySelectorAll('.wake-check input'))
  input.onchange = () => {
    preparationFinished = false;
    updatePreparation();
  };
element('evening').onclick = () => {
  preparationFinished = true;
  updatePreparation();
  notify('Макет: вечерняя подготовка завершена. Данные приложения не меняются.');
};
setState('ready');
updatePreparation();
