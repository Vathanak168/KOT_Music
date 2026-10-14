/**
 * KOT Music - Dedicated Video Watch Page Controller (YouTube Style)
 * Powered by HTML5 Video, Web Audio DSP, and YouTube-Style On-Video Controls
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const initialVideoId = urlParams.get('v') || urlParams.get('id');

  // DOM Elements
  const video = document.getElementById('watchVideo');
  const overlay = document.getElementById('watchOverlay');
  const videoBox = document.getElementById('watchVideoBox');
  const ambientGlow = document.getElementById('watchAmbientGlow');
  const bufferingSpinner = document.getElementById('watchBufferingSpinner');

  // Top Overlay Controls
  const overlayTitle = document.getElementById('watchOverlayTitle');
  const btnSettings = document.getElementById('btnWatchSettings');
  const btnFullscreen = document.getElementById('btnWatchFullscreen');
  const btnPip = document.getElementById('btnWatchPip');

  // Center Overlay Controls
  const btnCenterPlay = document.getElementById('btnCenterPlay');
  const iconCenterPlay = document.getElementById('iconCenterPlay');
  const iconCenterPause = document.getElementById('iconCenterPause');
  const btnPrev = document.getElementById('btnWatchPrev');
  const btnNext = document.getElementById('btnWatchNext');

  // Scrubber & Time
  const scrubberTrack = document.getElementById('watchScrubberTrack');
  const scrubberProgress = document.getElementById('watchScrubberProgress');
  const scrubberBuffer = document.getElementById('watchScrubberBuffer');
  const scrubberThumb = document.getElementById('watchScrubberThumb');
  const timeCurrent = document.getElementById('watchTimeCurrent');
  const timeDuration = document.getElementById('watchTimeDuration');

  // Double Tap Zones
  const doubleTapLeft = document.getElementById('doubleTapLeft');
  const doubleTapRight = document.getElementById('doubleTapRight');
  const rippleLeft = document.getElementById('rippleLeft');
  const rippleRight = document.getElementById('rippleRight');

  // Video Details Underneath
  const videoTitleEl = document.getElementById('videoTitle');
  const channelNameEl = document.getElementById('channelName');
  const channelAvatar = document.getElementById('channelAvatar');
  const btnLike = document.getElementById('btnWatchLike');
  const btnQueue = document.getElementById('btnWatchQueue');
  const btnSwitchMp3 = document.getElementById('btnSwitchMp3');
  const btnShare = document.getElementById('btnWatchShare');

  // Up Next & Autoplay
  const upnextList = document.getElementById('watchUpnextList');
  const upnextBadge = document.getElementById('watchUpnextBadge');
  const chkAutoplay = document.getElementById('watchChkAutoplay');

  // Settings Modal & Sound FX Modal
  const settingsModal = document.getElementById('watchSettingsModal');
  const settingsBackdrop = document.getElementById('watchSettingsBackdrop');
  const btnCloseSettings = document.getElementById('btnCloseWatchSettings');
  const itemSoundFx = document.getElementById('itemWatchSoundFx');
  const itemQuality = document.getElementById('itemWatchQuality');
  const itemSpeed = document.getElementById('itemWatchSpeed');
  const chkLoop = document.getElementById('chkWatchLoop');
  const chkAmbient = document.getElementById('chkWatchAmbient');
  const valActivePreset = document.getElementById('valActivePreset');
  const valQuality = document.getElementById('valWatchQuality');
  const valSpeed = document.getElementById('valWatchSpeed');

  // Sound FX Modal Elements
  const soundFxModal = document.getElementById('soundFxModal');
  const soundFxBackdrop = document.getElementById('soundFxBackdrop');
  const btnCloseSoundFx = document.getElementById('btnCloseSoundFx');
  const btnApplySoundFx = document.getElementById('btnApplySoundFx');
  const btnResetSoundFx = document.getElementById('btnResetSoundFx');

  // State
  let currentVideo = null;
  let relatedVideos = [];
  let isOverlayFaded = false;
  let overlayHideTimer = null;
  let isScrubbing = false;
  let videoLoop = false;
  let ambientEnabled = true;

  // Initialize Autoplay from Storage
  const autoplay = KOTStorage.getAutoplay();
  if (chkAutoplay) chkAutoplay.checked = autoplay;

  // Format MM:SS
  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Load and Play Video
  async function loadVideo(songId, songMetadata = null) {
    if (!songId) return;
    if (bufferingSpinner) bufferingSpinner.classList.remove('hidden');

    try {
      // Update optimistic UI if metadata is provided
      if (songMetadata) {
        if (videoTitleEl) videoTitleEl.textContent = songMetadata.title || 'KOT Video';
        if (overlayTitle) overlayTitle.textContent = songMetadata.title || 'KOT Video';
        if (channelNameEl) channelNameEl.textContent = songMetadata.artist || 'YouTube';
        if (channelAvatar && songMetadata.thumbnail) channelAvatar.src = songMetadata.thumbnail;
        if (ambientGlow && songMetadata.thumbnail) ambientGlow.style.backgroundImage = `url('${songMetadata.thumbnail}')`;
      }

      // 1. Fetch direct video stream URL
      const streamData = await KOTApi.fetchVideoStream(songId);
      if (!streamData.success) {
        throw new Error(streamData.message || streamData.error || 'Stream URL error');
      }

      currentVideo = {
        id: songId,
        title: streamData.title || (songMetadata ? songMetadata.title : 'KOT Video'),
        artist: streamData.channel || (songMetadata ? songMetadata.artist : 'YouTube'),
        thumbnail: streamData.thumbnail || (songMetadata ? songMetadata.thumbnail : `https://i.ytimg.com/vi/${songId}/hqdefault.jpg`),
        duration: streamData.duration || (songMetadata ? songMetadata.duration : 0)
      };

      // Update UI Details
      if (videoTitleEl) videoTitleEl.textContent = currentVideo.title;
      if (overlayTitle) overlayTitle.textContent = currentVideo.title;
      if (channelNameEl) channelNameEl.textContent = currentVideo.artist;
      if (channelAvatar) channelAvatar.src = currentVideo.thumbnail;
      if (ambientGlow) ambientGlow.style.backgroundImage = `url('${currentVideo.thumbnail}')`;

      // Update URL
      const newUrl = `/watch?v=${songId}`;
      if (window.location.pathname + window.location.search !== newUrl) {
        history.pushState(null, '', newUrl);
      }

      // Update document title
      document.title = `${currentVideo.title} - KOT Music`;

      // Update Like button
      updateLikeBtn();

      // Save to History
      KOTStorage.saveToHistory(currentVideo);

      // Set Video Source (works with proxy range streamer or direct stream)
      video.src = streamData.videoStreamUrl || streamData.directUrl || `/api/video-stream/${songId}`;
      video.load();

      // Initialize Sound Engine
      SoundEngine.init(video);

      // Attempt Playback
      try {
        await video.play();
      } catch (err) {
        console.warn('Autoplay gesture required:', err);
      }

      // Fetch Related Tracks
      fetchRelated(currentVideo);
    } catch (err) {
      console.error('Video load error:', err);
      if (bufferingSpinner) bufferingSpinner.classList.add('hidden');
    }
  }

  // Fetch Related Videos for Up Next
  async function fetchRelated(song) {
    if (!song || !song.id) return;
    if (upnextList) {
      upnextList.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          <span class="spinner" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 8px;"></span>
          កំពុងផ្ទុកបទចម្រៀងណែនាំបន្ត...
        </div>
      `;
    }

    try {
      const data = await KOTApi.fetchRelated(song.id, song.title, song.artist);
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        relatedVideos = data.data.filter(s => s.id !== song.id);
        renderUpNext(relatedVideos);
      } else {
        relatedVideos = [];
        if (upnextList) {
          upnextList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">មិនមានបទណែនាំបន្ថែមទេ</div>`;
        }
      }
    } catch (e) {
      if (upnextList) {
        upnextList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">មិនអាចទាញយកបទណែនាំបានទេ</div>`;
      }
    }
  }

  // Render Up Next Videos
  function renderUpNext(list) {
    if (!upnextList) return;
    if (upnextBadge) upnextBadge.textContent = `${list.length} បទ`;

    upnextList.innerHTML = '';
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = `watch-upnext-card ${currentVideo && currentVideo.id === item.id ? 'active-playing' : ''}`;
      card.dataset.id = item.id;

      card.innerHTML = `
        <div class="watch-upnext-thumb-wrap">
          <img class="watch-upnext-thumb" src="${item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`}" alt="${item.title}" loading="lazy">
          <span class="watch-upnext-time">${item.durationFormatted || item.duration || '3:30'}</span>
        </div>
        <div class="watch-upnext-info">
          <h4 class="watch-upnext-title" title="${item.title}">${item.title}</h4>
          <p class="watch-upnext-artist">${item.artist || 'YouTube Music'}</p>
        </div>
        <div class="watch-upnext-actions">
          <button class="btn-upnext-action btn-add-upnext-queue" title="ដាក់ក្នុង Queue" aria-label="Add to Queue">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', () => {
        loadVideo(item.id, item);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      const btnQ = card.querySelector('.btn-add-upnext-queue');
      if (btnQ) {
        btnQ.addEventListener('click', (e) => {
          e.stopPropagation();
          btnQ.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => {
            btnQ.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
          }, 1500);
        });
      }

      upnextList.appendChild(card);
    });
  }

  // Overlay Hide / Show Logic
  function showOverlay() {
    clearTimeout(overlayHideTimer);
    overlay.classList.remove('faded');
    isOverlayFaded = false;
    if (!video.paused) {
      overlayHideTimer = setTimeout(() => {
        if (!isScrubbing) hideOverlay();
      }, 3200);
    }
  }

  function hideOverlay() {
    overlay.classList.add('faded');
    isOverlayFaded = true;
  }

  function toggleOverlay() {
    if (isOverlayFaded) showOverlay();
    else hideOverlay();
  }

  // Play / Pause Toggle
  function togglePlay() {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  // Update Play/Pause Icons
  function updatePlayPauseIcons() {
    const isPlaying = !video.paused;
    if (iconCenterPlay) iconCenterPlay.classList.toggle('hidden', isPlaying);
    if (iconCenterPause) iconCenterPause.classList.toggle('hidden', !isPlaying);
  }

  // Double Tap Gestures (-10s / +10s)
  let lastTapLeft = 0;
  let lastTapRight = 0;

  if (doubleTapLeft) {
    doubleTapLeft.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTapLeft < 320) {
        video.currentTime = Math.max(video.currentTime - 10, 0);
        triggerRipple(rippleLeft);
      }
      lastTapLeft = now;
    });
  }

  if (doubleTapRight) {
    doubleTapRight.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTapRight < 320) {
        video.currentTime = Math.min(video.currentTime + 10, video.duration || 0);
        triggerRipple(rippleRight);
      }
      lastTapRight = now;
    });
  }

  function triggerRipple(el) {
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 600);
  }

  // Video Event Listeners
  video.addEventListener('play', () => {
    updatePlayPauseIcons();
    showOverlay();
  });

  video.addEventListener('pause', () => {
    updatePlayPauseIcons();
    showOverlay();
  });

  video.addEventListener('waiting', () => {
    if (bufferingSpinner) bufferingSpinner.classList.remove('hidden');
  });

  video.addEventListener('playing', () => {
    if (bufferingSpinner) bufferingSpinner.classList.add('hidden');
    updatePlayPauseIcons();
  });

  video.addEventListener('timeupdate', () => {
    if (!video.duration || isScrubbing) return;
    const cur = video.currentTime;
    const dur = video.duration;
    const pct = (cur / dur) * 100;

    if (scrubberProgress) scrubberProgress.style.width = `${pct}%`;
    if (scrubberThumb) scrubberThumb.style.left = `${pct}%`;
    if (timeCurrent) timeCurrent.textContent = formatTime(cur);
    if (timeDuration) timeDuration.textContent = formatTime(dur);

    // Buffer percentage
    if (video.buffered.length > 0 && scrubberBuffer) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const bufPct = (bufferedEnd / dur) * 100;
      scrubberBuffer.style.width = `${bufPct}%`;
    }
  });

  video.addEventListener('ended', () => {
    if (videoLoop) {
      video.currentTime = 0;
      video.play();
      return;
    }

    // YouTube Autoplay: If autoplay enabled, play next from related videos
    const isAutoplay = KOTStorage.getAutoplay();
    if (isAutoplay && relatedVideos.length > 0) {
      const nextSong = relatedVideos.shift();
      loadVideo(nextSong.id, nextSong);
    }
  });

  // Scrubber Dragging
  if (scrubberTrack) {
    function seekFromEvent(e) {
      const rect = scrubberTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (video.duration) {
        video.currentTime = pos * video.duration;
        const pct = pos * 100;
        if (scrubberProgress) scrubberProgress.style.width = `${pct}%`;
        if (scrubberThumb) scrubberThumb.style.left = `${pct}%`;
      }
    }

    scrubberTrack.addEventListener('pointerdown', (e) => {
      isScrubbing = true;
      scrubberTrack.classList.add('scrubbing');
      seekFromEvent(e);
    });

    window.addEventListener('pointermove', (e) => {
      if (isScrubbing) seekFromEvent(e);
    });

    window.addEventListener('pointerup', () => {
      if (isScrubbing) {
        isScrubbing = false;
        scrubberTrack.classList.remove('scrubbing');
        showOverlay();
      }
    });
  }

  // Click on video to toggle overlay
  videoBox.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('.watch-scrubber-track') || e.target.closest('.double-tap-zone')) return;
    toggleOverlay();
  });

  // Buttons on Overlay
  if (btnCenterPlay) btnCenterPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });

  if (btnNext) btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    if (relatedVideos.length > 0) {
      const nextSong = relatedVideos.shift();
      loadVideo(nextSong.id, nextSong);
    }
  });

  if (btnFullscreen) btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      videoBox.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  if (btnPip) btnPip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (video.requestPictureInPicture) {
      video.requestPictureInPicture().catch(() => {});
    }
  });

  // Settings Modal Handlers
  if (btnSettings) btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    openSettings();
  });

  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
  if (settingsBackdrop) settingsBackdrop.addEventListener('click', closeSettings);

  function openSettings() {
    if (settingsModal) settingsModal.classList.remove('hidden');
    // Sync active preset name
    if (valActivePreset && SoundEngine.presets[SoundEngine.currentPreset]) {
      valActivePreset.textContent = SoundEngine.presets[SoundEngine.currentPreset].name;
    }
  }

  function closeSettings() {
    if (settingsModal) settingsModal.classList.add('hidden');
  }

  // Item Sound FX inside Settings -> Opens Sound FX Modal
  if (itemSoundFx) {
    itemSoundFx.addEventListener('click', () => {
      closeSettings();
      openSoundFxModal();
    });
  }

  function openSoundFxModal() {
    if (soundFxModal) {
      soundFxModal.classList.remove('hidden');
      SoundEngine.syncUI();
    }
  }

  function closeSoundFxModal() {
    if (soundFxModal) soundFxModal.classList.add('hidden');
  }

  if (btnCloseSoundFx) btnCloseSoundFx.addEventListener('click', closeSoundFxModal);
  if (soundFxBackdrop) soundFxBackdrop.addEventListener('click', closeSoundFxModal);
  if (btnApplySoundFx) btnApplySoundFx.addEventListener('click', closeSoundFxModal);

  // Sound Preset Cards click
  const presetCards = document.querySelectorAll('.sound-preset-card');
  presetCards.forEach(c => {
    c.addEventListener('click', () => {
      const p = c.dataset.preset;
      SoundEngine.applyPreset(p);
      if (valActivePreset && SoundEngine.presets[p]) {
        valActivePreset.textContent = SoundEngine.presets[p].name;
      }
    });
  });

  // Sound Equalizer Sliders
  const sliderBass = document.getElementById('watchSliderBass');
  const sliderSpatial = document.getElementById('watchSliderSpatial');
  const sliderReverb = document.getElementById('watchSliderReverb');

  if (sliderBass) sliderBass.addEventListener('input', (e) => SoundEngine.setBass(parseFloat(e.target.value)));
  if (sliderSpatial) sliderSpatial.addEventListener('input', (e) => SoundEngine.setSpatialWidth(parseFloat(e.target.value)));
  if (sliderReverb) sliderReverb.addEventListener('input', (e) => SoundEngine.setReverb(parseFloat(e.target.value)));

  if (btnResetSoundFx) {
    btnResetSoundFx.addEventListener('click', () => {
      SoundEngine.applyPreset(SoundEngine.currentPreset);
    });
  }

  // Ambient Glow Toggle
  if (chkAmbient) {
    chkAmbient.addEventListener('change', () => {
      ambientEnabled = chkAmbient.checked;
      if (ambientGlow) ambientGlow.style.display = ambientEnabled ? 'block' : 'none';
    });
  }

  // Loop Toggle
  if (chkLoop) {
    chkLoop.addEventListener('change', () => {
      videoLoop = chkLoop.checked;
    });
  }

  // Autoplay Switch
  if (chkAutoplay) {
    chkAutoplay.addEventListener('change', () => {
      KOTStorage.setAutoplay(chkAutoplay.checked);
    });
  }

  // Switch to MP3 Button -> Opens main page in pure audio mode!
  if (btnSwitchMp3) {
    btnSwitchMp3.addEventListener('click', () => {
      if (currentVideo && currentVideo.id) {
        window.location.href = `/?play=${encodeURIComponent(currentVideo.id)}`;
      } else {
        window.location.href = '/';
      }
    });
  }

  // Like Button
  function updateLikeBtn() {
    if (!btnLike || !currentVideo) return;
    const isFav = KOTStorage.isFavorite(currentVideo.id);
    btnLike.classList.toggle('liked', isFav);
    const text = btnLike.querySelector('.pill-text');
    if (text) text.textContent = isFav ? 'ចូលចិត្តរួច ❤️' : 'ចូលចិត្ត';
  }

  if (btnLike) {
    btnLike.addEventListener('click', () => {
      if (!currentVideo) return;
      const res = KOTStorage.toggleFavorite(currentVideo);
      btnLike.classList.toggle('liked', res.isFav);
      const text = btnLike.querySelector('.pill-text');
      if (text) text.textContent = res.isFav ? 'ចូលចិត្តរួច ❤️' : 'ចូលចិត្ត';
    });
  }

  // Share Button
  if (btnShare) {
    btnShare.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const text = btnShare.querySelector('.pill-text');
        if (text) text.textContent = 'បានចម្លង Link! ✓';
        setTimeout(() => {
          if (text) text.textContent = 'ចែករំលែក';
        }, 2000);
      } catch (e) {}
    });
  }

  // Add to Queue Button
  if (btnQueue) {
    btnQueue.addEventListener('click', () => {
      const text = btnQueue.querySelector('.pill-text');
      if (text) text.textContent = 'បានបន្ថែម! ✓';
      setTimeout(() => {
        if (text) text.textContent = 'បន្ថែម Queue';
      }, 2000);
    });
  }

  // Start with Initial Video or fallback to Trending
  if (initialVideoId) {
    loadVideo(initialVideoId);
  } else {
    // If no video parameter in URL, fetch first trending song
    KOTApi.fetchTrending('khmer').then(data => {
      if (data.success && data.data && data.data.length > 0) {
        loadVideo(data.data[0].id, data.data[0]);
      }
    }).catch(console.error);
  }
});
