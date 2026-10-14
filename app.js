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

const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// Minutes since midnight in Lahore.
function lahoreMinutes(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: GYM_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

// The class running now, or else the next one to start, looking up to a week ahead.
function nextClass(classes, day, minutes) {
  const running = classes.find((c) => c.day === day && toMinutes(c.start) <= minutes && minutes < toMinutes(c.end));
  if (running) return { lesson: running, when: 'now' };
  const today = WEEK.indexOf(day);
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const onDay = WEEK[(today + ahead) % 7];
    const lesson = classes
      .filter((c) => c.day === onDay && (ahead > 0 || toMinutes(c.start) > minutes))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0];
    if (lesson) return { lesson, when: ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : onDay };
  }
  return null;
}

// The badge's words: "Next class: <name>, today at 6:00 pm" or "On now: <name>, until 9:00 pm".
function nextClassWords({ lesson, when }) {
  if (when === 'now') return { lead: 'On now:', name: lesson.name, time: `until ${lesson.endLabel}` };
  const day = when === 'today' || when === 'tomorrow' ? when : when[0].toUpperCase() + when.slice(1);
  return { lead: 'Next class:', name: lesson.name, time: `${day} at ${lesson.startLabel}` };
}

function otherTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}

// Taps worth counting are the ways people get in touch or find the gym.
function contactKind(href) {
  if (href.startsWith('https://wa.me/')) return 'whatsapp';
  if (href.startsWith('tel:')) return 'call';
  if (href.startsWith('https://www.instagram.com/')) return 'instagram';
  if (href.startsWith('https://maps.app.goo.gl/')) return 'directions';
  if (href.includes('#lrd=') || href.startsWith('https://g.page/r/')) return 'review';
  return null;
}

// "/" and "/index.html" are the home page; "/mma.html" is "mma".
function pageName(pathname) {
  const file = pathname.split('/').pop().replace(/\.html$/, '');
  return file === '' || file === 'index' ? 'home' : file;
}

const CONTACT_LABELS = {
  whatsapp: 'WhatsApp', call: 'Call', instagram: 'Instagram', directions: 'Directions', review: 'Google review',
};

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

function initNextClass(badge) {
  const classes = JSON.parse(badge.dataset.nextClass);
  const show = () => {
    const now = new Date();
    const next = nextClass(classes, lahoreToday(now).day, lahoreMinutes(now));
    if (!next) return;
    const { lead, name, time } = nextClassWords(next);
    const words = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = name;
    words.append(`${lead} `, strong, `, ${time}`);
    badge.replaceChildren(words);
    badge.classList.toggle('is-on-now', next.when === 'now');
    badge.hidden = false;
  };
  show();
  setInterval(show, 60 * 1000);
}

function initThemeToggle(button) {
  const root = document.documentElement;
  const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');
  const label = () => button.setAttribute('aria-label', `Switch to ${otherTheme(current())} mode`);

  button.addEventListener('click', () => {
    const next = otherTheme(current());
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode: still switches */ }
    label();
  });
  label();
  button.hidden = false;
}

// GoatCounter (loaded by the page when analytics is on) records each tap as an
// event such as "whatsapp-mma". Without it, taps just do what they always do.
function countContactTaps(page) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    const kind = link && contactKind(link.getAttribute('href'));
    if (!kind || !window.goatcounter?.count) return;
    window.goatcounter.count({
      path: `${kind}-${page}`, title: `${CONTACT_LABELS[kind]} tap on the ${page} page`, event: true,
    });
  });
}

if (typeof document !== 'undefined') {
  countContactTaps(pageName(location.pathname));
  document.querySelectorAll('[data-theme-toggle]').forEach(initThemeToggle);
  const today = lahoreToday(new Date());
  document.querySelectorAll('[data-schedule]').forEach((root) => initSchedule(root, today.day));
  markEvents(document.querySelectorAll('[data-event-date]'), today.iso);
  document.querySelectorAll('[data-next-class]').forEach(initNextClass);
}

if (typeof module !== 'undefined') {
  module.exports = {
    lahoreToday, defaultScheduleDay, eventStatus, neighbourDay, otherTheme, contactKind, pageName,
    lahoreMinutes, nextClass, nextClassWords,
  };
}
