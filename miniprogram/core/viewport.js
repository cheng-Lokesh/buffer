const SCENES = Object.freeze({
  reality: Object.freeze([
    { id: 'position', label: '位置' },
    { id: 'structure', label: '构成' },
    { id: 'evidence', label: '依据' }
  ]),
  future: Object.freeze([
    { id: 'trajectory', label: '轨迹' },
    { id: 'point', label: '点位' },
    { id: 'simulation', label: '模拟' }
  ]),
  conditions: Object.freeze([
    { id: 'basics', label: '基础' },
    { id: 'recurring', label: '固定' },
    { id: 'events', label: '未来事件' }
  ]),
  history: Object.freeze([
    { id: 'records', label: '记录' },
    { id: 'skins', label: '皮肤' },
    { id: 'data', label: '数据' }
  ])
});

function normalizePage(page, pageCount) {
  const count = Math.max(1, Number(pageCount) || 1);
  const value = Number.isFinite(Number(page)) ? Math.trunc(Number(page)) : 0;
  return Math.min(count - 1, Math.max(0, value));
}

function createSceneState(screenId, activeSceneIndex = 0) {
  const scenes = (SCENES[screenId] || SCENES.reality).map((scene, index) => ({
    ...scene,
    index,
    active: index === normalizePage(activeSceneIndex, (SCENES[screenId] || SCENES.reality).length)
  }));
  const current = normalizePage(activeSceneIndex, scenes.length);
  return { scenes, activeSceneIndex: current, activeSceneId: scenes[current].id };
}

function paginateItems(items, page = 0, pageSize = 3) {
  const source = Array.isArray(items) ? items : [];
  const size = Math.max(1, Math.trunc(Number(pageSize) || 1));
  const pageCount = Math.max(1, Math.ceil(source.length / size));
  const normalized = normalizePage(page, pageCount);
  return {
    items: source.slice(normalized * size, normalized * size + size),
    page: normalized,
    pageCount,
    total: source.length,
    hasPrevious: normalized > 0,
    hasNext: normalized < pageCount - 1
  };
}

module.exports = { SCENES, normalizePage, createSceneState, paginateItems };
