import "./index.css";
import type { RouteSectionProps } from "@solidjs/router";
import { Route, Router } from "@solidjs/router";
import { I18nProvider } from "./i18n/index.tsx";
import { AppLayout } from "./components/layout/app-layout";
import { SessionPage } from "./pages/session";
import { SettingsPage } from "./pages/settings";
import { SkillsPage } from "./pages/skills";
import { StatsPage } from "./pages/stats";
import { WorkspacePage } from "./pages/workspace";
import { WorkspacePickerPage } from "./pages/workspace-picker";

function LayoutWrapper(props: RouteSectionProps) {
  return <AppLayout>{props.children}</AppLayout>;
}

export default function App() {
  return (
    <I18nProvider>
      <Router root={LayoutWrapper}>
        <Route path="/" component={WorkspacePickerPage} />
        <Route path="/workspaces/:id" component={WorkspacePage} />
        <Route
          path="/workspaces/:workspaceId/sessions/:sessionId"
          component={SessionPage}
        />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/stats" component={StatsPage} />
        <Route path="/workspaces/:id/skills" component={SkillsPage} />
      </Router>
    </I18nProvider>
  );
}
