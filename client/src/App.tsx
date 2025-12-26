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
import Participants from "@/pages/Participants";
import ResetPassword from "@/pages/ResetPassword";
import MetabolicAge from "@/pages/MetabolicAge";

function ProtectedRoute({ component: Component, allowForceReset = false }: { component: () => React.JSX.Element; allowForceReset?: boolean }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

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

  if (user.forcePasswordReset && !allowForceReset && location !== '/reset-password') {
    return <Redirect to="/reset-password" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/reset-password">{() => <ProtectedRoute component={ResetPassword} allowForceReset />}</Route>
        <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
        <Route path="/trends">{() => <ProtectedRoute component={Trends} />}</Route>
        <Route path="/food">{() => <ProtectedRoute component={FoodLog} />}</Route>
        <Route path="/messages">{() => <ProtectedRoute component={Messages} />}</Route>
        <Route path="/reports">{() => <ProtectedRoute component={Reports} />}</Route>
        <Route path="/metabolic-age">{() => <ProtectedRoute component={MetabolicAge} />}</Route>
        <Route path="/admin/prompts">{() => <ProtectedRoute component={PromptsAdmin} />}</Route>
        <Route path="/admin/participants">{() => <ProtectedRoute component={Participants} />}</Route>
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
