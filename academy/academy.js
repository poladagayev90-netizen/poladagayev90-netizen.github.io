/* SpeakLab Academy — video guides to the SpeakLab app.
 *
 * Lives on speaklab.me, not in the app (Polad 2026-11-22: the app stays light,
 * the app only links here). Videos are on Firebase Storage; catalogue.json is
 * written by speak2them/scripts/academy-upload.cjs.
 *
 * Progress is in localStorage (no login): per SERIES + chapter id, so AZ ↔ TR
 * keeps it. A chapter is «watched» at 90 % and never goes back. Same rules as
 * speak2them/src/utils/academyMap.js (tested there).
 *
 * URLs: ./                        course list
 *       ./?c=T02                  single course overview (shareable)
 *       ./?c=T02&ch=ch2           player at chapter (shareable)
 *       any of them + &lang=az|tr (the app passes the learner's language)
 */
(function () {
  'use strict';
  var DONE_RATIO = 0.9;
  var WIDE = '(min-width: 768px)';
  var KEY = 'sl.academy.progress';
  var LANG_KEY = 'sl.academy.lang';

  var T = {
    az: {
      openApp: 'Tətbiqi aç', kicker: 'Video bələdçilər',
      title: 'SpeakLab Academy',
      lede: 'SpeakLab-dan necə istifadə etməyi qısa videolarla öyrən — hər fəsil bir dəqiqəyə yaxındır.',
      start: 'Başla', cont: 'Davam et', again: 'Yenidən bax', replay: 'Yenidən bax',
      chapters: 'fəsil', min: 'dəq', watched: '{d} / {t} baxılıb', completed: 'Tamamlandı',
      chapterOf: 'Fəsil {i} / {t}', prev: 'Əvvəlki', next: 'Növbəti',
      nextChapter: 'Növbəti fəsil', nextCourse: 'Növbəti kurs',
      seen: 'Baxıldı', now: 'İndi', left: '{x} qalıb',
      chapterDone: 'Fəsil bitdi', courseDone: 'Kurs tamamlandı', nextIs: 'Növbəti: {x}',
      all: 'Bütün kurslar', back: 'Bütün kurslar', listTitle: 'Fəsillər',
      share: 'Paylaş', shareCourse: 'Kursu paylaş', shareChapter: 'Fəsli paylaş',
      copied: 'Link kopyalandı', fullscreen: 'Tam ekran',
    },
    tr: {
      openApp: 'Uygulamayı aç', kicker: 'Video rehberler',
      title: 'SpeakLab Academy',
      lede: 'SpeakLab’i nasıl kullanacağını kısa videolarla öğren — her bölüm yaklaşık bir dakika.',
      start: 'Başla', cont: 'Devam et', again: 'Tekrar izle', replay: 'Tekrar izle',
      chapters: 'bölüm', min: 'dk', watched: '{d} / {t} izlendi', completed: 'Tamamlandı',
      chapterOf: 'Bölüm {i} / {t}', prev: 'Önceki', next: 'Sonraki',
      nextChapter: 'Sonraki bölüm', nextCourse: 'Sonraki kurs',
      seen: 'İzlendi', now: 'Şimdi', left: '{x} kaldı',
      chapterDone: 'Bölüm bitti', courseDone: 'Kurs tamamlandı', nextIs: 'Sıradaki: {x}',
      all: 'Tüm kurslar', back: 'Tüm kurslar', listTitle: 'Bölümler',
      share: 'Paylaş', shareCourse: 'Kursu paylaş', shareChapter: 'Bölümü paylaş',
      copied: 'Bağlantı kopyalandı', fullscreen: 'Tam ekran',
    },
  };

  // lucide icons, inline (no emoji, no icon font)
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>',
    check: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    circle: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    playing: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4Z"/></svg>',
    left: '<svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg class="i" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    again: '<svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    start: '<svg class="i" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>',
    share: '<svg class="i" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    expand: '<svg class="i" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  };

  var app = document.getElementById('app');
  var catalogue = null;
  var lang = 'az';
  var video = null;          // the player's <video>, when on a chapter
  var place = { key: null, t: 0, dur: 0, playing: false };
  var toastTimer = null;

  // ── storage ──────────────────────────────────────────────
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function store(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }
  var progress = load();
  if (!progress.chapters) progress.chapters = {};

  // ── pure rules (mirror of academyMap.js) ─────────────────
  function ckey(s, c) { return s + '_' + c; }
  function entry(s, c) { return progress.chapters[ckey(s, c)] || null; }
  function isDone(s, c) { var e = entry(s, c); return !!(e && e.done); }
  function resumeAt(s, c, dur) {
    var e = entry(s, c); var pos = e ? Number(e.pos) || 0 : 0;
    if (pos < 2) return 0;
    if (dur && pos > dur - 3) return 0;
    return pos;
  }
  function course(series) { return series.langs[lang] || series.langs.az; }
  function seriesProgress(series) {
    var chs = course(series).chapters;
    var done = chs.filter(function (c) { return isDone(series.id, c.id); }).length;
    return { done: done, total: chs.length, percent: Math.round(done / chs.length * 100) };
  }
  function courseAction(series) {
    var chs = course(series).chapters; var p = seriesProgress(series);
    if (p.done === p.total) return { kind: 'again', ch: chs[0].id };
    var last = String(progress.last || '').split('_');
    var lastSeries = last.shift(); var lastCh = last.join('_');
    if (lastSeries === series.id && chs.some(function (c) { return c.id === lastCh; }) && !isDone(series.id, lastCh)) {
      return { kind: 'cont', ch: lastCh };
    }
    var open = chs.filter(function (c) { return !isDone(series.id, c.id); })[0];
    var started = p.done > 0 || chs.some(function (c) { return resumeAt(series.id, c.id) > 0; });
    return { kind: started ? 'cont' : 'start', ch: open.id };
  }
  function nextSeriesAfter(series) {
    if (!catalogue || !catalogue.series) return null;
    var list = catalogue.series;
    var i = list.findIndex(function (s) { return s.id === series.id; });
    var rest = list.slice(i + 1).concat(list.slice(0, Math.max(0, i)));
    return rest.filter(function (s) { return seriesProgress(s).done < seriesProgress(s).total; })[0] || null;
  }
  function save(seriesId, chId, t, dur) {
    if (!dur) return;
    var k = ckey(seriesId, chId); var prev = progress.chapters[k];
    var pos = Math.max(0, Math.round(t * 10) / 10);
    progress.chapters[k] = { done: !!(prev && prev.done) || pos >= dur * DONE_RATIO, pos: pos, at: Date.now() };
    progress.last = k;
    store(progress);
  }
  function clock(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function t(key, vars) {
    var s = (T[lang] || T.az)[key] || key;
    Object.keys(vars || {}).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ── sharing ──────────────────────────────────────────────
  function shareUrl(seriesId, chId) {
    var base = location.origin + location.pathname;
    var q = new URLSearchParams();
    if (seriesId) q.set('c', seriesId);
    if (chId) q.set('ch', chId);
    q.set('lang', lang);
    return base + '?' + q.toString();
  }
  function showToast(msg) {
    var el = document.getElementById('ac-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ac-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }
  function fallbackCopy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast(t('copied')); }).catch(function () { execCopy(text); });
      return;
    }
    execCopy(text);
  }
  function execCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      if (document.execCommand('copy')) showToast(t('copied'));
      document.body.removeChild(ta);
    } catch (e) { /* clipboard blocked */ }
  }
  function shareItem(title, text, url) {
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        fallbackCopy(url);
      });
      return;
    }
    fallbackCopy(url);
  }
  function handleShareCourse(seriesId) {
    var s = findSeries(seriesId); if (!s) return;
    var c = course(s);
    shareItem(c.title + ' — SpeakLab Academy', c.description, shareUrl(s.id, null));
  }
  function handleShareChapter(seriesId, chId) {
    var s = findSeries(seriesId); if (!s) return;
    var c = course(s);
    var ch = c.chapters.filter(function (x) { return x.id === chId; })[0];
    if (!ch) { handleShareCourse(seriesId); return; }
    shareItem(ch.title + ' — ' + c.title, ch.subtitle, shareUrl(s.id, ch.id));
  }

  // ── routing ──────────────────────────────────────────────
  function params() { return new URLSearchParams(location.search); }
  function findSeries(id) {
    return (catalogue && catalogue.series || []).filter(function (s) { return s.id === id; })[0] || null;
  }
  function go(seriesId, chId, replace) {
    var q = new URLSearchParams();
    if (seriesId) q.set('c', seriesId);
    if (seriesId && chId) q.set('ch', chId);
    q.set('lang', lang);
    history[replace ? 'replaceState' : 'pushState']({}, '', '?' + q.toString());
    render();
    window.scrollTo(0, 0);
  }

  function setLang(next) {
    if (next === lang || !T[next]) return;
    lang = next;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* private mode */ }
    document.documentElement.lang = lang;
    var p = params(); p.set('lang', lang);
    history.replaceState({}, '', '?' + p.toString());
    if (video) swapPlayerLanguage(); else render();
    paintChrome();
  }

  function paintChrome() {
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-set') === lang)); });
  }

  // ── views ────────────────────────────────────────────────
  function chapterRows(series, currentId) {
    return '<ol class="chapters">' + course(series).chapters.map(function (c, i) {
      var done = isDone(series.id, c.id); var cur = c.id === currentId;
      var r = resumeAt(series.id, c.id, c.dur);
      var meta = done ? t('seen') : cur ? t('now') : r ? t('left', { x: clock(c.dur - r) }) : clock(c.dur);
      var icon = cur ? ICON.playing : done ? ICON.check : ICON.circle;
      return '<li class="chapter-item">' +
        '<button type="button" class="chapter' + (cur ? ' cur' : '') + '" data-open="' + series.id + '|' + c.id + '"' + (cur ? ' aria-current="true"' : '') + '>' +
        '<span class="mark' + (done ? ' done' : '') + '" aria-hidden="true">' + icon + '</span>' +
        '<span class="ch-main"><span class="ch-title">' + (i + 1) + '. ' + esc(c.title) + '</span><span class="ch-sub">' + esc(c.subtitle) + '</span></span>' +
        '<span class="ch-meta">' + meta + '</span></button>' +
        '<button type="button" class="ch-share" data-share-ch="' + series.id + '|' + c.id + '" aria-label="' + esc(t('shareChapter') + ': ' + c.title) + '" title="' + esc(t('shareChapter')) + '">' + ICON.share + '</button>' +
        '</li>';
    }).join('') + '</ol>';
  }

  function courseCardHtml(s, linkTitle) {
    var c = course(s); var p = seriesProgress(s); var a = courseAction(s);
    var runtime = c.chapters.reduce(function (n, ch) { return n + ch.dur; }, 0);
    var label = t({ start: 'start', cont: 'cont', again: 'again' }[a.kind]);
    var heading = linkTitle
      ? '<button type="button" class="course-title-link" data-course="' + s.id + '"><h2>' + esc(c.title) + '</h2></button>'
      : '<h2>' + esc(c.title) + '</h2>';
    return '<section class="course" aria-label="' + esc(c.title) + '">' +
      '<button type="button" class="poster" data-open="' + s.id + '|' + a.ch + '" aria-label="' + esc(label + ': ' + c.title) + '">' +
      '<img src="' + c.chapters[0].landscape.poster + '" alt="" loading="lazy" width="960" height="540"><span class="play" aria-hidden="true">' + ICON.play + '</span></button>' +
      '<div class="course-body">' +
      '<div class="course-head">' + heading + '</div>' +
      '<p class="desc">' + esc(c.description) + '</p>' +
      '<p class="meta">' + c.chapters.length + ' ' + t('chapters') + ' · ' + Math.max(1, Math.round(runtime / 60)) + ' ' + t('min') + '</p>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.total + '" aria-valuenow="' + p.done + '"><b style="width:' + p.percent + '%"></b></div>' +
      '<p class="bar-note">' + (p.done === p.total ? t('completed') : t('watched', { d: p.done, t: p.total })) + '</p>' +
      '<div class="course-actions">' +
      '<button type="button" class="btn" data-open="' + s.id + '|' + a.ch + '">' + (a.kind === 'again' ? ICON.again : ICON.start) + label + '</button>' +
      '<button type="button" class="btn sm ghost" data-share-course="' + s.id + '" aria-label="' + esc(t('shareCourse') + ': ' + c.title) + '">' + ICON.share + t('share') + '</button>' +
      '</div>' +
      chapterRows(s, null) + '</div></section>';
  }

  function renderList() {
    video = null;
    document.title = 'SpeakLab Academy';
    app.innerHTML = '<header class="hero"><p class="kicker">' + t('kicker') + '</p><h1>' + t('title') + '</h1><p>' + t('lede') + '</p></header>' +
      '<div class="courses">' + catalogue.series.map(function (s) { return courseCardHtml(s, true); }).join('') + '</div>';
  }

  function renderCourse(series) {
    video = null;
    var c = course(series);
    document.title = c.title + ' — SpeakLab Academy';
    app.innerHTML = '<div class="player-top">' +
      '<a class="back" href="./?lang=' + lang + '" data-nav="home">' + ICON.left + t('back') + '</a>' +
      '<button type="button" class="btn sm ghost" data-share-course="' + series.id + '">' + ICON.share + t('shareCourse') + '</button>' +
      '</div>' +
      '<div class="course-single">' + courseCardHtml(series, false) + '</div>';
  }

  function wide() { return window.matchMedia(WIDE).matches; }
  function srcFor(ch) { return wide() ? ch.landscape : ch.portrait; }

  function renderPlayer(series, chId) {
    var c = course(series);
    var idx = c.chapters.findIndex(function (x) { return x.id === chId; });
    if (idx < 0) { go(series.id, c.chapters[0].id, true); return; }
    var ch = c.chapters[idx]; var total = c.chapters.length;
    var prev = c.chapters[idx - 1]; var next = c.chapters[idx + 1];
    var otherCourse = !next ? nextSeriesAfter(series) : null;
    var otherCourseFirst = otherCourse ? course(otherCourse).chapters[0] : null;
    var media = srcFor(ch);
    document.title = ch.title + ' — SpeakLab Academy';

    var endedSub = next
      ? '<p class="frame-ended-sub">' + esc(t('nextIs', { x: next.title })) + '</p>'
      : (otherCourse ? '<p class="frame-ended-sub">' + esc(t('nextIs', { x: course(otherCourse).title })) + '</p>' : '');

    var endedButtons = next
      ? '<button type="button" class="btn" data-open="' + series.id + '|' + next.id + '">' + t('nextChapter') + ICON.right + '</button>' +
        '<button type="button" class="btn ghost" data-replay>' + ICON.again + t('replay') + '</button>'
      : (otherCourse && otherCourseFirst
          ? '<button type="button" class="btn" data-open="' + otherCourse.id + '|' + otherCourseFirst.id + '">' + t('nextCourse') + ICON.right + '</button>' +
            '<button type="button" class="btn ghost" data-nav="home">' + t('all') + '</button>'
          : '<button type="button" class="btn" data-nav="home">' + t('all') + '</button>') +
        '<button type="button" class="btn ghost" data-replay>' + ICON.again + t('replay') + '</button>';

    var nextStepBtn = next
      ? '<button type="button" class="btn" data-open="' + series.id + '|' + next.id + '">' + t('next') + ICON.right + '</button>'
      : (otherCourse && otherCourseFirst
          ? '<button type="button" class="btn" data-open="' + otherCourse.id + '|' + otherCourseFirst.id + '">' + t('nextCourse') + ICON.right + '</button>'
          : '<button type="button" class="btn" data-nav="home">' + t('all') + '</button>');

    app.innerHTML = '<div class="player-top">' +
      '<a class="back" href="./?lang=' + lang + '" data-nav="home">' + ICON.left + t('back') + '</a>' +
      '<div class="player-top-actions">' +
      '<button type="button" class="btn sm ghost" data-fullscreen>' + ICON.expand + t('fullscreen') + '</button>' +
      '<button type="button" class="btn sm ghost" data-share-ch="' + series.id + '|' + ch.id + '">' + ICON.share + t('share') + '</button>' +
      '</div></div>' +
      '<div class="player"><div class="stage">' +
      '<div class="frame ' + (wide() ? 'landscape' : 'portrait') + '">' +
        '<video controls playsinline preload="metadata" controlsList="nodownload" poster="' + media.poster + '" src="' + media.src + '"></video>' +
        '<div class="frame-ended" hidden>' +
          '<span class="frame-ended-mark" aria-hidden="true">' + ICON.check + '</span>' +
          '<p class="frame-ended-title">' + (next ? t('chapterDone') : t('courseDone')) + '</p>' +
          endedSub +
          '<div class="frame-ended-actions">' + endedButtons + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="now"><p class="kicker">' + t('chapterOf', { i: idx + 1, t: total }) + '</p><h1>' + esc(ch.title) + '</h1><p>' + esc(ch.subtitle) + '</p></div>' +
      '<div class="steps"><button type="button" class="btn ghost"' + (prev ? ' data-open="' + series.id + '|' + prev.id + '"' : ' disabled') + '>' + ICON.left + t('prev') + '</button>' +
      nextStepBtn + '</div>' +
      '</div><aside class="side" aria-label="' + t('listTitle') + '">' +
        '<div class="side-head"><h2>' + t('listTitle') + '</h2>' +
        '<button type="button" class="btn sm ghost" data-share-course="' + series.id + '">' + ICON.share + t('shareCourse') + '</button></div>' +
        '<p class="course-name">' + esc(c.title) + '</p>' + chapterRows(series, ch.id) +
      '</aside></div>';

    var key = ckey(series.id, ch.id);
    if (place.key !== key) place = { key: key, t: 0, dur: 0, playing: true };
    attach(app.querySelector('video'), series, ch);
  }

  // One <video> per file. Swapping the file (language, orientation) keeps the
  // place as a FRACTION — the AZ and TR cuts differ by a few seconds.
  function attach(v, series, ch) {
    video = v;
    var key = ckey(series.id, ch.id);
    function persist() { if (place.key === key && place.dur) save(series.id, ch.id, place.t, place.dur); }
    v.addEventListener('loadedmetadata', function () {
      var dur = v.duration || ch.dur;
      var at = place.dur > 0 && place.t > 0 ? (place.t / place.dur) * dur : resumeAt(series.id, ch.id, dur);
      if (at > 0) { try { v.currentTime = at; } catch (e) { /* not seekable yet */ } }
      place.dur = dur;
      if (place.playing) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { place.playing = false; }); }
    });
    v.addEventListener('timeupdate', function () {
      if (v !== video) return;
      place.t = v.currentTime; place.dur = v.duration || place.dur;
      var e = entry(series.id, ch.id);
      if (place.dur && place.t >= place.dur * DONE_RATIO && !(e && e.done)) persist();
    });
    v.addEventListener('play', function () {
      if (v !== video) return;
      place.playing = true;
      var ended = app.querySelector('.frame-ended');
      if (ended) ended.hidden = true;
    });
    v.addEventListener('pause', function () { if (v === video && !v.ended) { place.playing = false; persist(); } });
    v.addEventListener('ended', function () {
      if (v !== video) return;
      place.t = place.dur; place.playing = false; persist();
      var ended = app.querySelector('.frame-ended');
      if (ended) ended.hidden = false;
      refreshRows(series, ch.id);
    });
    v._persist = persist;
  }

  function refreshRows(series, chId) {
    var side = app.querySelector('.side .chapters');
    if (side) side.outerHTML = chapterRows(series, chId);
  }

  function currentSeries() { return findSeries(params().get('c')); }

  function swapPlayerLanguage() { var s = currentSeries(); if (s) renderPlayer(s, params().get('ch')); }

  function leavePlayer() { if (video && video._persist) video._persist(); if (video) video.pause(); video = null; }

  function render() {
    leavePlayer();
    var s = currentSeries();
    var ch = params().get('ch');
    if (s && ch) renderPlayer(s, ch);
    else if (s) renderCourse(s);
    else renderList();
  }

  // ── events ───────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var fsBtn = e.target.closest('[data-fullscreen]');
    if (fsBtn && video) {
      if (video.webkitEnterFullscreen) { try { video.webkitEnterFullscreen(); return; } catch (err) { /* ignore */ } }
      if (video.requestFullscreen) { video.requestFullscreen().catch(function () {}); return; }
      var fr = app.querySelector('.frame');
      if (fr && fr.requestFullscreen) fr.requestFullscreen().catch(function () {});
      return;
    }
    var shareCh = e.target.closest('[data-share-ch]');
    if (shareCh) { var sp = shareCh.getAttribute('data-share-ch').split('|'); handleShareChapter(sp[0], sp[1]); return; }
    var shareC = e.target.closest('[data-share-course]');
    if (shareC) { handleShareCourse(shareC.getAttribute('data-share-course')); return; }
    var replay = e.target.closest('[data-replay]');
    if (replay && video) {
      var ended = app.querySelector('.frame-ended');
      if (ended) ended.hidden = true;
      place.t = 0; place.playing = true;
      try { video.currentTime = 0; } catch (err) { /* ignore */ }
      var pr = video.play(); if (pr && pr.catch) pr.catch(function () {});
      return;
    }
    var courseBtn = e.target.closest('[data-course]');
    if (courseBtn) { place.key = null; go(courseBtn.getAttribute('data-course'), null, false); return; }
    var open = e.target.closest('[data-open]');
    if (open) { var parts = open.getAttribute('data-open').split('|'); place.key = null; go(parts[0], parts[1], !!video); return; }
    var nav = e.target.closest('[data-nav=home]');
    if (nav) { e.preventDefault(); go(null, null, false); return; }
    var l = e.target.closest('.lang button');
    if (l) setLang(l.getAttribute('data-set'));
  });
  window.addEventListener('popstate', render);
  window.matchMedia(WIDE).addEventListener('change', function () { if (video) swapPlayerLanguage(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && video && video._persist) video._persist(); });
  window.addEventListener('pagehide', function () { if (video && video._persist) video._persist(); });

  // ── start ────────────────────────────────────────────────
  var fromUrl = params().get('lang');
  var stored = null; try { stored = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }
  var device = String(navigator.language || '').slice(0, 2).toLowerCase();
  lang = T[fromUrl] ? fromUrl : T[stored] ? stored : T[device] ? device : 'az';
  if (T[fromUrl]) { try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* private mode */ } }
  document.documentElement.lang = lang;
  paintChrome();
  fetch('catalogue.json').then(function (r) { return r.json(); }).then(function (c) { catalogue = c; render(); })
    .catch(function () { app.textContent = 'SpeakLab Academy — please refresh.'; });
})();
