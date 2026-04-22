import { createBrowserRouter } from "react-router";
import { Layout } from "./layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { StoreOperationsPage } from "./pages/StoreOperationsPage";
import { SalesAnalysisPage } from "./pages/SalesAnalysisPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AIInsightsPage } from "./pages/AIInsightsPage";
import { ActionsPage } from "./pages/ActionsPage";
import { IssuesPage } from "./pages/IssuesPage";
import { AlertsPage } from "./pages/AlertsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: DashboardPage },
      { path: "dashboard", Component: DashboardPage },
      { path: "store-ops", Component: StoreOperationsPage },
      { path: "sales", Component: SalesAnalysisPage },
      { path: "inventory", Component: InventoryPage },
      { path: "reports", Component: ReportsPage },
      { path: "ai-insights", Component: AIInsightsPage },
      { path: "actions", Component: ActionsPage },
      { path: "issues", Component: IssuesPage },
      { path: "alerts", Component: AlertsPage },
    ],
  },
]);