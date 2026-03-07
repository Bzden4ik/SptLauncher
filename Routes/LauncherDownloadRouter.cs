using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
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
    public class LauncherDownloadRouter : DynamicRouter
    {
        private static ISptLogger<LauncherDownloadRouter> _logger = null!;
        private static HttpResponseUtil _httpUtil = null!;
        private static string           _modDir   = null!;
        private static LauncherConfig   _cfg      = null!;

        public LauncherDownloadRouter(
            JsonUtil jsonUtil,
            HttpResponseUtil httpUtil,
            ISptLogger<LauncherDownloadRouter> logger
        ) : base(jsonUtil, BuildRoutes())
        {
            _logger   = logger;
            _httpUtil = httpUtil;
            _modDir   = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
            _cfg      = LoadConfig(_modDir);
        }

        private static List<RouteAction> BuildRoutes()
        {
            var list = new List<RouteAction>(1);
            CollectionsMarshal.SetCount(list, 1);
            var span = CollectionsMarshal.AsSpan(list);

            // Matches any URL starting with /launcher/mods/
            span[0] = new RouteAction<EmptyRequestData>("/launcher/mods/",
                async (url, data, sessionId, output) =>
                {
                    try
                    {
                        return ServeModFile(url);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[SptLauncherServer] download error: {ex.Message}");
                        return _httpUtil.GetBody(new { error = "Internal error" });
                    }
                });

            return list;
        }

        private static string ServeModFile(string url)
        {
            var prefix = "/launcher/mods/";
            if (!url.StartsWith(prefix))
                return _httpUtil.GetBody(new { error = "Bad request" });

            var relative = url.Substring(prefix.Length); // "plugins/SomeMod.dll" или "plugins/SAIN/SAIN.dll"
            var parts    = relative.Split('/', 2);
            if (parts.Length < 2)
                return _httpUtil.GetBody(new { error = "Bad request" });

            var folder   = parts[0]; // "plugins" | "patchers"
            var filePath = parts[1]; // "SomeMod.dll" или "SAIN/SAIN.dll"

            if (folder != "plugins" && folder != "patchers")
                return _httpUtil.GetBody(new { error = "Not found" });

            var wwwroot  = Path.Combine(_modDir, "wwwroot", "mods");
            var native   = filePath.Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(wwwroot, folder, native));
            var allowed  = Path.GetFullPath(Path.Combine(wwwroot, folder));

            if (!fullPath.StartsWith(allowed) || !File.Exists(fullPath))
            {
                _logger.Warning($"[SptLauncherServer] File not found: {fullPath}");
                return _httpUtil.GetBody(new { error = "Not found" });
            }

            var bytes = File.ReadAllBytes(fullPath);
            var b64   = Convert.ToBase64String(bytes);
            _logger.Info($"[SptLauncherServer] Download: {folder}/{filePath} ({bytes.Length} bytes)");
            return _httpUtil.GetBody(b64);
        }

        private static LauncherConfig LoadConfig(string modDir)
        {
            var cfgPath = Path.Combine(modDir, "config.json");
            if (System.IO.File.Exists(cfgPath))
            {
                try
                {
                    return System.Text.Json.JsonSerializer.Deserialize<LauncherConfig>(
                        System.IO.File.ReadAllText(cfgPath),
                        new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                        ?? new LauncherConfig();
                }
                catch { }
            }
            return new LauncherConfig();
        }
    }
}
