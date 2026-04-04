import { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import SplashScreen from "./components/SplashScreen";
import Overview from "./pages/Overview";
import LiveOrders from "./pages/LiveOrders";
import ScoreOrder from "./pages/ScoreOrder";
import BuyerManagement from "./pages/BuyerManagement";
import Analytics from "./pages/Analytics";
import RuleConfig from "./pages/RuleConfig";
import ModelInsights from "./pages/ModelInsights";
import Config from "./pages/Config";
import ReviewAnalysis from "./pages/ReviewAnalysis";
import ReviewDashboard from "./pages/ReviewDashboard";
import ReviewIntelligence from "./pages/ReviewIntelligence";
import SuspiciousProducts from "./pages/SuspiciousProducts";
import ProductInsights from "./pages/ProductInsights";

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Overview />} />

            <Route path="live-orders" element={<LiveOrders />} />
            <Route path="score-order" element={<ScoreOrder />} />
            <Route path="buyer-management" element={<BuyerManagement />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="rule-config" element={<RuleConfig />} />
            <Route path="model-insights" element={<ModelInsights />} />
            <Route path="config" element={<Config />} />
            <Route path="review-analysis" element={<ReviewAnalysis />} />
            <Route path="review-dashboard" element={<ReviewDashboard />} />
            <Route path="review-intelligence" element={<ReviewIntelligence />} />
            <Route path="suspicious-products" element={<SuspiciousProducts />} />
            <Route path="product-insights" element={<ProductInsights />} />
          </Route>
        </Routes>
      </Router>
    </>
  );
}

