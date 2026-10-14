// Small progressive enhancements. The page is complete without this script.

const GYM_TIME_ZONE = 'Asia/Karachi';

// --- Decisions (pure, covered by tests/app.test.mjs) -------------------------

function lahoreToday(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: GYM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
    }).formatToParts(now).map((part) => [part.type, part.value]));
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, day: parts.weekday.toLowerCase() };
}

function defaultScheduleDay(today, daysWithClasses) {
  return daysWithClasses.includes(today) ? today : daysWithClasses[0];
}

function eventStatus(eventIso, todayIso) {
  return eventIso >= todayIso ? 'upcoming' : 'past';
}

function neighbourDay(days, current, key) {
  const index = days.indexOf(current);
  const last = days.length - 1;
  switch (key) {
    case 'ArrowRight': return days[index === last ? 0 : index + 1];
    case 'ArrowLeft': return days[index === 0 ? last : index - 1];
    case 'Home': return days[0];
    case 'End': return days[last];
    default: return null;
  }
}

// --- Page wiring -----------------------------------------------------------

function initSchedule(root, today) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = [...root.querySelectorAll('[role="tabpanel"]')];
  const days = tabs.map((tab) => tab.dataset.day);

  const select = (day, { focus = false } = {}) => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.day === day;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.day === day));
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => select(tab.dataset.day));
    tab.addEventListener('keydown', (event) => {
      const target = neighbourDay(days, tab.dataset.day, event.key);
      if (!target) return;
      event.preventDefault();
      select(target, { focus: true });
    });
  });

  panels.forEach((panel) => panel.classList.toggle('is-today', panel.dataset.day === today));
  root.classList.add('has-tabs');
  select(defaultScheduleDay(today, days));
}

function markEvents(items, todayIso) {
  items.forEach((item) => {
    const status = eventStatus(item.dataset.eventDate, todayIso);
    item.classList.add(`is-${status}`);
    if (status === 'upcoming') {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Upcoming';
      item.prepend(badge);
    }
  });
}

if (typeof document !== 'undefined') {
  const today = lahoreToday(new Date());
  document.querySelectorAll('[data-schedule]').forEach((root) => initSchedule(root, today.day));
  markEvents(document.querySelectorAll('[data-event-date]'), today.iso);
}

if (typeof module !== 'undefined') {
  module.exports = { lahoreToday, defaultScheduleDay, eventStatus, neighbourDay };
}
