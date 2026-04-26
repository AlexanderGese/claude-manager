type Shell = "bash" | "zsh" | "fish";

// The shell function passes the user's args straight to the binary, then
// distinguishes two kinds of stdout:
//   - resume line:  starts with "cd " AND contains "&& exec " → eval (the only
//     way to get the parent shell to actually cd into the saved project dir)
//   - anything else (doctor output, scan summary, init wrapper, --help, ...)
//     → just print so the user sees it
const POSIX_FN = `cm() {
  local out
  out=$(command claude-manager "$@") || return $?
  case "$out" in
    "" ) return 0 ;;
    "cd "*"&& exec "* ) eval "$out" ;;
    * ) printf '%s\\n' "$out" ;;
  esac
}
`;

const FISH_FN = `function cm
  set -l out (command claude-manager $argv)
  or return $status
  switch "$out"
    case ''
      return 0
    case 'cd *&& exec *'
      eval $out
    case '*'
      printf '%s\\n' $out
  end
end
`;

export function renderInit(shell: Shell | string): string {
  switch (shell) {
    case "bash":
    case "zsh":
      return POSIX_FN;
    case "fish":
      return FISH_FN;
    default:
      return `# falling back to bash-style wrapper for shell '${shell}'\n` + POSIX_FN;
  }
}

export function run(args: string[]): void {
  const shell = (args[0] ?? detectShell()) as Shell;
  process.stdout.write(renderInit(shell));
}

function detectShell(): Shell {
  const s = process.env.SHELL ?? "";
  if (s.endsWith("/fish")) return "fish";
  if (s.endsWith("/zsh"))  return "zsh";
  return "bash";
}
