// SPDX-License-Identifier: MIT
//
// Demo seed — the canonical "fix comment box + optimistic updates" scenario
// from the v4 prototype (`data.js`), materialized as a finished round-1
// transcript. Used so the Liquid Glass UI is immediately visible before a real
// `mineco-core` is bundled / a live session streams. AppModel seeds this when
// no sessions come back from `session/list`.

import Foundation

enum Scenario {
    /// Build the seed session: metadata + the full round-1 conversation.
    static func session() -> Session {
        Session(
            id: "demo-comment-optimistic",
            title: "Fix comment box + add optimistic updates",
            branch: "fix/comment-optimistic",
            repo: "acme/web-client",
            updatedAt: "now",
            conversation: conversation()
        )
    }

    /// A few extra "recent" threads for the sidebar.
    static func recentThreads() -> [Session] {
        [
            Session(id: "demo-auth", title: "Migrate auth to httpOnly cookies",
                    branch: "feat/auth-cookies", repo: "acme/web-client", updatedAt: "2h"),
            Session(id: "demo-darkmode", title: "Dark mode for settings page",
                    branch: "feat/settings-dark", repo: "acme/web-client", updatedAt: "yesterday"),
            Session(id: "demo-checkout", title: "Flaky checkout e2e test",
                    branch: "fix/checkout-e2e", repo: "acme/web-client", updatedAt: "mon"),
        ]
    }

    static func conversation() -> Conversation {
        var c = Conversation()

        // Task header
        c.append(.task(
            eyebrow: "Task · fix/comment-optimistic",
            title: "Fix comment box + add optimistic updates"
        ))

        // User turn
        c.append(.user(
            text: "The comment box doesn't clear after you post, and there's no loading feedback. Can you fix that and make new comments show up instantly (optimistic), rolling back if the request fails?",
            time: "09:41"
        ))

        // Agent turn
        c.append(.agentByline(time: "09:41"))
        c.append(.prose(text: agentIntro))
        c.append(.plan(items: todos))
        c.append(.trace(steps: traceSteps))
        c.append(.diff(path: diffPath, add: 14, del: 3, rows: diffRows))
        c.append(.terminal(cmd: "pnpm test comments", lines: termLines, okLabel: "3 passed", running: false))
        c.append(.prose(text: agentOutro))
        c.append(.actions([
            ActionButton(label: "Review & commit", symbol: "git-branch", primary: true),
            ActionButton(label: "Apply same pattern to replies"),
        ]))

        return c
    }

    // MARK: - Content (mirrors data.js)

    private static let agentIntro =
        "On it. I'll add an optimistic insert so the comment appears the moment you hit send, clear the box, and roll it back with a toast if the API call fails."
    private static let agentOutro =
        "Done — the box now clears instantly and new comments render optimistically. All three tests pass. Want me to apply the same pattern to replies?"

    private static let todos: [PlanItem] = [
        .init(id: "t1", label: "Locate the comment submit handler", state: .done),
        .init(id: "t2", label: "Insert optimistic comment on submit", state: .done),
        .init(id: "t3", label: "Clear textarea + show pending state", state: .done),
        .init(id: "t4", label: "Roll back the optimistic item on error", state: .done),
        .init(id: "t5", label: "Run the CommentList test suite", state: .done),
    ]

    private static let traceSteps: [TraceStep] = [
        .init(id: "s1", kind: .search, title: "Searched code", detail: "handleSubmit · components/comments",
              result: "3 matches", ok: false, duration: "0.4s", state: .done),
        .init(id: "s2", kind: .read, title: "Read file", detail: "CommentBox.tsx",
              result: "128 lines", ok: false, duration: "0.2s", state: .done),
        .init(id: "s3", kind: .think, title: "Reasoned about state flow", detail: "submit → await post → refetch list",
              result: "plan ready", ok: false, duration: "1.1s", state: .done),
        .init(id: "s4", kind: .edit, title: "Edited file", detail: "CommentBox.tsx",
              result: "+14 −3", ok: true, duration: "3.6s", state: .done),
        .init(id: "s5", kind: .run, title: "Run tests", detail: "pnpm test comments",
              result: "3 passed", ok: true, duration: "2.9s", state: .done),
    ]

    private static let diffPath = "src/components/comments/CommentBox.tsx"

    private static let diffRows: [DiffRow] = [
        .init(kind: .ctx, number: "41", code: "  async function handleSubmit(e: FormEvent) {"),
        .init(kind: .ctx, number: "42", code: "    e.preventDefault();"),
        .init(kind: .del, number: "−", code: "    const saved = await api.postComment(draft);"),
        .init(kind: .del, number: "−", code: "    setComments(await api.list());"),
        .init(kind: .add, number: "+", code: "    const optimistic = makePending(draft, me);"),
        .init(kind: .add, number: "+", code: "    setComments(prev => [...prev, optimistic]);"),
        .init(kind: .add, number: "+", code: "    setDraft('');                 // clear box"),
        .init(kind: .add, number: "+", code: "    try {"),
        .init(kind: .add, number: "+", code: "      const saved = await api.postComment(draft);"),
        .init(kind: .add, number: "+", code: "      reconcile(optimistic.id, saved);"),
        .init(kind: .add, number: "+", code: "    } catch (err) {"),
        .init(kind: .add, number: "+", code: "      rollback(optimistic.id);    // restore on fail"),
        .init(kind: .add, number: "+", code: "      toast.error('Could not post comment');"),
        .init(kind: .add, number: "+", code: "    }"),
        .init(kind: .ctx, number: "53", code: "  }"),
    ]

    private static let termLines: [TermLine] = [
        .init(prompt: "$", text: "pnpm test comments", style: .plain),
        .init(prompt: "", text: "PASS  src/components/comments/CommentBox.test.tsx", style: .ok),
        .init(prompt: "", text: "  ✓ clears the textarea after submit (24 ms)", style: .ok),
        .init(prompt: "", text: "  ✓ shows optimistic comment immediately (11 ms)", style: .ok),
        .init(prompt: "", text: "  ✓ rolls back when the API rejects (31 ms)", style: .ok),
        .init(prompt: "", text: "Tests: 3 passed, 3 total", style: .dim),
    ]
}
