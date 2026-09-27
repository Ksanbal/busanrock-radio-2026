/* global YT, SC, RADIO_DATA, NARRATION_AUDIO */

const state = {
  day: '2026-10-02',
  artistIndex: 0,
  songIndex: 0,
  phase: 'idle',
  playing: false,
  narrating: false,
  player: null,
  soundcloud: null,
  voice: null,
  pendingVideo: '',
  speechToken: 0,
  utterance: null,
  speechStartTimer: null,
  narrationAudio: new Audio(),
  narrationMode: null,
  wakeLock: null,
  installPrompt: null,
};

const $ = (selector) => document.querySelector(selector);
const dayLabels = {
  '2026-10-02': 'DAY 1 · 10.02',
  '2026-10-03': 'DAY 2 · 10.03',
  '2026-10-04': 'DAY 3 · 10.04',
};
const daySpokenLabels = {
  '2026-10-02': '10월 2일 금요일, 첫째 날',
  '2026-10-03': '10월 3일 토요일, 둘째 날',
  '2026-10-04': '10월 4일 일요일, 마지막 날',
};

function artists() {
  return RADIO_DATA.days.find((day) => day.date === state.day)?.artists || [];
}

function currentArtist() {
  return artists()[state.artistIndex];
}

function currentSong() {
  return currentArtist()?.songs?.[state.songIndex];
}

function escapeHtml(value = '') {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function renderTabs() {
  const root = $('#dayTabs');
  root.innerHTML = RADIO_DATA.days.map((day) => (
    `<button class="day-tab ${day.date === state.day ? 'active' : ''}" data-day="${day.date}">` +
      `${dayLabels[day.date]} · ${day.artists.length}팀</button>`
  )).join('');
  root.querySelectorAll('button').forEach((button) => {
    button.onclick = () => selectDay(button.dataset.day);
  });
}

function renderGrid() {
  const list = artists();
  $('#artistCount').textContent = `${list.length} ARTISTS`;
  $('#artistGrid').innerHTML = list.map((artist, index) => (
    `<article class="artist-card ${index === state.artistIndex ? 'active' : ''}" data-index="${index}">` +
      `<span class="artist-card__index">${String(index + 1).padStart(2, '0')} / ${dayLabels[state.day]}</span>` +
      `<h3>${escapeHtml(artist.artist)}</h3>` +
      `<p>${escapeHtml(artist.intro || '아티스트 소개를 준비하고 있습니다.')}</p>` +
      `<div class="artist-card__songs">${artist.songs.map((song) => escapeHtml(song.title)).join(' · ')}</div>` +
    '</article>'
  )).join('');
  document.querySelectorAll('.artist-card').forEach((card) => {
    card.onclick = () => jumpToArtist(Number(card.dataset.index));
  });
}

function render() {
  renderTabs();
  renderGrid();
  const artist = currentArtist();
  $('#nowDay').textContent = dayLabels[state.day];
  $('#nowArtist').textContent = artist?.artist || '부산국제록페스티벌 2026';
  $('#nowTitle').textContent = '재생 대기 중';
  $('#nowStory').textContent = artist?.anecdote || artist?.intro || '라디오 시작을 눌러주세요.';
  setProgress();
}

function setStatus(text) {
  $('#statusText').textContent = text;
}

function updateNow(title, story, link) {
  const artist = currentArtist();
  $('#nowArtist').textContent = artist?.artist || '';
  $('#nowTitle').textContent = title;
  $('#nowStory').textContent = story || artist?.anecdote || artist?.intro || '';
  $('#sourceLink').href = link || artist?.sources?.[0] || RADIO_DATA.officialLineupUrl;
  $('#sourceLink').textContent = link ? '재생 원본 열기 ↗' : '정보 출처 열기 ↗';
  document.querySelectorAll('.artist-card').forEach((card, index) => {
    card.classList.toggle('active', index === state.artistIndex);
  });
  setProgress();
}

function setProgress() {
  const list = artists();
  const total = Math.max(1, list.reduce((sum, artist) => sum + artist.songs.length, 0));
  let completed = 0;
  for (let index = 0; index < state.artistIndex; index += 1) {
    completed += list[index].songs.length;
  }
  completed += state.songIndex + (state.phase === 'song' ? 0.25 : 0);
  if (state.phase === 'done') completed = total;
  $('#progressBar').style.width = `${Math.min(100, (completed / total) * 100)}%`;
}

function chooseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  state.voice = voices.find((voice) => (
    voice.lang === 'ko-KR' && /sunhi|yuna|sora|kyuri|female/i.test(voice.name)
  )) || voices.find((voice) => voice.lang === 'ko-KR') || null;
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = chooseVoice;
  chooseVoice();
}

