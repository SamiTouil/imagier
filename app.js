// Mon Imagier — logique
(function () {
  'use strict';

  var THEMES = window.IMAGIER.themes;
  var $ = function (s) { return document.querySelector(s); };

  var home = $('#home');
  var viewer = $('#viewer');
  var grid = $('#theme-grid');
  var flashcard = $('#flashcard');
  var illu = $('#illu');
  var illuVideo = $('#illu-video');
  /* dessins qui s'animent au toucher (clip Veo + son) : tous les animaux, sauf le coquillage
     (pas un animal), le papillon et le canard (animations jamais satisfaisantes) */
  var ANIMAL_THEMES = { ferme: 1, sauvages: 1, mer: 1, betes: 1, oiseaux: 1 };
  var NO_ANIM = { coquillage: 1, papillon: 1, canard: 1 };
  var ANIMATED = {};
  THEMES.forEach(function (t) {
    if (ANIMAL_THEMES[t.id]) t.items.forEach(function (it) { if (!NO_ANIM[it[0]]) ANIMATED[it[0]] = 1; });
  });
  var articleEl = $('#article');
  var nounEl = $('#noun');
  var wordEl = $('#word');
  var chip = $('#theme-chip');
  var counter = $('#counter');
  var btnSound = $('#btn-sound');

  var deck = [];
  var idx = 0;
  var current = null;
  var lastDir = 1;
  var speakTimer = null;
  var soundOn = localStorage.getItem('imagier-son') === 'oui';

  function src(id) { return 'assets/img/' + id + '.webp'; }

  function setImg(el, id) {
    el.classList.remove('missing');
    el.onerror = function () { this.onerror = null; this.classList.add('missing'); };
    el.src = src(id);
  }

  function fullName(item) {
    return item[1] === "l'" ? "l'" + item[2] : item[1] + ' ' + item[2];
  }

  /* ---------- Briques partagées (imagier + histoire) ---------- */

  /* relance l'animation d'entrée glissée d'une carte/page (dir = sens du déplacement) */
  function slideIn(el, dir) {
    el.classList.remove('flash-in');
    void el.offsetWidth;
    el.style.setProperty('--slide', (dir >= 0 ? 44 : -44) + 'px');
    el.classList.add('flash-in');
  }

  /* balayage horizontal du doigt sur un écran -> suivant / précédent */
  function attachSwipe(el, onNext, onPrev) {
    var x = null, y = null;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      x = e.touches[0].clientX; y = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (x === null) return;
      var dx = e.changedTouches[0].clientX - x;
      var dy = e.changedTouches[0].clientY - y;
      x = y = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) onNext(); else onPrev(); }
    }, { passive: true });
  }

  /* flèches du clavier (seulement quand l'écran est visible) */
  function attachArrowNav(screenEl, onNext, onPrev, onHome) {
    document.addEventListener('keydown', function (e) {
      if (screenEl.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'Escape') onHome();
    });
  }

  /* clip vidéo qui se fond par-dessus l'image fixe, puis revient en fondu à la fin.
     opts.onPlay / opts.onStop : crochets propres à chaque visionneuse (ex. figer le flottement). */
  function makeVideoCrossfade(videoEl, opts) {
    opts = opts || {};
    var pauseTimer = null;
    function stop() {
      clearTimeout(pauseTimer);
      videoEl.style.opacity = '0';              /* fondu retour vers l'image fixe */
      videoEl.style.pointerEvents = 'none';
      if (opts.onStop) opts.onStop();
      /* pause après le fondu pour ne pas figer brutalement */
      pauseTimer = setTimeout(function () {
        try { videoEl.pause(); } catch (e) { /* rien */ }
      }, 420);
    }
    function play() {
      clearTimeout(pauseTimer);
      if (opts.onPlay) opts.onPlay();
      videoEl.muted = false;                    /* le son de l'animation est l'attrait : toujours actif */
      videoEl.style.opacity = '1';
      videoEl.style.pointerEvents = 'auto';
      try { videoEl.currentTime = 0; } catch (e) { /* rien */ }
      var p = videoEl.play();
      if (p && p.catch) {
        p.catch(function () {
          videoEl.muted = true;                 /* repli muet si la lecture sonore est bloquée */
          var p2 = videoEl.play();
          if (p2 && p2.catch) p2.catch(stop);
        });
      }
    }
    /* fond enchaîné vers l'image fixe juste avant la toute fin du clip */
    videoEl.addEventListener('timeupdate', function () {
      if (videoEl.duration && videoEl.currentTime >= videoEl.duration - 0.45
          && videoEl.style.opacity === '1') stop();
    });
    videoEl.addEventListener('ended', stop);
    videoEl.addEventListener('click', stop);
    return { stop: stop, play: play };
  }

  /* ---------- Accueil ---------- */

  THEMES.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-card';

    var img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.loading = 'lazy';
    setImg(img, t.cover);

    var title = document.createElement('span');
    title.className = 't-title';
    title.textContent = t.title;

    b.appendChild(img);
    b.appendChild(title);
    b.addEventListener('click', function () { openTheme(t); });
    grid.appendChild(b);
  });

  $('#surprise-card').addEventListener('click', openSurprise);

  /* ---------- Cartes histoires (accueil) ---------- */

  var storyCards = $('#story-cards');
  (window.STORIES || []).forEach(function (st) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'story-card';

    var img = document.createElement('img');
    img.src = st.dir + '/' + st.cover + '.webp';
    img.alt = '';
    img.loading = 'lazy';

    var body = document.createElement('div');
    body.className = 'sc-body';
    var kick = document.createElement('span');
    kick.className = 'sc-kicker';
    kick.textContent = 'HISTOIRE';
    var title = document.createElement('span');
    title.className = 'sc-title';
    title.textContent = st.title;
    body.appendChild(kick);
    body.appendChild(title);

    b.appendChild(img);
    b.appendChild(body);
    b.addEventListener('click', function () { openStory(st); });
    storyCards.appendChild(b);
  });

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function openTheme(t) {
    current = t;
    deck = t.items.slice();
    idx = 0;
    enterViewer();
  }

  function openSurprise() {
    current = { title: 'Surprise !', surprise: true };
    deck = shuffle(THEMES.reduce(function (all, t) { return all.concat(t.items); }, []));
    idx = 0;
    enterViewer();
  }

  /* ---------- Visionneuse ---------- */

  function enterViewer() {
    home.classList.add('hidden');
    viewer.classList.remove('hidden');
    chip.textContent = current.title;
    lastDir = 1;
    show();
  }

  function goHome() {
    stopSpeech();
    imgAnim.stop();
    viewer.classList.add('hidden');
    home.classList.remove('hidden');
  }

  function show() {
    var item = deck[idx];
    var article = item[1];
    var noun = item[2];

    setImg(illu, item[0]);
    illu.alt = fullName(item);

    /* repli sur l'image fixe ; précharge le clip si le dessin est animé */
    imgAnim.stop();
    if (ANIMATED[item[0]]) {
      illuVideo.src = 'assets/anim/' + item[0] + '.mp4';
      illuVideo.load();
    } else {
      illuVideo.removeAttribute('src');
    }

    articleEl.textContent = article;
    articleEl.className = article === 'le' ? 'a-m' : article === 'la' ? 'a-f' : 'a-n';
    nounEl.textContent = (article === "l'" ? '' : ' ') + noun;

    counter.textContent = (idx + 1) + ' / ' + deck.length;

    slideIn(flashcard, lastDir);

    autoSpeak(item);
    preloadNeighbors();
  }

  function preloadNeighbors() {
    [idx + 1, idx - 1].forEach(function (i) {
      var k = (i + deck.length) % deck.length;
      var im = new Image();
      im.src = src(deck[k][0]);
      fetch('assets/audio/' + deck[k][0] + '.mp3').catch(function () { /* hors-ligne file://, le navigateur gérera */ });
    });
  }

  function next() {
    lastDir = 1;
    idx++;
    if (idx >= deck.length) {
      if (current.surprise) shuffle(deck); /* on ne s'arrête jamais ! */
      idx = 0;
    }
    show();
  }

  function prev() {
    lastDir = -1;
    idx = (idx - 1 + deck.length) % deck.length;
    show();
  }

  /* ---------- Voix ---------- */
  /* Chaque mot a son MP3 (voix neuronale fr-FR-DeniseNeural) ;
     la synthèse vocale du navigateur ne sert que de secours. */

  var player = new Audio();
  player.preload = 'auto';

  var frVoice = null;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    var voices = speechSynthesis.getVoices();
    var fr = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf('fr') === 0; });
    if (!fr.length) { frVoice = null; return; }
    var preferred = ['amélie', 'amelie', 'audrey', 'thomas', 'aurélie', 'aurelie', 'marie'];
    for (var i = 0; i < preferred.length; i++) {
      for (var j = 0; j < fr.length; j++) {
        if (fr[j].name.toLowerCase().indexOf(preferred[i]) !== -1) { frVoice = fr[j]; return; }
      }
    }
    frVoice = fr[0];
  }

  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  function synthSpeak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      u.rate = 0.8;
      u.pitch = 1.05;
      if (frVoice) u.voice = frVoice;
      speechSynthesis.speak(u);
    } catch (e) { /* tant pis, pas de voix */ }
  }

  function speak(item) {
    if (!soundOn) return;
    stopSpeech();
    player.src = 'assets/audio/' + item[0] + '.mp3';
    var p = player.play();
    if (p && p.catch) {
      p.catch(function () { synthSpeak(fullName(item)); });
    }
  }

  function autoSpeak(item) {
    clearTimeout(speakTimer);
    if (!soundOn) return;
    speakTimer = setTimeout(function () { speak(item); }, 320);
  }

  function stopSpeech() {
    clearTimeout(speakTimer);
    try {
      player.pause();
      player.currentTime = 0;
    } catch (e) { /* rien à arrêter */ }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  function refreshSoundBtn() {
    btnSound.classList.toggle('muted', !soundOn);
  }

  btnSound.addEventListener('click', function () {
    soundOn = !soundOn;
    localStorage.setItem('imagier-son', soundOn ? 'oui' : 'non');
    refreshSoundBtn();
    if (soundOn) speak(deck[idx]);
    else stopSpeech();
  });
  refreshSoundBtn();

  /* ---------- Interactions ---------- */

  $('#btn-home').addEventListener('click', goHome);
  $('#btn-next').addEventListener('click', next);
  $('#btn-prev').addEventListener('click', prev);

  /* clip Veo (miaou, etc.) en fondu sur l'image fixe — voir makeVideoCrossfade */
  var imgAnim = makeVideoCrossfade(illuVideo, {
    onPlay: function () { stopSpeech(); illu.classList.add('frozen'); }, /* coupe la voix du mot, fige le flottement */
    onStop: function () { illu.classList.remove('frozen'); }            /* le petit flottement reprend */
  });

  function boing() {
    if (ANIMATED[deck[idx][0]]) { imgAnim.play(); return; }
    illu.classList.remove('boing');
    void illu.offsetWidth;
    illu.classList.add('boing');
    speak(deck[idx]);
  }

  illu.addEventListener('click', boing);
  wordEl.addEventListener('click', function () { speak(deck[idx]); });

  attachArrowNav(viewer, next, prev, goHome);
  attachSwipe(viewer, next, prev);

  /* ---------- Visionneuse d'histoire ---------- */

  var story = $('#story');
  var storyImg = $('#story-img');
  var storyText = $('#story-text');
  var storyTitle = $('#story-title');
  var storyCounter = $('#story-counter');
  var storyPage = $('#story-page');
  var btnStoryPrev = $('#story-prev');
  var btnStoryNext = $('#story-next');
  var storyVideo = $('#story-video');
  var storyHint = $('#story-hint');
  var STORY_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  var STORY_HINT = (STORY_TOUCH ? 'Touche' : 'Clique sur') + " le dessin pour l'animer ✨";

  var curStory = null;
  var sIdx = 0;
  var sDir = 1;

  function openStory(st) {
    curStory = st;
    sIdx = 0;
    sDir = 1;
    storyTitle.textContent = st.title;
    home.classList.add('hidden');
    story.classList.remove('hidden');
    renderStory();
  }

  function goHomeFromStory() {
    storyAnim.stop();
    story.classList.add('hidden');
    home.classList.remove('hidden');
  }

  function storySrc(i) {
    return curStory.dir + '/' + curStory.pages[i].img + '.webp';
  }

  function animSrc(i) {
    return curStory.dir + '/anim/' + curStory.pages[i].img + '.mp4';
  }

  /* clip Veo de la page en fondu sur l'image fixe — voir makeVideoCrossfade */
  var storyAnim = makeVideoCrossfade(storyVideo, {});
  storyImg.addEventListener('click', function () {
    if (curStory && curStory.pages[sIdx].anim) storyAnim.play();
  });

  function renderStory() {
    var pg = curStory.pages[sIdx];
    storyImg.src = storySrc(sIdx);
    storyImg.alt = pg.text;
    storyText.textContent = pg.text;

    /* animation au toucher : préchargement ; consigne seulement sur la couverture */
    storyAnim.stop();
    storyHint.textContent = STORY_HINT;
    storyHint.classList.toggle('hidden', sIdx !== 0);
    if (pg.anim) {
      storyVideo.src = animSrc(sIdx);
      storyVideo.load();
    } else {
      storyVideo.removeAttribute('src');
    }
    storyCounter.textContent = (sIdx + 1) + ' / ' + curStory.pages.length;
    btnStoryPrev.classList.toggle('disabled', sIdx === 0);
    btnStoryNext.classList.toggle('disabled', sIdx === curStory.pages.length - 1);

    slideIn(storyPage, sDir);

    [sIdx + 1, sIdx - 1].forEach(function (i) {
      if (i >= 0 && i < curStory.pages.length) {
        var im = new Image();
        im.src = storySrc(i);
      }
    });
  }

  function storyNext() {
    if (sIdx < curStory.pages.length - 1) { sDir = 1; sIdx++; renderStory(); }
  }
  function storyPrev() {
    if (sIdx > 0) { sDir = -1; sIdx--; renderStory(); }
  }

  btnStoryNext.addEventListener('click', storyNext);
  btnStoryPrev.addEventListener('click', storyPrev);
  $('#story-home').addEventListener('click', goHomeFromStory);

  attachArrowNav(story, storyNext, storyPrev, goHomeFromStory);
  attachSwipe(story, storyNext, storyPrev);
})();
