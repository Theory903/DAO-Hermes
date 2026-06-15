import type { ReactNode } from "react";

import { DAOBootScreen } from "@/features/DAO/shell/DAOBootScreen";

import { useAuth } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";
import { SpacePickerScreen } from "./SpacePickerScreen";

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const { phase } = useAuth();

  if (phase === "boot") {
    return <DAOBootScreen />;
  }

  if (phase === "login") {
    return <LoginScreen />;
  }

  if (phase === "spaces") {
    return <SpacePickerScreen />;
  }

  return <>{children}</>;
}
