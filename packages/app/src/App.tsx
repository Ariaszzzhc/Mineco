import { Router, Route } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import { AppLayout } from "./components/layout/app-layout";
import { HomePage } from "./pages/home";
import { SessionPage } from "./pages/session";
import { SettingsPage } from "./pages/settings";

function LayoutWrapper(props: RouteSectionProps) {
  return <AppLayout>{props.children}</AppLayout>;
}

export default function App() {
  return (
    <Router root={LayoutWrapper}>
      <Route path="/" component={HomePage} />
      <Route path="/sessions/:id" component={SessionPage} />
      <Route path="/settings" component={SettingsPage} />
    </Router>
  );
}
