/* 1500 生存季 × 比奇堡 —— 贴图动画过场（DESIGN-v4 第 10 项）
 * 渐黑(0.3s) → 帧序列(每帧约 0.38s，无声) → 渐亮。图片缺失时自动退化为纯渐黑渐亮。
 * 用法：window.BSCutscene.play('eat' | 'ice' | 'shop' | 'phone' | 'prize' | 'rob' | 'sleep')
 */
(() => {
  'use strict';
  const SCENES = {
    eat: ['eat-1.png', 'eat-2.png', 'eat-1.png'],
    ice: ['ice-1.png', 'ice-2.png'],
    shop: ['shop-1.png', 'shop-1.png'],
    phone: ['phone-1.png', 'phone-2.png'],
    prize: ['prize-1.png', 'prize-1.png'],
    rob: ['rob-1.png', 'rob-1.png'],
    sleep: ['sleep-1.png', 'sleep-2.png'],
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
