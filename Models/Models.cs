using System.Collections.Generic;

namespace SptLauncherServer.Models
{
    public class ModEntry
    {
        public string Filename { get; set; } = "";
        public string Folder   { get; set; } = "";   // "plugins" | "patchers"
        public string Hash     { get; set; } = "";   // SHA-256 hex
        public long   Size     { get; set; }
    }

    public class ModManifest
    {
        public string         GeneratedAt    { get; set; } = "";
        public string         ModVersion     { get; set; } = "1.1.0";
        public string         SptVersion     { get; set; } = "";
        public List<ModEntry> Mods           { get; set; } = new();
    }

    public class VersionInfo
    {
        public string SptVersion         { get; set; } = "";
        public string ModVersion         { get; set; } = "1.1.0";
        public string ProtocolVersion    { get; set; } = "2";
        public string MinLauncherVersion { get; set; } = "1.1.0";
        public string LatestLauncherVersion { get; set; } = "1.1.0";
        public string? LauncherDownloadUrl  { get; set; } = null;
        public string? ReleaseNotesUrl      { get; set; } = null;
    }

    public class LauncherConfig
    {
        public string  AuthMode               { get; set; } = "none";
        public string  Username               { get; set; } = "";
        public string  Password               { get; set; } = "";

        // Primary server mods (the BepInEx the server itself loads).
        public string  PluginsRelPath         { get; set; } = @"..\BepInEx\plugins";
        public string  PatchersRelPath        { get; set; } = @"..\BepInEx\patchers";

        // Client-only mods the server does NOT load (they break headless) but
        // clients still need. Served alongside the primary set, landing in the
        // client's normal BepInEx\plugins / patchers. Absolute paths are honored,
        // so this can live on any drive.
        public string  LauncherModsPluginsRelPath  { get; set; } = @"..\LauncherMods\BepInEx\plugins";
        public string  LauncherModsPatchersRelPath { get; set; } = @"..\LauncherMods\BepInEx\patchers";

        public string  LatestLauncherVersion  { get; set; } = "1.1.0";
        public string  MinLauncherVersion     { get; set; } = "1.1.0";
        public string? LauncherDownloadUrl    { get; set; } = null;
        public string? ReleaseNotesUrl        { get; set; } = null;
    }
}
