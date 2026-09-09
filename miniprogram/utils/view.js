const { getSkin } = require('../core/skins');

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '待确认';
  const rounded = Math.round(number * 100) / 100;
  return `¥${rounded.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatTime(value) {
  if (!value) return '还没有确认记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '确认时间未知';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatChanges(changes = []) {
  return changes.map((item) => ({
    ...item,
    timeLabel: formatTime(item.occurredAt),
    balanceLabel: item.after ? formatMoney(item.after.balance) : item.legacyDelta != null ? `${item.legacyDelta >= 0 ? '+' : ''}${formatMoney(item.legacyDelta).replace('¥', '¥')}` : '历史记录',
    reserveLabel: item.after ? formatMoney(item.after.reserve) : '',
    dailyLabel: item.after ? formatMoney(item.after.daily) : '',
    noteLabel: item.note || '没有补充说明'
  }));
}

function applySkinChrome(skinId) {
  const skin = getSkin(skinId);
  if (typeof wx === 'undefined') return skin;
  const dark = skin.id === 'sticker-field';
  wx.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: skin.colors.canvas,
    animation: { duration: 120, timingFunc: 'easeOut' }
  });
  wx.setTabBarStyle({ color: skin.colors.muted, selectedColor: skin.colors.accent, backgroundColor: skin.colors.surface, borderStyle: dark ? 'black' : 'white' });
  return skin;
}

function drawTrajectory(page, canvasId, trajectory, skinId) {
  if (typeof wx === 'undefined' || !Array.isArray(trajectory) || trajectory.length < 2) return;
  const skin = getSkin(skinId);
  wx.createSelectorQuery().in(page).select(`#${canvasId}`).fields({ node: true, size: true }).exec((result) => {
    const field = result && result[0];
    if (!field || !field.node || !field.width || !field.height) return;
    const canvas = field.node;
    const ratio = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
    canvas.width = field.width * ratio;
    canvas.height = field.height * ratio;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    const width = field.width;
    const height = field.height;
    const padding = 12;
    const values = trajectory.reduce((all, point) => all.concat(Number(point.balance), Number(point.reserve)), []).filter(Number.isFinite);
    const maximum = Math.max(...values, 1);
    const x = (index) => padding + (index / (trajectory.length - 1)) * (width - padding * 2);
    const y = (value) => height - padding - (Math.max(0, value) / maximum) * (height - padding * 2);

    context.clearRect(0, 0, width, height);
    context.setLineDash([5, 5]);
    context.strokeStyle = skin.colors.grid;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding, y(trajectory[0].reserve));
    context.lineTo(width - padding, y(trajectory[0].reserve));
    context.stroke();
    context.setLineDash([]);

    context.strokeStyle = skin.colors.accent;
    context.lineWidth = skin.id === 'riso-waves' ? 4 : skin.id === 'pixel-garden' ? 3 : 2.5;
    context.lineJoin = skin.id === 'pixel-garden' ? 'miter' : 'round';
    context.lineCap = skin.id === 'pixel-garden' ? 'square' : 'round';
    context.beginPath();
    trajectory.forEach((point, index) => {
      if (index === 0) context.moveTo(x(index), y(point.balance));
      else context.lineTo(x(index), y(point.balance));
    });
    context.stroke();
  });
}

module.exports = { formatMoney, formatTime, formatChanges, applySkinChrome, drawTrajectory };
