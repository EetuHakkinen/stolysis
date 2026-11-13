"use client";

import { createContext, useContext, useState } from "react";

const SelectedScenarioContext = createContext<{
  selectedId: number | undefined;
  select: (scenarioId: number | undefined) => void;
}>({ selectedId: undefined, select: () => {} });

// The estimate scenario selected on the company page, shared by the result tabs and the notes. It
// is kept in the URL, so it survives a reload. Changing it only replaces the history entry: every
// scenario's estimates are already loaded.
export function SelectedScenarioProvider({
  initialId,
  children,
}: {
  initialId: number | undefined;
  children: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(initialId);

  function select(scenarioId: number | undefined) {
    setSelectedId(scenarioId);
    const url = new URL(window.location.href);
    if (scenarioId == null) url.searchParams.delete("scenario");
    else url.searchParams.set("scenario", String(scenarioId));
    window.history.replaceState(null, "", url);
  }

  return <SelectedScenarioContext value={{ selectedId, select }}>{children}</SelectedScenarioContext>;
}

// Id of the selected scenario, undefined until one is selected (the first one is shown then).
export function useSelectedScenario() {
  return useContext(SelectedScenarioContext);
}
