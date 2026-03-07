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
        public string            GeneratedAt { get; set; } = "";
        public string            Version     { get; set; } = "1.0.0";
        public List<ModEntry>    Mods        { get; set; } = new List<ModEntry>();
    }

    // Конфиг — редактируется в config.json папки мода
    public class LauncherConfig
    {
        // AUTH: "none" — открытый для своих, "basic" — включить login/password
        public string AuthMode        { get; set; } = "none";
        public string Username        { get; set; } = "";
        public string Password        { get; set; } = "";
        public string PluginsRelPath  { get; set; } = @"..\BepInEx\plugins";
        public string PatchersRelPath { get; set; } = @"..\BepInEx\patchers";
    }
}
