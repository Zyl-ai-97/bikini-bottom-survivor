(() => {
  'use strict';

  const town = [-.6, 3.3, -40.5];
  const plaza = [0, 1.3, -26.1];
  const ground = (x, z, height = 1.46) => ({ x, z, height });
  const water = (x, y, z) => ({ x, y, z });
  const face = (x, z, height) => ground(x, z, height);
  const spongeView = ground(.14, -23.12, 1.45);
  const squidView = ground(.02, -23.80, 1.37);
  const patrickView = ground(.11, -23.90, 1.40);
  const krabsView = ground(-.28, -23.78, 1.30);
  const planktonView = ground(.28, -25.72, 1.11);
  const spongePortrait = face(1.2, -25.7, .85);
  const squidPortrait = face(1.0, -27.2, 1.04);
  const patrickPortrait = face(-.7, -27.6, .94);
  const krabsPortrait = face(-1.6, -25.8, 1.14);
  const planktonClose = floor => {
    const {x,z,baseY} = window.bikiniLayout.planktonPerch(floor);
    return {x,y:baseY + .36,z};
  };

  // Times are measured from the underwater controls handoff, when the plaque
  // starts its existing fall. Repeated positions give the waves room to read.
  const keys = [
    [0, 'plaque', null, null],
    [7.75, null, null, null],
    [9.6, 'descend', ground(2.92, 24.4, 2.70), town],
    [11.2, 'approach', ground(1.18, 17.4), town],
    [12.8, null, ground(-1.78, 8.65), town],
    [14.0, null, ground(-.47, 1.45), town],
    [15.3, null, ground(2.37, -6.05), town],
    [16.4, null, ground(2.03, -12.00), town],
    [17.65, null, ground(-1.68, -17.78), town],
    [18.65, 'turn-right', ground(-3.14, -20.74), [3.2, 1.8, -29.0]],
    [19.55, null, ground(-2.52, -21.36), [14.1, 2.9, -23.7]],
    [20.6, null, ground(3.20, -21.0), [18.0, 2.0, -22.10]],
    [21.7, null, ground(11.2, -21.45), [25.40, 3.7, -24.3]],
    [22.8, null, ground(19.8, -20.61), [31.68, 2.3, -22.1]],
    [23.75, null, ground(26.6, -20.48), [32.4, 2.4, -23.8]],
    [25.15, 'spongebob', ground(30.78, -19.70), face(31.68, -22.10, 1.10)],
    [27.35, null, ground(30.78, -19.70), face(31.68, -22.10, 1.10)],
    [29.3, 'turn-squidward', ground(28.05, -19.99), face(24.02, -21.53, 1.20)],
    [31.05, 'squidward', ground(23.45, -19.0), face(24.02, -21.53, 1.15)],
    [33.0, null, ground(23.45, -19.0), face(24.02, -21.53, 1.15)],
    [34.5, 'turn-patrick', ground(22.03, -19.34), face(19.50, -22.65, 1.26)],
    [36.2, 'patrick', ground(20.22, -20.1), face(19.50, -22.65, 1.24)],
    [38.12, null, ground(20.22, -20.1), face(19.50, -22.65, 1.24)],
    [39.8, 'trio-pullback', ground(22.4, -15.94, 2.45), [24.6, 1.77, -23.3]],
    [41.8, 'trio', ground(25.43, -11.35, 3.42), [25.39, 1.92, -23.7]],
    [42.43, null, ground(25.43, -11.35, 3.42), [25.39, 1.92, -23.7]],
    [43.9, 'cross-town', ground(20.45, -16.92, 2.8), [7, 3.6, -28]],
    [45.5, null, ground(12.33, -21.36, 1.82), [2, 5.7, -38.5]],
    [47.65, null, ground(-2.75, -21.27), [-4, 3.6, -37.0]],
    [48.55, null, ground(-3.5, -25.5), [-7.66, 2.5, -29.2]],
    [49.7, null, ground(-3.87, -31.86), [-14.5, 2.7, -35.8]],
    [50.7, null, ground(-9.72, -33.56), [-18.6, 1.45, -29.2]],
    [52.0, null, ground(-16.05, -28.60), [-26.4, 2.85, -30.6]],
    [53.5, null, ground(-25.5, -27.40), [-40.0, 2.68, -31.1]],
    [54.85, null, ground(-33.58, -27.80), [-46.9, 3.6, -36.8]],
    [56.2, null, ground(-41.94, -28.81), [-48.6, 4.25, -36.1]],
    [57.75, 'krabs', ground(-45.80, -29.97), face(-47.05, -32.26, 1.34)],
    [60.0, null, ground(-45.80, -29.97), face(-47.05, -32.26, 1.34)],
    [61.45, 'turn-plankton', ground(-47.31, -29.97, 1.32), [-49.7, .4, -29.2]],
    [63.3, 'plankton', ground(-48.85, -28.70, 1.20), face(-49.63, -26.60, .44)],
    [66.1, null, ground(-48.85, -28.70, 1.20), face(-49.63, -26.60, .44)],
    [67.8, 'orbit-rise', water(-50.55, 4.5, -29.55), [-37, 2.1, -22]],
    [70.6, 'orbit-left', water(-52.2, 10.9, -36.3), town],
    [74.1, null, water(-49.1, 16.4, -52.3), town],
    [78.2, 'orbit-backstreet', water(-32, 23.8, -66.0), town],
    [82.3, null, water(-9.6, 27.4, -73.4), town],
    // Come inside the floating flower before crossing the eastern ridge.
    [84.45, null, water(5.2, 27.9, -66.6), town],
    [86.3, null, water(17.4, 27.8, -60.4), town],
    [90.1, 'orbit-right', water(34.4, 21.5, -52.4), town],
    [93.5, null, water(37.5, 15.3, -36.8), town],
    [96.1, 'orbit-descend', water(25.2, 9.9, -16.7), [-2.0, 2.1, -31.6]],
    [98.7, 'plaza-approach', water(10.70, 5.4, -19.78), plaza],
    [99.53, 'plaza-lineup', ground(3.2, -22.0, 3.23), plaza],
    [100.60, 'plaza-spongebob', spongeView, spongePortrait],
    [101.97, null, spongeView, spongePortrait],
    [102.80, 'plaza-squidward', squidView, squidPortrait],
    [104.13, null, squidView, squidPortrait],
    [105.00, 'plaza-patrick', patrickView, patrickPortrait],
    [106.33, null, patrickView, patrickPortrait],
    [107.15, 'plaza-krabs', krabsView, krabsPortrait],
    [108.52, null, krabsView, krabsPortrait],
    [109.42, 'plankton-closeup', planktonView, planktonClose],
    [111.05, null, planktonView, planktonClose],
    [112.36, 'plaza-pullback', ground(.15, -21.90, 3.23), plaza],
    [113.40, 'town-rise', water(.03, 7.65, -24.50), [-.39, 2.3, -35.2]],
    [115.35, 'birds-eye', water(.12, 23.1, -27.9), [-.47, 2.7, -39.5]],
    [117.05, null, water(.34, 38.4, -28.6), [-.6, 2.6, -36.0]],
    [119.0, 'return-depth', water(.46, 50, -28.9), [-.62, 2.6, -35.1]]
  ];

  const interpolate = (a, b, tangentA, tangentB, t) => {
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * tangentA +
      (-2 * t3 + 3 * t2) * b + (t3 - t2) * tangentB;
  };
  const difference = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const radians = Math.PI / 180;

  function lensAt(time, defaultLens) {
    const smooth = value => {
      const t = Math.max(0, Math.min(1, value));
      return t * t * (3 - 2 * t);
    };
    const portrait = smooth(Math.min((time - 99.3) / 1.3, (112.36 - time) / 1.1));
    const close = smooth(Math.min((time - 108.52) / .9, (112.36 - time) / 1.31));
    const overhead = smooth((time - 113.4) / 5.6);
    if (!(portrait || close || overhead)) return defaultLens;
    const vertical = defaultLens.vertical - 9 * portrait - 12 * close + 11 * overhead;
    const aspect = Math.tan(defaultLens.horizontal * radians / 2) / Math.tan(defaultLens.vertical * radians / 2);
    const horizontal = 2 * Math.atan(aspect * Math.tan(vertical * radians / 2)) / radians;
    return { horizontal, vertical };
  }

  window.createRecordingCamera = function createRecordingCamera(floor, opening, returnHeight) {
    function toPoint(point) {
      if (Array.isArray(point)) return { x: point[0], y: point[1], z: point[2] };
      if (typeof point === 'function') return point(floor);
      const { x, z } = point;
      return { x, z, y: point.y ?? floor(x, z) + point.height };
    }

    const controls = keys.map(([time, marker, position, target], i) => {
      const camera = position ? toPoint(position) : { ...opening };
      if (i === keys.length - 1) camera.y = returnHeight;
      if (target) {
        const { x, y, z } = toPoint(target);
        const dx = x - camera.x, dz = z - camera.z;
        camera.yaw = Math.atan2(dx, -dz);
        camera.pitch = Math.atan2(y - camera.y, Math.hypot(dx, dz));
      }
      return { time, marker, camera };
    });

    const channels = ['x', 'y', 'z', 'yaw', 'pitch'];
    for (let i = 1; i < controls.length; i++) {
      const before = controls[i - 1].camera, after = controls[i].camera;
      after.yaw = before.yaw + difference(before.yaw, after.yaw);
    }
    const velocities = controls.map(({ time, camera }, i) => {
      const before = controls[i - 1], after = controls[i + 1];
      return channels.map(channel => {
        if (!before || !after) return 0;
        const inTime = time - before.time, outTime = after.time - time;
        const incoming = (camera[channel] - before.camera[channel]) / inTime;
        const outgoing = (after.camera[channel] - camera[channel]) / outTime;
        if (incoming * outgoing <= 0) return 0;
        const inWeight = (2 * outTime + inTime) / 3;
        const outWeight = (outTime + 2 * inTime) / 3;
        return (inTime + outTime) / (inWeight / incoming + outWeight / outgoing);
      });
    });

    const duration = controls.at(-1).time;
    function poseAt(seconds) {
      const time = Math.min(duration, Math.max(0, seconds));
      const segment = Math.max(0, controls.findLastIndex(key => key.time <= time && key.time < duration));
      const a = controls[segment], b = controls[segment + 1];
      const interval = b.time - a.time, t = (time - a.time) / interval;
      const camera = {};
      channels.forEach((channel, i) => {
        camera[channel] = interpolate(a.camera[channel], b.camera[channel],
          velocities[segment][i] * interval, velocities[segment + 1][i] * interval, t);
      });
      camera.y = Math.max(camera.y, floor(camera.x, camera.z) + .84);
      return camera;
    }

    return {
      duration,
      poseAt,
      lensAt,
      markerAt: time => controls.findLast(key => key.marker && key.time <= time)?.marker ?? 'plaque'
    };
  };
})();
