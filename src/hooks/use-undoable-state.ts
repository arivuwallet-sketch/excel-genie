import { useCallback, useState } from "react";

const HISTORY_LIMIT = 50;

export type UndoableControls = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * Drop-in replacement for useState that also tracks undo/redo history. The returned setter accepts
 * a value or an updater function, exactly like useState's, so every existing setSheets(...) call site
 * keeps working unchanged — only the useState(...) declaration itself needs to change.
 */
export function useUndoableState<T>(initial: T) {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setState((s) => {
      const next = typeof updater === "function" ? (updater as (prev: T) => T)(s.present) : updater;
      if (next === s.present) return s;
      return { past: [...s.past, s.present].slice(-HISTORY_LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      const previous = s.past[s.past.length - 1];
      if (previous === undefined) return s;
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      const next = s.future[0];
      if (next === undefined) return s;
      return { past: [...s.past, s.present], present: next, future: s.future.slice(1) };
    });
  }, []);

  const controls: UndoableControls = {
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };

  return [state.present, set, controls] as const;
}
