// A source box that can point at a line: line numbers down the side, and a band across
// the line an error names. Shared by both pages, like shell.js; it knows nothing about
// what the text is, only that it is lines.
//
// The band is drawn behind the textarea rather than inside it, since a textarea holds
// plain text and nothing else. That only lines up if a source line is a screen line, so
// the box stops soft-wrapping: a long line scrolls sideways, which for code is what a
// reader expects anyway, and the alternative — measuring where the browser wrapped —
// would be a reimplementation of its text layout.

/**
 * Wrap a textarea in place and hand back what the page needs to point into it.
 *
 * @param {HTMLTextAreaElement} textarea
 * @returns {{mark: (line: ?number) => void, reveal: (line: number) => void}}
 */
export function codeArea(textarea) {
  const box = document.createElement('div');
  box.className = 'code';
  const gutter = document.createElement('div');
  gutter.className = 'code-lines';
  gutter.setAttribute('aria-hidden', 'true');
  const numbers = document.createElement('div');
  gutter.append(numbers);
  const band = document.createElement('div');
  band.className = 'code-band';
  band.hidden = true;
  textarea.replaceWith(box);
  box.append(gutter, band, textarea);
  textarea.wrap = 'off';

  let marked = null;
  let count = 0;

  const metrics = () => {
    const cs = getComputedStyle(textarea);
    return { lh: parseFloat(cs.lineHeight), top: parseFloat(cs.paddingTop) };
  };

  // Numbers are rebuilt only when the count changes, which is the only thing that moves
  // them; scrolling just slides the column.
  const renumber = () => {
    const n = textarea.value.split('\n').length;
    if (n === count && numbers.dataset.marked === String(marked)) return;
    count = n;
    numbers.dataset.marked = String(marked);
    numbers.replaceChildren(...Array.from({ length: n }, (_, i) => {
      const d = document.createElement('div');
      d.textContent = String(i + 1);
      if (i + 1 === marked) d.className = 'bad';
      return d;
    }));
  };

  // The band is put where the line's number is, rather than computed from the textarea's
  // padding and line height: the number is already known to sit level with its line, and
  // a second calculation of the same thing is a second chance to get it wrong.
  const place = () => {
    numbers.style.transform = `translateY(${-textarea.scrollTop}px)`;
    const row = marked === null ? null : numbers.children[marked - 1];
    if (!row) return;
    // Measured on screen, after the scroll has moved the column, since which box an
    // offset is counted from depends on which ancestors are positioned.
    const at = row.getBoundingClientRect();
    band.style.top = `${at.top - box.getBoundingClientRect().top}px`;
    band.style.height = `${at.height}px`;
  };

  textarea.addEventListener('input', () => { renumber(); place(); });
  textarea.addEventListener('scroll', place);
  // A resize or a late font moves the lines without an input or a scroll to say so.
  new ResizeObserver(place).observe(textarea);
  document.fonts?.ready.then(place);

  /** Point at a line, or at nothing. A line past the end is the end, as a parser means it. */
  function mark(line) {
    const n = textarea.value.split('\n').length;
    marked = Number.isInteger(line) && line > 0 ? Math.min(line, n) : null;
    band.hidden = marked === null;
    count = -1;
    renumber();
    place();
  }

  /** Put the cursor on a line, select it, and scroll it into view. */
  function reveal(line) {
    const lines = textarea.value.split('\n');
    const at = Math.min(Math.max(line, 1), lines.length) - 1;
    const start = lines.slice(0, at).reduce((s, l) => s + l.length + 1, 0);
    textarea.focus();
    textarea.setSelectionRange(start, start + lines[at].length);
    const { lh, top } = metrics();
    const y = top + at * lh;   // only to decide whether to scroll, so near enough will do
    if (y < textarea.scrollTop || y + lh > textarea.scrollTop + textarea.clientHeight) {
      textarea.scrollTop = Math.max(0, y - textarea.clientHeight / 3);
    }
    place();
  }

  renumber();
  return { mark, reveal };
}

/**
 * Write an error into a message element, with the line it names made into a link that
 * takes the reader there. The parsers all spell a position as `line N: …`, so that is
 * the one form recognised; anything else is shown as it is.
 *
 * @param {HTMLElement} el
 * @param {string} where what the error is in, e.g. 'circuit'
 * @param {Error} e
 * @param {?{mark: Function, reveal: Function}} area the box the line is in
 */
export function showError(el, where, e, area) {
  const m = /^line (\d+): ([\s\S]*)$/.exec(e.message);
  const line = e.line ?? (m ? Number(m[1]) : null);
  area?.mark(line);
  if (!line || !area) {
    el.textContent = `${where} — ${e.message}`;
    return;
  }
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'error-line';
  link.textContent = `line ${line}`;
  link.title = 'go to this line';
  link.addEventListener('click', (ev) => { ev.preventDefault(); area.reveal(line); });
  el.replaceChildren(`${where} — `, link, `: ${m ? m[2] : e.message}`);
}
