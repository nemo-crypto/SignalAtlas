import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AShareFundDetailPage } from "./pages/AShareFundDetailPage";
import { AShareSectorFundsPage } from "./pages/AShareSectorFundsPage";
import { GridSignalPage } from "./pages/GridSignalPage";
import { HkFundDetailPage } from "./pages/HkFundDetailPage";
import { HkSectorFundsPage } from "./pages/HkSectorFundsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { WhaleTrackerPage } from "./pages/WhaleTrackerPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="/whale-tracker" element={<WhaleTrackerPage />} />
        <Route path="/grid-signals" element={<GridSignalPage />} />
        <Route path="/ashare-funds" element={<AShareSectorFundsPage />} />
        <Route path="/ashare-funds/:code" element={<AShareFundDetailPage />} />
        <Route path="/a-share-sector-funds" element={<AShareSectorFundsPage />} />
        <Route path="/a-share-sector-funds/:code" element={<AShareFundDetailPage />} />
        <Route path="/hk-funds" element={<HkSectorFundsPage />} />
        <Route path="/hk-funds/:code" element={<HkFundDetailPage />} />
        <Route path="/hk-sector-funds" element={<HkSectorFundsPage />} />
        <Route path="/hk-sector-funds/:code" element={<HkFundDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
