ADR-008: Use Zustand for Frontend State Management

Status: Accepted
Date: 2026-10-16

Context

The CosmosVote frontend needs a client-side state management solution to handle:

- Wallet connection state and account balances
- Proposal data and voting state
- Transaction status and loading indicators
- User preferences and UI state

The team evaluated several options including React Context, Redux, and Jotai before choosing Zustand.

Decision

Use Zustand as the primary state management library for the frontend.

Rationale

- Zustand provides a minimal API with hooks-based access, avoiding the boilerplate of Redux
- Unlike React Context, Zustand doesn't cause unnecessary re-renders when only a slice of state changes
- The bundle size is significantly smaller than Redux (~1KB vs ~12KB for the full Redux toolkit)
- TypeScript support is first-class, with automatic type inference from store definitions
- The middleware ecosystem (persist, devtools, immer) covers all our needs without adding dependencies
- Jotai was considered but its atomic model adds complexity for a app with relatively few global state slices
- React Context was rejected because it would require splitting state into many providers and still cause re-render issues

Consequences

- All global state lives in individual Zustand stores under frontend/src/stores/
- Components subscribe only to the state slices they need, minimizing re-renders
- Persist middleware handles localStorage sync for wallet connection state
- DevTools middleware enables time-travel debugging during development
- New state slices should follow the existing store pattern (create + selector hooks)
