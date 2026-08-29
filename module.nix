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
  };

  config = lib.mkIf cfg.enable {
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
    };

    systemd.services.dispatch = {
      description = "Dispatch agent station";
      wantedBy = [ "multi-user.target" ];
      after = [
        "network.target"
        "postgresql.service"
      ];
      requires = [ "postgresql.service" ];

      # worktree.ts shells out to git; a unit has no ambient PATH.
      path = [ cfg.gitPackage ];

      environment = {
        DATABASE_URL = "postgresql:///dispatch?host=/run/postgresql";
        CLAUDE_BIN = cfg.claudeBin;
        CLAUDE_CONFIG_DIR = "/var/lib/dispatch/claude";
      };

      serviceConfig = {
        ExecStart = "${self.packages.${system}.default}/bin/dispatch serve";
        User = "dispatch";
        Group = "dispatch";
        EnvironmentFile = cfg.tokenFile;
        StateDirectory = "dispatch";
        Restart = "on-failure";
      };
    };
  };
}
