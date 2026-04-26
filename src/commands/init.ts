type Shell = "bash" | "zsh" | "fish";

const POSIX_FN = `cm() {
  local out
  out=$(command claude-manager pick "$@") || return $?
  [ -n "$out" ] && eval "$out"
}
`;

const FISH_FN = `function cm
  set -l out (command claude-manager pick $argv)
  or return $status
  test -n "$out"; and eval $out
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
