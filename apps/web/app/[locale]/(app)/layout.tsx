import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen p-4 gap-4 overflow-hidden">
      <AppSidebar />
      <main className="flex-1 min-w-0 flex gap-4">{children}</main>
    </div>
  );
}
