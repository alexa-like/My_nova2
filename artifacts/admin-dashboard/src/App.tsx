import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { isAuthenticated } from "@/lib/api";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Users from "@/pages/Users";
import Broadcast from "@/pages/Broadcast";
import Codes from "@/pages/Codes";
import Analytics from "@/pages/Analytics";
import Logs from "@/pages/Logs";

function NotFound() {
  return (
    <div className="flex items-center justify-center h-full text-gray-500">
      Page not found
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Layout onLogout={() => setAuthed(false)}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/users" component={Users} />
          <Route path="/broadcast" component={Broadcast} />
          <Route path="/codes" component={Codes} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/logs" component={Logs} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </WouterRouter>
  );
}
