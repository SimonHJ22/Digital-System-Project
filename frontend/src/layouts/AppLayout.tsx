import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/geometry", label: "Geometry" },
  { to: "/traffic", label: "Traffic" },
  { to: "/signal", label: "Signal" },
  { to: "/results", label: "Results" },
  { to: "/simulation", label: "Simulation" },
  { to: "/compare", label: "Compare" },
];

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white shadow">
        <div className="w-full px-6 xl:px-10 py-4">
          <h1 className="text-xl font-bold">Traffic Simulation System</h1>
          <p className="text-sm text-slate-300">
            Web-based signalized intersection analysis and visualization
          </p>
        </div>
      </header>

      <div className="w-full px-4 md:px-6 xl:px-8 py-6">
        <div className="grid grid-cols-12 gap-3 xl:gap-4 items-start">
          {/* Sidebar (smaller) */}
          <aside className="col-span-12 md:col-span-2 xl:col-span-1">
            <nav className="bg-white rounded-2xl shadow p-3 space-y-2 sticky top-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2 text-xs font-medium transition ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>

          {/* Main Workspace (much larger) */}
          <main className="col-span-12 md:col-span-10 xl:col-span-11">
            <div className="bg-white rounded-2xl shadow min-h-[80vh] w-full p-2 md:p-4 xl:p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}