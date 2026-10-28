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

// Gallery: which photos a filter shows, and stepping through them in the lightbox.
function galleryShows(category, filter) {
  return filter === 'all' || category === filter;
}

function stepIndex(index, count, step) {
  return (index + step + count) % count;
}

// The phone header tucks away while scrolling down and comes back on the way
// up. Small movements keep it as it is, so it doesn't flicker.
const TUCK_AFTER = 120;
const TUCK_STEP = 8;
function headerTucked({ tucked, y, lastY, menuOpen }) {
  if (menuOpen || y < TUCK_AFTER) return false;
  if (Math.abs(y - lastY) < TUCK_STEP) return tucked;
  return y > lastY;
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

// Every tap on a link, button or question is counted. Contact taps keep their
// own kind; the rest are calendar adds, other links, buttons, or opened questions.
function tapKind(tag, href) {
  if (tag === 'summary') return 'open';
  if (tag === 'button') return 'button';
  if (href.endsWith('.ics') || href.startsWith('https://calendar.google.com/')) return 'calendar';
  return contactKind(href) || 'link';
}

// "Adults Jiu Jitsu: Fundamentals, 3 classes per week" becomes
// "adults-jiu-jitsu-fundamentals-3-classes-per-week".
function slug(text) {
  return text.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'unnamed';
}

const KIND_LABELS = {
  whatsapp: 'WhatsApp', call: 'Call', instagram: 'Instagram', directions: 'Directions', review: 'Google review',
  calendar: 'Calendar', link: 'Link', button: 'Button', open: 'Opened',
};

// A tap becomes a GoatCounter event such as "whatsapp-home-register-seminar-with-yousuf-nabi".
function tapEvent({ tag, href = '', label }, page) {
  const kind = tapKind(tag, href);
  const text = label.replace(/\s+/g, ' ').trim();
  return {
    path: `${kind}-${page}-${slug(text)}`,
    title: `${KIND_LABELS[kind]}: “${text}” on the ${page} page`,
  };
}

// --- Page wiring -----------------------------------------------------------

// Tabs: one panel shows at a time. A link to a hidden panel (#pricing-kids)
// switches to its tab first, then scrolls to it.
function initTabs(root, first) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));

  const select = (tab, { focus = false } = {}) => {
    tabs.forEach((other, i) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      panels[i].classList.toggle('is-active', selected);
      if (selected && focus) other.focus();
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const target = neighbourDay(tabs, tab, event.key);
      if (!target) return;
      event.preventDefault();
      select(target, { focus: true });
    });
  });

  const fromHash = () => {
    const index = panels.findIndex((panel) => `#${panel.id}` === location.hash);
    if (index < 0) return false;
    select(tabs[index]);
    panels[index].scrollIntoView();
    return true;
  };
  window.addEventListener('hashchange', fromHash);

  root.classList.add('has-tabs');
  if (!fromHash()) select(first(tabs));
}

