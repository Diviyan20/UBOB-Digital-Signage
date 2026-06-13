import { createContext, useContext } from "react";

interface NetworkStatusContextType {
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
}

export const NetworkStatusContext = createContext<NetworkStatusContextType>({
  isOnline: true,
  setIsOnline: () => {},
});

export const useNetworkStatus = () => useContext(NetworkStatusContext);