# claude-manager — hero shot
# Renders ../assets/hero.gif. Run from repo root: vhs tapes/hero.tape

Output assets/hero.gif

Set FontSize 16
Set Width 1400
Set Height 800
Set Padding 24
Set Theme "Catppuccin Mocha"
Set Shell "zsh"
Set TypingSpeed 60ms

# Open the TUI directly. pick.ts auto-detects that stdout is a real TTY
# (ttyd's pseudo-terminal) and renders Ink there, so vhs captures it.
Type "claude-manager"
Sleep 200ms
Enter
Sleep 1500ms

# Browse a bit
Down 3
Sleep 600ms
Down 2
Sleep 600ms
Up 1
Sleep 800ms

# Switch to overview
Tab
Sleep 1800ms

# Switch to projects
Tab
Sleep 1800ms

# Help
Tab
Sleep 1500ms

# Back to sessions
Tab
Sleep 600ms

# Quit (no resume)
Type "q"
Sleep 400ms

# Show the help text after closing the TUI
Type "claude-manager --help"
Sleep 200ms
Enter
Sleep 1500ms
