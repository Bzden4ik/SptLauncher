using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Tasks;
using SptLauncherServer.Models;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.Eft.Common;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Utils;

namespace SptLauncherServer.Routes
{
    [Injectable]
    public class LauncherManifestRouter : StaticRouter
    {
        private static ISptLogger<LauncherManifestRouter> _logger = null!;
        private static HttpResponseUtil _httpUtil = null!;
        private static JsonUtil         _jsonUtil = null!;
        private static LauncherConfig   _cfg      = null!;
        private static string           _modDir   = null!;

        public LauncherManifestRouter(
            JsonUtil jsonUtil,
            HttpResponseUtil httpUtil,
            ISptLogger<LauncherManifestRouter> logger
        ) : base(jsonUtil, BuildRoutes())
        {
            _logger   = logger;
            _httpUtil = httpUtil;
            _jsonUtil = jsonUtil;
            // Use assembly location so _modDir = user/mods/SptLauncherServer/
            _modDir   = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
            _cfg      = LoadConfig(_modDir);
        }

        private static List<RouteAction> BuildRoutes()
        {
            var list = new List<RouteAction>(2);
            CollectionsMarshal.SetCount(list, 2);
            var span = CollectionsMarshal.AsSpan(list);

            // GET /launcher/ping — server status check
            span[0] = new RouteAction<EmptyRequestData>("/launcher/ping",
                async (url, data, sessionId, output) =>
                {
                    return _httpUtil.GetBody(new { status = "ok", timestamp = DateTime.UtcNow.ToString("o") });
                });

            span[1] = new RouteAction<EmptyRequestData>("/launcher/manifest",
                async (url, data, sessionId, output) =>
                {
                    if (!IsAuthorized(sessionId))
                        return _httpUtil.GetBody(new { error = "Unauthorized" });
                    try
                    {
                        var manifest = BuildManifest(_modDir, _cfg);
                        SyncModsToWwwroot(_modDir, _cfg, manifest);
                        return _httpUtil.GetBody(manifest);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[SptLauncherServer] manifest error: {ex.Message}");
                        return _httpUtil.GetBody(new { error = "Internal error" });
                    }
                });

            return list;
        }

        private static ModManifest BuildManifest(string modDir, LauncherConfig cfg)
        {
            // modDir = user/mods/SptLauncherServer/ → 3 up = SPT root
            var serverRoot = Path.GetFullPath(Path.Combine(modDir, "..", "..", ".."));
            var manifest   = new ModManifest { GeneratedAt = DateTime.UtcNow.ToString("o") };

            foreach (var (folder, rel) in new[] {
                ("plugins",  cfg.PluginsRelPath),
                ("patchers", cfg.PatchersRelPath) })
            {
                var absPath = Path.GetFullPath(Path.Combine(serverRoot, rel));
                if (!Directory.Exists(absPath)) continue;

                foreach (var file in Directory.EnumerateFiles(absPath, "*", SearchOption.AllDirectories))
                {
                    var ext = Path.GetExtension(file).ToLowerInvariant();
                    if (ext != ".dll" && ext != ".cfg") continue;

                    // Относительный путь внутри папки, через /
                    var relPath = Path.GetRelativePath(absPath, file).Replace('\\', '/');

                    manifest.Mods.Add(new ModEntry
                    {
                        Filename = relPath,
                        Folder   = folder,
                        Hash     = ComputeSha256(file),
                        Size     = new FileInfo(file).Length
                    });
                }
            }

            _logger.Info($"[SptLauncherServer] Manifest built: {manifest.Mods.Count} mods");
            return manifest;
        }

        private static void SyncModsToWwwroot(string modDir, LauncherConfig cfg, ModManifest manifest)
        {
            // modDir = user/mods/SptLauncherServer/ → 3 up = SPT root
            var serverRoot = Path.GetFullPath(Path.Combine(modDir, "..", "..", ".."));
            var wwwroot    = Path.Combine(modDir, "wwwroot", "mods");

            foreach (var entry in manifest.Mods)
            {
                var srcDir  = entry.Folder == "plugins" ? cfg.PluginsRelPath : cfg.PatchersRelPath;
                // entry.Filename может быть "SAIN/SAIN.dll" — конвертируем слэши для ОС
                var nativePath = entry.Filename.Replace('/', Path.DirectorySeparatorChar);
                var srcPath = Path.GetFullPath(Path.Combine(serverRoot, srcDir, nativePath));
                var dstPath = Path.Combine(wwwroot, entry.Folder, nativePath);

                Directory.CreateDirectory(Path.GetDirectoryName(dstPath)!);

                if (!File.Exists(dstPath) || ComputeSha256(dstPath) != entry.Hash)
                {
                    File.Copy(srcPath, dstPath, overwrite: true);
                    _logger.Info($"[SptLauncherServer] Synced: {entry.Folder}/{entry.Filename}");
                }
            }
        }

        private static bool IsAuthorized(string? sessionId)
        {
            if (_cfg.AuthMode == "none") return true;
            if (_cfg.AuthMode == "basic")
            {
                var parts = (sessionId ?? "").Split(':', 2);
                return parts.Length == 2
                    && parts[0] == _cfg.Username
                    && parts[1] == _cfg.Password;
            }
            return false;
        }

        private static LauncherConfig LoadConfig(string modDir)
        {
            var cfgPath = Path.Combine(modDir, "config.json");
            if (File.Exists(cfgPath))
            {
                try
                {
                    var json = File.ReadAllText(cfgPath);
                    return JsonSerializer.Deserialize<LauncherConfig>(json,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                        ?? new LauncherConfig();
                }
                catch { }
            }
            var def = new LauncherConfig();
            File.WriteAllText(cfgPath,
                JsonSerializer.Serialize(def, new JsonSerializerOptions { WriteIndented = true }));
            return def;
        }

        private static string ComputeSha256(string filePath)
        {
            using var sha = SHA256.Create();
            using var fs  = File.OpenRead(filePath);
            return BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();
        }
    }
}
