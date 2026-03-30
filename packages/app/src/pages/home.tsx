import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";

export function HomePage() {
  const navigate = useNavigate();

  onMount(() => {
    // Sessions require a workspace — redirect to workspace list
    navigate("/workspaces", { replace: true });
  });

  return (
    <div class="flex h-full items-center justify-center">
      <div class="text-sm text-[var(--text-muted)]">Redirecting...</div>
    </div>
  );
}
