"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Machine } from "@/types/shared";

// ─── Context Value ──────────────────────────────────────────────

interface MachineSelectionContextValue {
  selectedMachine: Machine | null;
  selectMachine: (machine: Machine) => void;
  deselectMachine: () => void;
}

const MachineSelectionContext = createContext<MachineSelectionContextValue>({
  selectedMachine: null,
  selectMachine: () => {},
  deselectMachine: () => {},
});

// ─── Hook ───────────────────────────────────────────────────────

export function useMachineSelection(): MachineSelectionContextValue {
  return useContext(MachineSelectionContext);
}

// ─── Provider ───────────────────────────────────────────────────

export function MachineSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  const selectMachine = useCallback((machine: Machine) => {
    setSelectedMachine(machine);
  }, []);

  const deselectMachine = useCallback(() => {
    setSelectedMachine(null);
  }, []);

  return (
    <MachineSelectionContext.Provider
      value={{ selectedMachine, selectMachine, deselectMachine }}
    >
      {children}
    </MachineSelectionContext.Provider>
  );
}
