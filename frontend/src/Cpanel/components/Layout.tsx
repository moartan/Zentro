import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useCpanelUi } from "../context/CpanelUiProvider";

export default function Layout() {
  const { isSidebarPinned } = useCpanelUi();

  return (
    <div className="relative flex h-screen overflow-hidden bg-secondary/20 text-foreground">
      <Sidebar />
      <div
        className={`flex h-screen min-h-0 min-w-0 flex-1 flex-col pl-20 transition-[padding] duration-200 ${
          isSidebarPinned ? "pl-[17rem]" : ""
        }`}
      >
        <Header />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pb-6 pt-6 md:px-5">
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