function cancelSpeech() {
  state.speechToken += 1;
  state.narrating = false;
  state.narrationMode = null;
  window.clearTimeout(state.speechStartTimer);
  state.speechStartTimer = null;
  state.utterance = null;
  window.speechSynthesis?.cancel();
  state.narrationAudio.pause();
  state.narrationAudio.onended = null;
  state.narrationAudio.onerror = null;
  state.narrationAudio.removeAttribute('src');
  state.narrationAudio.load();
}

function speak(text, onEnd) {
  if (!$('#narrationToggle').checked || !('speechSynthesis' in window)) {
    onEnd();
    return;
  }

  cancelSpeech();
  const token = state.speechToken;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.94;
  utterance.pitch = 1.03;
  utterance.volume = 1;
  utterance.voice = state.voice;
  state.utterance = utterance;
  state.narrating = true;
  state.narrationMode = 'speech';
  updateMediaSession({ narration: true, title: '부국락 라디오 멘트' });

  let settled = false;
  const finish = () => {
    if (settled || token !== state.speechToken) return;
    settled = true;
    window.clearTimeout(state.speechStartTimer);
    state.speechStartTimer = null;
    state.utterance = null;
    state.narrating = false;
    state.narrationMode = null;
    if (state.playing) onEnd();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  state.speechStartTimer = window.setTimeout(() => {
    if (token !== state.speechToken) return;
    const synthesis = window.speechSynthesis;
    // YouTube and SoundCloud can leave the shared browser audio session paused
    // when a track ends. Explicitly resume it before queueing the DJ narration.
    synthesis.resume();
    synthesis.speak(utterance);
    if (!state.playing) synthesis.pause();
  }, 120);
}

function narrate(key, text, onEnd) {
  if (!$('#narrationToggle').checked) {
    onEnd();
    return;
  }

  const source = typeof NARRATION_AUDIO === 'undefined' ? '' : NARRATION_AUDIO[key];
  if (!source) {
    speak(text, onEnd);
    return;
  }

  cancelSpeech();
  const token = state.speechToken;
  const audio = state.narrationAudio;
  let settled = false;
  state.narrating = true;
  state.narrationMode = 'audio';
  updateMediaSession({ narration: true, title: '부국락 라디오 멘트' });

  const finish = () => {
    if (settled || token !== state.speechToken) return;
    settled = true;
    audio.onended = null;
    audio.onerror = null;
    state.narrating = false;
    state.narrationMode = null;
    if (state.playing) onEnd();
  };
  const fallback = () => {
    if (settled || token !== state.speechToken) return;
    settled = true;
    audio.onended = null;
    audio.onerror = null;
    state.narrating = false;
    state.narrationMode = null;
    speak(text, onEnd);
  };

  audio.preload = 'auto';
  audio.src = source;
  audio.onended = finish;
  audio.onerror = fallback;
  audio.play().catch(fallback);
}

function currentNarrationPrefix() {
  return `${state.day}/artist-${String(state.artistIndex + 1).padStart(2, '0')}`;
}

function pick(lines, salt = 0) {
  return lines[(state.artistIndex + state.songIndex + salt) % lines.length];
}

function dayOpeningText() {
  return `안녕하세요. 여기는 부국락 이천이십육 라디오입니다. ` +
    `${daySpokenLabels[state.day]} 라인업, 서른세 팀의 음악을 한 팀씩 만나보겠습니다. ` +
    `곡이 끝나도 채널은 그대로 두세요. 다음 이야기와 다음 곡이 바로 이어집니다.`;
}

function artistIntroText(artist) {
  const openings = [
    '자, 이번에 만나볼 뮤지션은',
    '분위기를 바꿔서, 다음 주인공은',
    '계속해서 무대 위에서 만날 이름은',
    '이번 순서의 아티스트는',
  ];
  return `${pick(openings)} ${artist.artist}입니다. ${artist.intro} ` +
    `이 팀의 색깔을 잘 보여주는 세 곡을 차례로 들어보겠습니다.`;
}

function firstSongText(artist, song) {
  return `첫 곡은 ${artist.artist}의 ${song.title}입니다. ${song.why} ` +
    `볼륨을 조금 올리고, 바로 들어보시죠.`;
}

function betweenSongsText(artist, previousSong, nextSong, nextIndex) {
  const bridges = [
    `방금 들으신 곡은 ${artist.artist}의 ${previousSong.title}이었습니다.`,
    `${previousSong.title}, 잘 듣고 오셨습니다.`,
    `지금까지 ${artist.artist}의 ${previousSong.title}이었고요.`,
  ];
  const nextCues = nextIndex === 1
    ? ['두 번째 추천곡은', '이어서 들을 두 번째 곡은', '다음 트랙으로 골라온 곡은']
    : ['세 곡 가운데 마지막 곡은', '이 아티스트의 마지막 추천곡은', '한 곡 더 이어가겠습니다. 곡은'];
  return `${pick(bridges, 1)} ${pick(nextCues, 2)} ${nextSong.title}입니다. ` +
    `${nextSong.why} 이어서 들어보시죠.`;
}

function artistOutroText(artist, song) {
  const nextArtist = artists()[state.artistIndex + 1];
  const transition = nextArtist
    ? `잠시 뒤에는 ${nextArtist.artist}의 이야기와 음악으로 이어가겠습니다.`
    : `이제 오늘 준비한 마지막 인사를 전해드릴 시간입니다.`;
  return `방금 들으신 곡은 ${artist.artist}의 ${song.title}이었습니다. ` +
    `${artist.anecdote} ${transition}`;
}

function selectDay(day) {
  stopAll();
  state.day = day;
  state.artistIndex = 0;
  state.songIndex = 0;
  state.phase = 'idle';
  render();
  updateNow('날짜 선택 완료', '라디오 시작을 누르면 오프닝부터 연속 재생합니다.');
}

function jumpToArtist(index) {
  stopAll();
  state.artistIndex = index;
  state.songIndex = 0;
  state.playing = true;
  $('#playButton').textContent = 'Ⅱ 일시정지';
  startArtist();
}

function beginDay() {
  if (!artists().length) return;
  state.playing = true;
  state.phase = 'dayIntro';
  state.artistIndex = 0;
  state.songIndex = 0;
  $('#playButton').textContent = 'Ⅱ 일시정지';
  const copy = dayOpeningText();
  updateNow('오늘의 오프닝', copy);
  setStatus(`${dayLabels[state.day]} 오프닝 방송 중`);
  narrate(`${state.day}/day-opening`, copy, startArtist);
}

function startArtist() {
  const artist = currentArtist();
  if (!artist) {
    finishDay();
    return;
  }
  state.phase = 'artistIntro';
  state.songIndex = 0;
  renderGrid();
  const copy = artistIntroText(artist);
  updateNow('DJ 아티스트 소개', copy);
  setStatus(`${artist.artist} 소개 방송 중`);
  narrate(`${currentNarrationPrefix()}/intro`, copy, announceFirstSong);
}

function announceFirstSong() {
  const artist = currentArtist();
  const song = currentSong();
  if (!artist || !song || !$('#songsToggle').checked) {
    advanceArtist();
    return;
  }
  state.phase = 'songIntro';
  const copy = firstSongText(artist, song);
  updateNow(`다음 곡 · ${song.title}`, copy, song.url);
  setStatus(`${artist.artist} 첫 곡 소개 중`);
  narrate(`${currentNarrationPrefix()}/song-1-intro`, copy, playCurrentSong);
}

function playCurrentSong() {
  const artist = currentArtist();
  const song = currentSong();
  if (!artist || !song) {
    advanceArtist();
    return;
  }

  state.phase = 'song';
  updateNow(`${state.songIndex + 1}. ${song.title}`, song.why || artist.anecdote, song.url);
  setStatus(`${artist.artist} — ${song.title}`);
  updateMediaSession({ artist, song });
  const youtubeId = song.youtubeId || extractYouTubeId(song.url);
  if (youtubeId) {
    playYouTube(youtubeId);
  } else if (/soundcloud\.com/.test(song.url || '')) {
    playSoundCloud(song.url);
  } else {
    setStatus('직접 재생할 수 없는 곡이라 다음 순서로 이동합니다.');
    window.setTimeout(handleSongEnded, 900);
  }
}

function handleSongEnded() {
  if (!state.playing || state.phase !== 'song') return;
  const artist = currentArtist();
  const previousSong = currentSong();
  if (!artist || !previousSong) return;

  state.phase = 'postSong';
  // Release the embedded player's audio session before starting Web Speech.
  // This also prevents duplicate ENDED/FINISH events from advancing twice.
  stopEmbeddedMedia();
  if (state.songIndex < artist.songs.length - 1) {
    state.songIndex += 1;
    const nextSong = currentSong();
    const copy = betweenSongsText(artist, previousSong, nextSong, state.songIndex);
    updateNow(`DJ 브리지 · ${nextSong.title}`, copy, nextSong.url);
    setStatus(`${previousSong.title}에서 ${nextSong.title}(으)로 이어가는 중`);
    narrate(`${currentNarrationPrefix()}/song-${state.songIndex + 1}-bridge`, copy, playCurrentSong);
  } else {
    const copy = artistOutroText(artist, previousSong);
    updateNow('DJ 마무리 멘트', copy);
    setStatus(`${artist.artist} 코너 마무리 중`);
    narrate(`${currentNarrationPrefix()}/outro`, copy, advanceArtist);
  }
}

function advanceArtist() {
  state.artistIndex += 1;
  state.songIndex = 0;
  if (state.artistIndex >= artists().length) {
    finishDay();
    return;
  }
  startArtist();
}

function next() {
  cancelSpeech();
  stopEmbeddedMedia();
  const artist = currentArtist();
  if (artist && state.songIndex < artist.songs.length - 1 && ['song', 'songIntro', 'postSong'].includes(state.phase)) {
    state.songIndex += 1;
    playCurrentSong();
  } else {
    advanceArtist();
  }
}

function previous() {
  cancelSpeech();
  stopEmbeddedMedia();
  if (state.songIndex > 0) {
    state.songIndex -= 1;
    playCurrentSong();
  } else {
    state.artistIndex = Math.max(0, state.artistIndex - 1);
    startArtist();
  }
}

function pauseResume() {
  if (!state.playing) {
    state.playing = true;
    $('#playButton').textContent = 'Ⅱ 일시정지';
    setPlaybackState('playing');
    if (state.phase === 'idle' || state.phase === 'done') {
      beginDay();
    } else if (state.narrating) {
      if (state.narrationMode === 'audio') {
        state.narrationAudio.play().catch(() => {
          setStatus('해설 음원을 다시 재생할 수 없습니다. 다음 버튼으로 계속할 수 있습니다.');
        });
      } else {
        window.speechSynthesis?.resume();
      }
      setStatus('라디오 멘트를 계속합니다.');
    } else if (state.phase === 'song') {
      state.player?.playVideo();
      state.soundcloud?.play();
      setStatus(`${currentArtist()?.artist} — ${currentSong()?.title}`);
    } else {
      startArtist();
    }
    return;
  }

  state.playing = false;
  $('#playButton').textContent = '▶ 계속 듣기';
  window.speechSynthesis?.pause();
  state.narrationAudio.pause();
  state.player?.pauseVideo();
  state.soundcloud?.pause();
  setPlaybackState('paused');
  setStatus('일시정지');
}

function finishDay() {
  state.phase = 'done';
  state.playing = false;
  state.narrating = false;
  $('#playButton').textContent = '↻ 다시 듣기';
  setPlaybackState('none');
  const copy = `${daySpokenLabels[state.day]} 라디오가 모두 끝났습니다. 다른 날짜를 골라 계속 들어보세요.`;
  updateNow('오늘 방송 종료', copy);
  setStatus(`${dayLabels[state.day]} 재생 완료`);
}

function stopEmbeddedMedia() {
  state.player?.stopVideo();
  state.soundcloud?.pause();
}

function stopAll() {
  cancelSpeech();
  stopEmbeddedMedia();
  state.playing = false;
  state.narrating = false;
  $('#playButton').textContent = '▶ 라디오 시작';
  setPlaybackState('none');
}

function extractYouTubeId(url = '') {
  return url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)?.[1] || '';
}

