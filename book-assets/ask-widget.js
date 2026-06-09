// Aristotle "ask the book" widget.
//
// Injected into breakdown.html by build-book.sh (appended inside a <script>
// tag, so this file must not contain a closing script tag sequence).
//
// What it does:
//   - Select any text in the book → a floating "Ask" chip appears.
//   - Click it (or the ✦ launcher, bottom-right) → an inline panel opens in
//     the same window with the selection quoted.
//   - Ask a question → streamed answer from `claude -p` running against the
//     book's source markdown (served by `aristotle serve <book-dir>`).
//   - Or hit "Fix chapter" with a complaint → an agent edits that chapter's
//     markdown in place, the server rebuilds the book, the page reloads.
//
// Server discovery: same origin when the book is served over http (the
// normal `aristotle serve` flow); falls back to http://127.0.0.1:4517 when
// opened as file:// so the widget still works next to a running server.
(function () {
  'use strict';

  var DEFAULT_PORT = 4517;
  var API = (location.protocol === 'http:' || location.protocol === 'https:')
    ? ''
    : 'http://127.0.0.1:' + DEFAULT_PORT;

  var state = {
    selection: null,   // { text, chapter: {id, title} }
    busy: false,
  };

  // ---------- styles ----------
  var css = ''
    + '.arq-chip{position:absolute;z-index:9999;background:#8b4513;color:#faf8f4;border:none;'
    + 'border-radius:14px;padding:4px 12px;font:13px -apple-system,Helvetica,Arial,sans-serif;'
    + 'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);display:none}'
    + '.arq-chip:hover{background:#6d3610}'
    + '.arq-launcher{position:fixed;right:1.2rem;bottom:1.2rem;z-index:9998;width:42px;height:42px;'
    + 'border-radius:50%;border:1px solid #e0dcd4;background:#fffdf9;color:#8b4513;font-size:19px;'
    + 'cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.12)}'
    + '.arq-launcher:hover{background:#f0ede6}'
    + '.arq-panel{position:fixed;right:1.2rem;bottom:1.2rem;z-index:10000;width:400px;max-width:calc(100vw - 2rem);'
    + 'max-height:72vh;display:none;flex-direction:column;background:#fffdf9;border:1px solid #e0dcd4;'
    + 'border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18);'
    + 'font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#2c2c2c}'
    + '.arq-head{display:flex;align-items:center;gap:.5rem;padding:.6rem .9rem;border-bottom:1px solid #e0dcd4}'
    + '.arq-title{font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6b6b6b}'
    + '.arq-chapter{font-size:12px;color:#8b4513;margin-left:auto;max-width:55%;overflow:hidden;'
    + 'text-overflow:ellipsis;white-space:nowrap}'
    + '.arq-close{border:none;background:none;font-size:17px;cursor:pointer;color:#6b6b6b;padding:0 .2rem}'
    + '.arq-log{overflow-y:auto;padding:.7rem .9rem;flex:1;min-height:60px}'
    + '.arq-q{margin:.4rem 0;padding:.45rem .7rem;background:#f0ede6;border-radius:8px;white-space:pre-wrap}'
    + '.arq-a{margin:.4rem 0 .8rem;padding:.1rem .1rem;white-space:pre-wrap}'
    + '.arq-a.arq-streaming:after{content:"▋";color:#8b4513;animation:arqblink 1s infinite}'
    + '@keyframes arqblink{50%{opacity:0}}'
    + '.arq-err{color:#a33;margin:.4rem 0;white-space:pre-wrap}'
    + '.arq-status{color:#6b6b6b;font-style:italic;margin:.3rem 0}'
    + '.arq-sel{margin:.5rem .9rem 0;padding:.4rem .7rem;border-left:3px solid #c4a87c;background:rgba(0,0,0,.02);'
    + 'color:#555;font-size:12.5px;max-height:72px;overflow:hidden;position:relative}'
    + '.arq-sel button{position:absolute;top:2px;right:4px;border:none;background:none;cursor:pointer;color:#999}'
    + '.arq-input{display:flex;gap:.5rem;padding:.7rem .9rem;border-top:1px solid #e0dcd4;align-items:flex-end}'
    + '.arq-ta{flex:1;resize:none;border:1px solid #e0dcd4;border-radius:7px;padding:.45rem .6rem;'
    + 'font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;background:#fff;min-height:34px;max-height:120px}'
    + '.arq-btn{border:none;border-radius:7px;padding:.45rem .8rem;cursor:pointer;font-size:13px;font-weight:600}'
    + '.arq-btn[disabled]{opacity:.5;cursor:default}'
    + '.arq-ask{background:#8b4513;color:#faf8f4}'
    + '.arq-fix{background:#f0ede6;color:#6d3610}'
    + '.arq-hint{padding:0 .9rem .55rem;font-size:11.5px;color:#9b9b9b}'
    + '.arq-toast{position:fixed;left:50%;top:1rem;transform:translateX(-50%);z-index:10001;background:#2c2c2c;'
    + 'color:#faf8f4;padding:.5rem 1rem;border-radius:8px;font:13px -apple-system,Helvetica,Arial,sans-serif;'
    + 'box-shadow:0 4px 16px rgba(0,0,0,.3)}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---------- DOM ----------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  var chip = el('button', 'arq-chip', 'Ask ✦');
  chip.setAttribute('data-aristotle-ask', 'chip');
  document.body.appendChild(chip);

  var launcher = el('button', 'arq-launcher', '✦');
  launcher.title = 'Ask the book';
  launcher.setAttribute('data-aristotle-ask', 'launcher');
  document.body.appendChild(launcher);

  var panel = el('div', 'arq-panel');
  panel.setAttribute('data-aristotle-ask', 'panel');
  var head = el('div', 'arq-head');
  var chapterLabel = el('span', 'arq-chapter', '');
  var closeBtn = el('button', 'arq-close', '×');
  head.appendChild(el('span', 'arq-title', 'Ask the book'));
  head.appendChild(chapterLabel);
  head.appendChild(closeBtn);
  var selBox = el('div', 'arq-sel');
  selBox.style.display = 'none';
  var log = el('div', 'arq-log');
  var inputRow = el('div', 'arq-input');
  var ta = el('textarea', 'arq-ta');
  ta.placeholder = 'Ask about the selection, or complain to fix the chapter…';
  ta.rows = 1;
  var askBtn = el('button', 'arq-btn arq-ask', 'Ask');
  var fixBtn = el('button', 'arq-btn arq-fix', 'Fix chapter');
  fixBtn.title = 'Send your complaint to an agent that rewrites this chapter and rebuilds the book';
  inputRow.appendChild(ta);
  inputRow.appendChild(askBtn);
  inputRow.appendChild(fixBtn);
  var hint = el('div', 'arq-hint', 'Enter to ask · Shift+Enter for newline · Esc to close');
  panel.appendChild(head);
  panel.appendChild(selBox);
  panel.appendChild(log);
  panel.appendChild(inputRow);
  panel.appendChild(hint);
  document.body.appendChild(panel);

  // ---------- chapter detection ----------
  function chapterOf(node) {
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.matches && node.matches('section.chapter')) {
        var h1 = node.querySelector('h1');
        return { id: node.id || '', title: h1 ? h1.textContent.trim() : (node.id || 'unknown') };
      }
      node = node.parentNode;
    }
    return null;
  }

  function chapterInView() {
    var sections = document.querySelectorAll('section.chapter');
    var mid = window.innerHeight / 2;
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return chapterOf(sections[i].querySelector('h1') || sections[i]);
    }
    return sections.length ? chapterOf(sections[0].querySelector('h1') || sections[0]) : null;
  }

  // ---------- selection handling ----------
  function currentSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    var text = sel.toString().trim();
    if (text.length < 3) return null;
    var range = sel.getRangeAt(0);
    if (panel.contains(range.startContainer) || panel.contains(range.endContainer)) return null;
    return { text: text, chapter: chapterOf(range.startContainer), range: range };
  }

  function placeChip() {
    var s = currentSelection();
    if (!s) { chip.style.display = 'none'; return; }
    var rect = s.range.getBoundingClientRect();
    chip.style.display = 'block';
    chip.style.left = Math.max(8, rect.left + window.scrollX + rect.width / 2 - 30) + 'px';
    chip.style.top = (rect.bottom + window.scrollY + 8) + 'px';
  }

  document.addEventListener('mouseup', function (e) {
    if (panel.contains(e.target) || e.target === chip) return;
    // selection isn't final until after mouseup completes
    setTimeout(placeChip, 0);
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Escape') { closePanel(); chip.style.display = 'none'; return; }
    if (!panel.contains(e.target)) setTimeout(placeChip, 0);
  });

  chip.addEventListener('click', function () {
    var s = currentSelection();
    if (s) attachSelection(s.text, s.chapter);
    chip.style.display = 'none';
    openPanel();
  });

  launcher.addEventListener('click', function () {
    if (!state.selection) {
      var ch = chapterInView();
      chapterLabel.textContent = ch ? ch.title : '';
      state.selection = ch ? { text: '', chapter: ch } : null;
    }
    openPanel();
  });

  function attachSelection(text, chapter) {
    state.selection = { text: text, chapter: chapter };
    chapterLabel.textContent = chapter ? chapter.title : '';
    if (text) {
      selBox.style.display = 'block';
      selBox.textContent = '“' + (text.length > 260 ? text.slice(0, 260) + '…' : text) + '”';
      var rm = el('button', null, '×');
      rm.addEventListener('click', function () {
        selBox.style.display = 'none';
        if (state.selection) state.selection.text = '';
      });
      selBox.appendChild(rm);
    } else {
      selBox.style.display = 'none';
    }
  }

  function openPanel() {
    panel.style.display = 'flex';
    launcher.style.display = 'none';
    ta.focus();
  }
  function closePanel() {
    panel.style.display = 'none';
    launcher.style.display = 'block';
  }
  closeBtn.addEventListener('click', closePanel);

  // ---------- transport ----------
  function send(mode) {
    if (state.busy) return;
    var text = ta.value.trim();
    if (!text) return;
    var sel = state.selection || { text: '', chapter: chapterInView() };

    state.busy = true;
    askBtn.disabled = fixBtn.disabled = true;
    ta.value = '';

    log.appendChild(el('div', 'arq-q', (mode === 'revise' ? '✎ ' : '') + text));
    var answer = el('div', 'arq-a arq-streaming');
    log.appendChild(answer);
    log.scrollTop = log.scrollHeight;

    fetch(API + '/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: mode,
        question: text,
        selection: sel.text || '',
        chapter: sel.chapter || null,
      }),
    }).then(function (res) {
      if (!res.ok) throw new Error('server replied ' + res.status);
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { finish(null); return; }
          buf += decoder.decode(r.value, { stream: true });
          var parts = buf.split('\n\n');
          buf = parts.pop();
          parts.forEach(function (part) {
            var line = part.split('\n').find(function (l) { return l.indexOf('data: ') === 0; });
            if (!line) return;
            var ev;
            try { ev = JSON.parse(line.slice(6)); } catch (e) { return; }
            handleEvent(ev, answer);
          });
          log.scrollTop = log.scrollHeight;
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      answer.classList.remove('arq-streaming');
      var msg = (API === '')
        ? 'Lost the ask server: ' + err.message
        : 'Can’t reach the ask server (' + err.message + ').\nStart it with:  aristotle serve <this book’s folder>';
      log.appendChild(el('div', 'arq-err', msg));
      finish(err);
    });

    function finish() {
      answer.classList.remove('arq-streaming');
      state.busy = false;
      askBtn.disabled = fixBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  function handleEvent(ev, answer) {
    if (ev.type === 'text') {
      answer.textContent += ev.text;
    } else if (ev.type === 'status') {
      log.insertBefore(el('div', 'arq-status', ev.message), answer.nextSibling);
    } else if (ev.type === 'error') {
      log.appendChild(el('div', 'arq-err', ev.message));
    } else if (ev.type === 'done') {
      if (ev.rebuilt) {
        log.appendChild(el('div', 'arq-status', 'Chapter rebuilt — reloading…'));
        try { sessionStorage.setItem('arq-revised', '1'); } catch (e) { /* private mode */ }
        setTimeout(function () { location.reload(); }, 900);
      }
    }
  }

  askBtn.addEventListener('click', function () { send('ask'); });
  fixBtn.addEventListener('click', function () { send('revise'); });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send('ask');
    }
  });

  // post-revise toast after the reload
  try {
    if (sessionStorage.getItem('arq-revised')) {
      sessionStorage.removeItem('arq-revised');
      var toast = el('div', 'arq-toast', 'Chapter updated ✓');
      document.body.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 3500);
    }
  } catch (e) { /* private mode */ }
})();
