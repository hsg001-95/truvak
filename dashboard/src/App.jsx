import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Overview from "./pages/Overview";
import LiveOrders from "./pages/LiveOrders";
import ScoreOrder from "./pages/ScoreOrder";
import BuyerManagement from "./pages/BuyerManagement";
import Analytics from "./pages/Analytics";
import RuleConfig from "./pages/RuleConfig";
import ModelInsights from "./pages/ModelInsights";
import Config from "./pages/Config";

export default function App() {
  return (
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
        </Route>
      </Routes>
    </Router>
  );
}