function initSchedule(root, today) {
  root.querySelectorAll('[role="tabpanel"]')
    .forEach((panel) => panel.classList.toggle('is-today', panel.dataset.day === today));
  initTabs(root, (tabs) => {
    const days = tabs.map((tab) => tab.dataset.day);
    return tabs[days.indexOf(defaultScheduleDay(today, days))];
  });
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

function initGallery(grid) {
  const items = [...grid.querySelectorAll('li')];
  const filters = document.querySelector('[data-gallery-filters]');
  const lightbox = document.querySelector('[data-lightbox]');

  if (filters) {
    const buttons = [...filters.querySelectorAll('[data-filter]')];
    buttons.forEach((button) => button.addEventListener('click', () => {
      buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      items.forEach((item) => { item.hidden = !galleryShows(item.dataset.category, button.dataset.filter); });
    }));
    filters.hidden = false;
  }

  if (!lightbox || typeof lightbox.showModal !== 'function') return;
  const image = lightbox.querySelector('img');
  const caption = lightbox.querySelector('figcaption');
  let shown = [];
  let index = 0;
  const show = () => {
    const link = shown[index];
    const thumb = link.querySelector('img');
    image.src = link.getAttribute('href');
    image.alt = thumb.alt;
    caption.textContent = link.dataset.caption;
  };
  const step = (by) => { index = stepIndex(index, shown.length, by); show(); };

  grid.addEventListener('click', (event) => {
    const link = event.target.closest('.photo-link');
    if (!link) return;
    event.preventDefault();
    shown = items.filter((item) => !item.hidden).map((item) => item.querySelector('.photo-link'));
    index = shown.indexOf(link);
    show();
    lightbox.showModal();
  });
  lightbox.querySelectorAll('[data-lightbox-step]').forEach((button) => {
    button.addEventListener('click', () => step(Number(button.dataset.lightboxStep)));
  });
  lightbox.querySelector('[data-lightbox-close]').addEventListener('click', () => lightbox.close());
  // A click on the dark backdrop (the dialog itself, not its contents) closes it.
  lightbox.addEventListener('click', (event) => { if (event.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
  });
}

// "Add to calendar" menus close on a tap elsewhere or Escape, like other menus.
function closeCalendarMenus() {
  const openMenus = () => document.querySelectorAll('details.add-calendar[open]');
  document.addEventListener('click', (event) => {
    openMenus().forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    openMenus().forEach((menu) => { menu.open = false; menu.querySelector('summary').focus(); });
  });
}

// The banner's boot script already removed it if it has expired or was closed.
function initAnnouncement(banner) {
  const button = banner.querySelector('[data-announcement-close]');
  button.addEventListener('click', () => {
    try { localStorage.setItem('announcement-closed', banner.dataset.announcement); } catch { /* private mode: closes for now */ }
    banner.remove();
  });
  button.hidden = false;
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

// On phones the stylesheet folds the menu behind the menu button.
function initMenu(header) {
  const button = header.querySelector('[data-menu-toggle]');
  const isOpen = () => header.classList.contains('is-open');
  const setOpen = (open) => {
    header.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  button.addEventListener('click', () => setOpen(!isOpen()));
  // Each item's place in reading order, for the staggered entrance in styles.css.
  header.querySelectorAll('.site-nav a, .theme-toggle').forEach((item, i) => item.style.setProperty('--i', i));
  header.querySelectorAll('.site-nav a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', (event) => { if (isOpen() && !header.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    button.focus();
  });

  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const tucked = headerTucked({ tucked: header.classList.contains('is-tucked'), y, lastY, menuOpen: isOpen() });
    header.classList.toggle('is-tucked', tucked);
    if (Math.abs(y - lastY) >= TUCK_STEP) lastY = y;
  }, { passive: true });

  header.classList.add('has-menu');
  button.hidden = false;
}

// Sections rise in the first time they come into view. Ones already on screen
// reveal straight away, so nothing is left hidden.
function initReveals(sections) {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  sections.forEach((section) => {
    section.classList.add('reveal');
    observer.observe(section);
  });
}

// The tagline's words light up in reading order as they cross a line just
// above the middle of the screen. Words crossing together step 60ms apart.
function initTagline(line) {
  if (!('IntersectionObserver' in window)) return;
  const words = [];
  [...line.childNodes].forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const pieces = node.textContent.split(/(\s+)/).map((piece) => {
      if (!piece.trim()) return document.createTextNode(piece);
      const word = document.createElement('span');
      word.className = 'tagline-word';
      word.textContent = piece;
      words.push(word);
      return word;
    });
    node.replaceWith(...pieces);
  });
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting)
      .sort((a, b) => words.indexOf(a.target) - words.indexOf(b.target))
      .forEach((entry, i) => {
        entry.target.style.transitionDelay = `${i * 60}ms`;
        entry.target.classList.add('is-lit');
        observer.unobserve(entry.target);
      });
  }, { rootMargin: '0px 0px -45% 0px' });
  words.forEach((word) => observer.observe(word));
}

// What a tapped element is called: its data-count name where the page gives
// one, otherwise what a screen reader would say, or a photo's description.
function tapLabel(element) {
  return element.dataset.count || element.getAttribute('aria-label') || element.textContent.trim()
    || element.querySelector('img')?.alt || element.getAttribute('href') || '';
}

// GoatCounter (loaded by the page when analytics is on) records each tap as an
// event. Without it, taps just do what they always do. Counting happens before
// the page reacts, so a button is named as it was when tapped.
function countTaps(page) {
  document.addEventListener('click', (event) => {
    const element = event.target.closest?.('a[href], button, summary');
    if (!element || !window.goatcounter?.count) return;
    // A question is counted when it opens, not when it closes.
    if (element.tagName === 'SUMMARY' && element.parentElement?.open) return;
    const tap = tapEvent({
      tag: element.tagName.toLowerCase(), href: element.getAttribute('href') || '', label: tapLabel(element),
    }, page);
    window.goatcounter.count({ ...tap, event: true });
  }, true);
}

if (typeof document !== 'undefined') {
  countTaps(pageName(location.pathname));
  document.querySelectorAll('[data-theme-toggle]').forEach(initThemeToggle);
  document.querySelectorAll('[data-site-header]').forEach(initMenu);
  document.querySelectorAll('[data-announcement]').forEach(initAnnouncement);
  closeCalendarMenus();
  document.querySelectorAll('[data-gallery]').forEach(initGallery);
  const today = lahoreToday(new Date());
  document.querySelectorAll('[data-schedule]').forEach((root) => initSchedule(root, today.day));
  document.querySelectorAll('[data-tabs]').forEach((root) => initTabs(root, (tabs) => tabs[0]));
  markEvents(document.querySelectorAll('[data-event-date]'), today.iso);
  document.querySelectorAll('[data-next-class]').forEach(initNextClass);
  initReveals(document.querySelectorAll('main > .section:not(.tagline-reveal)'));
  document.querySelectorAll('[data-tagline]').forEach(initTagline);
}

if (typeof module !== 'undefined') {
  module.exports = {
    lahoreToday, defaultScheduleDay, eventStatus, neighbourDay, otherTheme, contactKind, tapKind, slug, tapEvent, pageName,
    lahoreMinutes, nextClass, nextClassWords, galleryShows, stepIndex, headerTucked,
  };
}
