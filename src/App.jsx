import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { GeneratorProvider } from "./GeneratorContext.jsx";
import Generate from "./Generate.jsx";
import SavedPlans from "./SavedPlans.jsx";
import ConfluenceLayout from "./confluence/ConfluenceLayout.jsx";
import SpaceRoot from "./confluence/SpaceRoot.jsx";
import FolderView from "./confluence/FolderView.jsx";
import PageView from "./confluence/PageView.jsx";
import PublishPlan from "./confluence/PublishPlan.jsx";

export default function App() {
  return (
    <GeneratorProvider>
      <div className="app-root">
        <header className="topbar">
          <div className="topbar-brand">
            <span className="brand-badge">SC</span>
            <div>
              <strong>SpeedyCourse QA</strong>
              <small>Test Plan Studio</small>
            </div>
          </div>

          <nav className="topnav">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Generate
            </NavLink>
            <NavLink
              to="/saved"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Saved Plans
            </NavLink>
            <NavLink
              to="/confluence"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Confluence
            </NavLink>
          </nav>
        </header>

        <main className="app-content">
          <Routes>
            <Route path="/" element={<Generate />} />
            <Route
              path="/saved"
              element={
                <div className="page-pad">
                  <SavedPlans />
                </div>
              }
            />
            <Route path="/confluence" element={<ConfluenceLayout />}>
              <Route index element={<SpaceRoot />} />
              <Route path="folders/:folderId" element={<FolderView />} />
              <Route path="pages/:pageId" element={<PageView />} />
              <Route path="publish" element={<PublishPlan />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </GeneratorProvider>
  );
}
