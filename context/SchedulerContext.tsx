import { scheduler, SchedulerResult } from "@/frontend/services/ApiScheduler";
import React, { createContext, useContext, useEffect, useState } from "react";

const defaultState: SchedulerResult = {
  isOnline: true,
  promotions: [],
  signageVideos: [],
  lastUpdated: null,
};

const SchedulerContext = createContext<SchedulerResult>(defaultState);

export const SchedulerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<SchedulerResult>(defaultState);

  useEffect(() => {
    scheduler.start();
    const unsubscribe = scheduler.subscribe(setState);
    return () => {
      unsubscribe();
      scheduler.stop();
    };
  }, []);

  return (
    <SchedulerContext.Provider value={state}>
      {children}
    </SchedulerContext.Provider>
  );
};

export const useScheduler = () => useContext(SchedulerContext);
