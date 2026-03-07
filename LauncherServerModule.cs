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
            _logger.Success("[SptLauncherServer] Loaded.");
            _logger.Info("[SptLauncherServer] Endpoint: GET /launcher/manifest");
            _logger.Info("[SptLauncherServer] Files at:  /mods/plugins/<file.dll>");
            _logger.Info("[SptLauncherServer] Files at:  /mods/patchers/<file.dll>");
            return Task.CompletedTask;
        }
    }
}
