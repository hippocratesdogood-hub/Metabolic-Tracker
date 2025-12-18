import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DataProvider } from "@/lib/dataAdapter";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Trends from "@/pages/Trends";
import FoodLog from "@/pages/FoodLog";
import Messages from "@/pages/Messages";
import Reports from "@/pages/Reports";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import PromptsAdmin from "@/pages/PromptsAdmin";
import AdminDashboard from "@/pages/AdminDashboard";

function ProtectedRoute({ component: Component }: { component: () => React.JSX.Element }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
        <Route path="/trends">{() => <ProtectedRoute component={Trends} />}</Route>
        <Route path="/food">{() => <ProtectedRoute component={FoodLog} />}</Route>
        <Route path="/messages">{() => <ProtectedRoute component={Messages} />}</Route>
        <Route path="/reports">{() => <ProtectedRoute component={Reports} />}</Route>
        <Route path="/admin/prompts">{() => <ProtectedRoute component={PromptsAdmin} />}</Route>
        <Route path="/admin">{() => <ProtectedRoute component={AdminDashboard} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DataProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
