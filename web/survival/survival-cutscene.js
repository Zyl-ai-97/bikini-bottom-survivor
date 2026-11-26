/* 1500 生存季 × 比奇堡 —— 贴图动画过场（DESIGN-v4 第 10 项）
 * 渐黑(0.3s) → 帧序列(每帧约 0.38s，无声) → 渐亮。图片缺失时自动退化为纯渐黑渐亮。
 * 用法：window.BSCutscene.play('eat' | 'ice' | 'shop' | 'phone' | 'prize' | 'rob' | 'sleep')
 */
(() => {
  'use strict';
  const SCENES = {
    eat: ['eat-1.webp', 'eat-2.webp', 'eat-1.webp'],
    ice: ['ice-1.webp', 'ice-2.webp'],
    shop: ['shop-1.webp', 'shop-1.webp'],
    phone: ['phone-1.webp', 'phone-2.webp'],
    prize: ['prize-1.webp', 'prize-1.webp'],
    rob: ['rob-1.webp', 'rob-1.webp'],
    sleep: ['sleep-1.webp', 'sleep-2.webp'],
  };
  const overlay = document.createElement('div');
  overlay.id = 'survival-cutscene';
  overlay.hidden = true;
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:400;display:none;pointer-events:none;'
    + 'align-items:center;justify-content:center;opacity:0;transition:opacity .3s ease;';
  const img = document.createElement('img');
  img.alt = '';
  img.style.cssText = 'width:min(72vw,420px);height:min(72vw,420px);object-fit:contain;'
    + 'border-radius:18px;transition:transform .18s ease;';
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  let playing = false;
  function play(name) {
    const frames = SCENES[name];
    if (!frames || playing) return;
    playing = true;
    overlay.hidden = false;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    let i = 0;
    const showFrame = () => {
      if (i >= frames.length) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.hidden = true; overlay.style.display = 'none'; playing = false; }, 320);
        return;
      }
      img.style.transform = i % 2 ? 'scale(1.04) rotate(1deg)' : 'scale(1)';
      img.src = './survival/img/anim/' + frames[i];
      i += 1;
      setTimeout(showFrame, 380);
    };
    setTimeout(showFrame, 300);
  }
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
  img.addEventListener('load', () => { img.style.visibility = 'visible'; });

  window.BSCutscene = { play };
})();
