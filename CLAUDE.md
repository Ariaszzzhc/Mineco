# Claude.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

# Refactoring

This codebase is under refactoring. `backup/` is the original codebase

# Project Overview

Mineco is a multi-frontend coding agent. Client/Server architechture.
`packages/app` for web, `packages/desktop` for turi based desktop app (webview
is `app`). `packages/core` is the core server. All frontend is thin wrapper.

# Rules

do not run dev server. if you want to test, you should use unit test
