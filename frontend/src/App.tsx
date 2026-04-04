import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import GeometryPage from "./pages/GeometryPage";
import TrafficPage from "./pages/TrafficPage";
import SignalPage from "./pages/SignalPage";
import ResultsPage from "./pages/ResultsPage";
import SimulationPage from "./pages/SimulationPage";
import ComparePage from "./pages/ComparePage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="geometry" element={<GeometryPage />} />
          <Route path="traffic" element={<TrafficPage />} />
          <Route path="signal" element={<SignalPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}