import React, { Suspense, lazy } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DataProvider } from "@/lib/dataAdapter";
import Layout from "@/components/Layout";
import { Loader2 } from "lucide-react";

// Critical path - load immediately
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";

// Lazy load non-critical routes for better initial bundle size
const Trends = lazy(() => import("@/pages/Trends"));
const FoodLog = lazy(() => import("@/pages/FoodLog"));
const Messages = lazy(() => import("@/pages/Messages"));
const Reports = lazy(() => import("@/pages/Reports"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const MetabolicAge = lazy(() => import("@/pages/MetabolicAge"));

// Lazy load admin routes (rarely used, heavy components)
const PromptsAdmin = lazy(() => import("@/pages/PromptsAdmin"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const Participants = lazy(() => import("@/pages/Participants"));
const AIReports = lazy(() => import("@/pages/AIReports"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({
  component: Component,
  allowForceReset = false,
  allowedRoles,
}: {
  component: () => React.JSX.Element;
  allowForceReset?: boolean;
  allowedRoles?: string[];
}) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004aad]"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.forcePasswordReset && !allowForceReset && location !== '/reset-password') {
    return <Redirect to="/reset-password" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Redirect to={user.role === 'participant' ? '/' : '/admin'} />;
  }

  return <Component />;
}

function Router() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Critical path - not lazy loaded */}
          <Route path="/login" component={Login} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/">{() => <ProtectedRoute component={Dashboard} allowedRoles={['participant']} />}</Route>

          {/* Lazy loaded participant routes */}
          <Route path="/reset-password">{() => <ProtectedRoute component={ResetPassword} allowForceReset />}</Route>
          <Route path="/trends">{() => <ProtectedRoute component={Trends} allowedRoles={['participant']} />}</Route>
          <Route path="/food">{() => <ProtectedRoute component={FoodLog} allowedRoles={['participant']} />}</Route>
          <Route path="/messages">{() => <ProtectedRoute component={Messages} />}</Route>
          <Route path="/reports">{() => <ProtectedRoute component={Reports} allowedRoles={['participant']} />}</Route>
          <Route path="/metabolic-age">{() => <ProtectedRoute component={MetabolicAge} allowedRoles={['participant']} />}</Route>

          {/* Lazy loaded admin routes */}
          <Route path="/admin/prompts">{() => <ProtectedRoute component={PromptsAdmin} allowedRoles={['admin']} />}</Route>
          <Route path="/admin/analytics">{() => <ProtectedRoute component={AdminAnalytics} allowedRoles={['admin', 'coach']} />}</Route>
          <Route path="/admin/ai-reports">{() => <ProtectedRoute component={AIReports} allowedRoles={['admin', 'coach']} />}</Route>
          <Route path="/admin/participants">{() => <ProtectedRoute component={Participants} allowedRoles={['admin', 'coach']} />}</Route>
          <Route path="/admin">{() => <ProtectedRoute component={AdminDashboard} allowedRoles={['admin', 'coach']} />}</Route>

          <Route component={NotFound} />
        </Switch>
      </Suspense>
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
