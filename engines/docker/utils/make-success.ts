export interface CommandSuccess {
  command?: unknown;
  args?: unknown;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  all?: string;
}
export default ({
  all,
  args,
  command,
  stdout,
  stderr,
}: Omit<CommandSuccess, 'exitCode'>): CommandSuccess => ({
  command,
  args,
  exitCode: 0,
  stdout,
  stderr,
  all,
});
