/* sim.worker.js — runs the live simulations off the main thread, so that
   neither the hero animation nor the playground can make the page stutter
   while it is being scrolled. A classic worker rather than a module worker,
   because importScripts is the form that also works from a file:// origin in
   the browsers that allow workers there at all. */

importScripts('sim-core.js', 'sim-driver.js');

var sims = {};      // id -> sim
var timers = {};    // id -> interval handle

function stop(id) {
  if (timers[id]) { clearInterval(timers[id]); delete timers[id]; }
}

self.onmessage = function (e) {
  var d = e.data || {};
  var id = d.id;

  if (d.type === 'init') {
    stop(id);
    sims[id] = self.createSim(d.params, d.seed, d.window, d.perFrame, d.mode);
    if (d.warm) sims[id].warm(d.warm);
    self.postMessage({ id: id, type: 'frame', data: sims[id].snapshot() });
    return;
  }

  if (d.type === 'run') {
    stop(id);
    var sim = sims[id];
    if (!sim) return;
    timers[id] = setInterval(function () {
      sim.advance();
      self.postMessage({ id: id, type: 'frame', data: sim.snapshot() });
      if (sim.stalled) stop(id);
    }, d.interval || 40);
    return;
  }

  if (d.type === 'pause') { stop(id); return; }
  if (d.type === 'dispose') { stop(id); delete sims[id]; return; }
};
