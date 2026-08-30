self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.dispatch;
  inherit (pkgs.stdenv.hostPlatform) system;

  # soft reaches this through the ident map below, the daemon as itself.
  databaseUrl = "postgresql://dispatch@/dispatch?host=/run/postgresql";

  # Bare clones dispatch owns, under its StateDirectory.
  reposDir = "/var/lib/dispatch/repos";
in
{
  options.services.dispatch = {
    enable = lib.mkEnableOption "the dispatch agent station";

    claudeBin = lib.mkOption {
      type = lib.types.str;
      example = "\${inputs.setup.packages.\${system}.claude-code-wrapped}/bin/claude";
      description = ''
        Claude Code executable the agents run. A consumer option so the station
        isn't bound to one wrapper.
      '';
    };

    model = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "sonnet";
      description = ''
        Model the agents run, named as `claude --model` names it. Null leaves
        the variable unset, so the default stays in one place: the code.
      '';
    };

    gitPackage = lib.mkOption {
      type = lib.types.package;
      default = pkgs.git;
      example = "inputs.setup.packages.\${system}.git-wrapped";
      description = ''
        Git the daemon runs for worktrees, outside the agent. Pass the wrapper
        the Claude package carries so both see the same config.
      '';
    };

    tokenFile = lib.mkOption {
      type = lib.types.path;
      description = ''
        File holding `CLAUDE_CODE_OAUTH_TOKEN=...`, as produced by
        `claude setup-token`. Read at start, so an agenix secret fits. The token
        expires after a year.
      '';
    };

    githubTokenFile = lib.mkOption {
      type = lib.types.path;
      description = ''
        File holding `GH_TOKEN=...`. Agents push branches and open pull requests
        with it, so the daemon never needs its own ssh key.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    # The operator commands (new-task, tasks, run) are the same binary.
    environment.systemPackages = [ self.packages.${system}.default ];
    environment.variables.DISPATCH_DATABASE_URL = databaseUrl;

    # The daemon needs write access to every repository it works on.
    users.users.dispatch = {
      isSystemUser = true;
      group = "dispatch";
    };

    users.groups.dispatch = { };

    # Peer authentication over the socket matches the system user to the role,
    # and ensureDBOwnership only grants a role its same-named database.
    services.postgresql = {
      enable = true;
      ensureDatabases = [ "dispatch" ];
      ensureUsers = [
        {
          name = "dispatch";
          ensureDBOwnership = true;
        }
      ];

      # soft logs in as the dispatch role rather than getting one of its own,
      # so there is no second set of privileges to keep in step.
      identMap = ''
        dispatch-admins dispatch dispatch
        dispatch-admins soft dispatch
      '';

      authentication = "local dispatch dispatch peer map=dispatch-admins";
    };

    systemd.services.dispatch = {
      description = "Dispatch agent station";
      wantedBy = [ "multi-user.target" ];
      after = [
        "network.target"
        "postgresql.service"
      ];
      requires = [ "postgresql.service" ];

      # A unit has no ambient PATH: git for worktree.ts, the rest for the agent's
      # own tools, which have nothing to run without them.
      path = [
        cfg.gitPackage
        pkgs.bashInteractive
        pkgs.gh
        pkgs.nix
        pkgs.nodejs
      ];

      environment = {
        # A unit does not inherit environment.variables.
        DISPATCH_DATABASE_URL = databaseUrl;
        DISPATCH_REPOS = reposDir;
        DISPATCH_MIGRATIONS = "${self.packages.${system}.default}/libexec/migrations";
        # A null value is dropped from the unit rather than set empty, which is
        # what leaves the default to the one in the code.
        DISPATCH_MODEL = cfg.model;
        CLAUDE_BIN = cfg.claudeBin;
        CLAUDE_CONFIG_DIR = "/var/lib/dispatch/claude";

        # The dispatch user's home is /var/empty, so anything the agent runs
        # that wants one — `npm ci` first among them — fails. The StateDirectory
        # is the writable path systemd already creates and the daemon owns.
        HOME = "/var/lib/dispatch";

        # git has no credentials of its own here; gh supplies them from GH_TOKEN.
        # Injected rather than written to a config file because the git wrapper
        # already owns GIT_CONFIG_GLOBAL.
        GIT_CONFIG_COUNT = "1";
        GIT_CONFIG_KEY_0 = "credential.https://github.com.helper";
        GIT_CONFIG_VALUE_0 = "!gh auth git-credential";
      };

      serviceConfig = {
        ExecStart = "${self.packages.${system}.default}/bin/dispatch serve";
        User = "dispatch";
        Group = "dispatch";
        EnvironmentFile = [
          cfg.tokenFile
          cfg.githubTokenFile
        ];
        StateDirectory = "dispatch";
        Restart = "on-failure";
      };
    };
  };
}
