"use strict";
importScripts("./melee-data.js", "./melee-engine.js");
self.onmessage = function ({ data: request }) {
  try {
    const { config, ids } = request, c = RIMWORLD_MELEE.normalizeConfig(config);
    const variants = new Map([...RIMWORLD_MELEE_DATA.variants, RIMWORLD_MELEE.UNARMED].map(v => [v.id, v]));
    for (let index = 0; index < ids.length; index++) {
      const variant = variants.get(ids[index]);
      if (!variant) throw Error("Unknown weapon variant.");
      const result = RIMWORLD_MELEE.runVariant(RIMWORLD_MELEE_DATA, variant, c);
      self.postMessage({ type: "result", result, completed: index + 1, total: ids.length });
    }
    self.postMessage({ type: "done" });
  } catch (error) { self.postMessage({ type: "error", message: error.message }); }
};
