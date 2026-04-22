import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { RequireSellerProfile } from "@/components/guards/RequireSellerProfile";
import { RequireWallet } from "@/components/guards/RequireWallet";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/NotFound";
import Onboarding from "@/pages/Onboarding";
import SellerHome from "@/pages/SellerHome";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/seller"
          element={
            <RequireWallet>
              <RequireSellerProfile>
                <SellerHome />
              </RequireSellerProfile>
            </RequireWallet>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RequireWallet>
              <Onboarding />
            </RequireWallet>
          }
        />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
