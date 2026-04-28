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

const BASH_COMPLETE = `
_cm_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local names
  names="$(command claude-manager completions 2>/dev/null)"
  COMPREPLY=( $(compgen -W "$names" -- "$cur") )
}
complete -F _cm_complete cm
`;

// Modern zsh completion via compdef + compadd. compctl (the legacy API the
// previous version used) silently no-ops on most real setups (Oh-My-Zsh,
// Prezto, etc). If compinit hasn't run yet, try to load it ourselves so the
// eval works regardless of where the user puts it in their rc.
const ZSH_COMPLETE = `
if (( ! \${+functions[compdef]} )); then
  autoload -Uz compinit 2>/dev/null
  compinit -u 2>/dev/null
fi
if (( \${+functions[compdef]} )); then
  _cm_complete() {
    local -a items
    items=("\${(@f)$(command claude-manager completions 2>/dev/null)}")
    compadd -a items
  }
  compdef _cm_complete cm
fi
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

const FISH_COMPLETE = `
function __cm_complete
  command claude-manager completions 2>/dev/null
end
complete -c cm -f -a "(__cm_complete)"
`;

export function renderInit(shell: Shell | string): string {
  switch (shell) {
    case "bash":
      return POSIX_FN + BASH_COMPLETE;
    case "zsh":
      return POSIX_FN + ZSH_COMPLETE;
    case "fish":
      return FISH_FN + FISH_COMPLETE;
    default:
      return `# falling back to bash-style wrapper for shell '${shell}'\n` + POSIX_FN + BASH_COMPLETE;
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
