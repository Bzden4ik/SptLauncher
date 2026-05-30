using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Tasks;
using SptLauncherServer.Models;
using SptLauncherServer.Utils;
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
        private const string MOD_VERSION      = "1.1.0";
        private const string PROTOCOL_VERSION = "2";

        // Sync every file under plugins/patchers — only OS junk is excluded.
        private static readonly HashSet<string> IgnoreFiles =
            new(StringComparer.OrdinalIgnoreCase) { "desktop.ini", "thumbs.db", ".ds_store" };

        // Server-only / headless files that must NEVER be served to clients.
        // Fika.Headless.dll is the dedicated-server plugin and breaks a normal client.
        private static readonly HashSet<string> BlockedFiles =
            new(StringComparer.OrdinalIgnoreCase) { "Fika.Headless.dll" };

        private static ISptLogger<LauncherManifestRouter> _logger = null!;
        private static HttpResponseUtil _httpUtil = null!;
        private static JsonUtil         _jsonUtil = null!;
        private static LauncherConfig   _cfg      = null!;
        private static string           _modDir   = null!;

        // ── SHA-256 cache keyed by (path → mtime+size). Avoids re-hashing
        //    thousands of unchanged files on every manifest request. ──────────
        private sealed class CacheEntry { public long Mtime { get; set; } public long Size { get; set; } public string Hash { get; set; } = ""; }
        private static ConcurrentDictionary<string, CacheEntry> _hashCache = new();
        private static readonly object _buildLock = new();
        private static bool   _cacheDirty = false;
        private static string _cacheFile  = null!;

        public LauncherManifestRouter(
            JsonUtil jsonUtil,
            HttpResponseUtil httpUtil,
            ISptLogger<LauncherManifestRouter> logger
        ) : base(jsonUtil, BuildRoutes())
        {
            _logger    = logger;
            _httpUtil  = httpUtil;
            _jsonUtil  = jsonUtil;
            _modDir    = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
            _cacheFile = Path.Combine(_modDir, "hashcache.json");
            _cfg       = LoadConfig(_modDir);
            LoadHashCache();
        }

        private static List<RouteAction> BuildRoutes()
        {
            var list = new List<RouteAction>(3);
            CollectionsMarshal.SetCount(list, 3);
            var span = CollectionsMarshal.AsSpan(list);

            span[0] = new RouteAction<EmptyRequestData>("/launcher/ping",
                async (url, data, sessionId, output) =>
                    _httpUtil.GetBody(new { status = "ok", modVersion = MOD_VERSION, timestamp = DateTime.UtcNow.ToString("o") }));

            span[1] = new RouteAction<EmptyRequestData>("/launcher/version",
                async (url, data, sessionId, output) =>
                {
                    if (!IsAuthorized(sessionId)) return _httpUtil.GetBody(new { error = "Unauthorized" });
                    return _httpUtil.GetBody(new VersionInfo
                    {
                        SptVersion            = SptVersionResolver.Resolve(),
                        ModVersion            = MOD_VERSION,
                        ProtocolVersion       = PROTOCOL_VERSION,
                        MinLauncherVersion    = _cfg.MinLauncherVersion,
                        LatestLauncherVersion = _cfg.LatestLauncherVersion,
                        LauncherDownloadUrl   = _cfg.LauncherDownloadUrl,
                        ReleaseNotesUrl       = _cfg.ReleaseNotesUrl
                    });
                });

            span[2] = new RouteAction<EmptyRequestData>("/launcher/manifest",
                async (url, data, sessionId, output) =>
                {
                    if (!IsAuthorized(sessionId)) return _httpUtil.GetBody(new { error = "Unauthorized" });
                    try
                    {
                        ModManifest manifest;
                        lock (_buildLock)
                        {
                            manifest = BuildManifest(_modDir, _cfg);
                            SaveHashCache();
                        }
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

        // Source roots in priority order. Same `folder` tag (plugins/patchers)
        // means the file lands in the client's normal BepInEx subfolder.
        private static IEnumerable<(string folder, string absRoot)> SourceRoots(string serverRoot, LauncherConfig cfg)
        {
            yield return ("plugins",  Path.GetFullPath(Path.Combine(serverRoot, cfg.PluginsRelPath)));
            yield return ("patchers", Path.GetFullPath(Path.Combine(serverRoot, cfg.PatchersRelPath)));
            yield return ("plugins",  Path.GetFullPath(Path.Combine(serverRoot, cfg.LauncherModsPluginsRelPath)));
            yield return ("patchers", Path.GetFullPath(Path.Combine(serverRoot, cfg.LauncherModsPatchersRelPath)));
        }

        private static ModManifest BuildManifest(string modDir, LauncherConfig cfg)
        {
            var serverRoot = Path.GetFullPath(Path.Combine(modDir, "..", "..", ".."));
            var manifest   = new ModManifest
            {
                GeneratedAt = DateTime.UtcNow.ToString("o"),
                ModVersion  = MOD_VERSION,
                SptVersion  = SptVersionResolver.Resolve()
            };

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var (folder, absPath) in SourceRoots(serverRoot, cfg))
            {
                if (!Directory.Exists(absPath)) continue;

                foreach (var file in Directory.EnumerateFiles(absPath, "*", SearchOption.AllDirectories))
                {
                    var fileName = Path.GetFileName(file);
                    if (IgnoreFiles.Contains(fileName) || BlockedFiles.Contains(fileName)) continue;

                    var relPath = Path.GetRelativePath(absPath, file).Replace('\\', '/');
                    var key     = folder + "/" + relPath;
                    if (!seen.Add(key)) continue;   // primary server BepInEx wins over LauncherMods

                    try
                    {
                        var fi = new FileInfo(file);
                        manifest.Mods.Add(new ModEntry
                        {
                            Filename = relPath,
                            Folder   = folder,
                            Hash     = HashCached(fi),
                            Size     = fi.Length
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning($"[SptLauncherServer] skip {file}: {ex.Message}");
                    }
                }
            }

            _logger.Info($"[SptLauncherServer] Manifest built: {manifest.Mods.Count} files, SPT {manifest.SptVersion}");
            return manifest;
        }

        // ── Hash cache ──────────────────────────────────────────────────────
        private static string HashCached(FileInfo fi)
        {
            var path  = fi.FullName;
            var mtime = fi.LastWriteTimeUtc.Ticks;
            var size  = fi.Length;
            if (_hashCache.TryGetValue(path, out var e) && e.Mtime == mtime && e.Size == size)
                return e.Hash;

            var hash = ComputeSha256(path);
            _hashCache[path] = new CacheEntry { Mtime = mtime, Size = size, Hash = hash };
            _cacheDirty = true;
            return hash;
        }

        private static void LoadHashCache()
        {
            try
            {
                if (File.Exists(_cacheFile))
                {
                    var d = JsonSerializer.Deserialize<Dictionary<string, CacheEntry>>(File.ReadAllText(_cacheFile));
                    if (d != null) _hashCache = new ConcurrentDictionary<string, CacheEntry>(d);
                }
            }
            catch { /* corrupt cache → rebuild lazily */ }
        }

        private static void SaveHashCache()
        {
            if (!_cacheDirty) return;
            try { File.WriteAllText(_cacheFile, JsonSerializer.Serialize(_hashCache)); _cacheDirty = false; }
            catch { /* non-fatal */ }
        }

        private static bool IsAuthorized(string? sessionId)
        {
            if (_cfg.AuthMode == "none") return true;
            if (_cfg.AuthMode == "basic")
            {
                var parts = (sessionId ?? "").Split(':', 2);
                return parts.Length == 2 && parts[0] == _cfg.Username && parts[1] == _cfg.Password;
            }
            return false;
        }

        // Loads config, writing it back normalized so newly-added fields
        // (e.g. LauncherMods paths) appear in config.json for the admin to edit.
        private static LauncherConfig LoadConfig(string modDir)
        {
            var cfgPath = Path.Combine(modDir, "config.json");
            LauncherConfig cfg;
            if (File.Exists(cfgPath))
            {
                try
                {
                    cfg = JsonSerializer.Deserialize<LauncherConfig>(File.ReadAllText(cfgPath),
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new LauncherConfig();
                }
                catch { cfg = new LauncherConfig(); }
            }
            else cfg = new LauncherConfig();

            try { File.WriteAllText(cfgPath, JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true })); }
            catch { /* read-only fs → ignore */ }
            return cfg;
        }

        private static string ComputeSha256(string filePath)
        {
            using var sha = SHA256.Create();
            using var fs  = File.OpenRead(filePath);
            return BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();
        }
    }
}
