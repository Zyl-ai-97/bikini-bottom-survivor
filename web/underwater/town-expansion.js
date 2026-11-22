(() => {
  'use strict';

  function lane(points, width) {
    const result = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 2)];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .15);
      for (let j = 0; j < steps; j++) {
        const t = j / steps, t2 = t * t, t3 = t2 * t;
        const [x, z] = a.map((value, k) => .5 * (
          2 * value + (b[k] - before[k]) * t +
          (2 * before[k] - 5 * value + 4 * b[k] - after[k]) * t2 +
          (-before[k] + 3 * value - 3 * b[k] + after[k]) * t3
        ));
        result.push({x, z, width});
      }
    }
    const [x, z] = points.at(-1);
    result.push({x, z, width});
    return result;
  }

  window.sampleTownLane = lane;
  window.buildTownExpansion = function buildTownExpansion() {
    const sites = [
      // Small, separated buildings mark the shore without blocking the skyline.
      ['theater', -7.66, -29.21, 1.02, .56, 0],
      ['busStop', .65, -30.90, -1.12, .82, 1],
      ['market', -37.70, -31.35, 1.45, .76, 0],
      ['workshop', -14.30, -37.40, .20, .74, 0],
      ['shell', 17.45, -30.75, -.72, .66, 0],
      ['observatory', -.36, -48.15, 1.58, .43, 0],

      // The ridge street rises from the old main road and returns along the east bank.
      ['can', 3.56, -63.15, 1.12, .85, 2],
      ['workshop', 3.35, -67.65, .64, .91, 2],
      ['observatory', 11.75, -61.05, 2.56, .79, 1],
      ['gloveGate', 20.45, -66.30, -.04, .88, 0],
      ['gloveWheel', 22.20, -69.72, .05, .86, 0],
      ['workshop', 17.90, -60.10, 2.94, .94, 1],
      ['shell', 25.60, -67.55, -1.20, .69, 1],
      ['can', 24.65, -60.50, -1.18, .90, 4],
      ['observatory', 25.47, -53.65, -1.90, .73, 2],
      ['can', 19.40, -52.10, 1.53, .77, 5],
      ['workshop', 24.35, -46.70, -1.13, .67, 2],
      ['can', 17.35, -72.00, 1.28, .77, 4]
    ].map(([kind, x, z, angle, scale, variant]) => ({kind, x, z, angle, scale, variant}));

    const lanes = [
      lane([[4.35, -59.15], [5.25, -61.40], [8.30, -63.55], [12.10, -64.45],
        [16.10, -64.10], [19.95, -62.25], [22.25, -59.70], [22.51, -56.10],
        [22.90, -51.80], [21.90, -48.20], [20.45, -45.05], [17.02, -43.55]], .66),
      lane([[-2.85, -31.65], [-6.55, -32.70], [-10.30, -33.62], [-13.20, -32.85],
        [-14.62, -30.85], [-15.90, -28.65], [-18.42, -27.42], [-22.35, -27.45],
        [-26.10, -27.36], [-30.30, -28.15], [-33.25, -30.10], [-34.53, -31.02]], .45),
      lane([[18.84, -62.84], [20.12, -64.95], [20.45, -66.75], [20.24, -67.62],
        [19.36, -68.49], [19.10, -70.05], [19.64, -71.55]], .53),
      lane([[11.55, -34.85], [13.78, -34.35], [15.54, -33.44], [16.10, -32.65]], .39),
      lane([[-7.30, -32.92], [-6.28, -32.25], [-5.54, -31.22], [-5.13, -30.35]], .33),
      lane([[-2.78, -32.15], [-2.15, -32.10], [-1.62, -31.99]], .33)
    ];
    return {sites, lanes};
  };
})();
