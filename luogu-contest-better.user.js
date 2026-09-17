// ==UserScript==
// @name         洛谷近期比赛增强
// @namespace    https://github.com/luogu-contest-better
// @version      1.0.0
// @description  在洛谷首页的“近期比赛”中显示比赛的等级分门槛或咕值属性。
// @author       lg-contest-better
// @match        https://www.luogu.com.cn/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CACHE_KEY = 'contest-elo-threshold-cache-v1';
  const REQUEST_INTERVAL_MS = 1000;
  const GOLD_CLASS = 'lcb-elo-badge';

  let lastRequestStartedAt = 0;

  addStyle();
  void main();

  async function main() {
    if (location.pathname !== '/') return;

    const entries = findRatedContests();
    if (entries.length === 0) return;

    const cache = readCache();
    const pending = [];

    for (const entry of entries) {
      if (Object.prototype.hasOwnProperty.call(cache, entry.id)) {
        renderBadges(entry.badges, cache[entry.id]);
      } else {
        pending.push(entry);
      }
    }

    for (const entry of pending) {
      try {
        await waitForRequestSlot();
        const eloThreshold = await fetchEloThreshold(entry.url);

        cache[entry.id] = eloThreshold;
        writeCache(cache);
        renderBadges(entry.badges, eloThreshold);
      } catch (error) {
        console.warn(`[洛谷近期比赛增强] 无法读取比赛 ${entry.id}：`, error);
      }
    }
  }

  function findRatedContests() {
    const entries = new Map();

    for (const panel of document.querySelectorAll('section.lg-index-contest')) {
      const title = panel.querySelector('.am-panel-title');
      const link = title?.querySelector('a[href^="/contest/"]');
      const badge = [...(title?.querySelectorAll('span') ?? [])]
        .find((element) => element.textContent.trim() === 'Rated');

      if (!link || !badge) continue;

      const match = new URL(link.href, location.origin).pathname.match(/^\/contest\/(\d+)\/?$/);
      if (!match) continue;

      const id = match[1];
      const knownEntry = entries.get(id);

      if (knownEntry) {
        knownEntry.badges.push(badge);
      } else {
        entries.set(id, {
          id,
          url: new URL(`/contest/${id}`, location.origin).href,
          badges: [badge],
        });
      }
    }

    return [...entries.values()];
  }

  async function fetchEloThreshold(url) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const page = new DOMParser().parseFromString(html, 'text/html');
    const contextElement = page.querySelector(
      'script#lentille-context[type="application/json"]',
    );

    if (!contextElement) {
      throw new Error('未找到 lentille-context');
    }

    const context = JSON.parse(contextElement.textContent);
    const contest = context.data?.contest ?? context.contest;
    const eloThreshold = Number(contest?.eloThreshold);

    if (!Number.isFinite(eloThreshold)) {
      throw new Error('eloThreshold 不是有效数字');
    }

    return eloThreshold;
  }

  function renderBadges(badges, eloThreshold) {
    for (const badge of badges) {
      renderBadge(badge, eloThreshold);
    }
  }

  function renderBadge(badge, eloThreshold) {
    if (eloThreshold > 0) {
      badge.textContent = `${eloThreshold === 9999 ? 'INF' : eloThreshold}`;
      badge.classList.remove('lg-bg-green');
      badge.classList.add(GOLD_CLASS);
      return;
    }

    badge.textContent = '咕值';
    badge.classList.remove(GOLD_CLASS);
    badge.classList.add('lg-bg-green');
  }

  async function waitForRequestSlot() {
    const waitTime = Math.max(
      0,
      REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt),
    );

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    lastRequestStartedAt = Date.now();
  }

  function readCache() {
    const value = GM_getValue(CACHE_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function writeCache(cache) {
    GM_setValue(CACHE_KEY, cache);
  }

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .${GOLD_CLASS} {
        background-color: #d1af60 !important;
        color: #fff !important;
      }
    `;
    document.head.append(style);
  }
})();
