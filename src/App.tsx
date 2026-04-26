import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { GridSignalPage } from "./pages/GridSignalPage";
import { OverviewPage } from "./pages/OverviewPage";
import { WhaleTrackerPage } from "./pages/WhaleTrackerPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="/whale-tracker" element={<WhaleTrackerPage />} />
        <Route path="/grid-signals" element={<GridSignalPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
