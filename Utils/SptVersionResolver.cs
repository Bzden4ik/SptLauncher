using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;

namespace SptLauncherServer.Utils
{
    // Best-effort resolver for the running SPT version.
    // Tries (in order):
    //   1) SPTarkov.Server.Core assembly attributes (InformationalVersion → FileVersion → AssemblyVersion)
    //   2) ProgramStatics-style static field/property on common SPT types
    //   3) SPT_Data/Server/configs/core.json → sptVersion / projectName
    // Returns "unknown" only if every probe fails.
    public static class SptVersionResolver
    {
        private static string? _cached;

        public static string Resolve()
        {
            if (_cached != null) return _cached;
            _cached = TryAssembly()
                   ?? TryProgramStatics()
                   ?? TryCoreConfigFile()
                   ?? "unknown";
            return _cached;
        }

        private static string? TryAssembly()
        {
            try
            {
                var asm = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => a.GetName().Name == "SPTarkov.Server.Core");
                if (asm == null) return null;

                var info = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
                if (!string.IsNullOrWhiteSpace(info))
                {
                    // strip "+commitsha" suffix if present
                    var plus = info.IndexOf('+');
                    return plus > 0 ? info.Substring(0, plus) : info;
                }
                var file = asm.GetCustomAttribute<AssemblyFileVersionAttribute>()?.Version;
                if (!string.IsNullOrWhiteSpace(file)) return file;

                var v = asm.GetName().Version;
                return v != null ? v.ToString(3) : null;
            }
            catch { return null; }
        }

        private static string? TryProgramStatics()
        {
            try
            {
                var psType = AppDomain.CurrentDomain.GetAssemblies()
                    .SelectMany(a => SafeGetTypes(a))
                    .FirstOrDefault(t => t.Name == "ProgramStatics" || t.Name == "CoreConfig");
                if (psType == null) return null;

                foreach (var name in new[] { "SptVersion", "Version", "ProjectVersion" })
                {
                    var prop = psType.GetProperty(name, BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
                    if (prop?.GetValue(null) is string s && !string.IsNullOrWhiteSpace(s)) return s;
                    var field = psType.GetField(name, BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
                    if (field?.GetValue(null) is string sf && !string.IsNullOrWhiteSpace(sf)) return sf;
                }
            }
            catch { }
            return null;
        }

        private static Type[] SafeGetTypes(Assembly a)
        {
            try { return a.GetTypes(); }
            catch { return Array.Empty<Type>(); }
        }

        private static string? TryCoreConfigFile()
        {
            try
            {
                // modDir = ...\user\mods\SptLauncherServer\ — climb 3 to SPT root.
                var modDir   = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
                var sptRoot  = Path.GetFullPath(Path.Combine(modDir, "..", "..", ".."));
                var corePath = Path.Combine(sptRoot, "SPT_Data", "Server", "configs", "core.json");
                if (!File.Exists(corePath)) return null;

                using var doc = JsonDocument.Parse(File.ReadAllText(corePath));
                if (doc.RootElement.TryGetProperty("sptVersion", out var v) && v.ValueKind == JsonValueKind.String)
                    return v.GetString();
                if (doc.RootElement.TryGetProperty("projectName", out var n) && n.ValueKind == JsonValueKind.String)
                    return n.GetString();
            }
            catch { }
            return null;
        }
    }
}
