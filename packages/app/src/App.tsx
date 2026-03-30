import { Router, Route } from "@solidjs/router";
import type { RouteSectionProps } from "@solidjs/router";
import { AppLayout } from "./components/layout/app-layout";
import { WorkspacePickerPage } from "./pages/workspace-picker";
import { WorkspacePage } from "./pages/workspace";
import { SessionPage } from "./pages/session";
import { SettingsPage } from "./pages/settings";

function LayoutWrapper(props: RouteSectionProps) {
  return <AppLayout>{props.children}</AppLayout>;
}

export default function App() {
  return (
    <Router root={LayoutWrapper}>
      <Route path="/" component={WorkspacePickerPage} />
      <Route path="/workspaces/:id" component={WorkspacePage} />
      <Route path="/workspaces/:workspaceId/sessions/:sessionId" component={SessionPage} />
      <Route path="/settings" component={SettingsPage} />
    </Router>
  );
}