function showPlayer(provider) {
  $('#videoPlaceholder').style.display = 'none';
  $('#soundcloudPlayer').hidden = provider !== 'soundcloud';
  const youtubeFrame = $('#youtubePlayer iframe');
  if (youtubeFrame) youtubeFrame.hidden = provider !== 'youtube';
}

function playYouTube(id) {
  state.soundcloud?.pause();
  showPlayer('youtube');
  if (state.player?.loadVideoById) {
    state.player.loadVideoById(id);
  } else {
    state.pendingVideo = id;
  }
}

function playSoundCloud(url) {
  state.player?.pauseVideo();
  showPlayer('soundcloud');
  const frame = $('#soundcloudPlayer');
  try {
    state.soundcloud?.unbind(SC.Widget.Events.FINISH);
  } catch (_) {
    // A previous widget may not be ready yet.
  }
  frame.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&visual=true`;
  state.soundcloud = SC.Widget(frame);
  state.soundcloud.bind(SC.Widget.Events.READY, () => state.soundcloud.play());
  state.soundcloud.bind(SC.Widget.Events.FINISH, handleSongEnded);
}

function updateMediaSession({ artist, song, narration = false, title = '' }) {
  if (!('mediaSession' in navigator)) return;
  const name = artist?.artist || currentArtist()?.artist || '부국락 2026 라디오';
  navigator.mediaSession.metadata = new MediaMetadata({
    title: narration ? title : (song?.title || '부국락 라디오 멘트'),
    artist: narration ? `${name} · DJ 멘트` : name,
    album: `${dayLabels[state.day]} · 부산국제록페스티벌 2026`,
    artwork: [
      { src: '/radio-icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  });
  setPlaybackState(state.playing ? 'playing' : 'paused');
}

function setPlaybackState(value) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = value;
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const handlers = {
    play: pauseResume,
    pause: pauseResume,
    nexttrack: next,
    previoustrack: previous,
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (_) {
      // Some browsers expose only part of the Media Session API.
    }
  });
}

async function updateWakeLock(enabled) {
  if (!('wakeLock' in navigator)) {
    $('#keepAwakeToggle').checked = false;
    setStatus('이 브라우저는 화면 켜두기를 지원하지 않습니다.');
    return;
  }
  try {
    if (enabled) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
      });
      setStatus('화면을 켜둔 채 연속 재생합니다.');
    } else {
      await state.wakeLock?.release();
      state.wakeLock = null;
    }
  } catch (_) {
    $('#keepAwakeToggle').checked = false;
    setStatus('화면 켜두기 권한을 사용할 수 없습니다.');
  }
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    $('#installButton').hidden = false;
  });
  $('#installButton').onclick = async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $('#installButton').hidden = true;
  };
}

function setupBackgroundSupport() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      setStatus('오프라인 앱 등록에 실패했지만 일반 재생은 가능합니다.');
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing) {
      setStatus('백그라운드 재생 중 · 잠금화면에서 이전/다음 곡을 조작할 수 있습니다.');
    }
  });
  window.addEventListener('focus', () => {
    if ($('#keepAwakeToggle').checked && !state.wakeLock) updateWakeLock(true);
  });
}

window.onYouTubeIframeAPIReady = () => {
  state.player = new YT.Player('youtubePlayer', {
    height: '390',
    width: '640',
    videoId: '',
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        if (state.pendingVideo) {
          state.player.loadVideoById(state.pendingVideo);
          state.pendingVideo = '';
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED) handleSongEnded();
      },
      onError: () => {
        setStatus('이 영상은 임베드가 제한되어 다음 곡으로 이동합니다.');
        window.setTimeout(handleSongEnded, 900);
      },
    },
  });
};

$('#playButton').onclick = pauseResume;
$('#nextButton').onclick = next;
$('#prevButton').onclick = previous;
$('#keepAwakeToggle').onchange = (event) => updateWakeLock(event.target.checked);

setupMediaSession();
setupInstallPrompt();
setupBackgroundSupport();
render();
