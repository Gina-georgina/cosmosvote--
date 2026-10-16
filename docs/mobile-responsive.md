# Mobile Responsive Design

The CosmosVote frontend is fully responsive and optimized for mobile devices.

## Header Navigation

### Desktop (> 768px)

- Horizontal navigation bar with links
- Wallet info displayed in header
- Theme toggle always visible

### Mobile (≤ 768px)

**Issue #135 / #280** - Responsive hamburger menu implementation

Features:
- ✅ Hamburger menu toggle appears on screens < 768px
- ✅ Navigation links collapse into slide-out drawer
- ✅ Drawer opens/closes with keyboard (Enter/Escape)
- ✅ All navigation links accessible in drawer
- ✅ Wallet controls move to drawer on small screens
- ✅ Tested on iOS Safari and Android Chrome

### Breakpoints

| Viewport | Behavior |
|----------|----------|
| > 768px | Full desktop layout with horizontal nav |
| ≤ 768px | Hamburger menu, collapsible drawer |
| ≤ 480px | Connect button moves to drawer |
| ≤ 320px | Further spacing/sizing optimizations |

## Accessibility

The mobile menu is fully accessible:

- **ARIA attributes**: `aria-expanded`, `aria-controls`, `aria-hidden`, `aria-label`
- **Keyboard navigation**: 
  - Enter/Space to open/close hamburger
  - Escape to close drawer
  - Tab to navigate links within drawer
- **Focus management**: Focus returns to hamburger button when closed
- **Screen reader friendly**: Proper labels and semantic HTML

## Implementation

See:
- `frontend/src/components/Header.tsx` - Component logic
- `frontend/src/components/Header.module.css` - Responsive styles
- `frontend/src/components/Header.test.tsx` - Accessibility tests

## Testing Mobile Layout

### Manual Testing

1. Open the app in a browser
2. Open DevTools (F12)
3. Toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M)
4. Test different viewports:
   - iPhone SE (375px)
   - iPhone 12 Pro (390px)
   - iPad (768px)
   - Galaxy S20 (360px)

### Automated Testing

```bash
cd frontend
npm run test -- Header.test.tsx
```

Tests cover:
- Hamburger button rendering
- Menu open/close interactions
- Keyboard navigation (Escape key)
- ARIA attributes
- Navigation link accessibility

### Browser Testing

Recommended test matrix:
- ✅ Chrome Android
- ✅ iOS Safari
- ✅ Firefox Android
- ✅ Samsung Internet

## Future Enhancements

- [ ] Add swipe gestures to open/close drawer
- [ ] Implement focus trap inside open drawer
- [ ] Add smooth scroll animations
- [ ] Support for reduced motion preferences
- [ ] Touch-optimized button sizes (min 44x44px)

## Related

- Issue #135: Add mobile-responsive navigation menu with hamburger toggle
- Issue #280: Implement responsive header and mobile menu (original implementation)
- `docs/frontend-testing.md` - Frontend testing guidelines
- `frontend/src/responsive.css` - Global responsive utilities
