export const SKIN_STORAGE_KEY = 'buffer-zone.visual-skin.v1';
export const DEFAULT_SKIN_ID = 'ink-contours';

const skin = (definition) => Object.freeze(definition);

export const VISUAL_SKINS = Object.freeze([
  skin({
    id: 'ink-contours',
    label: '水墨等高线',
    shortLabel: '水墨',
    description: '温润纸张、水彩地形与安静留白',
    personality: '沉静、诗意、松弛',
    artwork: '/src/assets/skins/ink-contours.webp'
  }),
  skin({
    id: 'wallet-weather',
    label: '钱包天气漫画',
    shortLabel: '漫画',
    description: '手绘天气角色与复古印刷颗粒',
    personality: '贴心、幽默、有陪伴感',
    artwork: '/src/assets/skins/wallet-weather.webp'
  }),
  skin({
    id: 'pixel-garden',
    label: '像素花园',
    shortLabel: '像素',
    description: '把现金缓冲看成一座逐步生长的花园',
    personality: '治愈、轻松、有成长感',
    artwork: '/src/assets/skins/pixel-garden.webp'
  }),
  skin({
    id: 'felt-islands',
    label: '毛毡岛屿',
    shortLabel: '毛毡',
    description: '柔软岛屿、手作质感与温暖空间',
    personality: '可爱、柔软、有安全感',
    artwork: '/src/assets/skins/felt-islands.webp'
  }),
  skin({
    id: 'riso-waves',
    label: '街头丝网印刷',
    shortLabel: '街头',
    description: '高饱和波形、粗粝纸张与青年杂志感',
    personality: '直接、鲜明、有冲劲',
    artwork: '/src/assets/skins/riso-waves.webp'
  }),
  skin({
    id: 'sticker-field',
    label: '暗色贴纸磁场',
    shortLabel: '贴纸',
    description: '暗色纸面、撕边色环与夜间高对比',
    personality: '酷、自由、年轻',
    artwork: '/src/assets/skins/sticker-field.webp'
  })
]);

export function getVisualSkin(skinId) {
  return VISUAL_SKINS.find((item) => item.id === skinId) || VISUAL_SKINS.find((item) => item.id === DEFAULT_SKIN_ID);
}

export function getCashBufferZone(cash = {}) {
  if (cash?.status !== 'current') return null;
  const runwayDays = [cash.runwayDays, cash.touch?.days, cash.touch?.safeDaysLowerBound]
    .find((value) => Number.isFinite(value) && value >= 0);
  if (runwayDays == null) return null;
  if (runwayDays < 15) return 'survival';
  if (runwayDays < 30) return 'danger';
  if (runwayDays <= 60) return 'warning';
  return 'safe';
}

export function loadVisualSkin(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem?.(SKIN_STORAGE_KEY) || 'null');
    return getVisualSkin(saved?.version === 1 ? saved.skinId : null).id;
  } catch {
    return DEFAULT_SKIN_ID;
  }
}

export function persistVisualSkin(storage = globalThis.localStorage, skinId) {
  const normalizedSkinId = getVisualSkin(skinId).id;
  try {
    storage?.setItem?.(SKIN_STORAGE_KEY, JSON.stringify({ version: 1, skinId: normalizedSkinId }));
    return { ok: true, skinId: normalizedSkinId };
  } catch {
    return { ok: false, skinId: normalizedSkinId };
  }
}
