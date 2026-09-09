const SKINS = Object.freeze([
  Object.freeze({
    id: 'ink-contours', name: '水墨等高线', shortName: '水墨',
    description: '温润纸张、水彩地形与安静留白',
    realityKind: 'contours', historyKind: 'ink-line', changeNoun: '落下一枚墨点',
    artwork: '/assets/skins/ink-contours.webp',
    colors: { canvas: '#f5eedf', surface: '#fffaf0', ink: '#2f2a22', muted: '#776d60', accent: '#285b3d', grid: '#c9bda4', survival: '#df6848', danger: '#e8a15b', warning: '#7b8890', safe: '#3f6544' }
  }),
  Object.freeze({
    id: 'wallet-weather', name: '钱包天气漫画', shortName: '漫画',
    description: '手绘天气角色与复古印刷颗粒',
    realityKind: 'weather', historyKind: 'weather-wire', changeNoun: '更新天气播报',
    artwork: '/assets/skins/wallet-weather.webp',
    colors: { canvas: '#fff4d8', surface: '#fff9e8', ink: '#083d2c', muted: '#6d6655', accent: '#d9502f', grid: '#d7c89d', survival: '#d84b2b', danger: '#e59a18', warning: '#3981a8', safe: '#4e8241' }
  }),
  Object.freeze({
    id: 'pixel-garden', name: '像素花园', shortName: '像素',
    description: '把现金缓冲看成一座逐步生长的花园',
    realityKind: 'garden', historyKind: 'pixel-steps', changeNoun: '种下一条新变化',
    artwork: '/assets/skins/pixel-garden.webp',
    colors: { canvas: '#fff4d6', surface: '#fff9e9', ink: '#33271b', muted: '#766a57', accent: '#5d7b48', grid: '#dbc89e', survival: '#6b8294', danger: '#d59b43', warning: '#68824f', safe: '#436c42' }
  }),
  Object.freeze({
    id: 'felt-islands', name: '毛毡岛屿', shortName: '毛毡',
    description: '柔软岛屿、手作质感与温暖空间',
    realityKind: 'islands', historyKind: 'thread-path', changeNoun: '记下一段航行',
    artwork: '/assets/skins/felt-islands.webp',
    colors: { canvas: '#fff0d7', surface: '#fff8e9', ink: '#422a1f', muted: '#806551', accent: '#4f7a58', grid: '#dec49e', survival: '#a84935', danger: '#c87a32', warning: '#ba9c53', safe: '#4a744f' }
  }),
  Object.freeze({
    id: 'riso-waves', name: '街头丝网印刷', shortName: '街头',
    description: '高饱和波形、粗粝纸张与青年杂志感',
    realityKind: 'riso-bands', historyKind: 'rough-wave', changeNoun: '贴出一张新报',
    artwork: '/assets/skins/riso-waves.webp',
    colors: { canvas: '#f4efe4', surface: '#fbf6eb', ink: '#111111', muted: '#4b473f', accent: '#f12d36', grid: '#bdb4a5', survival: '#f12d36', danger: '#ff8a18', warning: '#1457e6', safe: '#48b953' }
  }),
  Object.freeze({
    id: 'sticker-field', name: '暗色贴纸磁场', shortName: '贴纸',
    description: '暗色纸面、撕边色环与夜间高对比',
    realityKind: 'magnetic-field', historyKind: 'neon-pulse', changeNoun: '贴上一枚新贴纸',
    artwork: '/assets/skins/sticker-field.webp',
    colors: { canvas: '#11151c', surface: '#1b202a', ink: '#f4ecd8', muted: '#bdb4a3', accent: '#ff4b82', grid: '#3a414f', survival: '#ff4b62', danger: '#ff9238', warning: '#4382ff', safe: '#62d66f' }
  })
]);

const DEFAULT_SKIN_ID = 'ink-contours';

function getSkin(id) {
  return SKINS.find((skin) => skin.id === id) || SKINS[0];
}

module.exports = { SKINS, DEFAULT_SKIN_ID, getSkin };
