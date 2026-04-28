# claude-manager — full feature demo
# Renders ../assets/demo.gif. Run from repo root: vhs tapes/demo.tape
#
# Beats:
#   1. open the TUI (default coral theme)
#   2. browse + live fuzzy search
#   3. cycle through all 4 views (sessions / overview / projects / help)
#   4. theme cycle (coral → catppuccin → gruvbox → nord → mono → coral)
#   5. cm <name> exact-match resume (just shows the resume line, doesn't
#      actually exec — vhs ends after the line is printed)
#   6. --help banner with the coral CM logo
#
# Total runtime ≈ 70s. Edit the Sleep values to retime.

Output assets/demo.gif

Set FontSize 14
Set Width 1500
Set Height 900
Set Padding 24
Set Theme "Catppuccin Mocha"
Set Shell "zsh"
Set TypingSpeed 55ms

# ─── 1. Open the TUI ─────────────────────────────────────────────────────────
Type "cm"
Sleep 250ms
Enter
Sleep 1600ms

# Browse with arrow keys (let the section headers / coral select bar shine)
Down 4
Sleep 500ms
Down 3
Sleep 500ms
Up 2
Sleep 800ms

# ─── 2. Live fuzzy search ────────────────────────────────────────────────────
Type "claude"
Sleep 1500ms
Backspace 6
Sleep 500ms

# ─── 3. Cycle through views ──────────────────────────────────────────────────
Tab
Sleep 2400ms      # overview — cost panel + 30-day sparkline + by-model breakdown
Tab
Sleep 2200ms      # projects — coral activity bars per cwd
Tab
Sleep 2200ms      # help — full keymap reference
Tab
Sleep 700ms       # back to sessions

# Quit
Type "q"
Sleep 500ms

# ─── 4. Theme cycle ──────────────────────────────────────────────────────────
Type "claude-manager theme catppuccin"
Enter
Sleep 700ms
Type "cm"
Enter
Sleep 1800ms
Down 3
Sleep 500ms
Tab
Sleep 1400ms      # overview in catppuccin pinks
Type "q"
Sleep 500ms

Type "claude-manager theme gruvbox"
Enter
Sleep 500ms
Type "cm"
Enter
Sleep 1700ms
Tab
Sleep 1300ms      # overview in gruvbox orange
Type "q"
Sleep 400ms

Type "claude-manager theme nord"
Enter
Sleep 500ms
Type "cm"
Enter
Sleep 1700ms
Type "q"
Sleep 400ms

Type "claude-manager theme mono"
Enter
Sleep 500ms
Type "cm"
Enter
Sleep 1500ms
Type "q"
Sleep 400ms

# Restore coral
Type "claude-manager theme coral"
Enter
Sleep 600ms

# ─── 5. cm <name> — exact custom_name match prints the resume line ──────────
Type "cm auth-rewrite"
Sleep 200ms
Enter
Sleep 1800ms

# ─── 6. The help banner with the CM logo ────────────────────────────────────
Type "claude-manager --help"
Enter
Sleep 3000ms
