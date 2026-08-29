{
  description = "Dispatches Claude Code agents at tasks, one worktree per task";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      packageJson = nixpkgs.lib.importJSON ./package.json;
    in
    {
      packages = forEachSystem (pkgs: {
        default = pkgs.buildNpmPackage {
          pname = packageJson.name;
          inherit (packageJson) version;
          src = ./.;

          npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;

          nativeBuildInputs = [ pkgs.makeWrapper ];

          installPhase = ''
            install -D dist/dispatch.mjs $out/libexec/dispatch.mjs
            # The bundle reads these at startup, so they have to outlive the
            # source tree. module.nix points DISPATCH_MIGRATIONS at them.
            cp -r migrations $out/libexec/migrations
            makeWrapper ${pkgs.nodejs}/bin/node $out/bin/dispatch \
              --add-flags $out/libexec/dispatch.mjs
          '';
        };
      });

      nixosModules.default = import ./module.nix self;

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            # postgresql_17 matches the system instance dispatch deploys against.
            postgresql_17
            ephemeralpg
          ];

          shellHook = /* bash */ ''
            CLAUDE_BIN=$(command -v claude) || {
              echo "dispatch: claude not on PATH" >&2
              return 1
            }
            export CLAUDE_BIN
          '';
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixfmt);
    };
}
