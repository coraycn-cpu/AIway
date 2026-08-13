import { AdminShell } from "../admin-shell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
