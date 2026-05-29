using System.Threading.Tasks;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Utils;

namespace SptLauncherServer
{
    [Injectable]
    public class LauncherServerModule : IOnLoad
    {
        private readonly ISptLogger<LauncherServerModule> _logger;

        public LauncherServerModule(ISptLogger<LauncherServerModule> logger)
        {
            _logger = logger;
        }

        public Task OnLoad()
        {
            var sptVer = Utils.SptVersionResolver.Resolve();
            _logger.Success($"[SptLauncherServer] Loaded.  mod v1.1.0  SPT {sptVer}");
            _logger.Info("[SptLauncherServer] Endpoint: GET /launcher/ping");
            _logger.Info("[SptLauncherServer] Endpoint: GET /launcher/version");
            _logger.Info("[SptLauncherServer] Endpoint: GET /launcher/manifest");
            _logger.Info("[SptLauncherServer] Files at:  GET /launcher/mods/<plugins|patchers>/<file>");
            return Task.CompletedTask;
        }
    }
}
