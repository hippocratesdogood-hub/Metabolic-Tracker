import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { DataProvider } from "@/lib/mockData";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Trends from "@/pages/Trends";
import FoodLog from "@/pages/FoodLog";
import Messages from "@/pages/Messages";
import Reports from "@/pages/Reports";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/trends" component={Trends} />
        <Route path="/food" component={FoodLog} />
        <Route path="/messages" component={Messages} />
        <Route path="/reports" component={Reports} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </DataProvider>
    </QueryClientProvider>
  );
}

export default App;
