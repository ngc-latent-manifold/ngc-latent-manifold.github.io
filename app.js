'use strict';

// Point estimates exported from the archived, matched main-ladder evaluations.
// Planner seeds are averaged within each pair before averaging over 300 pairs.
const results = window.NGC_RESULTS;

const format = n => n.toFixed(1);
function renderResults(index) {
  for (const task of results.tasks) {
    const cell = task.cells[index];
    const row = document.querySelector(`[data-task="${task.id}"]`);
    row.querySelector('.result-offset').textContent = cell.offset;
    row.querySelector('.result-l2').textContent = format(cell.l2);
    row.querySelector('.result-ngc').textContent = format(cell.ngc);
    row.querySelector('.result-delta').textContent = `${cell.delta >= 0 ? '+' : '−'}${format(Math.abs(cell.delta))}`;
  }
  document.querySelectorAll('[data-offset]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.offset) === index));
  });
  document.getElementById('results-announcement').textContent = `${['Shortest', 'Middle', 'Longest'][index]} tested goal offsets selected. ${results.tasks.map(t => `${t.name}, offset ${t.cells[index].offset}: NGC ${format(t.cells[index].ngc)} percent, L2 ${format(t.cells[index].l2)} percent`).join('. ')}.`;
}
document.querySelectorAll('[data-offset]').forEach(button => button.addEventListener('click', () => renderResults(Number(button.dataset.offset))));
document.getElementById('copy-bibtex').addEventListener('click', async event => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(document.getElementById('bibtex').textContent);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 2000);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('bibtex'));
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'Selected · press Ctrl/Cmd+C';
  }
});


// Keep native controls as a fallback until each custom player is ready.
document.querySelectorAll('[data-video-player]').forEach(player => {
  const video = player.querySelector('video');
  const toggle = player.querySelector('.video-toggle');
  const progress = player.querySelector('.video-progress');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let dragging = false;
  let wantedPlaying = false;
  let pendingTime = null;
  let seekVersion = 0;
  let preparing = null;
  let blobUrl = null;
  const status = document.createElement('span');
  status.className = 'video-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  player.append(status);
  const timeLabel = seconds => {
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };
  function updatePlayback() {
    const playing = !video.paused && !video.ended;
    player.classList.toggle('is-playing', playing);
    toggle.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    toggle.title = playing ? 'Pause video' : 'Play video';
  }
  function updateProgress() {
    const ready = Number.isFinite(video.duration) && video.duration > 0;
    progress.disabled = !ready;
    if (!ready) return;
    const seconds = pendingTime ?? video.currentTime;
    const value = seconds / video.duration * 1000;
    if (!dragging) progress.value = value;
    progress.style.setProperty('--progress', `${value / 10}%`);
    progress.setAttribute('aria-valuetext', `${timeLabel(seconds)} of ${timeLabel(video.duration)}`);
  }
  async function play() {
    wantedPlaying = true;
    if (preparing || dragging) return;
    try { await video.play(); } catch { /* Leave a usable play button if autoplay is blocked. */ }
    updatePlayback();
  }
  // Some static hosts ignore Range requests. A complete Blob gives the browser
  // a seekable source without requiring a change to the hosting service.
  async function ensureSeekable() {
    if (preparing) return preparing;
    if (blobUrl || (video.seekable.length && video.seekable.end(video.seekable.length - 1) > 0)) return;
    const source = video.currentSrc || video.querySelector('source').src;
    video.pause();
    status.textContent = 'Loading video…';
    status.hidden = false;
    player.setAttribute('aria-busy', 'true');
    preparing = (async () => {
      const response = await fetch(source);
      if (!response.ok) throw new Error('Video download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            video.removeEventListener('loadedmetadata', ready);
            video.removeEventListener('error', failed);
          };
          const ready = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error('Video could not load')); };
          video.addEventListener('loadedmetadata', ready);
          video.addEventListener('error', failed);
          video.src = url;
          video.load();
        });
        blobUrl = url;
      } catch (error) {
        URL.revokeObjectURL(url);
        video.src = source;
        video.load();
        throw error;
      }
    })();
    try { await preparing; }
    finally {
      preparing = null;
      player.removeAttribute('aria-busy');
    }
  }
  async function seek(seconds) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const version = ++seekVersion;
    // Avoid triggering the loop boundary when dragging to the very end.
    pendingTime = Math.max(0, Math.min(video.duration - .04, seconds));
    updateProgress();
    try {
      await ensureSeekable();
      if (version !== seekVersion) return;
      video.currentTime = pendingTime;
      status.hidden = true;
      if (wantedPlaying && !dragging) play();
    } catch {
      if (version !== seekVersion) return;
      pendingTime = null;
      status.textContent = 'Could not load video. Try seeking again.';
      status.hidden = false;
      updateProgress();
    }
  }
  toggle.addEventListener('click', () => {
    if (video.paused || video.ended) play();
    else { wantedPlaying = false; video.pause(); }
  });
  progress.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || progress.disabled) return;
    dragging = true;
    if (!preparing) wantedPlaying = !video.paused;
    video.pause();
    progress.setPointerCapture(event.pointerId);
  });
  function finishDrag() {
    if (!dragging) return;
    dragging = false;
    seek(Number(progress.value) / 1000 * video.duration);
  }
  progress.addEventListener('pointerup', finishDrag);
  progress.addEventListener('pointercancel', finishDrag);
  progress.addEventListener('lostpointercapture', finishDrag);
  window.addEventListener('blur', finishDrag);
  progress.addEventListener('input', () => {
    seek(Number(progress.value) / 1000 * video.duration);
  });
  progress.addEventListener('keydown', event => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const offsets = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 };
    let next;
    if (event.key in offsets) next = (pendingTime ?? video.currentTime) + offsets[event.key];
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = video.duration;
    else return;
    event.preventDefault();
    seek(next);
  });
  ['play', 'pause', 'ended', 'error'].forEach(event => video.addEventListener(event, updatePlayback));
  video.addEventListener('seeked', () => {
    if (!preparing && pendingTime !== null && Math.abs(video.currentTime - pendingTime) < .1) pendingTime = null;
    updateProgress();
  });
  ['loadedmetadata', 'durationchange', 'timeupdate'].forEach(event => video.addEventListener(event, updateProgress));
  reducedMotion.addEventListener('change', event => { if (event.matches) { wantedPlaying = false; video.pause(); } });
  video.controls = false;
  video.muted = true;
  toggle.hidden = false;
  progress.hidden = false;
  player.classList.add('is-enhanced');
  updatePlayback();
  updateProgress();
  if (!reducedMotion.matches) play();
});

