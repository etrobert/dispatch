{
  description = "Dispatches Claude Code agents at tasks, one worktree per task";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
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

          nativeBuildInputs = [
            pkgs.esbuild
            pkgs.makeWrapper
          ];

          installPhase = ''
            install -D dist/dispatch.mjs $out/libexec/dispatch.mjs
            makeWrapper ${pkgs.nodejs}/bin/node $out/bin/dispatch \
              --add-flags $out/libexec/dispatch.mjs
          '';
        };
      });

      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          # esbuild is not an npm dependency, so `npm run build` needs it here.
          packages = with pkgs; [
            nodejs
            esbuild
          ];
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixfmt);
    };
}
