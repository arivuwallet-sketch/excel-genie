import { calculateWorkbook } from "./calculation";
import type { Sheet } from "./spreadsheet";
self.onmessage = (event: MessageEvent<Sheet[]>) => {
  try {
    self.postMessage({ ok: true, result: calculateWorkbook(event.data) });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : "Calculation failed." });
  }
};