// Matched oracle cohort from paper Table 2, independent of the main results controls.
const oracleResults = [{"name": "TwoRoom", "cells": [[25, 92, 84, 100, 100], [50, 65, 58, 100, 100], [75, 24, 19, 94, 100]]}, {"name": "Cube", "cells": [[25, 44, 56, 59, 76], [50, 44, 52, 53, 71], [100, 31, 38, 50, 74]]}, {"name": "PushT", "cells": [[25, 90, 94, 88, 95], [50, 43, 58, 61, 84], [100, 14, 13, 28, 36]]}];
function renderOracleResults(index) {
  for (const task of oracleResults) {
    const [offset, learnedL2, oracleL2, learnedNGC, oracleNGC] = task.cells[index];
    const learned = document.querySelector(`[data-oracle-task="${task.name}"]`);
    const oracle = document.querySelector(`[data-oracle-predictor="${task.name}"]`);
    learned.querySelector('.oracle-offset').textContent = offset;
    for (const [row, l2, ngc] of [[learned, learnedL2, learnedNGC], [oracle, oracleL2, oracleNGC]]) {
      row.querySelector('.oracle-l2').textContent = l2;
      row.querySelector('.oracle-ngc').textContent = ngc;
      row.querySelector('.oracle-delta').textContent = `${ngc - l2 >= 0 ? '+' : '−'}${Math.abs(ngc - l2)}`;
    }
  }
  document.querySelectorAll('[data-oracle-offset]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.oracleOffset) === index));
  });
  document.getElementById('oracle-announcement').textContent = `${['Shortest', 'Middle', 'Longest'][index]} oracle goal offsets selected. ` + oracleResults.map(task => `${task.name}, offset ${task.cells[index][0]}: oracle NGC ${task.cells[index][4]} percent, L2 ${task.cells[index][2]} percent`).join('. ');
}
document.querySelectorAll('[data-oracle-offset]').forEach(button => button.addEventListener('click', () => renderOracleResults(Number(button.dataset.oracleOffset))));
